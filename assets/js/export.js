/* =============================================================================
 * export.js — Investor-ready Excel workbook (ExcelJS) from the table models.
 * ===========================================================================*/
window.MIS = window.MIS || {};

(function (MIS) {
  'use strict';
  const F = MIS.fmt;
  const NAVY = 'FF051C2C', BLUE = 'FF2251FF', GREY = 'FFF2F4F7', RULE = 'FFB8C2CC';

  function numFmt(f) {
    const u = F.unitDef();
    switch (f) {
      case 'amt': return u.dp ? '#,##0.00;(#,##0.00);"–"' : '#,##0;(#,##0);"–"';
      case 'pct': return '0.0%;(0.0%);"–"';
      case 'chg': return '+0.0%;-0.0%;"–"';
      case 'pp': return '+0.0" pp";-0.0" pp";"–"';
      case 'days': return '#,##0" d";-#,##0" d";"–"';
      case 'x': return '0.00"x";-0.00"x";"–"';
      case 'months': return '0.0;-0.0;"–"';
      case 'num': return '#,##0;(#,##0);"–"';
      case 'num1': return '0.0;(0.0);"–"';
      case 'rs': return '"₹"#,##0.00;("₹"#,##0.00);"–"';
      default: return 'General';
    }
  }
  function cellValue(c) {
    if (c.v === null || c.v === undefined || !isFinite(c.v)) return null;
    if (c.f === 'amt') return c.v / F.unitDef().div;
    if (c.f === 'pp') return c.v * 100;
    return c.v;
  }

  function addTableSheet(wb, table, meta) {
    const name = (table.sheetName || table.title).replace(/[\\\/\?\*\[\]:]/g, '').slice(0, 31);
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', xSplit: 1, ySplit: 5, showGridLines: false }] });
    ws.getColumn(1).width = 52;
    table.columns.forEach((c, i) => { ws.getColumn(i + 2).width = 14; });
    ws.getCell('A1').value = meta.company;
    ws.getCell('A1').font = { name: 'Georgia', size: 14, bold: true, color: { argb: NAVY } };
    ws.getCell('A2').value = table.title;
    ws.getCell('A2').font = { name: 'Arial', size: 12, bold: true, color: { argb: BLUE } };
    ws.getCell('A3').value = 'Amounts in ' + F.unitDef().label + (meta.note ? ' · ' + meta.note : '');
    ws.getCell('A3').font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF5B6B7A' } };

    const hdr = ws.getRow(5);
    hdr.getCell(1).value = 'Particulars';
    table.columns.forEach((c, i) => { hdr.getCell(i + 2).value = c.label + (c.provisional ? ' *' : ''); });
    hdr.eachCell(cell => {
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      cell.alignment = { horizontal: cell.col === 1 ? 'left' : 'right', vertical: 'middle' };
    });
    hdr.height = 20;

    let r = 6;
    table.rows.forEach(row => {
      const xr = ws.getRow(r);
      xr.getCell(1).value = row.label;
      xr.getCell(1).alignment = { indent: row.indent || 0 };
      row.cells.forEach((c, i) => {
        const cell = xr.getCell(i + 2);
        if (c.f === 'text') { cell.value = c.v === null ? null : c.v; return; }
        cell.value = cellValue(c);
        cell.numFmt = numFmt(c.f);
        cell.alignment = { horizontal: 'right' };
      });
      const base = { name: 'Arial', size: 10, color: { argb: 'FF1F2933' } };
      if (row.type === 'section') {
        xr.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: BLUE } };
      } else if (row.type === 'subtotal') {
        xr.eachCell({ includeEmpty: true }, cell => { if (cell.col <= table.columns.length + 1) { cell.font = Object.assign({}, base, { bold: true }); cell.border = { top: { style: 'thin', color: { argb: RULE } } }; } });
      } else if (row.type === 'total') {
        xr.eachCell({ includeEmpty: true }, cell => { if (cell.col <= table.columns.length + 1) { cell.font = Object.assign({}, base, { bold: true, color: { argb: NAVY } }); cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY } }; cell.border = { top: { style: 'thin', color: { argb: NAVY } }, bottom: { style: 'thin', color: { argb: NAVY } } }; } });
      } else if (row.type === 'pct' || row.type === 'memo') {
        xr.eachCell(cell => { cell.font = Object.assign({}, base, { italic: true, color: { argb: 'FF5B6B7A' } }); });
      } else {
        xr.eachCell(cell => { cell.font = base; });
      }
      r++;
    });
    if (table.columns.some(c => c.provisional)) {
      ws.getCell('A' + (r + 1)).value = '* Closing stock provisional (carried forward) — margins will change when actual closing stock is entered.';
      ws.getCell('A' + (r + 1)).font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FFB45309' } };
      r++;
    }
    ws.getCell('A' + (r + 1)).value = 'Source: Tally trial balance; MIS dashboard analysis. Generated ' + new Date().toLocaleString('en-IN');
    ws.getCell('A' + (r + 1)).font = { name: 'Arial', size: 8, color: { argb: 'FF8A99A8' } };
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
    return ws;
  }

  function addCover(wb, model, sel, ins) {
    const ws = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });
    ws.getColumn(1).width = 4; ws.getColumn(2).width = 110;
    const m = model.months.find(x => x.key === sel);
    const put = (r, v, font) => { const c = ws.getCell('B' + r); c.value = v; c.font = font; c.alignment = { wrapText: true, vertical: 'top' }; };
    put(2, model.company, { name: 'Georgia', size: 18, bold: true, color: { argb: NAVY } });
    put(3, 'Monthly MIS — Investor report · ' + m.label + ' · ' + model.fyLabel, { name: 'Arial', size: 12, color: { argb: BLUE } });
    put(5, ins.headline, { name: 'Georgia', size: 13, bold: true, color: { argb: 'FF1F2933' } });
    let r = 7;
    put(r++, 'KEY MESSAGES', { name: 'Arial', size: 10, bold: true, color: { argb: BLUE } });
    ins.messages.forEach((x, i) => { put(r, (i + 1) + '. ' + x.title + ' — ' + x.body, { name: 'Arial', size: 10 }); ws.getRow(r).height = 46; r++; });
    r++;
    ins.sections.forEach(s => {
      put(r++, s.title.toUpperCase(), { name: 'Arial', size: 10, bold: true, color: { argb: BLUE } });
      s.items.forEach(x => {
        const tag = { neg: '[RISK] ', watch: '[WATCH] ', pos: '[POSITIVE] ', info: '' }[x.tone];
        put(r, tag + x.title + ' — ' + x.body, { name: 'Arial', size: 10, color: { argb: x.tone === 'neg' ? 'FFB91C1C' : 'FF1F2933' } });
        ws.getRow(r).height = 46; r++;
      });
      r++;
    });
    put(r++, 'DATA INTEGRITY CHECKS', { name: 'Arial', size: 10, bold: true, color: { argb: BLUE } });
    ins.checks.forEach(c => { put(r++, (c.status === 'ok' ? '✓ ' : c.status === 'warn' ? '! ' : '✗ ') + c.text, { name: 'Arial', size: 9, color: { argb: c.status === 'ok' ? 'FF15803D' : c.status === 'warn' ? 'FFB45309' : 'FFB91C1C' } }); });
  }

  function addMapping(wb, model) {
    const ws = wb.addWorksheet('Mapping');
    ws.columns = [{ header: 'Tally group', key: 'g', width: 28 }, { header: 'Ledger', key: 'n', width: 44 }, { header: 'MIS line', key: 'l', width: 44 }, { header: 'Override?', key: 'o', width: 10 }];
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    model.ledgerUniverse.forEach(l => ws.addRow({ g: l.group, n: l.name, l: (MIS.config.ALL_LINES[l.line] || {}).label || l.line, o: l.line !== l.rule ? 'Yes' : '' }));
  }

  async function download(model, sel, which) {
    if (typeof ExcelJS === 'undefined') throw new Error('Excel writer (ExcelJS) did not load — check your internet connection.');
    const T = MIS.tables;
    const ins = MIS.insights.generate(model, sel);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'MIS Dashboard'; wb.created = new Date();
    const meta = { company: model.company };
    const m = model.months.find(x => x.key === sel);
    const all = !which || which === 'all';
    if (all) addCover(wb, model, sel, ins);
    if (all || which === 'pl') addTableSheet(wb, Object.assign(T.plTable(model, sel), { sheetName: 'P&L' }), meta);
    if (all || which === 'bs') addTableSheet(wb, Object.assign(T.bsTable(model, sel), { sheetName: 'Balance Sheet' }), meta);
    if (all || which === 'cf') {
      addTableSheet(wb, Object.assign(T.cfTable(model, sel), { sheetName: 'Cash Flow' }), meta);
      const br = T.bridgeTable(model, sel);
      if (br) addTableSheet(wb, Object.assign(br, { sheetName: 'Cash Bridge ' + m.label, title: 'Cash bridge — ' + m.label }), meta);
    }
    if (all || which === 'ratios') addTableSheet(wb, Object.assign(T.ratioTable(model, sel), { sheetName: 'Ratios' }), meta);
    if (all) {
      const A = MIS.analytics;
      const dt = A.debtTable(model, sel);
      if (dt) addTableSheet(wb, Object.assign(dt, { sheetName: 'Debt & Funding' }), meta);
      addTableSheet(wb, Object.assign(A.breakevenTable(model, sel), { sheetName: 'Breakeven' }), meta);
      addTableSheet(wb, Object.assign(A.costTable(model, sel), { sheetName: 'Cost Analysis' }), meta);
      if (model.ops && Object.keys(model.ops).length) addTableSheet(wb, Object.assign(A.unitTable(model, sel), { sheetName: 'Unit Economics' }), meta);
      addTableSheet(wb, Object.assign(T.ledgerTable(model, sel), { sheetName: 'P&L Ledger Detail' }), meta);
      addMapping(wb, model);
    }
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const label = { all: 'MIS Pack', pl: 'P&L', bs: 'Balance Sheet', cf: 'Cash Flow', ratios: 'Ratios' }[which || 'all'];
    const fname = (model.company.replace(/[^\w ]+/g, '').trim() + ' - ' + label + ' - ' + m.label + '.xlsx');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return fname;
  }

  MIS.exporter = { download };
})(window.MIS);
