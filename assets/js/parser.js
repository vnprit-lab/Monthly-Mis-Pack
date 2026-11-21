/* =============================================================================
 * parser.js — Reads a Tally "Trial Balance" Excel export into a clean model.
 * -----------------------------------------------------------------------------
 * Supported export (Tally Prime / ERP 9):
 *   Gateway → Display More Reports → Trial Balance → (Alt+F5 "Detailed")
 *   Period: one month (e.g. 1-Oct-26 to 31-Oct-26) or FY-to-date.
 *   Export → Excel. Closing balance Debit/Credit columns are mandatory;
 *   Opening Balance columns are optional (used when present).
 *
 * Group/ledger hierarchy is reconstructed WITHOUT relying on formatting:
 * a primary-group row is followed by child rows whose Dr/Cr sum to it.
 * ===========================================================================*/
window.MIS = window.MIS || {};

(function (MIS) {
  'use strict';
  const TOL = 1.0; // rupee tolerance for summation checks
  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  function txt(v) { return v === null || v === undefined ? '' : String(v).trim(); }

  // Parses numbers like 1234.5, "1,23,456.00", "1,234.00 Dr", "(1,234)", "-"
  function num(v) {
    if (v === null || v === undefined || v === '') return { v: 0, side: null };
    if (typeof v === 'number') return { v: v, side: null };
    let s = String(v).trim();
    if (!s || s === '-') return { v: 0, side: null };
    let side = null;
    const m = s.match(/\b(dr|cr)\.?$/i);
    if (m) { side = m[1].toLowerCase() === 'dr' ? 'Dr' : 'Cr'; s = s.slice(0, m.index).trim(); }
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/[,\s₹]/g, '');
    let n = parseFloat(s);
    if (isNaN(n)) return { v: 0, side: null, bad: true };
    if (neg) n = -n;
    return { v: n, side: side };
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function parseTallyDate(d, mon, y) {
    let year = parseInt(y, 10);
    if (year < 100) year += 2000;
    const m = MONTHS[mon.toLowerCase().slice(0, 3)];
    if (m === undefined) return null;
    return new Date(year, m, parseInt(d, 10));
  }

  function findPeriod(aoa) {
    const re = /(\d{1,2})[-\s\/]([A-Za-z]{3,9})[-\s\/,]*(\d{2,4})\s*(?:to|-)\s*(\d{1,2})[-\s\/]([A-Za-z]{3,9})[-\s\/,]*(\d{2,4})/;
    for (let r = 0; r < Math.min(aoa.length, 30); r++) {
      const row = aoa[r] || [];
      for (let c = 0; c < row.length; c++) {
        const m = txt(row[c]).match(re);
        if (m) {
          const from = parseTallyDate(m[1], m[2], m[3]);
          const to = parseTallyDate(m[4], m[5], m[6]);
          if (from && to) return { from: iso(from), to: iso(to) };
        }
      }
    }
    return null;
  }

  // Builds a label for each column from the header rows (forward-filling merged headers)
  function columnLabels(aoa, startRow, endRow, width) {
    const labels = new Array(width).fill('');
    for (let r = startRow; r < endRow; r++) {
      const row = aoa[r] || [];
      let carry = '';
      for (let c = 1; c < width; c++) {
        const t = txt(row[c]);
        if (t) carry = t;
        if (carry) labels[c] += ' ' + carry.toLowerCase();
      }
    }
    return labels;
  }

  function detectColumns(labels) {
    const cols = { cl: null, op: null };
    const pick = (word) => {
      const idx = labels.map((l, i) => ({ l, i })).filter(o => o.i > 0 && o.l.indexOf(word) >= 0);
      if (!idx.length) return null;
      const dr = idx.find(o => /debit|\bdr\b/.test(o.l));
      const cr = idx.find(o => /credit|\bcr\b/.test(o.l));
      if (dr && cr) return { dr: dr.i, cr: cr.i };
      return { single: idx[0].i };
    };
    cols.cl = pick('closing');
    cols.op = pick('opening');
    if (!cols.cl) {
      // No "closing" header: take the LAST debit/credit pair
      const drs = labels.map((l, i) => ({ l, i })).filter(o => o.i > 0 && /debit/.test(o.l));
      const crs = labels.map((l, i) => ({ l, i })).filter(o => o.i > 0 && /credit/.test(o.l));
      if (drs.length && crs.length) cols.cl = { dr: drs[drs.length - 1].i, cr: crs[crs.length - 1].i };
      else cols.cl = { dr: 1, cr: 2 };
    }
    return cols;
  }

  function readPair(row, spec) {
    if (!spec) return { dr: 0, cr: 0 };
    if (spec.single !== undefined) {
      const n = num(row[spec.single]);
      if (n.side === 'Cr') return { dr: 0, cr: Math.abs(n.v) };
      if (n.side === 'Dr') return { dr: Math.abs(n.v), cr: 0 };
      return n.v >= 0 ? { dr: n.v, cr: 0 } : { dr: 0, cr: -n.v };
    }
    const d = num(row[spec.dr]), c = num(row[spec.cr]);
    return { dr: d.v || 0, cr: c.v || 0 };
  }

  /**
   * @param {Array<Array>} aoa   rows of the sheet (SheetJS header:1 output)
   * @param {string} fileName
   * @returns parsed TB model
   */
  function parseTrialBalance(aoa, fileName) {
    const warnings = [];
    const strong = MIS.config.STRONG_PRIMARIES;
    const company = txt((aoa[0] || [])[0]) || 'Company';

    const period = findPeriod(aoa);
    if (!period) throw new Error('Could not find the period (e.g. "1-Oct-26 to 31-Oct-26") in the file header. Please export the Trial Balance directly from Tally.');

    // Locate "Particulars" header row
    let pRow = aoa.findIndex(r => r && /^particulars$/i.test(txt(r[0])));
    if (pRow < 0) throw new Error('Could not find the "Particulars" header row. Is this a Tally Trial Balance export?');

    // Header rows = from pRow until first row with text in column A
    let dataStart = pRow + 1;
    while (dataStart < aoa.length && !txt((aoa[dataStart] || [])[0])) dataStart++;
    const width = Math.max.apply(null, aoa.slice(pRow, dataStart + 5).map(r => (r || []).length));
    const labels = columnLabels(aoa, pRow, dataStart, width);
    const cols = detectColumns(labels);
    const hasOpening = !!cols.op;

    // Read data rows
    const rows = [];
    let grand = null;
    for (let r = dataStart; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const name = txt(row[0]);
      if (!name) continue;
      const cl = readPair(row, cols.cl);
      const op = hasOpening ? readPair(row, cols.op) : { dr: 0, cr: 0 };
      if (/^grand total$/i.test(name)) { grand = cl; break; }
      rows.push({ name: name, dr: cl.dr, cr: cl.cr, odr: op.dr, ocr: op.cr });
    }
    if (!rows.length) throw new Error('No ledger rows found in the file.');

    // Reconstruct primary groups by summation
    const groups = [];
    let cur = null;
    const isComplete = g => Math.abs(g.dr - g.sDr) <= TOL && Math.abs(g.cr - g.sCr) <= TOL;
    for (const row of rows) {
      const lname = row.name.toLowerCase();
      const isStrong = strong.indexOf(lname) >= 0;
      let child = false;
      if (cur && !cur.childless && !isComplete(cur) && !isStrong) {
        const remDr = cur.dr - cur.sDr, remCr = cur.cr - cur.sCr;
        if (row.dr <= remDr + TOL && row.cr <= remCr + TOL) child = true;
      }
      if (child) {
        cur.children.push(row); cur.sDr += row.dr; cur.sCr += row.cr;
        cur.sODr += row.odr; cur.sOCr += row.ocr;
      } else {
        if (cur && cur.children.length && !isComplete(cur)) {
          warnings.push('Children of group "' + cur.name + '" do not add up to the group total (difference Dr ' + (cur.dr - cur.sDr).toFixed(2) + ', Cr ' + (cur.cr - cur.sCr).toFixed(2) + ').');
        }
        cur = Object.assign({}, row, { children: [], sDr: 0, sCr: 0, sODr: 0, sOCr: 0 });
        if (MIS.config.groupKind(row.name) === 'PLA') cur.childless = true;
        groups.push(cur);
      }
    }

    // Flatten to ledgers (a group with no children becomes its own ledger)
    const ledgers = [];
    groups.forEach(g => {
      const kids = g.children.length ? g.children : [g];
      kids.forEach(k => ledgers.push({ group: g.name, name: k.name, dr: k.dr, cr: k.cr, odr: k.odr, ocr: k.ocr }));
    });

    // Validation
    const sumDr = groups.reduce((a, g) => a + g.dr, 0);
    const sumCr = groups.reduce((a, g) => a + g.cr, 0);
    const checks = {
      balanced: Math.abs(sumDr - sumCr) <= TOL * 2,
      matchesGrandTotal: grand ? (Math.abs(grand.dr - sumDr) <= TOL * 2 && Math.abs(grand.cr - sumCr) <= TOL * 2) : null,
      totalDr: sumDr, totalCr: sumCr,
      grandDr: grand ? grand.dr : null, grandCr: grand ? grand.cr : null
    };
    if (!checks.balanced) warnings.push('Trial balance does not tally: Dr ' + sumDr.toFixed(2) + ' vs Cr ' + sumCr.toFixed(2) + '.');
    if (checks.matchesGrandTotal === false) warnings.push('Sum of groups does not match the Grand Total row — the export may include nested sub-group detail. Use the "Detailed" (one level) view.');

    return {
      id: period.from + '_' + period.to,
      fileName: fileName,
      company: company,
      from: period.from,
      to: period.to,
      hasOpening: hasOpening,
      uploadedAt: new Date().toISOString(),
      groups: groups.map(g => ({ name: g.name, dr: g.dr, cr: g.cr, n: g.children.length })),
      ledgers: ledgers,
      checks: checks,
      warnings: warnings
    };
  }

  // Reads a File/ArrayBuffer with SheetJS and parses the first sheet that looks like a TB
  function parseWorkbook(arrayBuffer, fileName) {
    if (typeof XLSX === 'undefined') throw new Error('Excel reader (SheetJS) did not load — check your internet connection.');
    const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
    let lastErr = null;
    for (const sn of wb.SheetNames) {
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null, blankrows: false });
      try { return parseTrialBalance(aoa, fileName); } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('No trial balance found in workbook.');
  }

  MIS.parser = { parseTrialBalance, parseWorkbook, num, iso };
})(window.MIS);
