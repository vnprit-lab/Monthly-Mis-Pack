/* =============================================================================
 * app.js — UI: upload, persistence, tabs, rendering.
 * Data never leaves the browser: uploaded trial balances are parsed locally
 * and stored in this browser's localStorage (use Backup to move machines).
 * ===========================================================================*/
(function (MIS) {
  'use strict';
  const F = MIS.fmt, T = MIS.tables, CH = MIS.charts, E = MIS.engine.helpers;
  const STORE_KEY = 'mis-dashboard-v1';
  const $ = id => document.getElementById(id);
  const esc = F.esc;

  /* ------------------------------ state --------------------------------- */
  const state = { tbs: [], stockOverrides: {}, mapOverrides: {}, settings: { unit: 'lakh' }, sel: null, fy: null, tab: 'summary', mapFilter: '', mapOnlyOver: false };
  let model = null, dirty = true;

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      state.tbs = s.tbs || []; state.stockOverrides = s.stockOverrides || {}; state.mapOverrides = s.mapOverrides || {};
      state.settings = Object.assign(state.settings, s.settings || {});
      state.tab = s.tab || 'summary';
    } catch (e) { console.warn('Could not read saved data', e); }
  }
  function serialise() {
    return JSON.stringify({ version: 1, savedAt: new Date().toISOString(), tbs: state.tbs, stockOverrides: state.stockOverrides, mapOverrides: state.mapOverrides, settings: state.settings, tab: state.tab },
      (k, v) => (k && k.charAt(0) === '_' ? undefined : v));
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, serialise()); }
    catch (e) { toast('Could not save to this browser (storage full or blocked). Use Data & mapping → Download backup.', true); }
  }
  function getModel() {
    if (dirty) { model = MIS.engine.build(state); dirty = false; }
    return model;
  }
  function changed() { dirty = true; save(); render(); }

  /* ------------------------------ helpers ------------------------------- */
  let toastTimer = null;
  function toast(msg, err) {
    const t = $('toast');
    t.innerHTML = msg; t.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = 'toast'; }, err ? 9000 : 5000);
  }
  function fmtCell(c) {
    switch (c.f) {
      case 'amt': return F.amt(c.v);
      case 'pct': return F.pct(c.v);
      case 'pp': return F.pp(c.v);
      case 'chg': return F.signedPct(c.v);
      case 'days': return F.days(c.v);
      case 'x': return F.x(c.v);
      case 'months': return F.ok(c.v) ? (c.v >= 24 ? '24+' : c.v.toFixed(1)) : '–';
      default: return c.v === null || c.v === undefined ? '' : esc(c.v);
    }
  }
  function renderTable(t) {
    if (!t) return '';
    const lastMonth = t.columns.map(c => c.kind).lastIndexOf('month');
    let h = '<div class="table-wrap"><table class="fin"><thead><tr><th>Particulars</th>';
    t.columns.forEach((c, i) => {
      const cls = (i === lastMonth ? 'sel' : '') + (c.kind === 'ytd' ? ' ytd' : '');
      h += '<th class="' + cls + '">' + esc(c.label) + (c.provisional ? '<span class="prov" title="Closing stock provisional">PROV</span>' : '') + '</th>';
    });
    h += '</tr></thead><tbody>';
    t.rows.forEach(r => {
      h += '<tr class="' + r.type + '"><td class="ind' + (r.indent || 0) + '">' + esc(r.label) + '</td>';
      r.cells.forEach((c, i) => {
        const col = t.columns[i] || {};
        let cls = i === lastMonth ? 'sel' : col.kind === 'ytd' ? 'ytd' : (col.kind === 'mom' || col.kind === 'delta') ? 'mom' : '';
        if (col.kind === 'mom' && F.ok(c.v) && c.v !== 0) cls += c.v > 0 ? ' up' : ' down';
        if ((r.type === 'total' || r.type === 'subtotal') && c.f === 'amt' && F.ok(c.v) && c.v < -0.5) cls += ' neg-v';
        h += '<td class="' + cls + '">' + (r.type === 'section' ? '' : fmtCell(c)) + '</td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table></div>';
    return h;
  }
  function delta(cur, prev, prevLabel, kind) {
    if (!F.ok(cur) || !F.ok(prev)) return '<span class="muted">vs prior month: n/a</span>';
    if (kind === 'pp') {
      const d = cur - prev;
      return '<span class="' + (d >= 0 ? 'up' : 'down') + '">' + (d >= 0 ? '▲ ' : '▼ ') + F.pp(d).replace(/^[+–]/, '') + '</span> vs ' + prevLabel;
    }
    const c = F.change(cur, prev);
    if (c === null) return '<span class="muted">vs ' + prevLabel + ': n/a</span>';
    return '<span class="' + (c >= 0 ? 'up' : 'down') + '">' + (c >= 0 ? '▲ ' : '▼ ') + Math.abs(c * 100).toFixed(1) + '%</span> vs ' + prevLabel;
  }
  function amtU(v) { return F.amt(v, F.unitDef().dp === 0 ? 0 : (Math.abs(v / F.unitDef().div) >= 1000 ? 0 : 1)); }
  function exhibit(no, title, unit, body, source) {
    return '<div class="card exhibit"><div class="exhibit-no">Exhibit ' + no + '</div><h3>' + title + '</h3>' + (unit ? '<div class="unit">' + unit + '</div>' : '') + body +
      '<div class="source">' + (source || 'Source: Tally trial balance; MIS analysis') + '</div></div>';
  }
  let exNo = 0;
  const ex = (title, unit, body, source) => exhibit(++exNo, title, unit, body, source);
  const pageHead = (kicker, title, lede, actions) =>
    '<div class="page-head"><div><div class="kicker">' + kicker + '</div><h1 class="action">' + title + '</h1>' + (lede ? '<p class="lede">' + lede + '</p>' : '') + '</div>' +
    (actions ? '<div class="actions">' + actions + '</div>' : '') + '</div>';
  const dlBtn = (which, label) => '<button class="btn btn-line btn-sm" data-action="download" data-which="' + which + '">⬇ ' + label + '</button>';

  /* ------------------------------ empty state --------------------------- */
  function renderEmpty() {
    return '<div class="empty"><div class="kicker">Get started</div><h1 class="action">Upload the monthly Tally trial balance to build the investor MIS</h1>' +
      '<p class="lede">The dashboard builds the P&amp;L, balance sheet, cash flow, working-capital and ratio analysis automatically. Files are processed inside this browser — nothing is uploaded to a server.</p>' +
      '<div class="dropzone" data-action="upload"><div class="big">Drop trial balance files here, or click to choose</div><div class="muted">Excel exports from Tally (.xls / .xlsx). You can select several months at once.</div></div>' +
      '<div class="card" style="margin-top:18px"><h2 class="action" style="font-size:17px">How to export from Tally</h2><ol class="steps">' +
      '<li>Gateway of Tally → <b>Display More Reports → Trial Balance</b>.</li>' +
      '<li>Press <b>F2</b> (Period) and set one month, e.g. <code>1-10-2026</code> to <code>31-10-2026</code>.</li>' +
      '<li>Press <b>Alt+F5</b> for the <b>Detailed</b> view (groups with their ledgers / sub-groups).</li>' +
      '<li>Export (<b>Alt+E</b>) → Excel. Upload the file here. Repeat each month — the new month is added automatically.</li>' +
      '<li>For the first load, upload every month from April separately (or April-to-date plus each month) so trends, MoM change and the cash flow can be computed.</li></ol></div></div>';
  }

  /* ------------------------------ executive summary --------------------- */
  function ctx(m, sel) {
    const i = m.months.findIndex(x => x.key === sel);
    const mon = m.months[i], prev = i > 0 ? m.months[i - 1] : null;
    return {
      i: i, mon: mon, prev: prev,
      pl: m.pl[sel], b: m.bs[sel], cf: m.cf[sel], r: m.ratios[sel] || {},
      ppl: prev ? m.pl[prev.key] : null, pb: prev ? m.bs[prev.key] : null, pr: prev ? m.ratios[prev.key] || {} : {},
      ytd: m.ytd[sel] || {}, upto: T.monthsUpTo(m, sel)
    };
  }

  function renderSummary(m, sel) {
    const c = ctx(m, sel), ins = MIS.insights.generate(m, sel);
    const P = c.prev ? c.prev.label : 'prior month';
    const k = [];
    const tile = (lbl, val, d, ytd, neg) => '<div class="kpi"><div class="lbl">' + lbl + '</div><div class="val' + (neg ? ' neg' : '') + '">' + val + '</div><div class="d">' + d + '</div>' + (ytd ? '<div class="ytd">' + ytd + '</div>' : '') + '</div>';
    const u = F.unitDef().short;
    if (c.pl) {
      k.push(tile('Net revenue', amtU(c.pl.revNet) + ' <small style="font-size:13px">' + u + '</small>', delta(c.pl.revNet, c.ppl && c.ppl.revNet, P), c.ytd.pl ? 'YTD ' + F.money(c.ytd.pl.revNet) : ''));
      k.push(tile('Gross margin', F.pct(c.r.gm), delta(c.r.gm, c.pr.gm, P, 'pp'), c.ytd.pl && c.ytd.pl.revNet ? 'YTD ' + F.pct(c.ytd.pl.gp / c.ytd.pl.revNet) : '', c.r.gm < 0));
      k.push(tile('EBITDA', amtU(c.pl.ebitda) + ' <small style="font-size:13px">' + u + '</small>', 'Margin ' + F.pct(c.r.ebitdaM) + ' · ' + delta(c.pl.ebitda, c.ppl && c.ppl.ebitda, P), c.ytd.pl ? 'YTD ' + F.money(c.ytd.pl.ebitda) : '', c.pl.ebitda < 0));
      k.push(tile('Profit after tax', amtU(c.pl.pat) + ' <small style="font-size:13px">' + u + '</small>', delta(c.pl.pat, c.ppl && c.ppl.pat, P), c.ytd.pl ? 'YTD ' + F.money(c.ytd.pl.pat) : '', c.pl.pat < 0));
    }
    if (c.b) {
      const effective = c.b.cash - c.b.lines.BR_BANKCR - c.b.lines.BR_ST;
      k.push(tile('Cash & bank', amtU(c.b.cash) + ' <small style="font-size:13px">' + u + '</small>', delta(c.b.cash, c.pb && c.pb.cash, P), 'Net of OD / overdrawn: ' + F.money(effective), false));
      const rw = c.r.runway;
      k.push(tile('Cash runway', rw === undefined ? 'n/a' : rw === null ? 'FCF +ve' : (rw >= 24 ? '24+' : rw.toFixed(1)) + ' <small style="font-size:13px">months</small>',
        rw === undefined ? '<span class="muted">needs prior month BS</span>' : 'Avg FCF ' + F.money(c.r.avgFCF) + '/mo', 'Net debt ' + F.money(c.b.netDebt), rw !== undefined && rw !== null && rw < 6));
    }

    let h = pageHead('Executive summary · ' + c.mon.label + ' · ' + m.fyLabel, esc(ins.headline),
      provisionalNote(m, sel), dlBtn('all', 'Excel pack'));
    h += '<div class="kpis">' + k.join('') + '</div>';

    h += '<div class="grid g-main">';
    h += '<div class="card exhibit"><div class="exhibit-no">Key messages for investors</div><h3>What the numbers say this month</h3><ol class="messages">' +
      ins.messages.map(x => '<li class="' + x.tone + '"><div class="t">' + esc(x.title) + '</div><div class="b">' + esc(x.body) + '</div></li>').join('') + '</ol>' +
      '<div class="source">Full commentary in <a href="#" data-goto="insights">Insights &amp; risks</a>.</div></div>';
    h += '<div class="grid">' +
      ex('Net revenue by month', F.unitDef().label + ' · selected month highlighted', '<div class="chart-box"><canvas id="chRev"></canvas></div>') +
      ex('Gross and EBITDA margin trend', '% of net revenue', '<div class="chart-box"><canvas id="chMargin"></canvas></div>') + '</div>';
    h += '</div><div class="grid g2" style="margin-top:18px">';
    h += c.cf ? ex('Cash bridge — where the cash went in ' + c.mon.label, F.unitDef().label + ' · blue = inflow, orange = outflow',
      '<div class="chart-box tall"><canvas id="chBridge"></canvas></div>', 'Source: Tally TB; direct-method view derived from P&L and balance-sheet movements (GST shown net)')
      : ex('Cash bridge — ' + c.mon.label, '', '<p class="muted">Upload the previous month\'s trial balance to compute the cash bridge for ' + c.mon.label + '.</p>');
    h += ex('Working capital — days', 'Receivable, inventory and payable days', wcTiles(c) + '<div class="chart-box" style="height:200px;margin-top:12px"><canvas id="chWC"></canvas></div>');
    h += '</div>';
    const fails = ins.checks.filter(x => x.status !== 'ok');
    h += '<div class="card" style="margin-top:18px"><div class="exhibit-no">Data integrity</div><ul class="checks">' +
      (fails.length ? fails.slice(0, 6) : ins.checks.slice(0, 3)).map(x => '<li class="' + x.status + '">' + esc(x.text) + '</li>').join('') + '</ul></div>';

    return { html: h, after: () => {
      const labels = c.upto.map(x => x.label);
      CH.monthlyBars('chRev', labels, c.upto.map(x => m.pl[x.key] ? CH.unitVal(m.pl[x.key].revNet) : null), c.upto.length - 1);
      CH.lines('chMargin', labels, [
        { label: 'Gross margin', data: c.upto.map(x => m.ratios[x.key] && F.ok(m.ratios[x.key].gm) ? +(m.ratios[x.key].gm * 100).toFixed(1) : null) },
        { label: 'EBITDA margin', data: c.upto.map(x => m.ratios[x.key] && F.ok(m.ratios[x.key].ebitdaM) ? +(m.ratios[x.key].ebitdaM * 100).toFixed(1) : null) }
      ], { suffix: '%' });
      if (c.cf) CH.waterfall('chBridge', c.cf.open, c.cf.bridge, c.cf.close);
      wcChart('chWC', m, c.upto);
    } };
  }
  function wcTiles(c) {
    const r = c.r;
    const t = (l, v, s) => '<div class="wc-tile"><div class="lbl">' + l + '</div><div class="val">' + v + '</div><div class="s">' + s + '</div></div>';
    return '<div class="wc-tiles">' +
      t('DSO', F.days(r.dso), 'Receivables ' + F.money(c.b && c.b.lines.CA_TR)) +
      t('DIO', F.days(r.dio), 'Inventory ' + F.money(c.b && c.b.lines.CA_INV)) +
      t('DPO', F.days(r.dpo), 'Payables ' + F.money(c.b && c.b.lines.CL_TP)) +
      t('Cash cycle', F.days(r.ccc), 'Trade WC ' + F.money(c.b && c.b.tradeWC)) + '</div>';
  }
  function wcChart(id, m, upto) {
    const g = k => upto.map(x => m.ratios[x.key] && F.ok(m.ratios[x.key][k]) ? Math.round(m.ratios[x.key][k]) : null);
    CH.lines(id, upto.map(x => x.label), [{ label: 'DSO', data: g('dso') }, { label: 'DIO', data: g('dio') }, { label: 'DPO', data: g('dpo') }], { suffix: ' d' });
  }
  function provisionalNote(m, sel) {
    const s = m.stock[sel];
    if (s && s.src === 'provisional') return '<span class="pill warn">Provisional</span> Closing stock for ' + m.months.find(x => x.key === sel).label + ' is not yet in the books and has been carried forward (' + F.money(s.v) + '). Margins, inventory days and cash flow will update when it is entered.';
    return '';
  }

  /* ------------------------------ P&L ----------------------------------- */
  function renderPL(m, sel) {
    const c = ctx(m, sel), t = T.plTable(m, sel);
    const title = c.pl ? 'Net revenue of ' + F.money(c.pl.revNet) + ' at ' + F.pct(c.r.gm) + ' gross margin; EBITDA ' + F.money(c.pl.ebitda) + ' and PAT ' + F.money(c.pl.pat) + ' in ' + c.mon.label
      : 'P&L not available for ' + c.mon.label;
    let h = pageHead('Profit & loss · ' + c.mon.label, esc(title), provisionalNote(m, sel) || 'Monthly columns, financial-year-to-date and month-on-month change. Costs shown positive; deductions in parentheses.', dlBtn('pl', 'Download P&L (Excel)'));
    h += ex('Statement of profit & loss — monthly, YTD and MoM', F.unitDef().label, renderTable(t));
    if (c.pl) {
      h += '<div class="grid g2" style="margin-top:18px">';
      h += ex('Cost structure — ' + c.mon.label, '% of net revenue', '<div class="chart-box tall"><canvas id="chCost"></canvas></div>');
      h += ex('Gross sales by sales ledger — ' + c.mon.label, F.unitDef().label + ' · channel / product mix', '<div class="chart-box tall"><canvas id="chMix"></canvas></div>');
      h += '</div><div class="grid g2" style="margin-top:18px">';
      h += ex('EBITDA by month', F.unitDef().label, '<div class="chart-box"><canvas id="chEbitda"></canvas></div>');
      h += ex('Profit after tax by month', F.unitDef().label, '<div class="chart-box"><canvas id="chPat"></canvas></div>');
      h += '</div>';
    }
    return { html: h, after: () => {
      if (!c.pl) return;
      const L = MIS.config.ALL_LINES, p = c.pl;
      const items = [['Material consumption', p.consumption], ['Direct expenses', p.dirExp]].concat(
        ['OPX_EMP', 'OPX_SD', 'OPX_POWER', 'OPX_RENT', 'OPX_PROF', 'OPX_RM', 'OPX_ADMIN', 'OPX_BAD'].map(k => [L[k].label, p.lines[k]])).concat([['Finance costs', p.fin]])
        .filter(x => Math.abs(x[1]) > 1).sort((a, b) => b[1] - a[1]);
      CH.hbars('chCost', items.map(x => x[0]), items.map(x => p.revNet ? +(x[1] / p.revNet * 100).toFixed(1) : 0), { pct: true, focusFirst: true });
      const sl = p.salesLedgers.slice(0, 7);
      const other = p.salesLedgers.slice(7).reduce((a, x) => a + x.amt, 0);
      if (Math.abs(other) > 1) sl.push({ name: 'Other ledgers', amt: other });
      CH.hbars('chMix', sl.map(x => x.name.length > 34 ? x.name.slice(0, 33) + '…' : x.name), sl.map(x => +CH.unitVal(x.amt).toFixed(2)), { focusFirst: true });
      const labels = c.upto.map(x => x.label);
      CH.monthlyBars('chEbitda', labels, c.upto.map(x => m.pl[x.key] ? CH.unitVal(m.pl[x.key].ebitda) : null), c.upto.length - 1);
      CH.monthlyBars('chPat', labels, c.upto.map(x => m.pl[x.key] ? CH.unitVal(m.pl[x.key].pat) : null), c.upto.length - 1);
    } };
  }

  /* ------------------------------ Balance sheet ------------------------- */
  function renderBS(m, sel) {
    const c = ctx(m, sel), t = T.bsTable(m, sel), b = c.b;
    const title = b ? 'Net worth of ' + F.money(b.equity) + ' and borrowings of ' + F.money(b.debt) + ' fund ' + F.money(b.nfa) + ' of net fixed assets and ' + F.money(b.ca - b.cash) + ' of non-cash current assets'
      : 'Balance sheet not available for ' + c.mon.label;
    let h = pageHead('Balance sheet · as at ' + (b ? b.date : c.mon.end), esc(title), provisionalNote(m, sel) || 'Gross presentation: debit balances in creditors are shown as supplier advances, credit balances in bank ledgers as overdrawn borrowings.', dlBtn('bs', 'Download balance sheet (Excel)'));
    h += ex('Balance sheet — month-end with change vs prior month', F.unitDef().label, renderTable(t));
    if (b) {
      h += '<div class="grid g2" style="margin-top:18px">';
      h += ex('Sources of funds — ' + c.mon.label, F.unitDef().label, '<div class="chart-box tall"><canvas id="chFund"></canvas></div>');
      h += ex('Uses of funds — ' + c.mon.label, F.unitDef().label, '<div class="chart-box tall"><canvas id="chUse"></canvas></div>');
      h += '</div>';
    }
    return { html: h, after: () => {
      if (!b) return;
      const l = b.lines;
      const src = [['Share capital & reserves', l.EQ_SHARE + l.EQ_RES], ['OCDs', l.BR_OCD], ['Unsecured loans', l.BR_UNSEC], ['Term loans', l.BR_LT], ['Bank OD / CC', l.BR_ST], ['Overdrawn bank balances', l.BR_BANKCR], ['Trade payables', l.CL_TP], ['Statutory dues', l.CL_STAT], ['Other current liabilities', l.CL_EMP + l.CL_INT + l.CL_OTH + l.CL_PROV + l.CL_CUSTADV + l.CL_DTL]]
        .filter(x => x[1] > 1).sort((a, c2) => c2[1] - a[1]);
      CH.hbars('chFund', src.map(x => x[0]), src.map(x => +CH.unitVal(x[1]).toFixed(2)));
      const use = [['Accumulated losses', -l.EQ_RE], ['Net fixed assets', b.nfa], ['Inventories', l.CA_INV], ['Trade receivables', l.CA_TR], ['GST & tax credits', l.CA_STAT], ['Advances to suppliers', l.CA_SUPADV], ['Loans, advances & deposits', l.CA_LA + l.CA_DEP], ['Other assets', l.CA_OTH + l.CA_DTA + l.INVEST + l.CA_MISC + l.CA_SUSP], ['Cash & bank', l.CA_CASH]]
        .filter(x => x[1] > 1).sort((a, c2) => c2[1] - a[1]);
      CH.hbars('chUse', use.map(x => x[0]), use.map(x => +CH.unitVal(x[1]).toFixed(2)));
    } };
  }

  /* ------------------------------ Cash flow ----------------------------- */
  function renderCF(m, sel) {
    const c = ctx(m, sel), t = T.cfTable(m, sel), cf = c.cf, ycf = c.ytd.cf;
    const title = cf ? 'Operating cash flow of ' + F.money(cf.cfo) + ' and free cash flow of ' + F.money(cf.fcf) + '; cash & bank ' + (cf.close >= cf.open ? 'rose' : 'fell') + ' to ' + F.money(cf.close)
      : 'Monthly cash flow needs the previous month-end balance sheet';
    const lede = cf ? provisionalNote(m, sel) || 'Indirect method per Ind AS 7. Cash = cash-in-hand + bank debit balances; bank OD and overdrawn bank ledgers are treated as short-term borrowings.'
      : 'Upload the trial balance for the month before ' + c.mon.label + ' (or a TB exported with opening balances) and the cash flow, cash bridge and runway will populate.';
    let h = pageHead('Cash flow · ' + c.mon.label, esc(title), lede, dlBtn('cf', 'Download cash flow (Excel)'));
    if (cf || ycf) {
      h += '<div class="grid g2">';
      h += cf ? ex('Cash bridge — ' + c.mon.label, F.unitDef().label + ' · blue = inflow, orange = outflow', '<div class="chart-box tall"><canvas id="chBridgeM"></canvas></div>') : '<div></div>';
      h += ycf ? ex('Cash bridge — financial year to date', F.unitDef().label, '<div class="chart-box tall"><canvas id="chBridgeY"></canvas></div>') : '<div></div>';
      h += '</div><div style="height:18px"></div>';
    }
    h += ex('Cash flow statement — monthly and YTD', F.unitDef().label, renderTable(t));
    h += '<div class="grid g2" style="margin-top:18px">';
    h += ex('Closing cash & bank by month', F.unitDef().label, '<div class="chart-box"><canvas id="chCash"></canvas></div>');
    h += ex('Free cash flow by month', F.unitDef().label + ' · CFO + CFI', '<div class="chart-box"><canvas id="chFCF"></canvas></div>');
    h += '</div>';
    return { html: h, after: () => {
      if (cf) CH.waterfall('chBridgeM', cf.open, cf.bridge, cf.close);
      if (ycf) CH.waterfall('chBridgeY', ycf.open, ycf.bridge, ycf.close);
      const labels = c.upto.map(x => x.label);
      CH.monthlyBars('chCash', labels, c.upto.map(x => m.bs[x.key] ? CH.unitVal(m.bs[x.key].cash) : null), c.upto.length - 1);
      CH.monthlyBars('chFCF', labels, c.upto.map(x => m.cf[x.key] ? CH.unitVal(m.cf[x.key].fcf) : null), c.upto.length - 1);
    } };
  }

  /* ------------------------------ WC & ratios --------------------------- */
  function renderWC(m, sel) {
    const c = ctx(m, sel), r = c.r, b = c.b;
    const title = r.ccc !== null && r.ccc !== undefined ? 'Cash conversion cycle of ' + F.days(r.ccc) + ' with ' + F.money(b.tradeWC) + ' tied up in trade working capital'
      : 'Working capital and ratio analysis — ' + c.mon.label;
    let h = pageHead('Working capital & ratios · ' + c.mon.label, esc(title), provisionalNote(m, sel) || 'Days are computed on the month (receivables ÷ net revenue × days, etc.). Annualised ratios scale the period to 365 days.', dlBtn('ratios', 'Download ratios (Excel)'));
    const t = (l, v, s) => '<div class="wc-tile"><div class="lbl">' + l + '</div><div class="val">' + v + '</div><div class="s">' + s + '</div></div>';
    h += '<div class="card" style="margin-bottom:18px"><div class="wc-tiles">' +
      t('Receivable days', F.days(r.dso), F.money(b && b.lines.CA_TR) + ' receivables') +
      t('Inventory days (COGS)', F.days(r.dio), F.money(b && b.lines.CA_INV) + ' inventory') +
      t('Payable days', F.days(r.dpo), F.money(b && b.lines.CL_TP) + ' payables') +
      t('Cash conversion cycle', F.days(r.ccc), 'DSO + DIO − DPO') +
      t('Inventory cover', F.days(r.invCoverCons), 'days of material consumption') +
      t('Raw-material runway', F.days(r.invCoverPurch), 'days of purchases in stock') +
      t('GST / tax credit locked', F.money(r.gstLocked), 'receivable net of dues') +
      t('Current ratio', F.x(r.currentRatio), 'quick ' + F.x(r.quickRatio)) + '</div></div>';
    h += '<div class="grid g2">';
    h += ex('Receivable, inventory and payable days by month', 'days', '<div class="chart-box"><canvas id="chDays"></canvas></div>');
    h += ex('Trade working capital by month', F.unitDef().label + ' · inventory + receivables − payables', '<div class="chart-box"><canvas id="chTWC"></canvas></div>');
    h += '</div><div style="height:18px"></div>';
    h += ex('Key ratios & KPIs — monthly and YTD', 'Mixed units', renderTable(T.ratioTable(m, sel)));
    h += '<div class="card" style="margin-top:18px"><div class="exhibit-no">Definitions</div><div class="small muted" style="columns:2;column-gap:32px">' +
      '<p><b>DSO</b> = trade receivables ÷ net revenue × days in period. Receivables include GST; revenue excludes it.</p>' +
      '<p><b>DIO</b> = inventory ÷ cost of goods sold × days. <b>DPO</b> = trade payables ÷ (purchases + direct expenses) × days.</p>' +
      '<p><b>Inventory cover</b> = inventory ÷ daily material consumption (opening stock + purchases − closing stock).</p>' +
      '<p><b>Raw-material runway</b> = inventory ÷ daily purchases — how many days of buying the stock represents.</p>' +
      '<p><b>Cash runway</b> = cash & bank ÷ average monthly free-cash burn over the last three months.</p>' +
      '<p><b>Fixed-cost cover</b> = cash ÷ monthly payroll, rent, professional, admin and interest.</p>' +
      '<p><b>Current liabilities</b> for liquidity ratios include bank OD and overdrawn bank balances.</p>' +
      '<p><b>EBITDA</b> excludes other income; <b>EBIT</b> = EBITDA + other income − depreciation.</p></div></div>';
    return { html: h, after: () => {
      wcChart('chDays', m, c.upto);
      CH.monthlyBars('chTWC', c.upto.map(x => x.label), c.upto.map(x => m.bs[x.key] ? CH.unitVal(m.bs[x.key].tradeWC) : null), c.upto.length - 1);
    } };
  }

  /* ------------------------------ Insights ------------------------------ */
  function renderInsights(m, sel) {
    const ins = MIS.insights.generate(m, sel);
    const mon = m.months.find(x => x.key === sel);
    let h = pageHead('Insights & risks · ' + mon.label, esc(ins.headline), 'Generated from the statements using an analyst checklist (liquidity, working capital, margin drivers, solvency, data quality). Review and edit before sending to investors.', dlBtn('all', 'Excel pack incl. commentary'));
    const toneLbl = { neg: 'Risk', watch: 'Watch', pos: 'Positive', info: 'Note' };
    ins.sections.forEach(s => {
      if (!s.items.length) return;
      h += '<div class="ins-section card"><h2>' + esc(s.title) + '</h2>' + s.items.map(x =>
        '<div class="ins"><span class="tag ' + x.tone + '">' + toneLbl[x.tone] + '</span><div><div class="t">' + esc(x.title) + '</div><div class="b">' + esc(x.body) + '</div></div></div>').join('') + '</div>';
    });
    h += '<div class="ins-section card"><h2>Data integrity & controls</h2><ul class="checks">' + ins.checks.map(x => '<li class="' + x.status + '">' + esc(x.text) + '</li>').join('') + '</ul></div>';
    return { html: h };
  }

  /* ------------------------------ Data & mapping ------------------------ */
  function tbType(tb) {
    const ms = E.monthStart(tb.to);
    if (tb.from === ms) return '<span class="pill info">Monthly</span>';
    if (tb.from === E.fyStartOf(tb.to)) return '<span class="pill ok">FY to date</span>';
    return '<span class="pill warn">Custom period</span>';
  }
  function renderData(m, sel) {
    let h = pageHead('Data & mapping', 'Monthly routine: export the trial balance from Tally, upload it, confirm closing stock', 'Everything on this page is stored only in this browser. Use Backup to move the history to another computer or to keep a copy with the month-end file.',
      '<button class="btn btn-primary btn-sm" data-action="upload">⬆ Upload trial balance</button>');
    // Uploaded TBs
    const tbs = state.tbs.slice().sort((a, b) => (a.to + a.from < b.to + b.from ? 1 : -1));
    h += '<div class="card" style="margin-bottom:18px"><div class="exhibit-no">Uploaded trial balances</div><h2 class="action" style="font-size:17px">' + tbs.length + ' file(s) loaded</h2><div class="scroll"><table class="plain"><thead><tr><th>Period</th><th>Type</th><th>File</th><th class="num">Ledgers</th><th>Check</th><th>Uploaded</th><th></th></tr></thead><tbody>' +
      tbs.map(tb => '<tr><td>' + tb.from + ' → ' + tb.to + '</td><td>' + tbType(tb) + '</td><td>' + esc(tb.fileName) + '</td><td class="num">' + tb.ledgers.length + '</td><td>' +
        (tb.checks.balanced ? '<span class="pill ok">Balanced</span>' : '<span class="pill fail">Not balanced</span>') + (tb.warnings.length ? ' <span class="pill warn" title="' + esc(tb.warnings.join(' | ')) + '">' + tb.warnings.length + ' warning(s)</span>' : '') +
        '</td><td class="small muted">' + new Date(tb.uploadedAt).toLocaleString('en-IN') + '</td><td><button class="btn btn-danger btn-sm" data-action="remove" data-id="' + esc(tb.id) + '">Remove</button></td></tr>').join('') +
      '</tbody></table></div></div>';

    // Closing stock
    const dates = [E.addDays(m.fyStart, -1)].concat(m.months.map(x => x.end));
    h += '<div class="card" style="margin-bottom:18px"><div class="exhibit-no">Closing stock</div><h2 class="action" style="font-size:17px">Closing stock by month-end</h2>' +
      '<p class="small muted">A Tally trial balance shows <b>opening</b> stock only. Closing stock is picked up automatically from the next month\'s TB; for the latest month, enter it here (from the Stock Summary / physical count) in absolute rupees.</p>' +
      '<table class="plain"><thead><tr><th>Month-end</th><th class="num">Value used</th><th>Source</th><th>Manual entry (₹)</th><th></th></tr></thead><tbody>' +
      dates.map(d => {
        const k = d.slice(0, 7);
        const s = m.stock[k] || stockInfo(m, d);
        const books = s && s.src === 'books';
        const ov = state.stockOverrides[d];
        return '<tr><td>' + d + '</td><td class="num">' + (s ? F.money(s.v) : '–') + '</td><td>' + (s ? (s.src === 'books' ? '<span class="pill ok">From books</span>' : s.src === 'manual' ? '<span class="pill info">Manual</span>' : '<span class="pill warn">Provisional</span>') : '<span class="muted">n/a</span>') + '</td>' +
          '<td>' + (books ? '<span class="small muted">Next period TB available</span>' : '<input type="number" step="0.01" data-stock="' + d + '" value="' + (ov !== undefined ? ov : '') + '" placeholder="e.g. 4250000">') + '</td>' +
          '<td>' + (books ? '' : '<button class="btn btn-line btn-sm" data-action="savestock" data-date="' + d + '">Save</button>' + (ov !== undefined ? ' <button class="btn btn-line btn-sm" data-action="clearstock" data-date="' + d + '">Clear</button>' : '')) + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    // Mapping
    const L = MIS.config.ALL_LINES;
    const opts = Object.keys(L).map(id => ({ id: id, label: L[id].label, kind: L[id].kind }));
    const optHtml = sel0 => ['PL', 'BS', 'SPECIAL'].map(kind => '<optgroup label="' + ({ PL: 'Profit & loss', BS: 'Balance sheet', SPECIAL: 'Special' })[kind] + '">' +
      opts.filter(o => o.kind === kind).map(o => '<option value="' + o.id + '"' + (o.id === sel0 ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('') + '</optgroup>').join('');
    const f = state.mapFilter.toLowerCase();
    const list = m.ledgerUniverse.filter(l => (!f || (l.group + ' ' + l.name + ' ' + (L[l.line] || {}).label).toLowerCase().indexOf(f) >= 0) && (!state.mapOnlyOver || l.line !== l.rule))
      .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
    const nOver = Object.keys(state.mapOverrides).length;
    h += '<div class="card" style="margin-bottom:18px"><div class="exhibit-no">Chart-of-accounts mapping</div><h2 class="action" style="font-size:17px">Every Tally ledger mapped to an MIS line (' + m.ledgerUniverse.length + ' ledgers, ' + nOver + ' override' + (nOver === 1 ? '' : 's') + ')</h2>' +
      '<p class="small muted">Rules map ledgers automatically by Tally group and name. Change any line here — overrides are remembered for future months. New ledgers created in Tally are mapped by rule until you override them.</p>' +
      '<div class="toolbar"><input type="search" id="mapSearch" placeholder="Search group, ledger or line…" value="' + esc(state.mapFilter) + '"><label class="small"><input type="checkbox" id="mapOnlyOver"' + (state.mapOnlyOver ? ' checked' : '') + '> Overrides only</label>' +
      (nOver ? '<button class="btn btn-line btn-sm" data-action="resetmap">Reset all overrides</button>' : '') + '</div>' +
      '<div class="scroll"><table class="plain"><thead><tr><th>Tally group</th><th>Ledger / sub-group</th><th class="num">Latest balance</th><th>MIS line</th></tr></thead><tbody>' +
      list.map(l => '<tr><td class="muted">' + esc(l.group) + '</td><td>' + esc(l.name) + '</td><td class="num">' + (l.lastDr ? F.amt(l.lastDr) + ' Dr' : '') + (l.lastDr && l.lastCr ? ' / ' : '') + (l.lastCr ? F.amt(l.lastCr) + ' Cr' : '') + '</td>' +
        '<td><select data-map="' + esc(l.key) + '" class="' + (l.line !== l.rule ? 'over' : '') + '">' + optHtml(l.line) + '</select></td></tr>').join('') +
      '</tbody></table></div></div>';

    // Backup
    h += '<div class="card"><div class="exhibit-no">Backup & restore</div><h2 class="action" style="font-size:17px">Keep a copy of the history</h2>' +
      '<p class="small muted">Download a backup after each month-end and store it with the MIS file. Restoring replaces the data in this browser.</p>' +
      '<div class="toolbar"><button class="btn btn-line btn-sm" data-action="backup">⬇ Download backup (.json)</button><button class="btn btn-line btn-sm" data-action="restore">⬆ Restore backup</button>' +
      '<button class="btn btn-danger btn-sm" data-action="clearall">Delete all data in this browser</button></div></div>';
    return { html: h };
  }
  function stockInfo(m, d) {
    // FY opening stock (prior month-end) — from the TB starting the next day
    const t = m.tbs.filter(x => x.from === E.addDays(d, 1));
    if (t.length) return { v: t[t.length - 1]._stock, src: 'books' };
    if (state.stockOverrides[d] !== undefined) return { v: Number(state.stockOverrides[d]), src: 'manual' };
    return null;
  }

  /* ------------------------------ banner -------------------------------- */
  function renderBanner(m, sel) {
    const el = $('banner');
    const s = m && m.stock[sel];
    const mon = m && m.months.find(x => x.key === sel);
    if (!s || s.src !== 'provisional' || state.tab === 'data') { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    el.innerHTML = '<div class="inner"><b>Closing stock needed for ' + mon.label + '.</b><span>Tally\'s trial balance carries opening stock only, so ' + F.money(s.v) + ' has been carried forward provisionally.</span>' +
      '<input type="number" step="0.01" id="bannerStock" placeholder="Closing stock in ₹ (absolute)"><button class="btn btn-primary btn-sm" data-action="bannerstock" data-date="' + mon.end + '">Save closing stock</button></div>';
  }

  /* ------------------------------ render -------------------------------- */
  const RENDER = { summary: renderSummary, pl: renderPL, bs: renderBS, cf: renderCF, wc: renderWC, insights: renderInsights, data: renderData };

  function render() {
    F.setUnit(state.settings.unit);
    $('selUnit').value = state.settings.unit;
    CH.destroyAll();
    const app = $('app');
    let m;
    try { m = getModel(); } catch (e) { console.error(e); app.innerHTML = '<div class="card"><b>Could not build statements:</b> ' + esc(e.message) + '</div>'; return; }
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
    if (!m) {
      $('coName').textContent = 'Monthly MIS';
      $('selMonth').innerHTML = ''; $('selFY').innerHTML = '';
      $('banner').classList.add('hidden');
      app.innerHTML = renderEmpty();
      return;
    }
    if (!state.sel || !m.months.some(x => x.key === state.sel)) state.sel = m.defaultSel;
    const sel = state.sel;
    $('coName').textContent = m.company;
    document.title = m.company + ' — MIS ' + m.months.find(x => x.key === sel).label;
    $('selFY').innerHTML = m.fyList.map(f => { const y = +f.slice(0, 4); return '<option value="' + f + '"' + (f === m.fyStart ? ' selected' : '') + '>FY ' + y + '-' + String(y + 1).slice(2) + '</option>'; }).join('');
    $('selMonth').innerHTML = m.months.slice().reverse().map(x => '<option value="' + x.key + '"' + (x.key === sel ? ' selected' : '') + '>' + x.label + (x.hasPL ? '' : ' (BS only)') + '</option>').join('');
    renderBanner(m, sel);
    exNo = 0;
    let out;
    if (state.tab === 'pack') {
      const parts = ['summary', 'pl', 'bs', 'cf', 'wc', 'insights'].map(k => RENDER[k](m, sel));
      app.innerHTML = parts.map((p, i) => '<section class="' + (i ? 'pack-break' : '') + '">' + p.html + '</section>').join('');
      parts.forEach(p => p.after && p.after());
      return;
    }
    try { out = RENDER[state.tab](m, sel); }
    catch (e) { console.error(e); out = { html: '<div class="card"><b>Error rendering this view:</b> ' + esc(e.message) + '</div>' }; }
    app.innerHTML = out.html;
    if (out.after) { try { out.after(); } catch (e) { console.error(e); } }
  }

  /* ------------------------------ upload -------------------------------- */
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/privatelimited|pvtltd|limited|ltd/g, '');
  async function handleFiles(files) {
    files = Array.from(files || []).filter(f => /\.(xlsx?|xlsm)$/i.test(f.name));
    if (!files.length) { toast('Please choose Excel files exported from Tally (.xls / .xlsx).', true); return; }
    const added = [], errors = [];
    for (const f of files) {
      try {
        const buf = await f.arrayBuffer();
        const tb = MIS.parser.parseWorkbook(buf, f.name);
        if (state.tbs.length && norm(tb.company) !== norm(state.tbs[0].company)) {
          if (!confirm('"' + f.name + '" is for "' + tb.company + '" but the dashboard holds data for "' + state.tbs[0].company + '". Add it anyway?')) continue;
        }
        const i = state.tbs.findIndex(t => t.id === tb.id);
        if (i >= 0) state.tbs[i] = tb; else state.tbs.push(tb);
        added.push(tb);
      } catch (e) { errors.push(esc(f.name) + ': ' + esc(e.message)); }
    }
    if (added.length) {
      state.sel = null;
      const latest = added.reduce((a, t) => (t.to > a.to ? t : a), added[0]);
      state.fy = E.fyStartOf(latest.to);
      changed();
      const lbl = tb => E.monthLabel(tb.from) + (tb.from.slice(0, 7) !== tb.to.slice(0, 7) ? ' → ' + E.monthLabel(tb.to) : '');
      toast('Loaded ' + added.length + ' trial balance' + (added.length > 1 ? 's' : '') + ': ' + added.map(t => lbl(t) + (t.checks.balanced ? ' ✓' : ' ✗ not balanced')).join(', ') + (errors.length ? '<br>' + errors.join('<br>') : ''), !!errors.length);
    } else if (errors.length) toast(errors.join('<br>'), true);
  }

  /* ------------------------------ events -------------------------------- */
  function bind() {
    $('btnUpload').onclick = () => $('fileInput').click();
    $('fileInput').onchange = e => { handleFiles(e.target.files); e.target.value = ''; };
    $('selUnit').onchange = e => { state.settings.unit = e.target.value; save(); render(); };
    $('selMonth').onchange = e => { state.sel = e.target.value; render(); };
    $('selFY').onchange = e => { state.fy = e.target.value; state.sel = null; dirty = true; render(); };
    $('btnExcel').onclick = () => download('all');
    $('btnPrint').onclick = () => {
      if (!getModel()) return toast('Upload a trial balance first.', true);
      const prev = state.tab; state.tab = 'pack'; render();
      setTimeout(() => { window.print(); state.tab = prev; render(); }, 400);
    };
    $('tabs').onclick = e => {
      const b = e.target.closest('button[data-tab]'); if (!b) return;
      state.tab = b.dataset.tab; save(); render(); window.scrollTo(0, 0);
    };
    document.addEventListener('click', e => {
      const g = e.target.closest('[data-goto]');
      if (g) { e.preventDefault(); state.tab = g.dataset.goto; render(); window.scrollTo(0, 0); return; }
      const a = e.target.closest('[data-action]'); if (!a) return;
      const act = a.dataset.action;
      if (act === 'upload') $('fileInput').click();
      else if (act === 'download') download(a.dataset.which);
      else if (act === 'remove') {
        const tb = state.tbs.find(t => t.id === a.dataset.id);
        if (tb && confirm('Remove trial balance ' + tb.from + ' → ' + tb.to + ' (' + tb.fileName + ') from this browser?')) { state.tbs = state.tbs.filter(t => t !== tb); changed(); }
      } else if (act === 'savestock' || act === 'bannerstock') {
        const d = a.dataset.date;
        const inp = act === 'bannerstock' ? $('bannerStock') : document.querySelector('input[data-stock="' + d + '"]');
        const v = parseFloat(String(inp && inp.value).replace(/,/g, ''));
        if (!isFinite(v) || v < 0) return toast('Enter closing stock as a number in rupees, e.g. 4250000', true);
        state.stockOverrides[d] = v; changed(); toast('Closing stock for ' + d + ' saved: ' + F.money(v));
      } else if (act === 'clearstock') { delete state.stockOverrides[a.dataset.date]; changed(); }
      else if (act === 'resetmap') { if (confirm('Remove all mapping overrides and return to the automatic rules?')) { state.mapOverrides = {}; changed(); } }
      else if (act === 'backup') {
        const blob = new Blob([serialise()], { type: 'application/json' });
        const el = document.createElement('a'); el.href = URL.createObjectURL(blob);
        const m = getModel();
        el.download = 'MIS backup ' + (m ? m.company.replace(/[^\w ]+/g, '') + ' ' : '') + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(el); el.click(); setTimeout(() => { URL.revokeObjectURL(el.href); el.remove(); }, 1000);
      } else if (act === 'restore') $('backupInput').click();
      else if (act === 'clearall') {
        if (confirm('Delete ALL trial balances, closing-stock entries and mapping overrides stored in this browser? Download a backup first if unsure.')) {
          state.tbs = []; state.stockOverrides = {}; state.mapOverrides = {}; state.sel = null; changed();
        }
      }
    });
    document.addEventListener('change', e => {
      const s = e.target.closest('select[data-map]');
      if (s) {
        const key = s.dataset.map;
        const p = key.split('||');
        const rule = MIS.config.ruleClassify(p[0], p.slice(1).join('||'));
        if (s.value === rule) delete state.mapOverrides[key]; else state.mapOverrides[key] = s.value;
        changed(); toast('Mapping updated — all statements recalculated.');
        return;
      }
      if (e.target.id === 'mapOnlyOver') { state.mapOnlyOver = e.target.checked; render(); }
    });
    let st = null;
    document.addEventListener('input', e => {
      if (e.target.id === 'mapSearch') {
        clearTimeout(st);
        const v = e.target.value;
        st = setTimeout(() => { state.mapFilter = v; render(); const el = $('mapSearch'); if (el) { el.focus(); el.setSelectionRange(v.length, v.length); } }, 250);
      }
    });
    $('backupInput').onchange = async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      try {
        const s = JSON.parse(await f.text());
        if (!Array.isArray(s.tbs)) throw new Error('Not an MIS backup file.');
        if (!confirm('Replace the data in this browser with the backup from ' + (s.savedAt || 'unknown date') + ' (' + s.tbs.length + ' trial balances)?')) return;
        state.tbs = s.tbs; state.stockOverrides = s.stockOverrides || {}; state.mapOverrides = s.mapOverrides || {}; state.sel = null;
        changed(); toast('Backup restored.');
      } catch (err) { toast('Could not restore: ' + esc(err.message), true); }
    };
    // drag & drop anywhere
    let depth = 0;
    window.addEventListener('dragenter', e => { if (e.dataTransfer && Array.from(e.dataTransfer.types).indexOf('Files') >= 0) { depth++; $('dropOverlay').classList.add('show'); } });
    window.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) $('dropOverlay').classList.remove('show'); });
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => { e.preventDefault(); depth = 0; $('dropOverlay').classList.remove('show'); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });
  }

  async function download(which) {
    const m = getModel();
    if (!m) return toast('Upload a trial balance first.', true);
    try { const name = await MIS.exporter.download(m, state.sel || m.defaultSel, which); toast('Downloaded ' + esc(name)); }
    catch (e) { console.error(e); toast('Excel export failed: ' + esc(e.message), true); }
  }

  // Exposed for automated testing / power users
  MIS.app = {
    state: state,
    ingest: async (name, arrayBuffer) => { const blob = new File([arrayBuffer], name); await handleFiles([blob]); },
    model: () => getModel(),
    render: render
  };

  load();
  bind();
  if (typeof XLSX === 'undefined' || typeof Chart === 'undefined' || typeof ExcelJS === 'undefined')
    setTimeout(() => toast('Some libraries did not load (no internet?). Upload/charts/Excel may not work until you reconnect.', true), 500);
  render();
})(window.MIS);
