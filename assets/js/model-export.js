/* =============================================================================
 * model-export.js — "Financials" workbook in financial-modelling layout.
 * -----------------------------------------------------------------------------
 * Sheet 1  Financials : Income statement, balance sheet and cash flow stacked
 *                       on ONE sheet, with integrity checks.
 * Sheet 2  Ratios     : ratio summary, every cell a formula linked to Sheet 1.
 *
 * Columns : each month → a quarter column after every third month of the FY
 *           → YTD.   Rows are fixed so the layout never changes month to month.
 * Conventions (FAST-style):
 *   blue font  = hard-coded input taken from the Tally trial balance
 *   black font = formula        green font = link to another sheet
 *   Quarter = SUM of its months (flows) / quarter-end month (balances)
 *   YTD     = SUMIF over the month columns (flows) / latest month (balances)
 * When a quarter or YTD can't be built from months present in the sheet
 * (e.g. only an FY-to-date TB was uploaded) the engine value is written as a
 * blue input instead.
 * ===========================================================================*/
window.MIS = window.MIS || {};

(function (MIS) {
  'use strict';
  const F = MIS.fmt, E = MIS.engine.helpers;
  const C_NAVY = 'FF051C2C', C_BLUE = 'FF2251FF', C_QHDR = 'FF23415C', C_INPUT = 'FF0000FF', C_CALC = 'FF000000',
    C_LINK = 'FF008000', C_GREY = 'FF5B6B7A', C_QFILL = 'FFF3F5F8', C_YFILL = 'FFEEF2FF', C_TOT = 'FFF2F4F7', C_RULE = 'FFB8C2CC';
  const FIRST_COL = 3;   // A = label, B = unit, C.. = periods
  const FIRST_ROW = 11;  // rows 1-10 = titles + period header block
  const colL = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const isNum = v => typeof v === 'number' && isFinite(v);

  /* ------------------------- calc helpers -------------------------------- */
  // Every calc has f(R) → Excel formula (R(key) = cell address) and js(V) → value
  const SUMR = (a, b) => ({ f: R => 'SUM(' + R(a) + ':' + R(b) + ')', js: (V, X) => X.between(a, b).reduce((s, k) => s + V(k), 0) });
  const TERMS = (...t) => ({ f: R => t.map((x, i) => (x[1] < 0 ? '-' : (i ? '+' : '')) + R(x[0])).join(''), js: V => t.reduce((s, x) => s + x[1] * V(x[0]), 0) });
  const DIV = (n, d) => ({ f: R => 'IFERROR(' + R(n) + '/' + R(d) + ',0)', js: V => (V(d) ? V(n) / V(d) : 0) });
  const LINK = k => ({ f: R => R(k), js: V => V(k) });
  const CHECK = (a, b) => ({ f: R => 'ROUND(' + R(a) + '-' + R(b) + ',2)', js: V => Math.round((V(a) - V(b)) * 100) / 100 });

  /* ------------------------- Financials rows ----------------------------- */
  function finRows() {
    const rows = [];
    const hdr = label => rows.push({ type: 'hdr', label: label });
    const sub = label => rows.push({ type: 'sub', label: label });
    const blank = () => rows.push({ type: 'blank' });
    const inp = (key, label, sec, agg, src) => rows.push({ key, label, sec, agg, src, type: 'in', unit: 'amt' });
    const calc = (key, label, sec, c, style, extra) => rows.push(Object.assign({ key, label, sec, type: 'calc', unit: 'amt', style: style || '' }, c, extra || {}));
    const pct = (key, label, sec, c) => rows.push(Object.assign({ key, label, sec, type: 'pct', unit: 'pct' }, c));
    const ln = id => s => s.pl.lines[id];
    const bl = id => s => s.bs.lines[id];
    const L = MIS.config.ALL_LINES;

    hdr('INCOME STATEMENT');
    inp('rev_gross', 'Gross sales', 'pl', 'sum', s => s.pl.revGross);
    inp('rev_ret', 'Less: returns, discounts & rebates', 'pl', 'sum', s => -s.pl.revRet);
    calc('rev_net', 'Net revenue from operations', 'pl', SUMR('rev_gross', 'rev_ret'), 'subtotal');
    blank();
    sub('Cost of goods sold');
    inp('stock_open', 'Opening stock', 'pl', 'first', s => s.pl.stockOpen);
    ['MAT_MILK', 'MAT_RM', 'MAT_TRADED', 'MAT_PACK', 'MAT_FUEL', 'MAT_OTH', 'DIR_EXP'].forEach(id => inp(id.toLowerCase(), L[id].label, 'pl', 'sum', ln(id)));
    inp('stock_close', 'Less: closing stock', 'pl', 'last', s => -s.pl.stockClose);
    calc('cogs', 'Cost of goods sold', 'pl', SUMR('stock_open', 'stock_close'), 'subtotal');
    calc('gp', 'Gross profit', 'pl', TERMS(['rev_net', 1], ['cogs', -1]), 'total');
    pct('gm', 'Gross margin %', 'pl', DIV('gp', 'rev_net'));
    blank();
    sub('Operating expenses');
    ['OPX_EMP', 'OPX_SD', 'OPX_POWER', 'OPX_RENT', 'OPX_PROF', 'OPX_RM', 'OPX_ADMIN', 'OPX_BAD', 'OPX_SUSP'].forEach(id => inp(id.toLowerCase(), L[id].label, 'pl', 'sum', ln(id)));
    calc('opex', 'Total operating expenses', 'pl', SUMR('opx_emp', 'opx_susp'), 'subtotal');
    calc('ebitda', 'EBITDA', 'pl', TERMS(['gp', 1], ['opex', -1]), 'total');
    pct('ebitda_m', 'EBITDA margin %', 'pl', DIV('ebitda', 'rev_net'));
    blank();
    inp('oi', 'Add: other income', 'pl', 'sum', s => s.pl.oi);
    inp('dep', 'Less: depreciation & amortisation', 'pl', 'sum', s => s.pl.dep);
    calc('ebit', 'EBIT', 'pl', TERMS(['ebitda', 1], ['oi', 1], ['dep', -1]), 'subtotal');
    inp('fin', 'Less: finance costs', 'pl', 'sum', s => s.pl.fin);
    calc('pbt', 'Profit before tax', 'pl', TERMS(['ebit', 1], ['fin', -1]), 'subtotal');
    inp('tax', 'Less: tax', 'pl', 'sum', s => s.pl.tax);
    calc('pat', 'Profit after tax', 'pl', TERMS(['pbt', 1], ['tax', -1]), 'total');
    pct('pat_m', 'PAT margin %', 'pl', DIV('pat', 'rev_net'));
    blank();

    hdr('BALANCE SHEET');
    sub("Shareholders' funds");
    ['EQ_SHARE', 'EQ_RES', 'EQ_RE'].forEach(id => inp(id.toLowerCase(), L[id].label, 'bs', 'last', bl(id)));
    calc('nw', 'Net worth', 'bs', SUMR('eq_share', 'eq_re'), 'subtotal');
    sub('Borrowings');
    ['BR_LT', 'BR_UNSEC', 'BR_OCD', 'BR_ST', 'BR_BANKCR'].forEach(id => inp(id.toLowerCase(), L[id].label, 'bs', 'last', bl(id)));
    calc('debt', 'Total borrowings', 'bs', SUMR('br_lt', 'br_bankcr'), 'subtotal');
    sub('Current liabilities');
    ['CL_TP', 'CL_CUSTADV', 'CL_STAT', 'CL_EMP', 'CL_INT', 'CL_OTH', 'CL_PROV', 'CL_DTL'].forEach(id => inp(id.toLowerCase(), L[id].label, 'bs', 'last', bl(id)));
    calc('cl', 'Total current liabilities', 'bs', SUMR('cl_tp', 'cl_dtl'), 'subtotal');
    calc('tle', 'Total equity & liabilities', 'bs', TERMS(['nw', 1], ['debt', 1], ['cl', 1]), 'total');
    blank();
    sub('Fixed assets');
    ['FA_GROSS', 'FA_INT', 'FA_CWIP', 'FA_ACCDEP'].forEach(id => inp(id.toLowerCase(), L[id].label, 'bs', 'last', bl(id)));
    calc('nfa', 'Net fixed assets', 'bs', SUMR('fa_gross', 'fa_accdep'), 'subtotal');
    sub('Other non-current assets');
    ['INVEST', 'CA_DTA', 'CA_DEP'].forEach(id => inp(id.toLowerCase(), L[id].label, 'bs', 'last', bl(id)));
    calc('nca', 'Total other non-current assets', 'bs', SUMR('invest', 'ca_dep'), 'subtotal');
    sub('Current assets');
    ['CA_INV', 'CA_TR', 'CA_SUPADV', 'CA_STAT', 'CA_LA', 'CA_OTH', 'CA_MISC', 'CA_SUSP', 'CA_CASH'].forEach(id => inp(id.toLowerCase(), L[id].label, 'bs', 'last', bl(id)));
    calc('ca', 'Total current assets', 'bs', SUMR('ca_inv', 'ca_cash'), 'subtotal');
    calc('ta', 'Total assets', 'bs', TERMS(['nfa', 1], ['nca', 1], ['ca', 1]), 'total');
    blank();

    hdr('CASH FLOW STATEMENT');
    sub('A. Operating activities');
    calc('cf_pbt', 'Profit before tax', 'cf', LINK('pbt'), '', { needs: ['pl'] });
    calc('cf_dep', 'Add: depreciation & amortisation', 'cf', LINK('dep'), '', { needs: ['pl'] });
    calc('cf_fin', 'Add: finance costs', 'cf', LINK('fin'), '', { needs: ['pl'] });
    calc('cf_opwc', 'Operating profit before working-capital changes', 'cf', SUMR('cf_pbt', 'cf_fin'), 'subtotal', { needs: ['pl'] });
    const wc = [['inv', '(Increase) / decrease in inventories'], ['tr', '(Increase) / decrease in trade receivables'], ['supadv', '(Increase) / decrease in advances to suppliers'],
      ['stat_a', '(Increase) / decrease in GST & tax receivables'], ['la', '(Increase) / decrease in loans, advances & deposits'], ['otha', '(Increase) / decrease in other current assets'],
      ['tp', 'Increase / (decrease) in trade payables'], ['custadv', 'Increase / (decrease) in customer advances'], ['stat_l', 'Increase / (decrease) in statutory dues'],
      ['emp', 'Increase / (decrease) in employee dues'], ['othl', 'Increase / (decrease) in other payables & provisions']];
    wc.forEach(w => inp('wc_' + w[0], w[1], 'cf', 'sum', s => s.cf.wc[w[0]]));
    calc('cf_wc', 'Total working-capital change', 'cf', SUMR('wc_inv', 'wc_othl'), 'subtotal');
    inp('cf_tax', 'Income tax paid', 'cf', 'sum', s => s.cf.tax);
    calc('cfo', 'Net cash from operating activities (CFO)', 'cf', TERMS(['cf_opwc', 1], ['cf_wc', 1], ['cf_tax', 1]), 'total', { needs: ['pl'] });
    sub('B. Investing activities');
    inp('cf_capex', 'Capital expenditure (net)', 'cf', 'sum', s => s.cf.capex);
    inp('cf_inv', 'Investments', 'cf', 'sum', s => s.cf.invest);
    calc('cfi', 'Net cash from investing activities (CFI)', 'cf', SUMR('cf_capex', 'cf_inv'), 'total');
    sub('C. Financing activities');
    inp('cf_eq', 'Equity raised', 'cf', 'sum', s => s.cf.equity);
    inp('cf_lt', 'Term loans raised / (repaid)', 'cf', 'sum', s => s.cf.dLT);
    inp('cf_unsec', 'Unsecured loans raised / (repaid)', 'cf', 'sum', s => s.cf.dUnsec);
    inp('cf_ocd', 'OCDs issued / (redeemed)', 'cf', 'sum', s => s.cf.dOCD);
    inp('cf_st', 'Short-term bank borrowings / overdrawn balances', 'cf', 'sum', s => s.cf.dST);
    inp('cf_int', 'Interest & bank charges paid', 'cf', 'sum', s => s.cf.intPaid);
    calc('cff', 'Net cash from financing activities (CFF)', 'cf', SUMR('cf_eq', 'cf_int'), 'total');
    calc('cf_net', 'Net increase / (decrease) in cash', 'cf', TERMS(['cfo', 1], ['cfi', 1], ['cff', 1]), 'subtotal', { needs: ['pl'] });
    inp('cash_open', 'Opening cash & bank', 'cf', 'first', s => s.cf.open);
    inp('cash_other', 'Other / unreconciled', 'cf', 'sum', s => s.cf.other);
    calc('cash_close', 'Closing cash & bank', 'cf', TERMS(['cash_open', 1], ['cf_net', 1], ['cash_other', 1]), 'total', { needs: ['pl'] });
    calc('fcf', 'Memo: free cash flow (CFO + CFI)', 'cf', TERMS(['cfo', 1], ['cfi', 1]), 'memo', { needs: ['pl'] });
    blank();

    hdr('CHECKS');
    calc('chk_bs', 'Balance sheet: total assets − total equity & liabilities', 'bs', CHECK('ta', 'tle'), 'check');
    calc('chk_cf', 'Cash flow: closing cash − balance-sheet cash', 'cf', CHECK('cash_close', 'ca_cash'), 'check', { needs: ['pl', 'bs'] });
    rows.push({ key: 'chk_all', label: 'Model status', type: 'status' });
    return rows;
  }

  /* ------------------------- Ratio rows ---------------------------------- */
  function ratioRows() {
    const rows = [];
    const hdr = label => rows.push({ type: 'hdr', label: label });
    const r = (key, label, unit, needs, f, js, link) => rows.push({ key, label, unit, needs, f, js, type: link ? 'link' : 'calc' });
    const nm = 'n/m';
    const mats = R => 'SUM(' + R('mat_milk') + ':' + R('mat_oth') + ')';
    const matsV = V => ['mat_milk', 'mat_rm', 'mat_traded', 'mat_pack', 'mat_fuel', 'mat_oth'].reduce((s, k) => s + V(k), 0);
    const cons = R => '(' + R('stock_open') + '+' + mats(R) + '+' + R('stock_close') + ')';
    const consV = V => V('stock_open') + matsV(V) + V('stock_close');
    const stl = R => '(' + R('cl') + '+' + R('br_st') + '+' + R('br_bankcr') + ')';
    const stlV = V => V('cl') + V('br_st') + V('br_bankcr');
    const ann = R => '365/' + R('days');
    const safe = (cond, val) => (cond ? val : nm);

    hdr('GROWTH & MARGINS');
    r('r_rev', 'Net revenue', 'amt', ['pl'], R => R('rev_net'), V => V('rev_net'), true);
    r('r_gm', 'Gross margin', 'pct', ['pl'], R => 'IFERROR(' + R('gp') + '/' + R('rev_net') + ',0)', V => (V('rev_net') ? V('gp') / V('rev_net') : 0));
    r('r_em', 'EBITDA margin', 'pct', ['pl'], R => 'IFERROR(' + R('ebitda') + '/' + R('rev_net') + ',0)', V => (V('rev_net') ? V('ebitda') / V('rev_net') : 0));
    r('r_pm', 'PAT margin', 'pct', ['pl'], R => 'IFERROR(' + R('pat') + '/' + R('rev_net') + ',0)', V => (V('rev_net') ? V('pat') / V('rev_net') : 0));
    hdr('COST STRUCTURE (% OF NET REVENUE)');
    const share = (key, label, num, numV) => r(key, label, 'pct', ['pl'], R => 'IFERROR(' + num(R) + '/' + R('rev_net') + ',0)', V => (V('rev_net') ? numV(V) / V('rev_net') : 0));
    share('r_milk', 'Milk cost', R => R('mat_milk'), V => V('mat_milk'));
    share('r_cons', 'Material consumption (stock-adjusted)', cons, consV);
    share('r_pack', 'Packing materials', R => R('mat_pack'), V => V('mat_pack'));
    share('r_emp', 'Employee costs', R => R('opx_emp'), V => V('opx_emp'));
    share('r_sd', 'Selling, distribution & trade spend', R => R('opx_sd'), V => V('opx_sd'));
    share('r_pow', 'Power, fuel & utilities (incl. production fuel)', R => '(' + R('opx_power') + '+' + R('mat_fuel') + ')', V => V('opx_power') + V('mat_fuel'));
    share('r_finp', 'Finance costs', R => R('fin'), V => V('fin'));
    r('r_ret', 'Returns & discounts (% of gross sales)', 'pct', ['pl'], R => 'IFERROR(-' + R('rev_ret') + '/' + R('rev_gross') + ',0)', V => (V('rev_gross') ? -V('rev_ret') / V('rev_gross') : 0));
    hdr('WORKING CAPITAL');
    r('r_dso', 'Receivable days (DSO)', 'days', ['pl', 'bs'], R => 'IFERROR(' + R('ca_tr') + '/' + R('rev_net') + '*' + R('days') + ',"' + nm + '")', V => safe(V('rev_net'), V('ca_tr') / V('rev_net') * V('days')));
    r('r_dio', 'Inventory days on COGS (DIO)', 'days', ['pl', 'bs'], R => 'IF(' + R('cogs') + '>0,' + R('ca_inv') + '/' + R('cogs') + '*' + R('days') + ',"' + nm + '")', V => safe(V('cogs') > 0, V('ca_inv') / V('cogs') * V('days')));
    r('r_dpo', 'Payable days (DPO)', 'days', ['pl', 'bs'], R => 'IF((' + mats(R) + '+' + R('dir_exp') + ')>0,' + R('cl_tp') + '/(' + mats(R) + '+' + R('dir_exp') + ')*' + R('days') + ',"' + nm + '")',
      V => safe(matsV(V) + V('dir_exp') > 0, V('cl_tp') / (matsV(V) + V('dir_exp')) * V('days')));
    r('r_ccc', 'Cash conversion cycle', 'days', ['pl', 'bs'], R => 'IFERROR(' + R('r_dso') + '+' + R('r_dio') + '-' + R('r_dpo') + ',"' + nm + '")',
      V => ([V('r_dso'), V('r_dio'), V('r_dpo')].every(isNum) ? V('r_dso') + V('r_dio') - V('r_dpo') : nm));
    r('r_invc', 'Inventory cover — days of material consumption', 'days', ['pl', 'bs'], R => 'IF(' + cons(R) + '>0,' + R('ca_inv') + '/' + cons(R) + '*' + R('days') + ',"' + nm + '")',
      V => safe(consV(V) > 0, V('ca_inv') / consV(V) * V('days')));
    r('r_rmr', 'Raw-material runway — days of purchases in stock', 'days', ['pl', 'bs'], R => 'IF(' + mats(R) + '>0,' + R('ca_inv') + '/' + mats(R) + '*' + R('days') + ',"' + nm + '")',
      V => safe(matsV(V) > 0, V('ca_inv') / matsV(V) * V('days')));
    r('r_twc', 'Trade working capital (inventory + receivables − payables)', 'amt', ['bs'], R => R('ca_inv') + '+' + R('ca_tr') + '-' + R('cl_tp'), V => V('ca_inv') + V('ca_tr') - V('cl_tp'));
    hdr('LIQUIDITY');
    r('r_cr', 'Current ratio (CL incl. bank OD & overdrawn balances)', 'x', ['bs'], R => 'IFERROR(' + R('ca') + '/' + stl(R) + ',"' + nm + '")', V => safe(stlV(V), V('ca') / stlV(V)));
    r('r_qr', 'Quick ratio', 'x', ['bs'], R => 'IFERROR((' + R('ca') + '-' + R('ca_inv') + ')/' + stl(R) + ',"' + nm + '")', V => safe(stlV(V), (V('ca') - V('ca_inv')) / stlV(V)));
    r('r_cashr', 'Cash ratio', 'x', ['bs'], R => 'IFERROR(' + R('ca_cash') + '/' + stl(R) + ',"' + nm + '")', V => safe(stlV(V), V('ca_cash') / stlV(V)));
    r('r_gst', 'Net GST / tax credit locked', 'amt', ['bs'], R => R('ca_stat') + '-' + R('cl_stat'), V => V('ca_stat') - V('cl_stat'));
    hdr('SOLVENCY');
    r('r_nw', 'Net worth', 'amt', ['bs'], R => R('nw'), V => V('nw'), true);
    r('r_debt', 'Total borrowings', 'amt', ['bs'], R => R('debt'), V => V('debt'), true);
    r('r_nd', 'Net debt (borrowings − cash)', 'amt', ['bs'], R => R('debt') + '-' + R('ca_cash'), V => V('debt') - V('ca_cash'));
    r('r_de', 'Debt / equity', 'x', ['bs'], R => 'IF(' + R('nw') + '>0,' + R('debt') + '/' + R('nw') + ',"' + nm + '")', V => safe(V('nw') > 0, V('debt') / V('nw')));
    r('r_ic', 'Interest cover (EBITDA / finance costs)', 'x', ['pl'], R => 'IF(' + R('fin') + '>0,' + R('ebitda') + '/' + R('fin') + ',"' + nm + '")', V => safe(V('fin') > 0, V('ebitda') / V('fin')));
    r('r_nde', 'Net debt / annualised EBITDA', 'x', ['pl', 'bs'], R => 'IF(' + R('ebitda') + '>0,' + R('r_nd') + '/(' + R('ebitda') + '*' + ann(R) + '),"' + nm + '")',
      V => safe(V('ebitda') > 0, V('r_nd') / (V('ebitda') * 365 / V('days'))));
    hdr('RETURNS (ANNUALISED)');
    r('r_roce', 'ROCE (EBIT / capital employed)', 'pct', ['pl', 'bs'], R => 'IF((' + R('nw') + '+' + R('debt') + ')>0,' + R('ebit') + '*' + ann(R) + '/(' + R('nw') + '+' + R('debt') + '),"' + nm + '")',
      V => safe(V('nw') + V('debt') > 0, V('ebit') * 365 / V('days') / (V('nw') + V('debt'))));
    r('r_roe', 'ROE', 'pct', ['pl', 'bs'], R => 'IF(' + R('nw') + '>0,' + R('pat') + '*' + ann(R) + '/' + R('nw') + ',"' + nm + '")', V => safe(V('nw') > 0, V('pat') * 365 / V('days') / V('nw')));
    r('r_fat', 'Fixed-asset turnover', 'x', ['pl', 'bs'], R => 'IF(' + R('nfa') + '>0,' + R('rev_net') + '*' + ann(R) + '/' + R('nfa') + ',"' + nm + '")', V => safe(V('nfa') > 0, V('rev_net') * 365 / V('days') / V('nfa')));
    hdr('CASH');
    r('r_fcf', 'Free cash flow (CFO + CFI)', 'amt', ['cf'], R => R('fcf'), V => V('fcf'), true);
    r('r_fcfm', 'Free cash flow per month (average)', 'amt', ['cf'], R => R('fcf') + '/' + R('days') + '*30.4', V => V('fcf') / V('days') * 30.4);
    r('r_run', 'Cash runway (months at this burn)', 'months', ['cf', 'bs'], R => 'IF(' + R('r_fcfm') + '<0,MAX(0,' + R('ca_cash') + '/-' + R('r_fcfm') + '),"FCF +ve")', V => (V('r_fcfm') < 0 ? Math.max(0, V('ca_cash') / -V('r_fcfm')) : 'FCF +ve'));
    return rows;
  }

  /* ------------------------- columns ------------------------------------- */
  function buildColumns(model, sel) {
    const view = MIS.tables.monthsUpTo(model, sel);
    const selM = model.months.find(m => m.key === sel);
    const fyShort = 'FY' + String(+model.fyStart.slice(0, 4) + 1).slice(2);
    const cols = [], fyMonths = [];
    let ms = model.fyStart;
    while (ms <= selM.start) {
      const me = E.monthEnd(ms), key = ms.slice(0, 7);
      fyMonths.push({ key: key, start: ms, end: me });
      const m = view.find(x => x.key === key);
      if (m) cols.push({ type: 'Month', label: m.label, start: ms, end: me, days: m.days, stmt: { pl: model.pl[key] || null, bs: model.bs[key] || null, cf: model.cf[key] || null } });
      if (fyMonths.length % 3 === 0) {
        const qs = fyMonths[fyMonths.length - 3].start;
        const per = model.period(qs, me);
        cols.push({ type: 'Quarter', label: 'Q' + (fyMonths.length / 3) + ' ' + fyShort, start: qs, end: me, days: per.days,
          comp: cols.filter(c => c.type === 'Month' && c.start >= qs && c.end <= me), stmt: per });
      }
      ms = E.addDays(me, 1);
    }
    const y = model.ytd[sel] || {};
    const compY = cols.filter(c => c.type === 'Month');
    cols.push({ type: 'YTD', label: 'YTD ' + selM.label, start: model.fyStart, end: selM.end, days: E.daysBetween(model.fyStart, selM.end), comp: compY,
      full: compY.length === fyMonths.length, stmt: { pl: y.pl || null, bs: model.bs[sel] || null, cf: y.cf || null } });

    // How each statement is filled in each column: formula (from months) / value / none
    cols.forEach(c => {
      c.mode = {};
      ['pl', 'bs', 'cf'].forEach(sec => {
        if (c.type === 'Month') { c.mode[sec] = c.stmt[sec] ? 'value' : 'none'; return; }
        const complete = c.type === 'Quarter' ? c.comp.length === 3 : c.full;
        if (complete && c.comp.length && c.comp.every(m => m.stmt[sec])) c.mode[sec] = 'formula';
        else c.mode[sec] = c.stmt[sec] ? 'value' : 'none';
      });
      c.stock = model.stockClose(c.end).src;
    });
    const out = cols.filter(c => c.type === 'Month' || c.type === 'YTD' || ['pl', 'bs', 'cf'].some(s => c.mode[s] !== 'none'));
    out.forEach((c, i) => { c.idx = FIRST_COL + i; c.L = colL(c.idx); });
    return out;
  }

  /* ------------------------- formats & styles ---------------------------- */
  function numFmt(unit) {
    const dp = F.unitDef().dp;
    switch (unit) {
      case 'amt': return dp ? '#,##0.00_);(#,##0.00);"–"_)' : '#,##0_);(#,##0);"–"_)';
      case 'pct': return '0.0%_);(0.0%);"–"_)';
      case 'days': return '#,##0_);(#,##0);"–"_)';
      case 'x': return '0.00"x"_);(0.00"x");"–"_)';
      case 'months': return '0.0_);(0.0);"–"_)';
      default: return 'General';
    }
  }
  const unitLabel = u => ({ amt: F.unitDef().label, pct: '%', days: 'days', x: 'x', months: 'months' }[u] || '');
  const font = (o) => Object.assign({ name: 'Arial', size: 10, color: { argb: C_CALC } }, o || {});
  const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb } });
  const colFill = c => (c.type === 'Quarter' ? fill(C_QFILL) : c.type === 'YTD' ? fill(C_YFILL) : null);

  function writeHeader(ws, model, cols, title) {
    const lastL = cols[cols.length - 1].L;
    ws.getColumn(1).width = 50; ws.getColumn(2).width = 9;
    cols.forEach(c => { ws.getColumn(c.idx).width = 12.5; });
    ws.getCell('A1').value = model.company;
    ws.getCell('A1').font = { name: 'Georgia', size: 14, bold: true, color: { argb: C_NAVY } };
    ws.getCell('A2').value = title;
    ws.getCell('A2').font = font({ size: 12, bold: true, color: { argb: C_BLUE } });
    ws.getCell('A3').value = 'Amounts in ' + F.unitDef().label + ' unless stated  ·  Blue = input from Tally trial balance  ·  Black = formula  ·  Green = link  ·  Grey columns = quarters  ·  Tinted column = YTD';
    ws.getCell('A3').font = font({ size: 8.5, italic: true, color: { argb: C_GREY } });
    const hdr = [['Period', c => c.label], ['Period end', c => { const p = c.end.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); }],
      ['Period type', c => c.type], ['Days', c => c.days], ['Closing stock basis', c => ({ books: 'Books', manual: 'Manual', provisional: 'Provisional' }[c.stock] || '')]];
    hdr.forEach((h, i) => {
      const r = 5 + i;
      ws.getCell('A' + r).value = h[0];
      ws.getCell('A' + r).font = font({ bold: i === 0, color: { argb: i === 0 ? 'FFFFFFFF' : C_GREY } });
      if (i === 0) { ws.getCell('A' + r).fill = fill(C_NAVY); ws.getCell('B' + r).fill = fill(C_NAVY); }
      cols.forEach(c => {
        const cell = ws.getCell(c.L + r);
        cell.value = h[1](c);
        cell.alignment = { horizontal: 'right' };
        if (i === 0) { cell.font = font({ bold: true, color: { argb: 'FFFFFFFF' } }); cell.fill = fill(c.type === 'Quarter' ? C_QHDR : c.type === 'YTD' ? C_BLUE : C_NAVY); }
        else if (i === 1) { cell.numFmt = 'dd-mmm-yy'; cell.font = font({ color: { argb: C_GREY } }); }
        else if (i === 4) cell.font = font({ size: 9, italic: true, color: { argb: c.stock === 'provisional' ? 'FFB45309' : C_GREY } });
        else cell.font = font({ size: 9, italic: true, color: { argb: C_GREY } });
        if (i > 0 && colFill(c)) cell.fill = colFill(c);
      });
    });
    ws.getRow(10).height = 6;
    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 9, showGridLines: false, zoomScale: 90 }];
    ws.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '5:9' };
    return lastL;
  }

  function styleBand(ws, r, cols, label) {
    ws.getCell('A' + r).value = label;
    ['A', 'B'].concat(cols.map(c => c.L)).forEach(L => { const cell = ws.getCell(L + r); cell.fill = fill(C_NAVY); cell.font = font({ bold: true, color: { argb: 'FFFFFFFF' } }); });
  }

  /* ------------------------- writer -------------------------------------- */
  function writeFinancials(wb, model, cols) {
    const ws = wb.addWorksheet('Financials', { properties: { tabColor: { argb: C_NAVY } } });
    writeHeader(ws, model, cols, 'Financial statements — monthly, quarterly and YTD');
    const rows = finRows();
    const rowOf = {}, order = [];
    rows.forEach((s, i) => { s.r = FIRST_ROW + i; if (s.key) { rowOf[s.key] = s.r; order.push(s.key); } });
    const between = (a, b) => order.slice(order.indexOf(a), order.indexOf(b) + 1);
    const div = F.unitDef().div;
    const vals = cols.map(() => ({}));
    const ytd = cols[cols.length - 1];
    const sumifRange = r => {
      const lastPeriod = cols[cols.length - 2] || cols[0];
      return 'SUMIF($' + cols[0].L + '$7:$' + lastPeriod.L + '$7,"Month",' + cols[0].L + r + ':' + lastPeriod.L + r + ')';
    };

    rows.forEach(s => {
      const r = s.r;
      if (s.type === 'hdr') { styleBand(ws, r, cols, s.label); return; }
      if (s.type === 'blank') return;
      const lab = ws.getCell('A' + r);
      lab.value = s.label;
      if (s.type === 'sub') { lab.font = font({ bold: true, italic: true, color: { argb: C_BLUE } }); return; }
      if (s.type === 'status') {
        lab.font = font({ bold: true });
        cols.forEach(c => {
          const cell = ws.getCell(c.L + r);
          cell.value = { formula: 'IF(AND(ABS(N(' + c.L + rowOf.chk_bs + '))<0.01,ABS(N(' + c.L + rowOf.chk_cf + '))<0.01),"OK","ERROR")', result: (Math.abs(vals[cols.indexOf(c)].chk_bs || 0) < 0.01 && Math.abs(vals[cols.indexOf(c)].chk_cf || 0) < 0.01) ? 'OK' : 'ERROR' };
          cell.alignment = { horizontal: 'right' }; cell.font = font({ bold: true });
        });
        const ref = cols[0].L + r + ':' + cols[cols.length - 1].L + r;
        ws.addConditionalFormatting({ ref: ref, rules: [
          { type: 'containsText', operator: 'containsText', text: 'OK', style: { font: { color: { argb: 'FF15803D' }, bold: true }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFECFDF3' } } } },
          { type: 'containsText', operator: 'containsText', text: 'ERROR', style: { font: { color: { argb: 'FF9C0006' }, bold: true }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } } } }] });
        return;
      }
      ws.getCell('B' + r).value = unitLabel(s.unit);
      ws.getCell('B' + r).font = font({ size: 8.5, color: { argb: C_GREY } });
      const bold = s.style === 'subtotal' || s.style === 'total';
      lab.font = font({ bold: bold, italic: s.type === 'pct' || s.style === 'memo' || s.style === 'check', color: { argb: s.type === 'pct' || s.style === 'memo' ? C_GREY : C_CALC } });
      if (s.type === 'in') lab.alignment = { indent: 1 };
      if (s.style === 'total') { lab.fill = fill(C_TOT); ws.getCell('B' + r).fill = fill(C_TOT); }

      cols.forEach((c, ci) => {
        const needs = [s.sec].concat(s.needs || []);
        if (needs.some(n => c.mode[n] === 'none')) return;
        const cell = ws.getCell(c.L + r);
        const V = k => (isNum(vals[ci][k]) ? vals[ci][k] : 0);
        let isInput = false;
        if (s.type === 'in') {
          const mode = c.mode[s.sec];
          if (mode === 'value') {
            const raw = s.src(c.stmt);
            const v = isNum(raw) ? raw / div : 0;
            vals[ci][s.key] = v; cell.value = v; isInput = true;
          } else { // formula aggregation from the month columns
            const comp = c.comp, ids = comp.map(m => cols.indexOf(m));
            let f, v;
            if (s.agg === 'sum') {
              f = c.type === 'Quarter' ? 'SUM(' + comp[0].L + r + ':' + comp[comp.length - 1].L + r + ')' : sumifRange(r);
              v = ids.reduce((a, i) => a + (vals[i][s.key] || 0), 0);
            } else if (s.agg === 'first') { f = comp[0].L + r; v = vals[ids[0]][s.key] || 0; }
            else { f = comp[comp.length - 1].L + r; v = vals[ids[ids.length - 1]][s.key] || 0; }
            vals[ci][s.key] = v; cell.value = { formula: f, result: v };
          }
        } else {
          const R = k => c.L + rowOf[k];
          const v = s.js(V, { between: between });
          vals[ci][s.key] = v;
          cell.value = { formula: s.f(R), result: v };
        }
        cell.numFmt = numFmt(s.unit);
        cell.font = font({ bold: bold, italic: s.type === 'pct' || s.style === 'memo', color: { argb: isInput ? C_INPUT : (s.type === 'pct' || s.style === 'memo' ? C_GREY : C_CALC) } });
        if (colFill(c)) cell.fill = colFill(c);
        if (s.style === 'total') { cell.fill = colFill(c) || fill(C_TOT); }
        if (s.style === 'subtotal') cell.border = { top: { style: 'thin', color: { argb: C_RULE } } };
        if (s.style === 'total') cell.border = { top: { style: 'thin', color: { argb: C_NAVY } }, bottom: { style: 'double', color: { argb: C_NAVY } } };
      });
      if (s.style === 'subtotal') { lab.border = { top: { style: 'thin', color: { argb: C_RULE } } }; }
      if (s.style === 'total') { lab.border = { top: { style: 'thin', color: { argb: C_NAVY } }, bottom: { style: 'double', color: { argb: C_NAVY } } }; }
      if (s.style === 'check') {
        ws.addConditionalFormatting({ ref: cols[0].L + r + ':' + cols[cols.length - 1].L + r,
          rules: [{ type: 'cellIs', operator: 'notEqual', formulae: ['0'], style: { font: { color: { argb: 'FF9C0006' } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } } } }] });
      }
    });

    // Notes
    let r = rows[rows.length - 1].r + 2;
    const notes = [
      'Notes',
      '1. Blue figures are taken from the Tally trial balance through the MIS account mapping (see the dashboard, Data & mapping tab). Black figures are formulas.',
      '2. Quarter columns sum the three months for income-statement and cash-flow lines and take the quarter-end month for balance-sheet lines. YTD sums the month columns (SUMIF on "Month").',
      '3. Where months are missing from the sheet, the quarter / YTD figure is taken from a period or FY-to-date trial balance and shown in blue.',
      '4. Closing stock is not part of a Tally trial balance; "Closing stock basis" shows whether it came from the books, a manual entry or is provisional (carried forward).',
      '5. Cash = cash-in-hand + bank debit balances. Bank OD and overdrawn bank ledgers are treated as short-term borrowings. Costs are shown positive and deducted in formulas.'
    ];
    notes.forEach((n, i) => { const cell = ws.getCell('A' + (r + i)); cell.value = n; cell.font = font({ size: 8.5, bold: i === 0, color: { argb: C_GREY } }); });
    if (cols.some(c => c.stock === 'provisional')) {
      const cell = ws.getCell('A' + (r + notes.length)); cell.value = 'Warning: one or more columns use a PROVISIONAL closing stock — margins will change when the actual stock is entered.';
      cell.font = font({ size: 8.5, bold: true, color: { argb: 'FFB45309' } });
    }
    return { rowOf: rowOf, vals: vals };
  }

  function writeRatios(wb, model, cols, fin) {
    const ws = wb.addWorksheet('Ratios', { properties: { tabColor: { argb: C_BLUE } } });
    writeHeader(ws, model, cols, 'Ratio summary — linked to the Financials sheet');
    const rows = ratioRows();
    const rowOf = {};
    rows.forEach((s, i) => { s.r = FIRST_ROW + i; if (s.key) rowOf[s.key] = s.r; });
    const vals = cols.map(() => ({}));
    rows.forEach(s => {
      const r = s.r;
      if (s.type === 'hdr') { styleBand(ws, r, cols, s.label); return; }
      ws.getCell('A' + r).value = s.label;
      ws.getCell('A' + r).font = font();
      ws.getCell('A' + r).alignment = { indent: 1 };
      ws.getCell('B' + r).value = unitLabel(s.unit);
      ws.getCell('B' + r).font = font({ size: 8.5, color: { argb: C_GREY } });
      cols.forEach((c, ci) => {
        if (s.needs.some(n => c.mode[n] === 'none')) return;
        const R = k => (k === 'days' ? c.L + '$8' : rowOf[k] ? c.L + rowOf[k] : 'Financials!' + c.L + fin.rowOf[k]);
        const V = k => {
          if (k === 'days') return c.days;
          const src = rowOf[k] ? vals[ci] : fin.vals[ci];
          const v = src[k];
          return k.indexOf('r_') === 0 ? v : (isNum(v) ? v : 0);
        };
        let v = s.js(V);
        if (typeof v === 'number' && !isFinite(v)) v = 'n/m';
        vals[ci][s.key] = v;
        const cell = ws.getCell(c.L + r);
        cell.value = { formula: s.f(R), result: v };
        cell.numFmt = numFmt(s.unit);
        cell.alignment = { horizontal: 'right' };
        cell.font = font({ color: { argb: s.type === 'link' ? C_LINK : C_CALC } });
        if (colFill(c)) cell.fill = colFill(c);
      });
    });
    const r = rows[rows.length - 1].r + 2;
    ws.getCell('A' + r).value = 'Days-based ratios use the period length in row 8. Annualised ratios scale the period to 365 days. "n/m" = not meaningful (e.g. negative equity or EBITDA).';
    ws.getCell('A' + r).font = font({ size: 8.5, italic: true, color: { argb: C_GREY } });
  }

  async function download(model, sel) {
    if (typeof ExcelJS === 'undefined') throw new Error('Excel writer (ExcelJS) did not load — check your internet connection.');
    const cols = buildColumns(model, sel);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'MIS Dashboard'; wb.created = new Date();
    wb.calcProperties.fullCalcOnLoad = true;
    const fin = writeFinancials(wb, model, cols);
    writeRatios(wb, model, cols, fin);
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const selM = model.months.find(m => m.key === sel);
    const name = model.company.replace(/[^\w ]+/g, '').trim() + ' - Financials - ' + selM.label + '.xlsx';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return name;
  }

  MIS.modelExport = { download, buildColumns, finRows, ratioRows };
})(window.MIS);
