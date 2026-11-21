/* =============================================================================
 * insights.js — Analyst commentary generated from the statements.
 * Each insight: { tone: 'neg' | 'watch' | 'pos' | 'info', title, body }
 * Thresholds are deliberately conservative and documented inline so the
 * reviewer can tune them for the business.
 * ===========================================================================*/
window.MIS = window.MIS || {};

(function (MIS) {
  'use strict';
  const F = MIS.fmt;
  const RANK = { neg: 0, watch: 1, pos: 2, info: 3 };

  function generate(model, key) {
    const i = model.months.findIndex(m => m.key === key);
    const m = model.months[i];
    const prev = i > 0 ? model.months[i - 1] : null;
    const pl = model.pl[key], b = model.bs[key], cf = model.cf[key], r = model.ratios[key] || {};
    const ppl = prev ? model.pl[prev.key] : null;
    const pr = prev ? model.ratios[prev.key] || {} : {};
    const pb = prev ? model.bs[prev.key] : null;
    const ytd = model.ytd[key] || {};
    const stock = model.stock[key];
    const M = m.label;

    const cash = [], wc = [], prof = [], sol = [], checks = [];

    /* ============ CASH & LIQUIDITY ============ */
    if (cf) {
      const br = cf.bridge;
      const g = k => (br.find(x => x.k === k) || { v: 0 }).v;
      const net = cf.close - cf.open;
      cash.push({
        tone: net >= 0 ? 'pos' : (cf.close < -cf.fcf ? 'neg' : 'watch'),
        title: 'Cash moved from ' + F.money(cf.open) + ' to ' + F.money(cf.close) + ' in ' + M + ' (' + (net >= 0 ? '+' : '') + F.money(net) + ')',
        body: 'Collections ' + F.money(g('collections')) + '; paid to suppliers ' + F.money(-g('suppliers')) + '; payroll ' + F.money(-g('payroll')) +
          '; other operating costs ' + F.money(-g('opex')) + '; GST/taxes ' + F.money(-g('taxes')) + '; capex ' + F.money(-g('capex')) +
          '; interest ' + F.money(-g('interest')) + '; net funding ' + F.money(g('funding')) + '. Operating cash flow was ' + F.money(cf.cfo) +
          ' and free cash flow ' + F.money(cf.fcf) + '.'
      });
    } else {
      cash.push({ tone: 'info', title: 'Cash bridge for ' + M + ' needs the previous month-end balance sheet',
        body: 'Upload the trial balance for the previous month (or a TB with opening balances) to unlock the monthly cash flow, cash bridge and burn-based runway.' });
    }
    if (b) {
      const bankCr = b.lines.BR_BANKCR, od = b.lines.BR_ST;
      const netBank = b.cash - bankCr - od;
      if (bankCr > 1000) {
        cash.push({ tone: 'neg', title: 'Effective liquidity is ' + F.money(netBank) + ', not ' + F.money(b.cash),
          body: 'Bank ledgers carry credit (overdrawn) balances of ' + F.money(bankCr) + (od > 0 ? ' in addition to bank OD of ' + F.money(od) : '') +
            '. Gross cash & bank on the debit side is ' + F.money(b.cash) + '. Confirm whether the credit balance is a sanctioned OD/CC limit, an unpresented-cheque timing difference or a loan routed through a bank ledger, and reclassify in Tally accordingly.' });
      } else {
        cash.push({ tone: b.cash > 0 ? 'info' : 'neg', title: 'Closing cash & bank: ' + F.money(b.cash) + (od > 0 ? ' against bank OD of ' + F.money(od) : ''),
          body: 'Net debt stands at ' + F.money(b.netDebt) + '.' });
      }
      if (r.runway !== undefined) {
        if (r.runway === null) cash.push({ tone: 'pos', title: 'Free cash flow positive on a trailing basis', body: 'Average free cash flow over the last ' + Math.min(3, i + 1) + ' month(s) is ' + F.money(r.avgFCF) + ' per month — no runway constraint from operations.' });
        else cash.push({
          tone: r.runway < 3 ? 'neg' : r.runway < 6 ? 'watch' : 'pos',
          title: 'Cash runway ≈ ' + F.months(r.runway) + ' at current burn',
          body: 'Trailing average free-cash burn is ' + F.money(-r.avgFCF) + ' per month against cash of ' + F.money(b.cash) + '. ' +
            (r.runway < 6 ? 'Below a 6-month comfort level — line up funding (OCD tranche / working-capital limit) or tighten collections and supplier terms now.' : 'Comfortable, but monitor monthly.')
        });
      }
      if (r.fixedCover !== null && r.fixedCover !== undefined) {
        cash.push({ tone: r.fixedCover < 1 ? 'neg' : r.fixedCover < 3 ? 'watch' : 'pos',
          title: 'Cash covers ' + r.fixedCover.toFixed(1) + ' months of fixed cash costs',
          body: 'Fixed cash costs (payroll, rent, professional, admin and interest) run at ' + F.money(pl.fixedCash / pl.days * 30.4) + ' per month. This is the "lights-on" cover if revenue paused.' });
      }
    }

    /* ============ WORKING CAPITAL ============ */
    if (pl && b) {
      if (r.invCoverCons !== null && r.invCoverCons !== undefined) {
        const d = r.invCoverCons;
        wc.push({ tone: d > 120 ? 'neg' : d > 45 ? 'watch' : 'pos',
          title: 'Inventory of ' + F.money(b.lines.CA_INV) + ' = ' + F.days(d) + ' of material consumption',
          body: (d > 120 ? 'This is far above what a fresh-dairy portfolio (cottage cheese, paneer, ghee) normally carries and implies either slow-moving / aged stock or an over-stated closing-stock valuation. Reconcile with a physical count and the Tally stock summary before sharing margins externally. ' : '') +
            'Stock also covers ' + F.days(r.invCoverPurch) + ' of current purchases (raw-material runway).' +
            (stock && stock.src === 'provisional' ? ' Note: closing stock for ' + M + ' is PROVISIONAL (carried forward) — enter the actual figure in Data & Mapping.' : '') });
      } else if (pl.consumption <= 0 && b.lines.CA_INV > 0) {
        wc.push({ tone: 'neg', title: 'Stock increased by more than total material purchases',
          body: 'Material consumption for ' + M + ' is ' + F.money(pl.consumption) + ' (opening stock + purchases − closing stock). A non-positive consumption is not economically possible for a producing plant — closing stock is almost certainly over-stated or purchases are under-booked.' });
      }
      // FY-to-date stock build: a large rise in stock flatters YTD gross margin
      if (ytd.pl && ytd.pl.materials > 0) {
        const build = ytd.pl.stockClose - ytd.pl.stockOpen;
        const share = build / ytd.pl.materials;
        if (share > 0.3) {
          const ygm = ytd.pl.revNet ? ytd.pl.gp / ytd.pl.revNet : null;
          wc.push({ tone: 'neg',
            title: 'Inventory rose from ' + F.money(ytd.pl.stockOpen) + ' (FY opening) to ' + F.money(ytd.pl.stockClose) + ' — absorbing ' + F.pct(share, 0) + ' of YTD purchases',
            body: 'This stock build lifts YTD gross margin to ' + F.pct(ygm) + (r.gm !== null && r.gm !== undefined ? ' while ' + M + ' alone shows ' + F.pct(r.gm) : '') +
              '. A plant making perishable dairy products rarely builds stock at this pace. Validate closing stock (physical count, valuation at lower of cost and NRV, ageing of cheese / ghee, expired goods) before presenting YTD profit to investors.' });
        }
      }
      if (r.dso !== null) wc.push({ tone: r.dso > 60 ? 'neg' : r.dso > 40 ? 'watch' : 'pos',
        title: 'Receivables at ' + F.days(r.dso) + ' of sales (' + F.money(b.lines.CA_TR) + ')',
        body: (pr.dso ? 'Moved ' + (r.dso >= pr.dso ? 'up' : 'down') + ' from ' + F.days(pr.dso) + ' last month. ' : '') +
          'Receivables include GST while revenue excludes it, so the true collection period is ~5–12% lower. ' +
          (b.lines.CL_CUSTADV > 0 ? 'Customer advances / credit balances of ' + F.money(b.lines.CL_CUSTADV) + ' are shown separately as a liability.' : '') });
      if (r.dpo !== null) wc.push({ tone: r.dpo > 90 ? 'neg' : r.dpo > 60 ? 'watch' : 'pos',
        title: 'Supplier credit at ' + F.days(r.dpo) + ' of purchases (' + F.money(b.lines.CL_TP) + ')',
        body: (r.dpo > 60 ? 'The business is leaning on suppliers for funding. For a milk-procurement model this is a supply-continuity risk — farmers / milk aggregators typically expect 7–15 day settlement. ' : 'Within normal trade terms. ') +
          (b.lines.CA_SUPADV > 0 ? 'Advances paid to suppliers (debit balances in creditors): ' + F.money(b.lines.CA_SUPADV) + '.' : '') });
      if (r.ccc !== null) wc.push({ tone: r.ccc > 90 ? 'watch' : 'info',
        title: 'Cash conversion cycle: ' + F.days(r.ccc),
        body: 'DSO ' + F.days(r.dso) + ' + DIO ' + F.days(r.dio) + ' − DPO ' + F.days(r.dpo) + '. Trade working capital (inventory + receivables − payables) is ' + F.money(b.tradeWC) +
          (r.nwcPctRev !== null ? ', i.e. ' + F.pct(r.nwcPctRev) + ' of annualised revenue.' : '.') });
      const gst = b.lines.CA_STAT - b.lines.CL_STAT;
      if (gst > 0.1 * pl.revNet) wc.push({ tone: 'watch',
        title: F.money(gst) + ' of cash is locked in net GST / tax credits',
        body: 'GST input credit & tax receivables of ' + F.money(b.lines.CA_STAT) + ' vs statutory dues of ' + F.money(b.lines.CL_STAT) +
          '. Milk is largely GST-exempt while packing, fuel and services carry GST, so credits accumulate. Evaluate an inverted-duty-structure refund (Sec. 54(3), CGST Act) and reconcile with GSTR-2B — this is a direct cash lever.' });
    }

    /* ============ PROFITABILITY ============ */
    if (pl) {
      const mom = ppl ? F.change(pl.revNet, ppl.revNet) : null;
      prof.push({ tone: mom === null ? 'info' : mom >= 0 ? 'pos' : 'watch',
        title: 'Net revenue ' + F.money(pl.revNet) + ' in ' + M + (mom !== null ? ' (' + F.signedPct(mom) + ' MoM)' : ''),
        body: 'Gross sales ' + F.money(pl.revGross) + ', returns & discounts ' + F.money(pl.revRet) + ' (' + F.pct(r.returnsPct) + ' of gross).' +
          (ytd.pl ? ' YTD net revenue ' + F.money(ytd.pl.revNet) + ' at ' + F.pct(ytd.pl.revNet ? ytd.pl.gp / ytd.pl.revNet : null) + ' gross margin.' : '') });
      if (r.returnsPct !== null && r.returnsPct > 0.03) prof.push({ tone: r.returnsPct > 0.06 ? 'neg' : 'watch',
        title: 'Sales returns at ' + F.pct(r.returnsPct) + ' of gross sales',
        body: 'For short-shelf-life products, returns above ~3% usually point to over-stocking in channel, cold-chain breaks or shelf-life at dispatch. Track returns by channel and SKU; agree return caps with distributors / platforms.' });
      const top = pl.salesLedgers[0];
      if (top && pl.revGross > 0) {
        const share = top.amt / pl.revGross;
        if (share > 0.5) prof.push({ tone: 'watch', title: F.pct(share, 0) + ' of gross sales come from one ledger: "' + top.name + '"',
          body: 'High channel / customer concentration. Investors will ask about contract terms, payment cycle and the plan to diversify (modern trade, HoReCa, distributors).' });
      }
      const gm = r.gm;
      prof.push({ tone: gm === null ? 'info' : gm < 0 ? 'neg' : gm < 0.2 ? 'watch' : 'pos',
        title: 'Gross margin ' + F.pct(gm) + (pr.gm !== undefined && pr.gm !== null ? ' (' + F.pp(gm - pr.gm) + ' MoM)' : ''),
        body: 'Milk cost is ' + F.pct(r.milkPct) + ' of revenue and packing ' + F.pct(r.packPct) + '. COGS = opening stock ' + F.money(pl.stockOpen) + ' + purchases & direct costs ' + F.money(pl.materials + pl.dirExp) + ' − closing stock ' + F.money(pl.stockClose) + '.' +
          (pl.meta.stockCloseSrc === 'provisional' ? ' Closing stock is provisional, so this margin will move once the actual stock is entered.' : '') });
      prof.push({ tone: pl.ebitda >= 0 ? 'pos' : 'neg',
        title: 'EBITDA ' + F.money(pl.ebitda) + ' (' + F.pct(r.ebitdaM) + ' margin); PAT ' + F.money(pl.pat),
        body: 'Operating costs ' + F.money(pl.opex) + ': employees ' + F.money(pl.lines.OPX_EMP) + ' (' + F.pct(r.empPct) + '), selling & trade spend ' + F.money(pl.lines.OPX_SD) + ' (' + F.pct(r.sdPct) + '), power & utilities ' + F.money(pl.lines.OPX_POWER) + ', rent ' + F.money(pl.lines.OPX_RENT) + ', professional ' + F.money(pl.lines.OPX_PROF) + '. Finance costs ' + F.money(pl.fin) + ' (' + F.pct(r.finPct) + ' of revenue).' });
      if (r.tradePct !== null && r.tradePct > 0.03) prof.push({ tone: 'watch', title: 'Trade spend (brand-funded discounts, distributor margin, expiry claims) at ' + F.pct(r.tradePct) + ' of revenue',
        body: 'Trade spend of ' + F.money(pl.tradeSpend) + ' sits in operating costs. Tie every scheme to incremental volume; expiry claims are a forecasting problem, not a marketing cost.' });
      if (pl.lines.FIN > 0 && pl.ledgers.some(l => /bank charge/i.test(l.name) && l.amt > 0.3 * pl.lines.FIN)) prof.push({ tone: 'watch', title: 'Bank charges are a large part of finance costs',
        body: 'Bank charges of ' + F.money(pl.ledgers.filter(l => /bank charge/i.test(l.name)).reduce((a, l) => a + l.amt, 0)) + ' in ' + M + '. Check for loan processing fees, payment-gateway / platform settlement charges or penal charges that should be reclassified or renegotiated.' });
    }

    /* ============ BALANCE SHEET & SOLVENCY ============ */
    if (b) {
      const paidIn = b.lines.EQ_SHARE + b.lines.EQ_RES;
      sol.push({ tone: b.equity < 0 ? 'neg' : b.equity < 0.5 * paidIn ? 'watch' : 'pos',
        title: 'Net worth ' + F.money(b.equity) + (b.equity < 0 ? ' — fully eroded' : ''),
        body: 'Paid-in capital & reserves ' + F.money(paidIn) + '; retained earnings / (accumulated losses) ' + F.money(b.lines.EQ_RE) + '. ' +
          (b.equity < 0 ? 'Negative net worth weakens bank-funding eligibility; conversion of OCDs / fresh equity would repair the balance sheet.' : '') });
      const debtMix = [['OCDs', b.lines.BR_OCD], ['unsecured loans', b.lines.BR_UNSEC], ['term loans', b.lines.BR_LT], ['bank OD', b.lines.BR_ST], ['overdrawn bank', b.lines.BR_BANKCR]].filter(x => x[1] > 0);
      sol.push({ tone: r.de !== null && r.de !== undefined && r.de < 1.5 ? 'info' : 'watch',
        title: 'Total borrowings ' + F.money(b.debt) + '; net debt ' + F.money(b.netDebt),
        body: 'Mix: ' + debtMix.map(x => x[0] + ' ' + F.money(x[1])).join(', ') + '. ' + (r.de !== null && r.de !== undefined ? 'Debt / equity ' + F.x(r.de) + '. ' : 'Debt / equity not meaningful (equity ≤ 0). ') +
          (b.lines.CL_INT > 0 ? 'Interest accrued & payable: ' + F.money(b.lines.CL_INT) + '.' : '') });
      if (pl) sol.push({ tone: r.intCover === null ? 'info' : r.intCover < 1 ? 'neg' : r.intCover < 2 ? 'watch' : 'pos',
        title: 'Interest cover ' + (r.intCover === null ? 'n/a' : F.x(r.intCover)),
        body: 'EBITDA ' + F.money(pl.ebitda) + ' vs finance costs ' + F.money(pl.fin) + ' in ' + M + '. Lenders typically look for > 2.0x.' });
      if (r.currentRatio !== null) sol.push({ tone: r.currentRatio < 1 ? 'neg' : r.currentRatio < 1.2 ? 'watch' : 'pos',
        title: 'Current ratio ' + F.x(r.currentRatio) + ', quick ratio ' + F.x(r.quickRatio),
        body: 'Current assets ' + F.money(b.ca) + ' vs current liabilities incl. short-term bank borrowings ' + F.money(b.currentLiab) + '. Excluding inventory, liquid assets cover ' + F.x(r.quickRatio) + ' of short-term obligations.' });
    }

    /* ============ GROWTH, BREAKEVEN, DEBT SERVICE, COSTS ============ */
    const A = MIS.analytics, grow = [];
    if (pl) {
      const cmp = A.comparator(model, key);
      if (cmp && cmp.kind === 'avg') {
        const g = F.change(pl.revNet, cmp.pl.revNet);
        grow.push({ tone: g === null ? 'info' : g >= 0 ? 'pos' : 'watch',
          title: 'Net revenue ' + F.signedPct(g) + ' vs the ' + model.gap.label + ' monthly average (' + F.money(cmp.pl.revNet) + ')',
          body: 'Months before ' + M + ' are only available as one block (FY-to-date TB minus ' + M + '). Upload each month\'s TB to see a true month-on-month trend.' });
      }
      const be = A.breakeven(pl, 1);
      if (be && be.be) grow.push({ tone: be.gap >= 0 ? 'pos' : be.gap > -0.2 ? 'watch' : 'neg',
        title: 'Revenue is ' + F.signedPct(be.gap, 0) + ' vs EBITDA breakeven of ' + F.money(be.be) + ' a month',
        body: 'Contribution margin ' + F.pct(be.cm) + ' on fixed costs of ' + F.money(be.fixedM) + ' a month. Including interest, cash breakeven is ' + F.money(be.beCash) + ' a month. Each +1 pp of contribution margin lowers breakeven by about ' + F.money(be.be - be.fixedM / (be.cm + 0.01)) + '.' });
      else if (be) grow.push({ tone: 'neg', title: 'Contribution margin is ' + F.pct(be.cm) + ' — no breakeven at current pricing and costs',
        body: 'Variable costs (materials consumed, direct, selling & trade, power) exceed revenue in ' + M + '. If closing stock is provisional this is likely overstated — enter actual closing stock first.' });
      const y = ytd.pl, ny = y ? Math.round(y.days / 30.4) : 0, bey = y ? A.breakeven(y, ny) : null;
      if (bey && bey.be) grow.push({ tone: bey.gap >= 0 ? 'pos' : 'watch', title: 'On a YTD basis revenue averages ' + F.money(bey.revM) + ' a month vs breakeven of ' + F.money(bey.be),
        body: 'YTD contribution margin ' + F.pct(bey.cm) + '. YTD is flattered by the stock build-up if closing stock is overstated.' });
      const ca = A.costAnalysis(model, key);
      ca.spikes.slice(0, 3).forEach(x => prof.push({ tone: 'watch', title: 'Cost spike: ' + x.name + ' at ' + F.money(x.cur) + ' vs usual ' + F.money(x.avg),
        body: 'Booked under ' + MIS.config.ALL_LINES[x.line].label + '. Check for one-offs, prior-period entries or misclassification before the MIS goes out.' }));
      if (ca.top[0]) prof.push({ tone: 'info', title: 'Largest cost ledger: ' + ca.top[0].name + ' — ' + F.money(ca.top[0].cur) + ' (' + F.pct(ca.top[0].pctRev) + ' of revenue)',
        body: 'Top five: ' + ca.top.slice(0, 5).map(x => x.name + ' ' + F.money(x.cur)).join('; ') + '.' });
      const chn = A.mix(pl, A.channelOf);
      if (chn[0] && chn[0].share > 0.5) grow.push({ tone: 'watch', title: chn[0].k + ' is ' + F.pct(chn[0].share, 0) + ' of gross sales',
        body: 'Channel mix: ' + chn.map(x => x.k + ' ' + F.pct(x.share, 0)).join(', ') + '. A single dominant channel sets your pricing, payment terms and returns policy.' });
    }
    const ds = A.debtService(model, key), lbk = A.loanBook(model, key);
    if (lbk) sol.push({ tone: 'info', title: 'Loan book ' + F.money(lbk.total) + ' across ' + lbk.rows.filter(x => x.bal > 1).length + ' facilities',
      body: lbk.rows.filter(x => x.bal > 1).map(x => x.name + ' ' + F.money(x.bal) + ' (' + F.pct(x.share, 0) + ')').join('; ') + '.' });
    if (ds) sol.push({ tone: ds.dscr === null ? 'info' : ds.dscr < 1 ? 'neg' : ds.dscr < 1.25 ? 'watch' : 'pos',
      title: 'Debt service cover ' + (ds.dscr === null ? 'n/a' : F.x(ds.dscr)) + '; effective cost of debt ' + F.pct(ds.costOfDebt),
      body: 'Interest ' + F.money(ds.interest) + (ds.hasPrev ? ' + principal repaid ' + F.money(ds.principal) : ' (principal needs the prior month)') + ' against EBITDA of ' + F.money(pl ? pl.ebitda : null) + '.' +
        (ds.emi ? ' Contracted EMIs of ' + F.money(ds.emi) + ' are covered ' + F.x(ds.emiCover) + ' by EBITDA.' : ' Enter contracted EMIs in Data & mapping to track EMI cover.') });

    /* ============ DATA INTEGRITY ============ */
    model.tbs.forEach(tb => {
      checks.push({ status: tb.checks.balanced ? 'ok' : 'fail', text: 'TB ' + tb.from + ' → ' + tb.to + ': ' + (tb.checks.balanced ? 'balanced' : 'NOT balanced') + ' (Dr ' + F.money(tb.checks.totalDr) + ')' });
      tb.warnings.forEach(w => checks.push({ status: 'warn', text: w }));
    });
    if (b) checks.push({ status: Math.abs(b.diff) < 5 ? 'ok' : 'fail', text: 'Balance sheet at ' + b.date + (Math.abs(b.diff) < 5 ? ' balances' : ' out of balance by ' + F.money(b.diff)) });
    if (stock) checks.push({ status: stock.src === 'provisional' ? 'warn' : 'ok', text: 'Closing stock ' + M + ': ' + F.money(stock.v) + ' — ' + (stock.src === 'books' ? 'from books (next period opening stock)' : stock.src === 'manual' ? 'manual entry' : 'PROVISIONAL, carried forward. Enter actual closing stock in Data & Mapping.') });
    if (pl && pl.meta.src === 'derived') checks.push({ status: 'ok', text: M + ' P&L derived as YTD minus previous YTD.' });
    if (pl && Math.abs(pl.lines.OPX_SUSP) > 1) checks.push({ status: 'warn', text: 'Suspense / unclassified entries in P&L: ' + F.money(pl.lines.OPX_SUSP) + ' — clear before closing the month.' });
    if (b && Math.abs(b.lines.CA_SUSP) > 1) checks.push({ status: 'warn', text: 'Suspense balance on balance sheet: ' + F.money(b.lines.CA_SUSP) + '.' });
    if (ytd.pl && Math.abs(ytd.pl.dep) < 1 && b && b.lines.FA_GROSS > 0) checks.push({ status: 'warn', text: 'No depreciation booked YTD on gross block of ' + F.money(b.lines.FA_GROSS + b.lines.FA_INT) + ' — EBIT and PAT are overstated until depreciation is provided (book monthly or quarterly).' });
    if (pl && ytd.pl && ytd.pl.revNet && pl.revNet && Math.abs(ytd.pl.gp / ytd.pl.revNet - pl.gp / pl.revNet) > 0.25)
      checks.push({ status: 'warn', text: 'Gross margin for ' + M + ' (' + F.pct(pl.gp / pl.revNet) + ') differs from YTD (' + F.pct(ytd.pl.gp / ytd.pl.revNet) + ') by more than 25 pp — usually a closing-stock cut-off or valuation issue.' });
    if (cf && Math.abs(cf.other) > 1) checks.push({ status: 'warn', text: 'Cash flow has an unreconciled difference of ' + F.money(cf.other) + ' (equity movements outside P&L, or stock inconsistency).' });
    if (cf && Math.abs(cf.other) <= 1) checks.push({ status: 'ok', text: 'Cash flow reconciles to closing cash & bank.' });
    (model.unknownGroups || []).forEach(g => checks.push({ status: 'warn', text: 'Unrecognised Tally group "' + g + '" — review its mapping.' }));

    /* ============ HEADLINE & KEY MESSAGES ============ */
    const all = [].concat(cash, wc, prof, sol, grow);
    const ranked = all.filter(x => x.tone !== 'info').sort((a, c) => RANK[a.tone] - RANK[c.tone]);
    const negs = ranked.filter(x => x.tone === 'neg');
    const pos = ranked.filter(x => x.tone === 'pos');
    const messages = negs.slice(0, 3).concat(ranked.filter(x => x.tone === 'watch').slice(0, Math.max(0, 3 - negs.length))).concat(pos.slice(0, 1));

    let headline = M + ': ';
    if (pl) {
      const mom = ppl ? F.change(pl.revNet, ppl.revNet) : null;
      headline += 'net revenue of ' + F.money(pl.revNet) + (mom !== null ? ' (' + F.signedPct(mom, 0) + ' MoM)' : '') + ' with EBITDA of ' + F.money(pl.ebitda);
    } else headline += 'balance sheet updated';
    if (b && b.lines.BR_BANKCR > 1000) headline += '; liquidity is the binding constraint — overdrawn bank balances exceed cash on hand';
    else if (r.runway !== undefined && r.runway !== null && r.runway < 6) headline += '; cash runway is about ' + F.months(r.runway);
    else if (b && b.equity < 0) headline += '; net worth remains negative';

    return { headline: headline, messages: messages, sections: [
      { id: 'cash', title: 'Cash & liquidity — are we sufficiently funded?', items: cash },
      { id: 'wc', title: 'Working capital — where is the cash tied up?', items: wc },
      { id: 'grow', title: 'Growth & breakeven — how far from self-sustaining?', items: grow },
      { id: 'prof', title: 'Profitability & costs — what drives the margin?', items: prof },
      { id: 'sol', title: 'Balance sheet & solvency', items: sol }
    ], checks: checks };
  }

  MIS.insights = { generate };
})(window.MIS);
