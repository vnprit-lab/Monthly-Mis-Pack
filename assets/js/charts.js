/* =============================================================================
 * charts.js — Chart.js exhibits in a restrained consulting style:
 * one focus colour, muted context, thin marks, single y-axis, hover tooltips.
 * ===========================================================================*/
window.MIS = window.MIS || {};

(function (MIS) {
  'use strict';
  const F = MIS.fmt;
  // Palettes per theme. "navy" = context bars / totals, "blue" = focus, "orange" = outflow.
  const PALETTES = {
    light: { navy: '#051C2C', blue: '#2251FF', cyan: '#00A9F4', orange: '#E0703C', soft: '#F2B8A0', muted: '#B8C2CC', grid: '#EEF1F4', ink: '#4A5A6A', label: '#1F2933', tip: '#051C2C', ring: '#FFFFFF' },
    dark: { navy: '#5D7C99', blue: '#00A9F4', cyan: '#00A9F4', orange: '#F28B5B', soft: '#8A5A48', muted: '#2A4D6B', grid: '#133650', ink: '#B3C3D2', label: '#E6EDF3', tip: '#000D16', ring: '#0A2639', total: '#C9D6E3', line1: '#E6EDF3' }
  };
  const COL = Object.assign({}, PALETTES.light);
  function setTheme(t) { Object.assign(COL, PALETTES[t] || PALETTES.light); if (!PALETTES[t] || t === 'light') { COL.total = COL.navy; COL.line1 = COL.navy; } }
  setTheme('light');
  const live = {};

  function base() {
    if (typeof Chart === 'undefined') return false;
    Chart.defaults.font.family = "'Inter','Helvetica Neue',Arial,sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.color = COL.ink;
    Chart.defaults.borderColor = COL.grid;
    Chart.defaults.animation = false;
    Chart.defaults.plugins.legend.labels.boxWidth = 10;
    Chart.defaults.plugins.legend.labels.boxHeight = 10;
    Chart.defaults.plugins.tooltip.backgroundColor = COL.tip;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 3;
    return true;
  }
  function make(id, cfg) {
    if (!base()) return;
    const el = document.getElementById(id);
    if (!el) return;
    if (live[id]) { live[id].destroy(); delete live[id]; }
    live[id] = new Chart(el.getContext('2d'), cfg);
  }
  function destroyAll() { Object.keys(live).forEach(k => { live[k].destroy(); delete live[k]; }); }

  const unitVal = v => (v === null || v === undefined ? null : v / F.unitDef().div);
  // Axis presets are getters so they pick up the current theme's colours
  const AX = {
    get amt() { return { grid: { color: COL.grid }, border: { display: false }, ticks: { callback: v => Number(v).toLocaleString('en-IN') } }; },
    get pct() { return { grid: { color: COL.grid }, border: { display: false }, ticks: { callback: v => v + '%' } }; },
    get none() { return { grid: { display: false }, border: { color: COL.muted } }; }
  };

  // Plugin: value label at the tip of selected bars only
  const tipLabel = {
    id: 'tipLabel',
    afterDatasetsDraw(chart, args, opts) {
      if (!opts || !opts.indexes) return;
      const { ctx } = chart;
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        meta.data.forEach((bar, i) => {
          if (opts.indexes.indexOf(i) < 0) return;
          const v = ds.data[i];
          if (v === null || v === undefined) return;
          const val = Array.isArray(v) ? v[1] - v[0] : v;
          ctx.save();
          ctx.fillStyle = COL.label;
          ctx.font = "600 11px Inter, Arial";
          const horiz = chart.options.indexAxis === 'y';
          const txt = opts.format ? opts.format(val) : Number(val).toLocaleString('en-IN', { maximumFractionDigits: 1 });
          if (horiz) { ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, Math.max(bar.x, bar.base) + 6, bar.y); }
          else { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(txt, bar.x, Math.min(bar.y, bar.base) - 4); }
          ctx.restore();
        });
      });
    }
  };

  /** Monthly bars with the selected month highlighted */
  function monthlyBars(id, labels, values, selIdx, opts) {
    opts = opts || {};
    make(id, {
      type: 'bar',
      data: { labels: labels, datasets: [{ label: opts.label || '', data: values, backgroundColor: values.map((v, i) => i === selIdx ? COL.blue : (v !== null && v < 0 ? COL.soft : COL.navy)), borderRadius: 4, borderSkipped: 'start', maxBarThickness: 24, categoryPercentage: 0.7 }] },
      options: {
        maintainAspectRatio: false,
        layout: { padding: { top: 18 } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + (opts.pct ? Number(c.raw).toFixed(1) + '%' : Number(c.raw).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + ' ' + F.unitDef().label) } }, tipLabel: { indexes: [selIdx], format: opts.pct ? v => v.toFixed(1) + '%' : null } },
        scales: { x: AX.none, y: opts.pct ? AX.pct : AX.amt }
      },
      plugins: [tipLabel]
    });
  }

  /** Multi-series line chart (same unit, single axis) */
  function lines(id, labels, series, opts) {
    opts = opts || {};
    const palette = [COL.line1, COL.cyan, COL.orange, COL.blue];
    make(id, {
      type: 'line',
      data: { labels: labels, datasets: series.map((s, i) => ({ label: s.label, data: s.data, borderColor: palette[i], backgroundColor: palette[i], borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBorderColor: COL.ring, pointBorderWidth: 2, spanGaps: true, tension: 0 })) },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top', align: 'start' }, tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + (c.raw === null ? '–' : opts.suffix === '%' ? Number(c.raw).toFixed(1) + '%' : Math.round(c.raw) + (opts.suffix || '')) } } },
        scales: { x: AX.none, y: opts.suffix === '%' ? AX.pct : { beginAtZero: true, grid: { color: COL.grid }, border: { display: false }, ticks: { callback: v => v + (opts.suffix || '') } } }
      }
    });
  }

  /** Cash waterfall: opening → flows → closing */
  function waterfall(id, opening, items, closing) {
    const labels = ['Opening'].concat(items.map(i => i.label)).concat(['Closing']);
    const data = [], colors = [], deltas = [];
    let run = unitVal(opening);
    data.push([0, run]); colors.push(COL.total); deltas.push(run);
    items.forEach(it => {
      const v = unitVal(it.v);
      data.push([run, run + v]); colors.push(v >= 0 ? COL.blue : COL.orange); deltas.push(v);
      run += v;
    });
    data.push([0, unitVal(closing)]); colors.push(COL.total); deltas.push(unitVal(closing));
    make(id, {
      type: 'bar',
      data: { labels: labels.map(l => l.length > 18 ? l.split(' ').reduce((acc, w) => { const last = acc[acc.length - 1]; if ((last + ' ' + w).trim().length <= 16) acc[acc.length - 1] = (last + ' ' + w).trim(); else acc.push(w); return acc; }, ['']) : l),
        datasets: [{ data: data, backgroundColor: colors, borderRadius: 3, borderSkipped: false, maxBarThickness: 34, categoryPercentage: 0.8 }] },
      options: {
        maintainAspectRatio: false,
        layout: { padding: { top: 18 } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: c => labels[c[0].dataIndex], label: c => ' ' + (deltas[c.dataIndex] >= 0 ? '' : '–') + Math.abs(deltas[c.dataIndex]).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + ' ' + F.unitDef().label } },
          tipLabel: { indexes: data.map((d, i) => i), format: v => (Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1)).toLocaleString('en-IN') } },
        scales: { x: Object.assign({}, AX.none, { ticks: { autoSkip: false, maxRotation: 0, font: { size: 10 } } }), y: AX.amt }
      },
      plugins: [tipLabel]
    });
  }

  /** Horizontal bars sorted descending (single series) */
  function hbars(id, labels, values, opts) {
    opts = opts || {};
    make(id, {
      type: 'bar',
      data: { labels: labels, datasets: [{ data: values, backgroundColor: values.map((v, i) => i === 0 && opts.focusFirst ? COL.blue : COL.navy), borderRadius: 4, borderSkipped: 'start', maxBarThickness: 18, categoryPercentage: 0.75 }] },
      options: {
        indexAxis: 'y', maintainAspectRatio: false,
        layout: { padding: { right: 48 } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + (opts.pct ? Number(c.raw).toFixed(1) + '%' : Number(c.raw).toLocaleString('en-IN', { maximumFractionDigits: 2 }) + ' ' + F.unitDef().label) } }, tipLabel: { indexes: values.map((v, i) => i), format: opts.pct ? v => v.toFixed(1) + '%' : v => v.toLocaleString('en-IN', { maximumFractionDigits: 1 }) } },
        scales: { x: Object.assign({}, opts.pct ? AX.pct : AX.amt, { display: false }), y: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 11 } } } }
      },
      plugins: [tipLabel]
    });
  }

  MIS.charts = { monthlyBars, lines, waterfall, hbars, destroyAll, unitVal, COL, setTheme };
})(window.MIS);
