/* =============================================================================
 * config.js — Chart-of-accounts mapping for Tally trial balances
 * -----------------------------------------------------------------------------
 * Every Tally ledger is classified into ONE MIS line using:
 *   1. a user override (saved from the "Data & Mapping" tab), else
 *   2. the rules below (primary Tally group + keywords in the ledger name).
 *
 * Balance-sheet lines carry a "contra" line: a debit balance in a liability
 * ledger (e.g. advance paid to a creditor) is shown on the asset side under
 * the contra line, and vice-versa. This keeps the balance sheet gross, which
 * is what an investor-grade working-capital analysis needs.
 * ===========================================================================*/
window.MIS = window.MIS || {};

(function (MIS) {
  'use strict';

  /* ---------------- P&L line catalogue (nature: Cr = income, Dr = cost) ---- */
  const PL_LINES = [
    { id: 'REV_GROSS', label: 'Gross sales', nature: 'Cr', block: 'Revenue' },
    { id: 'REV_RET', label: 'Less: Returns, discounts & rebates', nature: 'Dr', block: 'Revenue' },
    { id: 'OI', label: 'Other income', nature: 'Cr', block: 'Other income' },
    { id: 'MAT_MILK', label: 'Milk', nature: 'Dr', block: 'Materials' },
    { id: 'MAT_RM', label: 'Other raw materials & additives', nature: 'Dr', block: 'Materials' },
    { id: 'MAT_TRADED', label: 'Traded goods (paneer, cheese etc.)', nature: 'Dr', block: 'Materials' },
    { id: 'MAT_PACK', label: 'Packing materials', nature: 'Dr', block: 'Materials' },
    { id: 'MAT_FUEL', label: 'Production fuel', nature: 'Dr', block: 'Materials' },
    { id: 'MAT_OTH', label: 'Other production consumables', nature: 'Dr', block: 'Materials' },
    { id: 'DIR_EXP', label: 'Direct expenses', nature: 'Dr', block: 'Materials' },
    { id: 'OPX_EMP', label: 'Employee costs', nature: 'Dr', block: 'Opex' },
    { id: 'OPX_SD', label: 'Selling, distribution & trade spend', nature: 'Dr', block: 'Opex' },
    { id: 'OPX_POWER', label: 'Power, fuel & utilities', nature: 'Dr', block: 'Opex' },
    { id: 'OPX_RENT', label: 'Rent', nature: 'Dr', block: 'Opex' },
    { id: 'OPX_PROF', label: 'Professional & compliance', nature: 'Dr', block: 'Opex' },
    { id: 'OPX_RM', label: 'Repairs & maintenance', nature: 'Dr', block: 'Opex' },
    { id: 'OPX_ADMIN', label: 'Administrative & other expenses', nature: 'Dr', block: 'Opex' },
    { id: 'OPX_BAD', label: 'Bad debts & write-offs', nature: 'Dr', block: 'Opex' },
    { id: 'OPX_SUSP', label: 'Suspense / unclassified', nature: 'Dr', block: 'Opex' },
    { id: 'DEP', label: 'Depreciation & amortisation', nature: 'Dr', block: 'Below EBITDA' },
    { id: 'FIN', label: 'Finance costs (interest & bank charges)', nature: 'Dr', block: 'Below EBITDA' },
    { id: 'TAX', label: 'Tax expense', nature: 'Dr', block: 'Below EBITDA' }
  ];

  /* ---------------- Balance-sheet line catalogue ---------------------------- */
  // side: A = asset, L = liability / equity. contra: where opposite balances go.
  const BS_LINES = [
    { id: 'EQ_SHARE', label: 'Share capital', side: 'L', block: 'Equity' },
    { id: 'EQ_RES', label: 'Reserves & surplus (incl. securities premium)', side: 'L', block: 'Equity' },
    { id: 'EQ_RE', label: 'Retained earnings / (accumulated losses)', side: 'L', block: 'Equity', computed: true },
    { id: 'BR_LT', label: 'Term loans (secured)', side: 'L', block: 'Borrowings' },
    { id: 'BR_UNSEC', label: 'Unsecured loans', side: 'L', block: 'Borrowings' },
    { id: 'BR_OCD', label: 'Optionally convertible debentures', side: 'L', block: 'Borrowings' },
    { id: 'BR_ST', label: 'Bank OD / cash credit', side: 'L', block: 'Borrowings' },
    { id: 'BR_BANKCR', label: 'Bank accounts in credit (overdrawn)', side: 'L', block: 'Borrowings' },
    { id: 'CL_TP', label: 'Trade payables', side: 'L', block: 'Current liabilities', contra: 'CA_SUPADV' },
    { id: 'CL_CUSTADV', label: 'Advances from customers', side: 'L', block: 'Current liabilities', contra: 'CA_TR' },
    { id: 'CL_STAT', label: 'Statutory dues (GST, TDS, PF etc.)', side: 'L', block: 'Current liabilities', contra: 'CA_STAT' },
    { id: 'CL_EMP', label: 'Employee & director dues', side: 'L', block: 'Current liabilities', contra: 'CA_OTH' },
    { id: 'CL_INT', label: 'Interest accrued & payable', side: 'L', block: 'Current liabilities', contra: 'CA_OTH' },
    { id: 'CL_OTH', label: 'Other payables', side: 'L', block: 'Current liabilities', contra: 'CA_OTH' },
    { id: 'CL_PROV', label: 'Provisions', side: 'L', block: 'Current liabilities', contra: 'CA_OTH' },
    { id: 'CL_DTL', label: 'Deferred tax liability', side: 'L', block: 'Current liabilities', contra: 'CA_DTA' },

    { id: 'FA_GROSS', label: 'Property, plant & equipment (gross)', side: 'A', block: 'Fixed assets' },
    { id: 'FA_INT', label: 'Intangible assets', side: 'A', block: 'Fixed assets' },
    { id: 'FA_CWIP', label: 'Capital work-in-progress', side: 'A', block: 'Fixed assets' },
    { id: 'FA_ACCDEP', label: 'Less: Accumulated depreciation', side: 'A', block: 'Fixed assets' },
    { id: 'INVEST', label: 'Investments', side: 'A', block: 'Non-current assets' },
    { id: 'CA_DTA', label: 'Deferred tax asset', side: 'A', block: 'Non-current assets', contra: 'CL_DTL' },
    { id: 'CA_DEP', label: 'Security deposits', side: 'A', block: 'Non-current assets', contra: 'CL_OTH' },
    { id: 'CA_INV', label: 'Inventories', side: 'A', block: 'Current assets', computed: true },
    { id: 'CA_TR', label: 'Trade receivables', side: 'A', block: 'Current assets', contra: 'CL_CUSTADV' },
    { id: 'CA_SUPADV', label: 'Advances to suppliers', side: 'A', block: 'Current assets', contra: 'CL_TP' },
    { id: 'CA_STAT', label: 'GST input credit & tax receivables', side: 'A', block: 'Current assets', contra: 'CL_STAT' },
    { id: 'CA_LA', label: 'Loans & advances (incl. staff)', side: 'A', block: 'Current assets', contra: 'CL_OTH' },
    { id: 'CA_OTH', label: 'Other current assets', side: 'A', block: 'Current assets', contra: 'CL_OTH' },
    { id: 'CA_MISC', label: 'Misc. expenditure (to the extent not written off)', side: 'A', block: 'Current assets' },
    { id: 'CA_SUSP', label: 'Suspense (balance sheet)', side: 'A', block: 'Current assets' },
    { id: 'CA_CASH', label: 'Cash & bank balances', side: 'A', block: 'Current assets', contra: 'BR_BANKCR' }
  ];

  // Special pseudo-lines (not shown directly)
  const SPECIAL = { STOCK: 'STOCK', PLA: 'PLA' };

  const ALL_LINES = {};
  PL_LINES.forEach(l => { ALL_LINES[l.id] = Object.assign({ kind: 'PL' }, l); });
  BS_LINES.forEach(l => { ALL_LINES[l.id] = Object.assign({ kind: 'BS' }, l); });
  ALL_LINES.STOCK = { id: 'STOCK', label: 'Stock-in-hand (opening stock of period)', kind: 'SPECIAL' };
  ALL_LINES.PLA = { id: 'PLA', label: 'Profit & Loss A/c (opening balance)', kind: 'SPECIAL' };

  /* ---------------- Tally primary groups ----------------------------------- */
  // "Strong" primaries: a row with one of these names always starts a new group.
  const STRONG_PRIMARIES = [
    'capital account', 'loans (liability)', 'current liabilities', 'fixed assets',
    'investments', 'current assets', 'sales accounts', 'purchase accounts',
    'direct incomes', 'direct expenses', 'indirect incomes', 'indirect expenses',
    'income (direct)', 'expenses (direct)', 'income (indirect)', 'expenses (indirect)',
    'misc. expenses (asset)', 'misc expenses (asset)', 'branch / divisions',
    'profit & loss a/c', 'profit and loss a/c', 'difference in opening balances'
  ];

  const GROUP_KIND = {
    'capital account': 'CAPITAL', 'reserves & surplus': 'CAPITAL',
    'loans (liability)': 'LOANS', 'secured loans': 'LOANS', 'unsecured loans': 'LOANS',
    'bank od a/c': 'LOANS', 'bank occ a/c': 'LOANS',
    'current liabilities': 'CL', 'duties & taxes': 'CL', 'provisions': 'CL', 'sundry creditors': 'CL',
    'fixed assets': 'FA', 'investments': 'INV',
    'current assets': 'CA', 'stock-in-hand': 'CA', 'stock-in-hand ': 'CA', 'deposits (asset)': 'CA',
    'loans & advances (asset)': 'CA', 'sundry debtors': 'CA', 'cash-in-hand': 'CA', 'bank accounts': 'CA',
    'misc. expenses (asset)': 'MISC', 'misc expenses (asset)': 'MISC',
    'branch / divisions': 'CL', 'suspense a/c': 'SUSP', 'difference in opening balances': 'SUSP',
    'sales accounts': 'SALES', 'purchase accounts': 'PURCH',
    'direct incomes': 'OI', 'indirect incomes': 'OI', 'income (direct)': 'OI', 'income (indirect)': 'OI',
    'direct expenses': 'DIRX', 'expenses (direct)': 'DIRX',
    'indirect expenses': 'INDX', 'expenses (indirect)': 'INDX',
    'profit & loss a/c': 'PLA', 'profit and loss a/c': 'PLA'
  };

  function groupKind(group) {
    const g = (group || '').trim().toLowerCase();
    if (GROUP_KIND[g]) return GROUP_KIND[g];
    // Unknown (user-created) primary group — guess by keyword
    if (/sale|revenue|turnover/.test(g)) return 'SALES';
    if (/purchase/.test(g)) return 'PURCH';
    if (/income/.test(g)) return 'OI';
    if (/direct exp/.test(g)) return 'DIRX';
    if (/expense/.test(g)) return 'INDX';
    if (/capital|reserve|equity/.test(g)) return 'CAPITAL';
    if (/loan|borrow|debenture/.test(g)) return 'LOANS';
    if (/liabilit|payable|creditor/.test(g)) return 'CL';
    if (/fixed|asset block|property/.test(g)) return 'FA';
    if (/asset|debtor|receivable|bank|cash|stock/.test(g)) return 'CA';
    return 'UNKNOWN';
  }

  const has = (re, s) => re.test(s);

  /* ---------------- Rule engine -------------------------------------------- */
  function ruleClassify(group, ledger) {
    const kind = groupKind(group);
    const n = (ledger || '').toLowerCase();
    switch (kind) {
      case 'PLA': return 'PLA';
      case 'SALES':
        if (has(/return|discount|rebate|credit note|claim/, n)) return 'REV_RET';
        return 'REV_GROSS';
      case 'OI': return 'OI';
      case 'PURCH':
        if (has(/\bmilk\b/, n) && !has(/can|crate|powder|pouch/, n)) return 'MAT_MILK';
        if (has(/pack|carton|label|pouch|box|film|container|cup|lid/, n)) return 'MAT_PACK';
        if (has(/paneer|cheese|ghee|butter|curd|trading|traded/, n)) return 'MAT_TRADED';
        if (has(/additive|culture|rennet|salt|cream|raw material|ingredient|food material|flavour|spice|vegetable/, n)) return 'MAT_RM';
        if (has(/bpcl|hpcl|iocl|petrol|diesel|fuel|lpg|gas|furnace|firewood|briquette/, n)) return 'MAT_FUEL';
        return 'MAT_OTH';
      case 'DIRX':
        if (has(/interest|intrest/, n)) return 'FIN';
        return 'DIR_EXP';
      case 'INDX':
        if (has(/depreciation|amorti[sz]/, n)) return 'DEP';
        if (has(/interest|intrest|bank charge|processing fee|finance charge|loan charge|foreclosure/, n)) return 'FIN';
        if (has(/income tax|deferred tax|tax expense|current tax|mat credit/, n)) return 'TAX';
        if (has(/suspense/, n)) return 'OPX_SUSP';
        if (has(/bad debt|written off|write off|doubtful/, n)) return 'OPX_BAD';
        if (has(/repair|maintenance|plumbing|servic|reinstall|installation/, n)) return 'OPX_RM';
        if (has(/salary|salaries|wage|employee|staff|stipend|bonus|gratuity|\bpf\b|\besi\b|provident|allowance|incentive|labour|remuneration|accommodation|food exp|welfare|recruit/, n)) return 'OPX_EMP';
        if (has(/\brent\b|lease/, n)) return 'OPX_RENT';
        if (has(/electric|bescom|power|diesel|genset|generator|water|etp|fuel/, n)) return 'OPX_POWER';
        if (has(/freight|transport|courier|delivery|porter|distributor|brand funded|discount|commission|advertis|marketing|promotion|listing|expiry|damage|packing charge|sample|scheme|margin|carriage|logistic/, n)) return 'OPX_SD';
        if (has(/professional|legal|audit|consult|licen[cs]e|stamp|roc|filing|compliance|certif|challan|fssai|trademark/, n)) return 'OPX_PROF';
        return 'OPX_ADMIN';
      case 'CAPITAL':
        if (has(/reserve|surplus|premium|general/, n) || (group || '').toLowerCase().indexOf('reserve') >= 0) return 'EQ_RES';
        return 'EQ_SHARE';
      case 'LOANS':
        if (has(/\bod\b|overdraft|cash credit|\bcc\b|\bocc\b/, n) || has(/bank od|bank occ/, (group || '').toLowerCase())) return 'BR_ST';
        if (has(/debenture|\bocd|\bccd|\bncd/, n)) return 'BR_OCD';
        if (has(/unsecured/, n) || (group || '').toLowerCase() === 'unsecured loans') return 'BR_UNSEC';
        return 'BR_LT';
      case 'CL':
        if (has(/creditor|supplier|trade payable/, n)) return 'CL_TP';
        if (has(/duties|tax|gst|tds|tcs|statutory|\bpf\b|\besi\b|professional tax/, n)) return 'CL_STAT';
        if (has(/provision/, n)) return 'CL_PROV';
        if (has(/salary|wage|employee|director|bonus|\bot\b|staff/, n)) return 'CL_EMP';
        if (has(/interest|intrest/, n)) return 'CL_INT';
        if (has(/advance from|customer advance|advance received/, n)) return 'CL_CUSTADV';
        if (has(/deferred tax/, n)) return 'CL_DTL';
        return 'CL_OTH';
      case 'FA':
        if (has(/acc\.? ?dep|accumulated|depreciation|provision for dep/, n)) return 'FA_ACCDEP';
        if (has(/intangible|software|goodwill|trademark|brand|licen/, n)) return 'FA_INT';
        if (has(/cwip|capital work|under construction|under installation/, n)) return 'FA_CWIP';
        return 'FA_GROSS';
      case 'INV': return 'INVEST';
      case 'CA':
        if (has(/opening stock|closing stock|stock-in-hand|stock in hand|inventor|^stock/, n)) return 'STOCK';
        if (has(/deferred tax/, n)) return 'CA_DTA';
        if (has(/tds|tcs|gst|input|duties|tax|igst|cgst|sgst|advance tax/, n)) return 'CA_STAT';
        if (has(/fixed deposit|\bfd\b/, n)) return 'CA_CASH';
        if (has(/deposit/, n)) return 'CA_DEP';
        if (has(/debtor|receivable/, n)) return 'CA_TR';
        if (has(/cash|bank/, n)) return 'CA_CASH';
        if (has(/loan|advance/, n)) return 'CA_LA';
        return 'CA_OTH';
      case 'MISC': return 'CA_MISC';
      case 'SUSP': return 'CA_SUSP';
      default: return 'CA_OTH';
    }
  }

  // Ledger names that indicate trade spend (for the trade-spend ratio)
  const TRADE_SPEND_RE = /brand funded|distributor margin|margin differential|expiry|damage|scheme|trade discount|listing/i;

  MIS.config = {
    PL_LINES, BS_LINES, ALL_LINES, SPECIAL, STRONG_PRIMARIES,
    groupKind, ruleClassify, TRADE_SPEND_RE,
    FY_START_MONTH: 4 // April (Indian financial year)
  };
})(window.MIS);
