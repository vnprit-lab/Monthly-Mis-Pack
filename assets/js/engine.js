/* =============================================================================
 * engine.js — Turns uploaded trial balances into monthly & YTD statements.
 * -----------------------------------------------------------------------------
 * Inputs (state):
 *   tbs            parsed trial balances (monthly and/or FY-to-date)
 *   stockOverrides { 'YYYY-MM-DD': closingStockValue }   (manual entries)
 *   mapOverrides   { 'Group||Ledger': lineId }
 *
 * Monthly P&L comes from a one-month TB, or is derived as
 *   YTD(this month) − YTD(previous month).
 * Balance sheet at a month-end comes from any TB ending on that date.
 * Closing stock is NOT in a Tally TB (the TB shows opening stock), so it is
 * taken from the next period's TB, else a manual entry, else carried forward
 * and flagged PROVISIONAL.
 * ===========================================================================*/
window.MIS = window.MIS || {};

(function (MIS) {
  'use strict';
  const C = MIS.config;
  const L = C.ALL_LINES;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* ---------------- date helpers (ISO strings, local time) ----------------- */
  const pad = n => (n < 10 ? '0' : '') + n;
  const toISO = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const fromISO = s => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  const addDays = (s, n) => { const d = fromISO(s); d.setDate(d.getDate() + n); return toISO(d); };
  const monthStart = s => s.slice(0, 8) + '01';
  const monthEnd = s => { const d = fromISO(monthStart(s)); return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
  const prevMonthEnd = s => addDays(monthStart(s), -1);
  const daysBetween = (a, b) => Math.round((fromISO(b) - fromISO(a)) / 86400000) + 1;
  const monthLabel = s => { const d = fromISO(s); return MON[d.getMonth()] + '-' + String(d.getFullYear()).slice(2); };
  function fyStartOf(s) {
    const d = fromISO(s);
    const y = d.getMonth() + 1 >= C.FY_START_MONTH ? d.getFullYear() : d.getFullYear() - 1;
    return y + '-' + pad(C.FY_START_MONTH) + '-01';
  }

  /* ---------------- classification ---------------------------------------- */
  function makeClassifier(overrides) {
    return function (group, name) {
      const k = group + '||' + name;
      if (overrides && overrides[k] && L[overrides[k]]) return overrides[k];
      return C.ruleClassify(group, name);
    };
  }

  /* ---------------- main build -------------------------------------------- */
  function build(state) {
    const tbs = (state.tbs || []).slice().sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : a.from < b.from ? 1 : -1));
    if (!tbs.length) return null;
    const classify = makeClassifier(state.mapOverrides || {});
    const stockOverrides = state.stockOverrides || {};

    // Pre-classify every TB's ledgers once
    tbs.forEach(tb => {
      tb._led = tb.ledgers.map(l => Object.assign({}, l, { line: classify(l.group, l.name) }));
      tb._stock = tb._led.filter(l => l.line === 'STOCK').reduce((a, l) => a + l.dr - l.cr, 0);
      tb._plOpen = tb._led.filter(l => l.line === 'PLA').reduce((a, l) => a + l.dr - l.cr, 0);
    });

    const findTB = (from, to) => {
      const c = tbs.filter(t => t.from === from && t.to === to);
      return c.length ? c[c.length - 1] : null;
    };

    /* ---- P&L ledger flows for an arbitrary period -------------------------- */
    function plMapOf(tb) {
      const m = {};
      tb._led.forEach(l => {
        if (!L[l.line] || L[l.line].kind !== 'PL') return;
        const k = l.group + '||' + l.name;
        m[k] = m[k] || { group: l.group, name: l.name, line: l.line, net: 0 };
        m[k].net += l.dr - l.cr; // Dr-positive
      });
      return m;
    }
    function diffMap(a, b) {
      const out = {};
      Object.keys(a).forEach(k => { out[k] = Object.assign({}, a[k]); });
      Object.keys(b).forEach(k => {
        out[k] = out[k] || Object.assign({}, b[k], { net: 0 });
        out[k].net -= b[k].net;
      });
      return out;
    }
    function sumMaps(maps) {
      const out = {};
      maps.forEach(m => Object.keys(m).forEach(k => {
        out[k] = out[k] || Object.assign({}, m[k], { net: 0 });
        out[k].net += m[k].net;
      }));
      return out;
    }
    function flows(from, to) {
      const d = findTB(from, to);
      if (d) return { map: plMapOf(d), src: 'direct', tb: d };
      // to-aligned difference: [a,to] − [a,from-1]
      for (const A of tbs.filter(t => t.to === to && t.from < from)) {
        const B = findTB(A.from, addDays(from, -1));
        if (B) return { map: diffMap(plMapOf(A), plMapOf(B)), src: 'derived', tb: A };
      }
      // from-aligned difference: [from,b] − [to+1,b]
      for (const A of tbs.filter(t => t.from === from && t.to > to)) {
        const B = findTB(addDays(to, 1), A.to);
        if (B) return { map: diffMap(plMapOf(A), plMapOf(B)), src: 'derived', tb: A };
      }
      return null;
    }

    /* ---- stock ------------------------------------------------------------- */
    function stockAtKnown(date) {
      const next = tbs.filter(t => t.from === addDays(date, 1));
      if (next.length) return { v: next[next.length - 1]._stock, src: 'books' };
      if (stockOverrides[date] !== undefined && stockOverrides[date] !== null && stockOverrides[date] !== '')
        return { v: Number(stockOverrides[date]), src: 'manual' };
      return null;
    }
    const stockCache = {};
    function stockClose(date) {
      if (stockCache[date]) return stockCache[date];
      let r = stockAtKnown(date);
      if (!r) {
        // carry forward the last known stock (search back up to 36 month-ends)
        let d = prevMonthEnd(date);
        for (let i = 0; i < 36; i++) {
          const k = stockAtKnown(d);
          if (k) { r = { v: k.v, src: 'provisional', from: d }; break; }
          d = prevMonthEnd(d);
        }
        if (!r) {
          const t = tbs.filter(x => x.to === date);
          r = { v: t.length ? t[t.length - 1]._stock : 0, src: 'provisional' };
        }
      }
      stockCache[date] = r;
      return r;
    }

    /* ---- P&L statement ------------------------------------------------------ */
    function plStatement(map, stockOpen, stockCloseV, days, meta) {
      const lines = {};
      C.PL_LINES.forEach(l => { lines[l.id] = 0; });
      const ledgers = [];
      Object.keys(map).forEach(k => {
        const r = map[k];
        const def = L[r.line];
        const amt = def.nature === 'Cr' ? -r.net : r.net;
        lines[r.line] += amt;
        if (Math.abs(r.net) > 0.005) ledgers.push({ group: r.group, name: r.name, line: r.line, amt: amt });
      });
      const s = { lines: lines, ledgers: ledgers, days: days, meta: meta || {} };
      s.revGross = lines.REV_GROSS;
      s.revRet = lines.REV_RET;
      s.revNet = s.revGross - s.revRet;
      s.oi = lines.OI;
      s.materials = ['MAT_MILK', 'MAT_RM', 'MAT_TRADED', 'MAT_PACK', 'MAT_FUEL', 'MAT_OTH'].reduce((a, k) => a + lines[k], 0);
      s.dirExp = lines.DIR_EXP;
      s.stockOpen = stockOpen; s.stockClose = stockCloseV;
      s.stockChange = stockCloseV - stockOpen;
      s.cogs = stockOpen + s.materials + s.dirExp - stockCloseV;
      s.consumption = stockOpen + s.materials - stockCloseV; // materials consumed
      s.gp = s.revNet - s.cogs;
      s.opex = ['OPX_EMP', 'OPX_SD', 'OPX_POWER', 'OPX_RENT', 'OPX_PROF', 'OPX_RM', 'OPX_ADMIN', 'OPX_BAD', 'OPX_SUSP'].reduce((a, k) => a + lines[k], 0);
      s.ebitda = s.gp - s.opex;
      s.dep = lines.DEP;
      s.ebit = s.ebitda + s.oi - s.dep;
      s.fin = lines.FIN;
      s.interest = ledgers.filter(l => l.line === 'FIN' && /interest|intrest/i.test(l.name)).reduce((a, l) => a + l.amt, 0);
      s.pbt = s.ebit - s.fin;
      s.tax = lines.TAX;
      s.pat = s.pbt - s.tax;
      s.salesLedgers = ledgers.filter(l => l.line === 'REV_GROSS').sort((a, b) => b.amt - a.amt);
      s.tradeSpend = ledgers.filter(l => l.line === 'OPX_SD' && C.TRADE_SPEND_RE.test(l.name)).reduce((a, l) => a + l.amt, 0);
      s.fixedCash = lines.OPX_EMP + lines.OPX_RENT + lines.OPX_PROF + lines.OPX_ADMIN + s.interest;
      return s;
    }

    /* ---- balance sheet ------------------------------------------------------ */
    function emptyBS() { const o = {}; C.BS_LINES.forEach(l => { o[l.id] = 0; }); return o; }
    function addLedgerToBS(lines, line, dr, cr) {
      const def = L[line];
      if (!def || def.kind !== 'BS') return false;
      if (def.contra) {
        if (def.side === 'L') { lines[line] += cr; lines[def.contra] += dr; }
        else { lines[line] += dr; lines[def.contra] += cr; }
      } else {
        lines[line] += def.side === 'A' ? dr - cr : cr - dr;
      }
      return true;
    }
    function finishBS(lines, date, src, extra) {
      const b = { date: date, lines: lines, src: src };
      Object.assign(b, extra || {});
      const sum = ids => ids.reduce((a, k) => a + (lines[k] || 0), 0);
      b.equity = sum(['EQ_SHARE', 'EQ_RES', 'EQ_RE']);
      b.debt = sum(['BR_LT', 'BR_UNSEC', 'BR_OCD', 'BR_ST', 'BR_BANKCR']);
      b.stDebt = sum(['BR_ST', 'BR_BANKCR']);
      b.cl = sum(['CL_TP', 'CL_CUSTADV', 'CL_STAT', 'CL_EMP', 'CL_INT', 'CL_OTH', 'CL_PROV', 'CL_DTL']);
      b.totalLE = b.equity + b.debt + b.cl;
      b.nfa = sum(['FA_GROSS', 'FA_INT', 'FA_CWIP', 'FA_ACCDEP']);
      b.nca = sum(['INVEST', 'CA_DTA', 'CA_DEP']);
      b.ca = sum(['CA_INV', 'CA_TR', 'CA_SUPADV', 'CA_STAT', 'CA_LA', 'CA_OTH', 'CA_MISC', 'CA_SUSP', 'CA_CASH']);
      b.totalA = b.nfa + b.nca + b.ca;
      b.diff = b.totalA - b.totalLE;
      b.cash = lines.CA_CASH;
      b.netDebt = b.debt - b.cash;
      b.tradeWC = lines.CA_INV + lines.CA_TR - lines.CL_TP;
      b.currentLiab = b.cl + b.stDebt;
      return b;
    }
    const bsCache = {};
    function bsAt(date) {
      if (bsCache[date] !== undefined) return bsCache[date];
      let res = null;
      const ending = tbs.filter(t => t.to === date);
      if (ending.length) {
        // prefer a one-month TB, else the most recently uploaded
        const tb = ending.find(t => t.from === monthStart(date)) || ending[ending.length - 1];
        const lines = emptyBS();
        tb._led.forEach(l => addLedgerToBS(lines, l.line, l.dr, l.cr));
        const sc = stockClose(date);
        const pl = plStatement(plMapOf(tb), tb._stock, sc.v, daysBetween(tb.from, tb.to));
        lines.CA_INV = sc.v;
        lines.EQ_RE = -tb._plOpen + pl.pat;
        res = finishBS(lines, date, 'TB ' + tb.from + ' to ' + tb.to, { stockSrc: sc.src, plOpen: tb._plOpen });
      } else {
        const opening = tbs.filter(t => t.from === addDays(date, 1) && t.hasOpening);
        if (opening.length) {
          const tb = opening[opening.length - 1];
          const lines = emptyBS();
          tb._led.forEach(l => addLedgerToBS(lines, l.line, l.odr, l.ocr));
          lines.CA_INV = tb._stock;
          const tmp = finishBS(lines, date, '');
          lines.EQ_RE = tmp.totalA - tmp.totalLE; // balancing figure
          res = finishBS(lines, date, 'Opening balances of TB ' + tb.from + ' to ' + tb.to, { stockSrc: 'books' });
        }
      }
      bsCache[date] = res;
      return res;
    }

    /* ---- cash flow ---------------------------------------------------------- */
    function cashFlow(b0, b1, pl) {
      if (!b0 || !b1 || !pl) return null;
      const d = k => (b1.lines[k] || 0) - (b0.lines[k] || 0);
      const lines = pl.lines;
      const cf = {};
      // Indirect method
      cf.pbt = pl.pbt; cf.dep = pl.dep; cf.fin = pl.fin;
      cf.opBeforeWC = pl.pbt + pl.dep + pl.fin;
      cf.wc = {
        inv: -d('CA_INV'), tr: -d('CA_TR'), supadv: -d('CA_SUPADV'), stat_a: -d('CA_STAT'),
        la: -(d('CA_LA') + d('CA_DEP')), otha: -(d('CA_OTH') + d('CA_MISC') + d('CA_SUSP') + d('CA_DTA')),
        tp: d('CL_TP'), custadv: d('CL_CUSTADV'), stat_l: d('CL_STAT'), emp: d('CL_EMP'),
        othl: d('CL_OTH') + d('CL_PROV') + d('CL_DTL')
      };
      cf.wcTotal = Object.keys(cf.wc).reduce((a, k) => a + cf.wc[k], 0);
      cf.tax = -pl.tax;
      cf.cfo = cf.opBeforeWC + cf.wcTotal + cf.tax;
      const dNFA = d('FA_GROSS') + d('FA_INT') + d('FA_CWIP') + d('FA_ACCDEP');
      cf.capex = -(dNFA + pl.dep);
      cf.invest = -d('INVEST');
      cf.cfi = cf.capex + cf.invest;
      cf.equity = d('EQ_SHARE') + d('EQ_RES');
      cf.dLT = d('BR_LT'); cf.dUnsec = d('BR_UNSEC'); cf.dOCD = d('BR_OCD');
      cf.dST = d('BR_ST') + d('BR_BANKCR');
      cf.intPaid = -pl.fin + d('CL_INT');
      cf.cff = cf.equity + cf.dLT + cf.dUnsec + cf.dOCD + cf.dST + cf.intPaid;
      cf.net = cf.cfo + cf.cfi + cf.cff;
      cf.open = b0.cash; cf.close = b1.cash;
      cf.other = (cf.close - cf.open) - cf.net; // equity movements not via P&L, rounding
      cf.fcf = cf.cfo + cf.cfi;

      // Direct-method style cash bridge (for the waterfall)
      const otherOpex = pl.opex - lines.OPX_EMP;
      cf.bridge = [
        { k: 'collections', label: 'Collections from customers', v: pl.revNet + pl.oi - d('CA_TR') + d('CL_CUSTADV') },
        { k: 'suppliers', label: 'Paid to suppliers', v: -(pl.materials + pl.dirExp) + d('CL_TP') - d('CA_SUPADV') },
        { k: 'payroll', label: 'Payroll', v: -lines.OPX_EMP + d('CL_EMP') },
        { k: 'opex', label: 'Other operating costs', v: -otherOpex + d('CL_OTH') + d('CL_PROV') + d('CL_DTL') - d('CA_OTH') - d('CA_MISC') - d('CA_SUSP') - d('CA_DTA') - d('CA_LA') - d('CA_DEP') },
        { k: 'taxes', label: 'GST / taxes (net)', v: -pl.tax + d('CL_STAT') - d('CA_STAT') },
        { k: 'capex', label: 'Capex', v: cf.cfi },
        { k: 'funding', label: 'Debt & equity raised / (repaid)', v: cf.equity + cf.dLT + cf.dUnsec + cf.dOCD + cf.dST },
        { k: 'interest', label: 'Interest & bank charges paid', v: cf.intPaid }
      ];
      if (Math.abs(cf.other) > 1) cf.bridge.push({ k: 'other', label: 'Other / unreconciled', v: cf.other });
      return cf;
    }
    function sumCF(list) {
      if (!list.length || list.some(x => !x)) return null;
      const out = JSON.parse(JSON.stringify(list[0]));
      const add = (o, x) => Object.keys(o).forEach(k => {
        if (typeof o[k] === 'number') o[k] += x[k];
        else if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) add(o[k], x[k]);
      });
      for (let i = 1; i < list.length; i++) add(out, list[i]);
      out.open = list[0].open; out.close = list[list.length - 1].close;
      // merge bridges by key
      const map = {};
      list.forEach(cf => cf.bridge.forEach(b => { map[b.k] = map[b.k] || { k: b.k, label: b.label, v: 0 }; map[b.k].v += b.v; }));
      out.bridge = Object.keys(map).map(k => map[k]);
      return out;
    }

    /* ---- ratios ------------------------------------------------------------- */
    function ratios(pl, b, cf, prevCFs) {
      const r = {};
      if (!pl && !b) return r;
      const div = (a, c) => (c && isFinite(a / c) ? a / c : null);
      if (pl) {
        const ann = 365 / pl.days;
        r.gm = div(pl.gp, pl.revNet);
        r.ebitdaM = div(pl.ebitda, pl.revNet);
        r.patM = div(pl.pat, pl.revNet);
        r.milkPct = div(pl.lines.MAT_MILK, pl.revNet);
        r.packPct = div(pl.lines.MAT_PACK, pl.revNet);
        r.empPct = div(pl.lines.OPX_EMP, pl.revNet);
        r.sdPct = div(pl.lines.OPX_SD, pl.revNet);
        r.tradePct = div(pl.tradeSpend, pl.revNet);
        r.powerPct = div(pl.lines.OPX_POWER + pl.lines.MAT_FUEL, pl.revNet);
        r.returnsPct = div(pl.revRet, pl.revGross);
        r.finPct = div(pl.fin, pl.revNet);
        r.intCover = pl.fin > 0 ? pl.ebitda / pl.fin : null;
        if (b) {
          r.dso = div(b.lines.CA_TR, pl.revNet) !== null ? b.lines.CA_TR / pl.revNet * pl.days : null;
          r.dio = pl.cogs > 0 ? b.lines.CA_INV / pl.cogs * pl.days : null;
          const purch = pl.materials + pl.dirExp;
          r.dpo = purch > 0 ? b.lines.CL_TP / purch * pl.days : null;
          r.ccc = (r.dso !== null && r.dio !== null && r.dpo !== null) ? r.dso + r.dio - r.dpo : null;
          r.invCoverPurch = pl.materials > 0 ? b.lines.CA_INV / (pl.materials / pl.days) : null;
          r.invCoverCons = pl.consumption > 0 ? b.lines.CA_INV / (pl.consumption / pl.days) : null;
          r.roce = (b.equity + b.debt) > 0 ? pl.ebit * ann / (b.equity + b.debt) : null;
          r.roe = b.equity > 0 ? pl.pat * ann / b.equity : null;
          r.assetTurn = b.nfa > 0 ? pl.revNet * ann / b.nfa : null;
          r.netDebtEbitda = pl.ebitda > 0 ? b.netDebt / (pl.ebitda * ann) : null;
          r.nwcPctRev = pl.revNet > 0 ? b.tradeWC / (pl.revNet * ann) : null;
          r.fixedCover = pl.fixedCash > 0 ? b.cash / (pl.fixedCash / pl.days * 30.4) : null;
        }
      }
      if (b) {
        r.currentRatio = b.currentLiab > 0 ? b.ca / b.currentLiab : null;
        r.quickRatio = b.currentLiab > 0 ? (b.ca - b.lines.CA_INV) / b.currentLiab : null;
        r.cashRatio = b.currentLiab > 0 ? b.cash / b.currentLiab : null;
        r.de = b.equity > 0 ? b.debt / b.equity : null;
        r.netWorth = b.equity;
        r.netDebt = b.netDebt;
        r.gstLocked = b.lines.CA_STAT - b.lines.CL_STAT;
      }
      // Cash runway on trailing (up to 3 months) free-cash-flow burn
      const fcfs = (prevCFs || []).filter(Boolean).map(x => x.fcf);
      if (cf) fcfs.push(cf.fcf);
      const recent = fcfs.slice(-3);
      if (recent.length && b) {
        const avg = recent.reduce((a, x) => a + x, 0) / recent.length;
        r.avgFCF = avg;
        r.runway = avg < 0 ? Math.max(0, b.cash / -avg) : null; // null = cash generative
      }
      return r;
    }

    /* ---- choose FY & months ------------------------------------------------- */
    const latestTo = tbs.reduce((a, t) => (t.to > a ? t.to : a), tbs[0].to);
    const fyStart = state.fy && state.fy.length === 10 ? state.fy : fyStartOf(latestTo);
    const fyEnd = addDays(toISO(new Date(fromISO(fyStart).getFullYear() + 1, fromISO(fyStart).getMonth(), 1)), -1);
    const fyList = Array.from(new Set(tbs.map(t => fyStartOf(t.to)))).sort();

    const months = [];
    let ms = fyStart;
    for (let i = 0; i < 12; i++) {
      const me = monthEnd(ms);
      const fl = flows(ms, me);
      const b = bsAt(me);
      months.push({ key: ms.slice(0, 7), start: ms, end: me, label: monthLabel(ms), days: daysBetween(ms, me), flows: fl, hasPL: !!fl, hasBS: !!b });
      ms = addDays(me, 1);
    }
    // trim to months with data
    let first = months.findIndex(m => m.hasPL || m.hasBS);
    let last = -1; months.forEach((m, i) => { if (m.hasPL || m.hasBS) last = i; });
    if (first < 0) { first = 0; last = 0; }
    const view = months.slice(first, last + 1);

    const model = {
      company: tbs[tbs.length - 1].company,
      fyStart: fyStart, fyEnd: fyEnd, fyLabel: 'FY ' + fromISO(fyStart).getFullYear() + '-' + String(fromISO(fyStart).getFullYear() + 1).slice(2),
      fyList: fyList,
      months: view,
      pl: {}, bs: {}, cf: {}, ratios: {}, stock: {},
      ytd: {}, tbs: tbs, warnings: []
    };

    // Monthly statements
    view.forEach(m => {
      const sc = stockClose(m.end);
      model.stock[m.key] = sc;
      if (m.flows) {
        const so = stockClose(prevMonthEnd(m.end));
        model.pl[m.key] = plStatement(m.flows.map, so.v, sc.v, m.days, { src: m.flows.src, stockOpenSrc: so.src, stockCloseSrc: sc.src });
      }
      model.bs[m.key] = bsAt(m.end);
    });
    const prevBSFor = m => bsAt(prevMonthEnd(m.end));
    view.forEach((m, i) => {
      model.cf[m.key] = cashFlow(prevBSFor(m), model.bs[m.key], model.pl[m.key]);
    });
    view.forEach((m, i) => {
      const prevCFs = view.slice(Math.max(0, i - 2), i).map(x => model.cf[x.key]);
      model.ratios[m.key] = ratios(model.pl[m.key], model.bs[m.key], model.cf[m.key], prevCFs);
    });

    // YTD for every month in view
    view.forEach((m, i) => {
      const e = m.end;
      let pl = null, src = null;
      const direct = findTB(fyStart, e);
      if (direct) {
        pl = plStatement(plMapOf(direct), direct._stock, stockClose(e).v, daysBetween(fyStart, e), { src: 'direct' });
        src = 'direct';
      } else {
        const fyMonths = months.filter(x => x.end <= e);
        if (fyMonths.every(x => x.flows)) {
          const map = sumMaps(fyMonths.map(x => x.flows.map));
          pl = plStatement(map, stockClose(addDays(fyStart, -1)).v, stockClose(e).v, daysBetween(fyStart, e), { src: 'sum' });
          src = 'sum of months';
        }
      }
      let cf = null;
      const b0 = bsAt(addDays(fyStart, -1));
      if (b0 && pl) cf = cashFlow(b0, model.bs[m.key], pl);
      else {
        const fyMonths = months.filter(x => x.end <= e);
        const list = fyMonths.map(x => model.cf[x.key.slice(0, 7)] || null);
        if (fyMonths.length && fyMonths.every(x => model.cf[x.key])) cf = sumCF(list);
      }
      model.ytd[m.key] = { pl: pl, cf: cf, src: src, ratios: ratios(pl, model.bs[m.key], null, []) };
    });

    // Default selection: last month with a P&L, else last month
    const withPL = view.filter(m => m.hasPL);
    model.defaultSel = (withPL.length ? withPL[withPL.length - 1] : view[view.length - 1]).key;

    // Ledger universe for the mapping screen
    const uni = {};
    tbs.forEach(tb => tb._led.forEach(l => {
      const k = l.group + '||' + l.name;
      if (!uni[k]) uni[k] = { key: k, group: l.group, name: l.name, line: l.line, rule: C.ruleClassify(l.group, l.name), lastDr: 0, lastCr: 0, lastTo: '' };
      if (tb.to >= uni[k].lastTo) { uni[k].lastDr = l.dr; uni[k].lastCr = l.cr; uni[k].lastTo = tb.to; }
    }));
    model.ledgerUniverse = Object.keys(uni).map(k => uni[k]);
    model.unknownGroups = Array.from(new Set(tbs.flatMap(t => t.groups.map(g => g.name)).filter(g => C.groupKind(g) === 'UNKNOWN')));

    /**
     * Statements for an arbitrary period (used for quarters).
     * P&L comes from a matching TB, a TB difference, or the sum of the months.
     */
    model.period = function (from, to) {
      let fl = flows(from, to);
      if (!fl) {
        const ms = months.filter(x => x.start >= from && x.end <= to);
        if (ms.length && ms[0].start === from && ms[ms.length - 1].end === to && ms.every(x => x.flows))
          fl = { map: sumMaps(ms.map(x => x.flows.map)), src: 'sum' };
      }
      const pl = fl ? plStatement(fl.map, stockClose(addDays(from, -1)).v, stockClose(to).v, daysBetween(from, to), { src: fl.src }) : null;
      const bs = bsAt(to);
      const cf = pl ? cashFlow(bsAt(addDays(from, -1)), bs, pl) : null;
      return { pl: pl, bs: bs, cf: cf, days: daysBetween(from, to) };
    };
    model.stockClose = stockClose;

    // All FY months (for the month picker and the data-coverage strip)
    model.fyMonths = months.map(m => ({ key: m.key, label: m.label, start: m.start, end: m.end, hasPL: m.hasPL, hasBS: m.hasBS }));

    // Months before the first monthly P&L that can only be seen as one block
    // (e.g. Apr–Sep = YTD Oct TB − Oct TB). Shown as a total and a monthly average.
    const firstPL = view.find(m => m.hasPL);
    if (firstPL && firstPL.start > fyStart) {
      const to = addDays(firstPL.start, -1);
      const per = model.period(fyStart, to);
      if (per.pl) {
        const n = months.filter(m => m.end <= to).length;
        model.gap = { from: fyStart, to: to, n: n, label: monthLabel(fyStart).slice(0, 3) + '–' + monthLabel(to).slice(0, 3), pl: per.pl };
      }
    }

    // Ledger-level balances at a month-end (for the loan book)
    model.ledgersAt = function (date) {
      const ending = tbs.filter(t => t.to === date);
      if (!ending.length) return null;
      const tb = ending.find(t => t.from === monthStart(date)) || ending[ending.length - 1];
      return tb._led;
    };
    model.ops = state.ops || {};

    model.helpers = { monthLabel, prevMonthEnd, addDays, fyStartOf };
    return model;
  }

  MIS.engine = { build, helpers: { monthLabel, monthEnd, monthStart, prevMonthEnd, addDays, fyStartOf, daysBetween } };
})(window.MIS);
