/* format.js — number formatting in Indian conventions (₹ lakh / crore) */
window.MIS = window.MIS || {};

(function (MIS) {
  'use strict';
  const UNITS = {
    lakh: { div: 1e5, label: '₹ lakh', short: 'L', dp: 2 },
    crore: { div: 1e7, label: '₹ crore', short: 'Cr', dp: 2 },
    rupee: { div: 1, label: '₹', short: '', dp: 0 }
  };
  let unit = 'lakh';
  const nf = {};
  const getNF = dp => nf[dp] || (nf[dp] = new Intl.NumberFormat('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp }));
  const ok = v => v !== null && v !== undefined && isFinite(v);

  const F = {
    UNITS: UNITS,
    setUnit(u) { if (UNITS[u]) unit = u; },
    unit() { return unit; },
    unitDef() { return UNITS[unit]; },
    /** table amount in current unit, negatives in parentheses */
    amt(v, dp) {
      if (!ok(v)) return '–';
      const u = UNITS[unit];
      const d = dp === undefined ? u.dp : dp;
      const x = v / u.div;
      if (Math.abs(x) < Math.pow(10, -d) / 2) return '–';
      const s = getNF(d).format(Math.abs(x));
      return x < 0 ? '(' + s + ')' : s;
    },
    /** narrative money: ₹12.34 L / ₹1.23 Cr (auto-scales to crore above 100 L) */
    money(v) {
      if (!ok(v)) return 'n/a';
      const a = Math.abs(v);
      let s;
      if (a >= 1e7) s = '₹' + getNF(2).format(a / 1e7) + ' Cr';
      else if (a >= 1e5) s = '₹' + getNF(1).format(a / 1e5) + ' L';
      else s = '₹' + getNF(0).format(a);
      return v < 0 ? '–' + s : s;
    },
    pct(v, dp) { return ok(v) ? (v * 100).toFixed(dp === undefined ? 1 : dp) + '%' : '–'; },
    signedPct(v, dp) { return ok(v) ? (v >= 0 ? '+' : '–') + Math.abs(v * 100).toFixed(dp === undefined ? 1 : dp) + '%' : '–'; },
    pp(v) { return ok(v) ? (v >= 0 ? '+' : '–') + Math.abs(v * 100).toFixed(1) + ' pp' : '–'; },
    days(v) { return ok(v) ? Math.round(v).toLocaleString('en-IN') + ' d' : '–'; },
    x(v) { return ok(v) ? v.toFixed(2) + 'x' : '–'; },
    months(v) { return ok(v) ? (v >= 24 ? '24+ months' : v.toFixed(1) + ' months') : '–'; },
    change(cur, prev) {
      if (!ok(cur) || !ok(prev) || Math.abs(prev) < 1) return null;
      return (cur - prev) / Math.abs(prev);
    },
    ok: ok,
    esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  };
  MIS.fmt = F;
})(window.MIS);
