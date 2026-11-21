/* =============================================================================
 * tables.js — Statement layouts (P&L, balance sheet, cash flow, ratios).
 * One table model feeds BOTH the web page and the Excel export, so what the
 * investor sees on screen and in the workbook is always identical.
 *
 * Table model: { id, title, columns:[{label, kind}], rows:[{label, type, indent, cells:[{v,f}]}] }
 *   row.type: section | line | subtotal | total | pct | memo
 *   cell.f  : amt | pct | pp | chg | days | x | months | text
 * ===========================================================================*/
window.MIS = window.MIS || {};

(function (MIS) {
  'use strict';
  const F = MIS.fmt;
  const L = MIS.config.ALL_LINES;

  function monthsUpTo(model, sel) {
    const idx = model.months.findIndex(m => m.key === sel);
    return model.months.slice(0, idx + 1);
  }
  const prevOf = (model, sel) => {
    const idx = model.months.findIndex(m => m.key === sel);
    return idx > 0 ? model.months[idx - 1] : null;
  };
  const isNum = v => v !== null && v !== undefined && isFinite(v);

  /* Generic builder: rows defs {label,type,f,get(src),indent,keep} over sources */
  function buildRows(defs, sources, extra) {
    const rows = [];
    defs.forEach(d => {
      if (d.type === 'section') { rows.push({ label: d.label, type: 'section', cells: sources.map(() => ({ v: null, f: 'text' })).concat((extra || []).map(() => ({ v: null, f: 'text' }))) }); return; }
      const vals = sources.map(s => (s ? safe(d.get, s) : null));
      const nonZero = vals.some(v => isNum(v) && Math.abs(v) > 0.5);
      if (!nonZero && !d.keep && d.type === 'line') return;
      const cells = vals.map(v => ({ v: v, f: d.f || 'amt' }));
      (extra || []).forEach(x => cells.push(x(d, vals)));
      rows.push({ label: d.label, type: d.type || 'line', indent: d.indent || 0, cells: cells, note: d.note });
    });
    return rows;
  }
  function safe(fn, s) { try { const v = fn(s); return isNum(v) ? v : null; } catch (e) { return null; } }

  /* MoM extra column (compares last two month columns) */
  function momExtra(nMonths, selIdxInCols, prevIdxInCols) {
    return function (d, vals) {
      const cur = vals[selIdxInCols], prev = prevIdxInCols >= 0 ? vals[prevIdxInCols] : null;
      if (d.f === 'pct') return { v: isNum(cur) && isNum(prev) ? cur - prev : null, f: 'pp' };
      if (d.f && d.f !== 'amt') return { v: isNum(cur) && isNum(prev) ? cur - prev : null, f: d.f === 'x' ? 'x' : d.f };
      return { v: F.change(cur, prev), f: 'chg' };
    };
  }

  /* ---------------------------- P&L ------------------------------------- */
  function plDefs() {
    const ln = id => p => p.lines[id];
    return [
      { type: 'section', label: 'Revenue' },
      { label: L.REV_GROSS.label, get: ln('REV_GROSS'), indent: 1, keep: true },
      { label: L.REV_RET.label, get: p => -p.lines.REV_RET, indent: 1 },
      { label: 'Net revenue from operations', type: 'subtotal', get: p => p.revNet },
      { type: 'section', label: 'Cost of goods sold' },
      { label: 'Opening stock', get: p => p.stockOpen, indent: 1 },
      { label: L.MAT_MILK.label, get: ln('MAT_MILK'), indent: 1 },
      { label: L.MAT_RM.label, get: ln('MAT_RM'), indent: 1 },
      { label: L.MAT_TRADED.label, get: ln('MAT_TRADED'), indent: 1 },
      { label: L.MAT_PACK.label, get: ln('MAT_PACK'), indent: 1 },
      { label: L.MAT_FUEL.label, get: ln('MAT_FUEL'), indent: 1 },
      { label: L.MAT_OTH.label, get: ln('MAT_OTH'), indent: 1 },
      { label: L.DIR_EXP.label, get: ln('DIR_EXP'), indent: 1 },
      { label: 'Less: Closing stock', get: p => -p.stockClose, indent: 1 },
      { label: 'Cost of goods sold', type: 'subtotal', get: p => p.cogs },
      { label: 'Gross profit', type: 'total', get: p => p.gp },
      { label: 'Gross margin %', type: 'pct', f: 'pct', get: p => p.revNet ? p.gp / p.revNet : null },
      { type: 'section', label: 'Operating expenses' },
      { label: L.OPX_EMP.label, get: ln('OPX_EMP'), indent: 1 },
      { label: L.OPX_SD.label, get: ln('OPX_SD'), indent: 1 },
      { label: L.OPX_POWER.label, get: ln('OPX_POWER'), indent: 1 },
      { label: L.OPX_RENT.label, get: ln('OPX_RENT'), indent: 1 },
      { label: L.OPX_PROF.label, get: ln('OPX_PROF'), indent: 1 },
      { label: L.OPX_RM.label, get: ln('OPX_RM'), indent: 1 },
      { label: L.OPX_ADMIN.label, get: ln('OPX_ADMIN'), indent: 1 },
      { label: L.OPX_BAD.label, get: ln('OPX_BAD'), indent: 1 },
      { label: L.OPX_SUSP.label, get: ln('OPX_SUSP'), indent: 1 },
      { label: 'Total operating expenses', type: 'subtotal', get: p => p.opex },
      { label: 'EBITDA', type: 'total', get: p => p.ebitda },
      { label: 'EBITDA margin %', type: 'pct', f: 'pct', get: p => p.revNet ? p.ebitda / p.revNet : null },
      { label: 'Add: Other income', get: p => p.oi, indent: 1 },
      { label: 'Less: Depreciation & amortisation', get: p => -p.dep, indent: 1, keep: true },
      { label: 'EBIT', type: 'subtotal', get: p => p.ebit },
      { label: 'Less: Finance costs', get: p => -p.fin, indent: 1, keep: true },
      { label: 'Profit before tax', type: 'subtotal', get: p => p.pbt },
      { label: 'Less: Tax', get: p => -p.tax, indent: 1 },
      { label: 'Profit after tax', type: 'total', get: p => p.pat },
      { label: 'PAT margin %', type: 'pct', f: 'pct', get: p => p.revNet ? p.pat / p.revNet : null },
      { type: 'section', label: 'Key cost ratios (% of net revenue)' },
      { label: 'Milk cost', type: 'pct', f: 'pct', get: p => p.lines.MAT_MILK / p.revNet },
      { label: 'Material consumption (stock-adjusted)', type: 'pct', f: 'pct', get: p => p.consumption / p.revNet },
      { label: 'Packing materials', type: 'pct', f: 'pct', get: p => p.lines.MAT_PACK / p.revNet },
      { label: 'Employee costs', type: 'pct', f: 'pct', get: p => p.lines.OPX_EMP / p.revNet },
      { label: 'Selling, distribution & trade spend', type: 'pct', f: 'pct', get: p => p.lines.OPX_SD / p.revNet },
      { label: 'Power, fuel & utilities (incl. production fuel)', type: 'pct', f: 'pct', get: p => (p.lines.OPX_POWER + p.lines.MAT_FUEL) / p.revNet },
      { label: 'Finance costs', type: 'pct', f: 'pct', get: p => p.fin / p.revNet },
      { label: 'Returns & discounts (% of gross sales)', type: 'pct', f: 'pct', get: p => p.revRet / p.revGross }
    ];
  }

  function plTable(model, sel) {
    const ms = monthsUpTo(model, sel);
    const prev = prevOf(model, sel);
    const ytd = model.ytd[sel] && model.ytd[sel].pl;
    const gap = model.gap, A = MIS.analytics;
    const sources = [], cols = [];
    if (gap) {
      sources.push(gap.pl, A.gapAvg(model));
      cols.push({ label: gap.label + ' total', kind: 'gap' }, { label: gap.label + ' avg / month', kind: 'gap' });
    }
    const off = sources.length;
    ms.forEach(m => { sources.push(model.pl[m.key] || null); cols.push({ label: m.label, kind: 'month', provisional: model.stock[m.key] && model.stock[m.key].src === 'provisional' }); });
    const selCol = off + ms.length - 1;
    let prevCol = prev && model.pl[prev.key] ? off + ms.findIndex(m => m.key === prev.key) : -1;
    let cmpLabel = 'MoM %';
    if (prevCol < 0 && gap && ms[0].key === sel) { prevCol = 1; cmpLabel = 'vs ' + gap.label + ' avg'; }
    sources.push(ytd || null);
    cols.push({ label: 'YTD ' + ms[ms.length - 1].label, kind: 'ytd' });
    cols.push({ label: cmpLabel, kind: 'mom' });
    const rows = buildRows(plDefs(), sources, [momExtra(ms.length, selCol, prevCol)]);

    // Growth section: each month vs the previous month (first month vs the earlier-months average)
    const base = i => {
      const mi = i - off;
      if (mi < 0 || mi >= ms.length) return null;
      for (let j = mi - 1; j >= 0; j--) if (model.pl[ms[j].key]) return j === mi - 1 ? sources[off + j] : null;
      return gap && mi === 0 ? sources[1] : null;
    };
    const blank = () => ({ v: null, f: 'text' });
    rows.push({ label: 'Growth (vs previous month; first month vs ' + (gap ? gap.label + ' average' : 'n/a') + ')', type: 'section', cells: sources.map(blank).concat([blank()]) });
    [['Net revenue growth', p => p.revNet, 'chg'], ['Gross profit growth', p => p.gp, 'chg'], ['Operating expenses growth', p => p.opex, 'chg'],
      ['EBITDA change (₹)', p => p.ebitda, 'amtd'], ['Gross margin change', p => (p.revNet ? p.gp / p.revNet : null), 'pp'], ['EBITDA margin change', p => (p.revNet ? p.ebitda / p.revNet : null), 'pp']]
      .forEach(g => {
        const cells = sources.map((s, i) => {
          const b = base(i);
          if (!s || !b) return { v: null, f: g[2] === 'amtd' ? 'amt' : g[2] };
          const c = g[1](s), p = g[1](b);
          if (g[2] === 'chg') return { v: F.change(c, p), f: 'chg' };
          return { v: isNum(c) && isNum(p) ? c - p : null, f: g[2] === 'amtd' ? 'amt' : 'pp' };
        });
        cells.push(blank());
        rows.push({ label: g[0], type: 'pct', indent: 1, cells: cells });
      });
    return { id: 'pl', title: 'Statement of profit & loss', subtitle: model.company + ' · ' + F.unitDef().label, columns: cols, rows: rows };
  }

  /* ---------------------------- Balance sheet --------------------------- */
  function bsDefs() {
    const ln = id => b => b.lines[id];
    const line = (id, extra) => Object.assign({ label: L[id].label, get: ln(id), indent: 1 }, extra || {});
    return [
      { type: 'section', label: 'EQUITY & LIABILITIES' },
      { type: 'section', label: "Shareholders' funds" },
      line('EQ_SHARE'), line('EQ_RES'), line('EQ_RE', { keep: true }),
      { label: 'Net worth', type: 'subtotal', get: b => b.equity },
      { type: 'section', label: 'Borrowings' },
      line('BR_LT'), line('BR_UNSEC'), line('BR_OCD'), line('BR_ST'), line('BR_BANKCR'),
      { label: 'Total borrowings', type: 'subtotal', get: b => b.debt },
      { type: 'section', label: 'Current liabilities' },
      line('CL_TP'), line('CL_CUSTADV'), line('CL_STAT'), line('CL_EMP'), line('CL_INT'), line('CL_OTH'), line('CL_PROV'), line('CL_DTL'),
      { label: 'Total current liabilities', type: 'subtotal', get: b => b.cl },
      { label: 'TOTAL EQUITY & LIABILITIES', type: 'total', get: b => b.totalLE },
      { type: 'section', label: 'ASSETS' },
      { type: 'section', label: 'Fixed assets' },
      line('FA_GROSS'), line('FA_INT'), line('FA_CWIP'), line('FA_ACCDEP'),
      { label: 'Net fixed assets', type: 'subtotal', get: b => b.nfa },
      { type: 'section', label: 'Other non-current assets' },
      line('INVEST'), line('CA_DTA'), line('CA_DEP'),
      { label: 'Total other non-current assets', type: 'subtotal', get: b => b.nca },
      { type: 'section', label: 'Current assets' },
      line('CA_INV', { keep: true }), line('CA_TR'), line('CA_SUPADV'), line('CA_STAT'), line('CA_LA'), line('CA_OTH'), line('CA_MISC'), line('CA_SUSP'), line('CA_CASH', { keep: true }),
      { label: 'Total current assets', type: 'subtotal', get: b => b.ca },
      { label: 'TOTAL ASSETS', type: 'total', get: b => b.totalA },
      { type: 'section', label: 'Memo' },
      { label: 'Check: assets − liabilities (should be nil)', type: 'memo', get: b => b.diff, keep: true },
      { label: 'Net debt (borrowings − cash)', type: 'memo', get: b => b.netDebt },
      { label: 'Trade working capital (inventory + receivables − payables)', type: 'memo', get: b => b.tradeWC },
      { label: 'Net GST / tax credit (receivable − payable)', type: 'memo', get: b => b.lines.CA_STAT - b.lines.CL_STAT }
    ];
  }
  function bsTable(model, sel) {
    const ms = monthsUpTo(model, sel);
    const prev = prevOf(model, sel);
    const sources = ms.map(m => model.bs[m.key] || null);
    const selCol = ms.length - 1;
    const prevCol = prev ? ms.findIndex(m => m.key === prev.key) : -1;
    const cols = ms.map(m => ({ label: m.label, kind: 'month', provisional: model.stock[m.key] && model.stock[m.key].src === 'provisional' }));
    cols.push({ label: 'Δ MoM', kind: 'delta' });
    cols.push({ label: 'Δ %', kind: 'mom' });
    const rows = buildRows(bsDefs(), sources, [
      (d, vals) => ({ v: isNum(vals[selCol]) && prevCol >= 0 && isNum(vals[prevCol]) ? vals[selCol] - vals[prevCol] : null, f: 'amt' }),
      (d, vals) => ({ v: prevCol >= 0 ? F.change(vals[selCol], vals[prevCol]) : null, f: 'chg' })
    ]);
    return { id: 'bs', title: 'Balance sheet (month-end)', subtitle: model.company + ' · ' + F.unitDef().label, columns: cols, rows: rows };
  }

  /* ---------------------------- Cash flow ------------------------------- */
  function cfDefs() {
    const w = k => c => c.wc[k];
    return [
      { type: 'section', label: 'A. Cash flow from operating activities' },
      { label: 'Profit before tax', get: c => c.pbt, indent: 1, keep: true },
      { label: 'Add: Depreciation & amortisation', get: c => c.dep, indent: 1 },
      { label: 'Add: Finance costs', get: c => c.fin, indent: 1 },
      { label: 'Operating profit before working-capital changes', type: 'subtotal', get: c => c.opBeforeWC },
      { type: 'section', label: 'Working-capital changes' },
      { label: '(Increase) / decrease in inventories', get: w('inv'), indent: 1 },
      { label: '(Increase) / decrease in trade receivables', get: w('tr'), indent: 1 },
      { label: '(Increase) / decrease in advances to suppliers', get: w('supadv'), indent: 1 },
      { label: '(Increase) / decrease in GST & tax receivables', get: w('stat_a'), indent: 1 },
      { label: '(Increase) / decrease in loans, advances & deposits', get: w('la'), indent: 1 },
      { label: '(Increase) / decrease in other current assets', get: w('otha'), indent: 1 },
      { label: 'Increase / (decrease) in trade payables', get: w('tp'), indent: 1 },
      { label: 'Increase / (decrease) in customer advances', get: w('custadv'), indent: 1 },
      { label: 'Increase / (decrease) in statutory dues', get: w('stat_l'), indent: 1 },
      { label: 'Increase / (decrease) in employee dues', get: w('emp'), indent: 1 },
      { label: 'Increase / (decrease) in other payables & provisions', get: w('othl'), indent: 1 },
      { label: 'Total working-capital change', type: 'subtotal', get: c => c.wcTotal },
      { label: 'Income tax paid', get: c => c.tax, indent: 1 },
      { label: 'Net cash from operating activities (CFO)', type: 'total', get: c => c.cfo },
      { type: 'section', label: 'B. Cash flow from investing activities' },
      { label: 'Capital expenditure (net)', get: c => c.capex, indent: 1, keep: true },
      { label: 'Investments', get: c => c.invest, indent: 1 },
      { label: 'Net cash from investing activities (CFI)', type: 'total', get: c => c.cfi },
      { type: 'section', label: 'C. Cash flow from financing activities' },
      { label: 'Equity raised', get: c => c.equity, indent: 1 },
      { label: 'Term loans raised / (repaid)', get: c => c.dLT, indent: 1 },
      { label: 'Unsecured loans raised / (repaid)', get: c => c.dUnsec, indent: 1 },
      { label: 'OCDs issued / (redeemed)', get: c => c.dOCD, indent: 1 },
      { label: 'Short-term bank borrowings / overdrawn balances', get: c => c.dST, indent: 1 },
      { label: 'Interest & bank charges paid', get: c => c.intPaid, indent: 1 },
      { label: 'Net cash from financing activities (CFF)', type: 'total', get: c => c.cff },
      { label: 'Net increase / (decrease) in cash', type: 'subtotal', get: c => c.net },
      { label: 'Opening cash & bank', get: c => c.open, indent: 1, keep: true },
      { label: 'Other / unreconciled', get: c => c.other, indent: 1 },
      { label: 'Closing cash & bank', type: 'total', get: c => c.close },
      { type: 'section', label: 'Memo' },
      { label: 'Free cash flow (CFO + CFI)', type: 'memo', get: c => c.fcf, keep: true }
    ];
  }
  function cfTable(model, sel) {
    const ms = monthsUpTo(model, sel);
    const sources = ms.map(m => model.cf[m.key] || null);
    sources.push(model.ytd[sel] ? model.ytd[sel].cf : null);
    const cols = ms.map(m => ({ label: m.label, kind: 'month' }));
    cols.push({ label: 'YTD ' + ms[ms.length - 1].label, kind: 'ytd' });
    const rows = buildRows(cfDefs(), sources, []);
    return { id: 'cf', title: 'Cash flow statement (indirect method)', subtitle: model.company + ' · ' + F.unitDef().label, columns: cols, rows: rows };
  }

  /* ---------------------------- Ratios ---------------------------------- */
  function ratioDefs() {
    const r = k => x => x.r[k];
    return [
      { type: 'section', label: 'Growth & margins' },
      { label: 'Net revenue', get: x => x.pl && x.pl.revNet, f: 'amt', indent: 1 },
      { label: 'Revenue growth (MoM)', get: x => x.growth, f: 'pct', indent: 1 },
      { label: 'Gross margin', get: r('gm'), f: 'pct', indent: 1 },
      { label: 'EBITDA margin', get: r('ebitdaM'), f: 'pct', indent: 1 },
      { label: 'PAT margin', get: r('patM'), f: 'pct', indent: 1 },
      { type: 'section', label: 'Working capital' },
      { label: 'Receivable days (DSO)', get: r('dso'), f: 'days', indent: 1 },
      { label: 'Inventory days on COGS (DIO)', get: r('dio'), f: 'days', indent: 1 },
      { label: 'Payable days (DPO)', get: r('dpo'), f: 'days', indent: 1 },
      { label: 'Cash conversion cycle', get: r('ccc'), f: 'days', indent: 1 },
      { label: 'Inventory cover — days of material consumption', get: r('invCoverCons'), f: 'days', indent: 1 },
      { label: 'Raw-material runway — days of purchases in stock', get: r('invCoverPurch'), f: 'days', indent: 1 },
      { label: 'Trade working capital % annualised revenue', get: r('nwcPctRev'), f: 'pct', indent: 1 },
      { type: 'section', label: 'Liquidity' },
      { label: 'Current ratio', get: r('currentRatio'), f: 'x', indent: 1 },
      { label: 'Quick ratio', get: r('quickRatio'), f: 'x', indent: 1 },
      { label: 'Cash ratio', get: r('cashRatio'), f: 'x', indent: 1 },
      { label: 'Cash runway (months, trailing FCF burn)', get: r('runway'), f: 'months', indent: 1 },
      { label: 'Fixed-cost cover (months)', get: r('fixedCover'), f: 'months', indent: 1 },
      { label: 'Net GST / tax credit locked', get: r('gstLocked'), f: 'amt', indent: 1 },
      { type: 'section', label: 'Solvency' },
      { label: 'Net worth', get: r('netWorth'), f: 'amt', indent: 1 },
      { label: 'Net debt', get: r('netDebt'), f: 'amt', indent: 1 },
      { label: 'Debt / equity', get: r('de'), f: 'x', indent: 1 },
      { label: 'Net debt / annualised EBITDA', get: r('netDebtEbitda'), f: 'x', indent: 1 },
      { label: 'Interest cover (EBITDA / finance costs)', get: r('intCover'), f: 'x', indent: 1 },
      { type: 'section', label: 'Returns (annualised)' },
      { label: 'ROCE (EBIT / capital employed)', get: r('roce'), f: 'pct', indent: 1 },
      { label: 'ROE', get: r('roe'), f: 'pct', indent: 1 },
      { label: 'Fixed-asset turnover', get: r('assetTurn'), f: 'x', indent: 1 }
    ].map(d => Object.assign({ keep: true }, d));
  }
  function ratioTable(model, sel) {
    const ms = monthsUpTo(model, sel);
    const sources = ms.map((m, i) => {
      const pl = model.pl[m.key] || null;
      const ppl = i > 0 ? model.pl[ms[i - 1].key] : null;
      return { r: model.ratios[m.key] || {}, pl: pl, growth: pl && ppl ? F.change(pl.revNet, ppl.revNet) : null };
    });
    const y = model.ytd[sel] || {};
    sources.push({ r: y.ratios || {}, pl: y.pl, growth: null });
    const cols = ms.map(m => ({ label: m.label, kind: 'month' }));
    cols.push({ label: 'YTD ' + ms[ms.length - 1].label, kind: 'ytd' });
    const defs = ratioDefs();
    const rows = buildRows(defs, sources, []).map(row => { if (row.type === 'line') row.type = 'line'; return row; });
    return { id: 'ratios', title: 'Key ratios & KPIs', subtitle: model.company, columns: cols, rows: rows };
  }

  /* ---------------------------- Cash bridge ----------------------------- */
  function bridgeTable(model, sel, ytd) {
    const cf = ytd ? (model.ytd[sel] && model.ytd[sel].cf) : model.cf[sel];
    if (!cf) return null;
    const rows = [{ label: 'Opening cash & bank', type: 'subtotal', cells: [{ v: cf.open, f: 'amt' }] }];
    cf.bridge.forEach(b => rows.push({ label: b.label, type: 'line', indent: 1, cells: [{ v: b.v, f: 'amt' }] }));
    rows.push({ label: 'Closing cash & bank', type: 'total', cells: [{ v: cf.close, f: 'amt' }] });
    return { id: 'bridge', title: 'Cash bridge', columns: [{ label: F.unitDef().label, kind: 'month' }], rows: rows };
  }

  /* ---------------------------- Ledger detail --------------------------- */
  function ledgerTable(model, sel) {
    const ms = monthsUpTo(model, sel);
    const ytd = model.ytd[sel] && model.ytd[sel].pl;
    const keys = {};
    const add = (pl, idx) => pl && pl.ledgers.forEach(l => {
      const k = l.line + '||' + l.group + '||' + l.name;
      keys[k] = keys[k] || { line: l.line, group: l.group, name: l.name, vals: new Array(ms.length + 1).fill(null) };
      keys[k].vals[idx] = (keys[k].vals[idx] || 0) + l.amt;
    });
    ms.forEach((m, i) => add(model.pl[m.key], i));
    add(ytd, ms.length);
    const order = MIS.config.PL_LINES.map(l => l.id);
    const list = Object.keys(keys).map(k => keys[k]).sort((a, b) => order.indexOf(a.line) - order.indexOf(b.line) || a.name.localeCompare(b.name));
    const rows = [];
    let cur = null;
    list.forEach(x => {
      if (x.line !== cur) { cur = x.line; rows.push({ label: L[cur].label, type: 'section', cells: x.vals.map(() => ({ v: null, f: 'text' })) }); }
      rows.push({ label: x.name, type: 'line', indent: 1, cells: x.vals.map(v => ({ v: v, f: 'amt' })), group: x.group });
    });
    const cols = ms.map(m => ({ label: m.label, kind: 'month' }));
    cols.push({ label: 'YTD', kind: 'ytd' });
    return { id: 'ledgers', title: 'P&L ledger detail (by MIS line)', subtitle: model.company + ' · ' + F.unitDef().label, columns: cols, rows: rows };
  }

  MIS.tables = { plTable, bsTable, cfTable, ratioTable, bridgeTable, ledgerTable, monthsUpTo, prevOf };
})(window.MIS);
