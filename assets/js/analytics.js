/* =============================================================================
 * analytics.js — Business analytics on top of the statements:
 *   growth (MoM and vs the earlier-months average), loan book & debt service,
 *   breakeven, product / channel mix, unit economics (needs operating inputs),
 *   cost analysis (largest lines, spikes, peak month).
 * Every function returns plain numbers or a table model (same shape as
 * tables.js) so the web page and the Excel pack stay identical.
 * ===========================================================================*/
window.MIS = window.MIS || {};

(function (MIS) {
  'use strict';
  const F = MIS.fmt;
  const LINES = MIS.config.ALL_LINES;
  const isNum = v => v !== null && v !== undefined && isFinite(v);
  const div = (a, b) => (isNum(a) && isNum(b) && b ? a / b : null);

  /* -------------------- operating inputs (not in Tally) ------------------ */
  const OPS_FIELDS = [
    { k: 'milkL', label: 'Milk procured', unit: 'litres' },
    { k: 'prodKg', label: 'Total production', unit: 'kg' },
    { k: 'soldCheese', label: 'Cottage cheese / paneer sold', unit: 'kg' },
    { k: 'soldGhee', label: 'Ghee sold', unit: 'kg' },
    { k: 'soldOther', label: 'Other products sold', unit: 'kg' },
    { k: 'capacityKg', label: 'Installed capacity', unit: 'kg / month' },
    { k: 'headcount', label: 'Headcount (payroll + contract)', unit: 'people' },
    { k: 'emi', label: 'Contracted EMIs due in the month', unit: '₹' }
  ];
  const ops = (model, key) => (model.ops && model.ops[key]) || {};
  const opsNum = (model, key, k) => { const v = parseFloat(ops(model, key)[k]); return isFinite(v) ? v : null; };

  /* -------------------- helpers ------------------------------------------ */
  function monthIdx(model, sel) { return model.months.findIndex(m => m.key === sel); }
  function prevMonth(model, sel) { const i = monthIdx(model, sel); return i > 0 ? model.months[i - 1] : null; }

  /** Scales a P&L statement (used for the "average month" of a combined block) */
  function scalePL(pl, f) {
    const o = JSON.parse(JSON.stringify(pl));
    Object.keys(o).forEach(k => { if (typeof o[k] === 'number' && k !== 'days') o[k] = o[k] * f; });
    Object.keys(o.lines).forEach(k => { o.lines[k] *= f; });
    o.ledgers.forEach(l => { l.amt *= f; });
    o.salesLedgers.forEach(l => { l.amt *= f; });
    o.stockOpen = null; o.stockClose = null; o.days = pl.days * f;
    return o;
  }
  function gapAvg(model) { return model.gap ? scalePL(model.gap.pl, 1 / model.gap.n) : null; }

  /** Comparison base for a month: previous month, else the earlier-months average */
  function comparator(model, sel) {
    const p = prevMonth(model, sel);
    if (p && model.pl[p.key]) return { pl: model.pl[p.key], bs: model.bs[p.key], label: p.label, kind: 'mom' };
    // First monthly P&L after a combined block (e.g. Oct after Apr–Sep): compare with the block's monthly average
    const first = model.months.find(m => m.hasPL);
    if (model.gap && first && first.key === sel) return { pl: gapAvg(model), bs: null, label: model.gap.label + ' avg', kind: 'avg' };
    return null;
  }

  /* -------------------- breakeven ---------------------------------------- */
  function breakeven(pl, monthsInPeriod) {
    if (!pl) return null;
    const n = monthsInPeriod || 1;
    const L = pl.lines;
    const variable = pl.consumption + pl.dirExp + L.OPX_SD + L.OPX_POWER;
    const fixed = L.OPX_EMP + L.OPX_RENT + L.OPX_PROF + L.OPX_RM + L.OPX_ADMIN + L.OPX_BAD + L.OPX_SUSP;
    const contrib = pl.revNet - variable;
    const cm = div(contrib, pl.revNet);
    const fixedM = fixed / n, intM = pl.interest / n, revM = pl.revNet / n;
    const be = cm && cm > 0 ? fixedM / cm : null;
    const beCash = cm && cm > 0 ? (fixedM + intM) / cm : null;
    return { n: n, variable: variable, fixed: fixed, contrib: contrib, cm: cm, fixedM: fixedM, intM: intM, revM: revM, be: be, beCash: beCash,
      gap: be ? revM / be - 1 : null, gapCash: beCash ? revM / beCash - 1 : null };
  }

  /* -------------------- product / channel mix ---------------------------- */
  function productOf(name) {
    const n = name.toLowerCase();
    if (/ghee/.test(n)) return 'Ghee';
    if (/paneer/.test(n)) return 'Paneer';
    if (/cottage|cheese/.test(n)) return 'Cottage cheese';
    if (/butter|curd|yog|milk/.test(n)) return 'Other dairy';
    if (/service/.test(n)) return 'Services';
    if (/distributor/.test(n)) return 'Distributor sales (mixed)';
    return 'Other sales';
  }
  function channelOf(name) {
    const n = name.toLowerCase();
    if (/noice/.test(n)) return 'NOICE';
    if (/distributor/.test(n)) return 'Distributors';
    if (/nmt|modern trade|\bmt\b/.test(n)) return 'Modern trade';
    if (/sample/.test(n)) return 'Samples';
    return 'Direct / other';
  }
  function mix(pl, fn) {
    if (!pl) return [];
    const m = {};
    pl.salesLedgers.forEach(l => { const k = fn(l.name); m[k] = (m[k] || 0) + l.amt; });
    const tot = Object.keys(m).reduce((a, k) => a + m[k], 0);
    return Object.keys(m).map(k => ({ k: k, v: m[k], share: div(m[k], tot) })).sort((a, b) => b.v - a.v);
  }

  /* -------------------- loan book & debt service ------------------------- */
  const LOAN_LINES = ['BR_LT', 'BR_UNSEC', 'BR_OCD', 'BR_ST'];
  function loanLedgers(model, date) {
    const led = model.ledgersAt(date);
    if (!led) return null;
    const out = [];
    led.forEach(l => {
      if (LOAN_LINES.indexOf(l.line) >= 0) out.push({ name: l.name, group: l.group, type: LINES[l.line].label, line: l.line, bal: l.cr - l.dr });
      else if (l.line === 'CA_CASH' && l.cr > 0.5) out.push({ name: l.name + ' (credit balance)', group: l.group, type: LINES.BR_BANKCR.label, line: 'BR_BANKCR', bal: l.cr });
    });
    return out;
  }
  function loanBook(model, sel) {
    const m = model.months.find(x => x.key === sel);
    const cur = loanLedgers(model, m.end);
    if (!cur) return null;
    const p = prevMonth(model, sel);
    const prev = p ? loanLedgers(model, p.end) : null;
    const rows = cur.map(x => {
      const pr = prev ? prev.find(y => y.name === x.name && y.line === x.line) : null;
      return Object.assign({}, x, { prev: pr ? pr.bal : (prev ? 0 : null) });
    });
    if (prev) prev.forEach(y => { if (!rows.some(x => x.name === y.name && x.line === y.line)) rows.push(Object.assign({}, y, { prev: y.bal, bal: 0 })); });
    const total = rows.reduce((a, x) => a + x.bal, 0);
    rows.forEach(x => { x.share = div(x.bal, total); x.chg = isNum(x.prev) ? x.bal - x.prev : null; });
    rows.sort((a, b) => b.bal - a.bal);
    const b = model.bs[sel];
    const accrued = (model.ledgersAt(m.end) || []).filter(l => l.line === 'CL_INT' || /\bemi\b/i.test(l.name)).map(l => ({ name: l.name, bal: l.cr - l.dr }));
    return { rows: rows, total: total, prevTotal: prev ? rows.reduce((a, x) => a + (x.prev || 0), 0) : null, accrued: accrued, netDebt: b ? b.netDebt : null, cash: b ? b.cash : null };
  }
  function interestByLender(model, sel) {
    const pl = model.pl[sel], y = model.ytd[sel] && model.ytd[sel].pl;
    const map = {};
    const add = (p, k) => p && p.ledgers.filter(l => l.line === 'FIN').forEach(l => { map[l.name] = map[l.name] || { name: l.name, m: 0, y: 0 }; map[l.name][k] += l.amt; });
    add(pl, 'm'); add(y, 'y');
    return Object.keys(map).map(k => Object.assign(map[k], { kind: /interest|intrest/i.test(k) ? 'Interest' : 'Bank & finance charges' })).sort((a, b) => b.y - a.y || b.m - a.m);
  }
  function debtService(model, sel) {
    const pl = model.pl[sel], b = model.bs[sel], p = prevMonth(model, sel);
    const pb = p ? model.bs[p.key] : null;
    if (!pl || !b) return null;
    const termDebt = x => x.lines.BR_LT + x.lines.BR_UNSEC + x.lines.BR_OCD;
    const d = pb ? termDebt(b) - termDebt(pb) : null;
    const principal = d !== null ? Math.max(0, -d) : null;
    const drawn = d !== null ? Math.max(0, d) : null;
    const service = pl.interest + (principal || 0);
    const avgDebt = pb ? (b.debt + pb.debt) / 2 : b.debt;
    const emi = opsNum(model, sel, 'emi');
    return {
      interest: pl.interest, charges: pl.fin - pl.interest, principal: principal, drawn: drawn, service: service,
      dscr: service > 0 ? pl.ebitda / service : null, costOfDebt: avgDebt > 0 ? pl.interest * 365 / pl.days / avgDebt : null,
      emi: emi, emiCover: emi ? pl.ebitda / emi : null, emiPctRev: emi ? emi / pl.revNet : null, hasPrev: !!pb
    };
  }

  /* -------------------- unit economics ----------------------------------- */
  function unitEconomics(model, key) {
    const pl = model.pl[key];
    const o = k => opsNum(model, key, k);
    const sold = ['soldCheese', 'soldGhee', 'soldOther'].map(o).filter(isNum);
    const kg = sold.length ? sold.reduce((a, x) => a + x, 0) : null;
    const r = { kg: kg, milkL: o('milkL'), prodKg: o('prodKg'), headcount: o('headcount'), capacity: o('capacityKg') };
    if (pl) {
      r.realisation = div(pl.revNet, kg);
      r.milkPerL = div(pl.lines.MAT_MILK, r.milkL);
      r.matPerKg = div(pl.consumption + pl.dirExp, kg);
      r.gpPerKg = div(pl.gp, kg);
      r.contribPerKg = (() => { const be = breakeven(pl); return be ? div(be.contrib, kg) : null; })();
      r.revPerHead = div(pl.revNet, r.headcount);
      r.empCostPerHead = div(pl.lines.OPX_EMP, r.headcount);
    }
    r.yield = r.milkL && r.prodKg ? r.prodKg / r.milkL * 100 : null;
    r.utilisation = div(r.prodKg, r.capacity);
    return r;
  }

  /* -------------------- cost analysis ------------------------------------ */
  const COST_LINES = ['MAT_MILK', 'MAT_RM', 'MAT_TRADED', 'MAT_PACK', 'MAT_FUEL', 'MAT_OTH', 'DIR_EXP', 'OPX_EMP', 'OPX_SD', 'OPX_POWER', 'OPX_RENT', 'OPX_PROF', 'OPX_RM', 'OPX_ADMIN', 'OPX_BAD', 'OPX_SUSP', 'DEP', 'FIN'];
  function costAnalysis(model, sel) {
    const upto = MIS.tables.monthsUpTo(model, sel);
    const pl = model.pl[sel];
    const cmp = comparator(model, sel);
    const ytd = model.ytd[sel] && model.ytd[sel].pl;
    const led = {};
    const put = (p, slot) => p && p.ledgers.forEach(l => {
      if (COST_LINES.indexOf(l.line) < 0) return;
      const k = l.group + '||' + l.name;
      led[k] = led[k] || { name: l.name, line: l.line, months: {}, cur: 0, cmp: null, ytd: null };
      if (slot === 'cur') led[k].cur += l.amt;
      else if (slot === 'cmp') led[k].cmp = (led[k].cmp || 0) + l.amt;
      else if (slot === 'ytd') led[k].ytd = (led[k].ytd || 0) + l.amt;
      else led[k].months[slot] = (led[k].months[slot] || 0) + l.amt;
    });
    upto.forEach(m => put(model.pl[m.key], m.key));
    put(pl, 'cur'); put(cmp && cmp.pl, 'cmp'); put(ytd, 'ytd');
    const list = Object.keys(led).map(k => {
      const x = led[k];
      const hist = upto.filter(m => m.key !== sel && isNum(x.months[m.key])).map(m => x.months[m.key]);
      const avg = hist.length ? hist.reduce((a, v) => a + v, 0) / hist.length : (cmp && cmp.kind === 'avg' ? x.cmp : null);
      let peak = null;
      if (upto.length > 1) upto.forEach(m => { const v = x.months[m.key]; if (isNum(v) && (!peak || v > peak.v)) peak = { label: m.label, v: v }; });
      return Object.assign(x, {
        pctRev: pl ? div(x.cur, pl.revNet) : null, chg: isNum(x.cmp) ? x.cur - x.cmp : null, chgPct: F.change(x.cur, x.cmp), avg: avg,
        spike: isNum(avg) && avg > 0 && x.cur > 1.5 * avg && x.cur - avg > 25000, peak: peak, ytdShare: ytd ? div(x.ytd, ytd.materials + ytd.dirExp + ytd.opex + ytd.fin) : null
      });
    });
    const top = list.filter(x => x.cur > 0).sort((a, b) => b.cur - a.cur).slice(0, 15);
    const spikes = list.filter(x => x.spike).sort((a, b) => (b.cur - b.avg) - (a.cur - a.avg));
    const movers = list.filter(x => isNum(x.chg)).sort((a, b) => b.chg - a.chg);
    // Line × month heat table data
    const heat = COST_LINES.map(id => {
      const vals = upto.map(m => (model.pl[m.key] ? model.pl[m.key].lines[id] : null));
      const max = Math.max.apply(null, vals.filter(isNum).concat([0]));
      return { id: id, label: LINES[id].label, vals: vals, max: max, gapAvg: model.gap ? model.gap.pl.lines[id] / model.gap.n : null, ytd: ytd ? ytd.lines[id] : null };
    }).filter(h => h.vals.some(v => isNum(v) && Math.abs(v) > 1) || (isNum(h.ytd) && Math.abs(h.ytd) > 1));
    return { top: top, spikes: spikes, movers: movers, heat: heat, months: upto, cmp: cmp, total: pl ? pl.materials + pl.dirExp + pl.opex + pl.fin + pl.dep : null };
  }

  /* -------------------- table models for Excel --------------------------- */
  const cell = (v, f) => ({ v: v, f: f || 'amt' });
  const txt = v => ({ v: v, f: 'text' });
  function debtTable(model, sel) {
    const lb = loanBook(model, sel), ds = debtService(model, sel), ib = interestByLender(model, sel);
    if (!lb) return null;
    const rows = [{ label: 'Loan book (month-end)', type: 'section', cells: [txt(null), txt(null), txt(null), txt(null), txt(null)] }];
    lb.rows.forEach(x => rows.push({ label: x.name, type: 'line', indent: 1, cells: [txt(x.type), cell(x.bal), cell(x.prev), cell(x.chg), cell(x.share, 'pct')] }));
    rows.push({ label: 'Total loan book', type: 'total', cells: [txt(''), cell(lb.total), cell(lb.prevTotal), cell(isNum(lb.prevTotal) ? lb.total - lb.prevTotal : null), cell(1, 'pct')] });
    lb.accrued.forEach(x => rows.push({ label: 'Memo: ' + x.name, type: 'memo', cells: [txt('Payable'), cell(x.bal), txt(null), txt(null), txt(null)] }));
    rows.push({ label: 'Interest & finance charges by lender', type: 'section', cells: [txt(null), txt(null), txt(null), txt(null), txt(null)] });
    ib.forEach(x => rows.push({ label: x.name, type: 'line', indent: 1, cells: [txt(x.kind), cell(x.m), cell(x.y), txt(null), txt(null)] }));
    if (ds) {
      rows.push({ label: 'Debt service (month)', type: 'section', cells: [txt(null), txt(null), txt(null), txt(null), txt(null)] });
      [['Interest charged', ds.interest, 'amt'], ['Principal repaid (fall in term debt)', ds.principal, 'amt'], ['New borrowing drawn', ds.drawn, 'amt'], ['Total debt service', ds.service, 'amt'],
        ['DSCR (EBITDA ÷ debt service)', ds.dscr, 'x'], ['Effective cost of debt (annualised)', ds.costOfDebt, 'pct'], ['Contracted EMIs (input)', ds.emi, 'amt'], ['EMI cover (EBITDA ÷ EMI)', ds.emiCover, 'x']]
        .forEach(x => rows.push({ label: x[0], type: 'line', indent: 1, cells: [txt(''), cell(x[1], x[2]), txt(null), txt(null), txt(null)] }));
    }
    const m = model.months.find(x => x.key === sel);
    const p = prevMonth(model, sel);
    return { id: 'debt', title: 'Debt & funding — ' + m.label, columns: [{ label: 'Type', kind: 'text' }, { label: m.label + ' / month', kind: 'month' }, { label: (p ? p.label : 'Prior') + ' / YTD', kind: 'prior' }, { label: 'Change', kind: 'delta' }, { label: 'Share', kind: 'mom' }], rows: rows };
  }
  function breakevenTable(model, sel) {
    const pl = model.pl[sel], y = model.ytd[sel] && model.ytd[sel].pl;
    const a = breakeven(pl, 1), ny = y ? Math.round(y.days / 30.4) : 1, b = breakeven(y, ny);
    const g = model.gap ? breakeven(model.gap.pl, model.gap.n) : null;
    const srcs = [a, g, b];
    const row = (label, fn, f, type) => ({ label: label, type: type || 'line', indent: type ? 0 : 1, cells: srcs.map(s => cell(s ? fn(s) : null, f || 'amt')) });
    const rows = [
      row('Net revenue per month', s => s.revM),
      row('Variable costs per month (materials consumed, direct, selling & trade, power)', s => s.variable / s.n),
      row('Contribution margin %', s => s.cm, 'pct', 'pct'),
      row('Fixed costs per month (people, rent, professional, R&M, admin)', s => s.fixedM),
      row('Interest per month', s => s.intM),
      row('EBITDA breakeven revenue per month', s => s.be, 'amt', 'subtotal'),
      row('Cash breakeven revenue per month (incl. interest)', s => s.beCash, 'amt', 'subtotal'),
      row('Revenue vs EBITDA breakeven', s => s.gap, 'pct', 'pct'),
      row('Revenue vs cash breakeven', s => s.gapCash, 'pct', 'pct')
    ];
    const m = model.months.find(x => x.key === sel);
    return { id: 'breakeven', title: 'Breakeven analysis', columns: [{ label: m.label, kind: 'month' }, { label: model.gap ? model.gap.label + ' (avg/month)' : 'Earlier months', kind: 'gap' }, { label: 'YTD (avg/month)', kind: 'ytd' }], rows: rows };
  }
  function costTable(model, sel) {
    const ca = costAnalysis(model, sel);
    const m = model.months.find(x => x.key === sel);
    const rows = ca.top.map(x => ({ label: x.name, type: 'line', indent: 0, cells: [txt(LINES[x.line].label), cell(x.cur), cell(x.pctRev, 'pct'), cell(x.cmp), cell(x.chgPct, 'chg'), cell(x.ytd), txt(x.peak ? x.peak.label : '–'), txt(x.spike ? 'SPIKE' : '')] }));
    return { id: 'costs', title: 'Top expense ledgers — ' + m.label, columns: [{ label: 'MIS line', kind: 'text' }, { label: m.label, kind: 'month' }, { label: '% of revenue', kind: 'plain' }, { label: ca.cmp ? ca.cmp.label : 'Prior', kind: 'prior' }, { label: 'Change %', kind: 'costchg' }, { label: 'YTD', kind: 'ytd' }, { label: 'Peak month', kind: 'text' }, { label: 'Flag', kind: 'text' }], rows: rows };
  }
  function unitTable(model, sel) {
    const upto = MIS.tables.monthsUpTo(model, sel);
    const us = upto.map(m => unitEconomics(model, m.key));
    const row = (label, k, f) => ({ label: label, type: 'line', indent: 1, cells: us.map(u => cell(u[k], f)) });
    const rows = [
      { label: 'Volumes (operating inputs)', type: 'section', cells: us.map(() => txt(null)) },
      row('Milk procured (litres)', 'milkL', 'num'), row('Production (kg)', 'prodKg', 'num'), row('Volume sold (kg)', 'kg', 'num'),
      row('Yield (kg produced per 100 L milk)', 'yield', 'num1'), row('Capacity utilisation', 'utilisation', 'pct'), row('Headcount', 'headcount', 'num'),
      { label: 'Unit economics (₹)', type: 'section', cells: us.map(() => txt(null)) },
      row('Net realisation per kg sold', 'realisation', 'rs'), row('Milk cost per litre', 'milkPerL', 'rs'), row('Material & direct cost per kg sold', 'matPerKg', 'rs'),
      row('Gross profit per kg sold', 'gpPerKg', 'rs'), row('Contribution per kg sold', 'contribPerKg', 'rs'), row('Revenue per employee (month)', 'revPerHead', 'rs'), row('Employee cost per head (month)', 'empCostPerHead', 'rs')
    ];
    return { id: 'unit', title: 'Unit economics', columns: upto.map(m => ({ label: m.label, kind: 'month' })), rows: rows };
  }

  MIS.analytics = { OPS_FIELDS, scalePL, gapAvg, comparator, breakeven, mix, productOf, channelOf, loanBook, interestByLender, debtService, unitEconomics, costAnalysis, debtTable, breakevenTable, costTable, unitTable, prevMonth };
})(window.MIS);
