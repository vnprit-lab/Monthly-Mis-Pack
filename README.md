# Monthly MIS Dashboard: Tally trial balance to investor pack

A browser dashboard that turns the **monthly Tally trial balance** into an investor-ready MIS:

- **Monthly P&L** with FY-to-date (YTD) and month-on-month % change
- **Monthly balance sheet** (month-end) with the change against last month
- **Monthly cash flow** (indirect method) plus a **cash bridge**: opening cash → collections → payments → closing cash
- **Working-capital and ratio analysis**: DSO / DIO / DPO, cash conversion cycle, inventory cover, raw-material runway, cash runway, fixed-cost cover, liquidity, leverage, interest cover, ROCE
- **Analyst commentary** written from the numbers (risks, watch items, positives) and **data-integrity checks**
- **Growth**: month-on-month change on every P&L line, plus a growth section (revenue, gross profit, opex, EBITDA, margins). When earlier months exist only inside an FY-to-date TB, they show as one block (e.g. *Apr–Sep total* and *Apr–Sep avg / month*) and the first month is compared with that average
- **Debt & funding**: loan book by facility (incl. overdrawn bank ledgers), interest and charges by lender (month and YTD), effective cost of debt, debt service (interest + principal repaid), DSCR, contracted EMIs and EMI cover
- **Unit economics & breakeven**: contribution margin, fixed-cost base, EBITDA and cash breakeven revenue, revenue vs breakeven, product and channel mix. With monthly volumes entered: realisation per kg, milk cost per litre, yield per 100 L, capacity utilisation, revenue per employee
- **Cost analysis**: top 15 expense ledgers, biggest increases and decreases, cost spikes (more than 1.5× the usual run-rate), and a cost-line × month table with the peak month outlined
- **Data coverage strip and month picker**: every FY month is listed; months without a monthly TB are greyed out with a hint to upload them
- **Excel downloads**: the full MIS pack, or the P&L, balance sheet, cash flow or ratios on their own
- **Financials model (Excel)**, built in financial-modelling layout:
  - *Financials* sheet: income statement, balance sheet and cash flow stacked on one sheet, with balance-sheet and cash checks and a model status row
  - *Ratios* sheet: margins, cost structure, working-capital days, liquidity, solvency, returns and cash runway, all as formulas linked to *Financials*
  - Columns: each month, a quarter column after every third month of the FY (Q1 = Apr–Jun …), then YTD
  - Blue = input from the TB, black = formula, green = link. Quarters use `SUM` over the months (flows) or the quarter-end month (balances); YTD uses `SUMIF` on the period type. The row layout never changes, so month-on-month files line up
- **PDF pack**: the print-ready investor pack (use the browser's *Save as PDF*)
- **Dark theme** (deep navy, the default) with a **Light** toggle in the top bar. PDFs always print in the light theme

Files are processed **inside the browser**. Nothing is uploaded to a server.

---

## Monthly routine for staff (about 2 minutes)

1. **Tally:** Gateway of Tally → *Display More Reports* → **Trial Balance**
2. **F2 (Period):** pick the month, e.g. `1-11-2026` to `30-11-2026`
3. **Alt+F5:** switch to the **Detailed** view, which shows groups with their ledgers / sub-groups
4. **Alt+E → Excel:** export the file
5. Open the dashboard → **Upload trial balance** (or drag the file onto the page)
6. *(Optional, recommended)* **Data & mapping → Operating data**: enter milk procured (litres), production and kg sold, headcount and the EMIs due. A trial balance carries no quantities
7. If a banner asks for **closing stock**, type the month-end stock value in rupees (from the Stock Summary or the physical count) and press *Save*
8. **Excel pack** / **Financials** / **PDF pack** → send to investors

The new month is added to the trend and YTD automatically, and every MoM % is recalculated.

### First-time load (April → October)

Upload **each month separately** (Apr, May, … Oct). You can select all seven files at once. You can also upload one *April-to-date* TB as well as the monthly files. Both formats work:

| What you upload | What the dashboard derives |
|---|---|
| One-month TBs (1-Oct to 31-Oct) | The month's P&L directly. Balance sheet at month-end |
| FY-to-date TBs (1-Apr to 31-Oct) | YTD P&L. A month's P&L = YTD(this month) − YTD(last month) |
| The March TB (or FY 25-26 TB) | The 31-Mar balance sheet, which unlocks April's cash flow and the YTD cash flow |

> **Cash flow, the cash bridge and MoM % need the previous month's TB as well.** With only one month loaded, the P&L and balance sheet work, and the dashboard tells you which file to add.

---

## Why closing stock is asked for

A Tally trial balance shows **opening** stock (the stock at the start of the period). Closing stock appears only in the final P&L / balance sheet. The dashboard picks up the closing stock in this order:

1. **From the books**: the next month's TB shows it as opening stock (e.g. the Nov TB gives 31-Oct closing stock)
2. **Manual entry**: the banner, or *Data & mapping → Closing stock*
3. **Provisional**: the last known figure is carried forward. These columns are marked **PROV** and margins will change when the real figure comes in

---

## Account mapping

Every Tally ledger is mapped to an MIS line by rules: the Tally primary group plus keywords in the ledger name (`assets/js/config.js`). Examples: *Milk* → Milk cost; *Brand Funded Discount* → Selling, distribution & trade spend; *Intrest on Loan…* → Finance costs; *Bank OD A/c* → Short-term borrowings.

To move a ledger to a different line, use **Data & mapping → Chart-of-accounts mapping**. Overrides are remembered for later months. A ledger created later in Tally is mapped by the rules until you override it.

The balance sheet is shown **gross**, the way an analyst needs it:

- Debit balances in *Sundry Creditors* → **Advances to suppliers** (asset)
- Credit balances in *Sundry Debtors* → **Advances from customers** (liability)
- Credit balances in *Bank Accounts* → **Bank accounts in credit (overdrawn)** under borrowings
- Debit balances in *Duties & Taxes* → **GST input credit & tax receivables**

---

## Methodology (summary)

| Item | Definition |
|---|---|
| Net revenue | Sales accounts net of returns / discounts / rebates |
| COGS | Opening stock + purchases + direct expenses − closing stock |
| EBITDA | Gross profit − operating expenses (excludes other income, depreciation, finance costs) |
| EBIT / PBT / PAT | EBITDA + other income − depreciation; − finance costs; − tax |
| Retained earnings | − (Profit & Loss A/c opening balance) + profit for the TB period |
| Cash | Cash-in-hand + bank debit balances. Bank OD and overdrawn bank ledgers count as borrowings |
| CFO | PBT + depreciation + finance costs ± working-capital changes − tax |
| Capex | − (Δ net fixed assets + depreciation) |
| DSO / DIO / DPO | Receivables ÷ revenue × days; inventory ÷ COGS × days; payables ÷ (purchases + direct exp.) × days |
| Inventory cover | Inventory ÷ daily material consumption |
| Raw-material runway | Inventory ÷ daily purchases |
| Cash runway | Cash ÷ average monthly free-cash burn over the last 3 months |
| Fixed-cost cover | Cash ÷ monthly payroll, rent, professional, admin and interest |

Every balance sheet is checked (assets − liabilities = 0), every TB is checked for Dr = Cr, and every cash flow is reconciled to the closing cash. Any difference shows up in **Data integrity**.

---

## Running it

**Option A: open the file.** Double-click `index.html`. It works from the file system and needs an internet connection for the three libraries.

**Option B: single file.** Run `python3 build.py` → send `dist/mis-dashboard.html` to staff as one file.

**Option C: GitHub Pages.** Push the repo → *Settings → Pages → Deploy from branch (main, root)*. Keep the repository **private** if you want the code private. Client data is never part of the repo either way (see `.gitignore`), and each user's data stays in their own browser.

**Local preview:** `python3 -m http.server 8765` → open http://localhost:8765

### Data storage and backup

Uploaded TBs, closing-stock entries and mapping overrides are kept in the browser's local storage. To move to another computer, or to keep an audit copy with the month-end file, use **Data & mapping → Download backup (.json)** and **Restore backup**.

---

## Project structure

```
index.html              Page shell and library includes
assets/css/styles.css   Visual system (consulting style, print stylesheet)
assets/js/config.js     MIS line catalogue + Tally mapping rules   ← tune mapping here
assets/js/parser.js     Tally TB Excel → ledgers (rebuilds the group hierarchy by summation)
assets/js/engine.js     Monthly / YTD P&L, balance sheet, cash flow, ratios
assets/js/insights.js   Analyst commentary + integrity checks       ← tune thresholds here
assets/js/tables.js     Statement layouts shared by screen and Excel
assets/js/analytics.js  Growth, loan book & debt service, breakeven, unit economics, cost analysis
assets/js/export.js     Formatted Excel workbook (ExcelJS)
assets/js/model-export.js  Financials model workbook (monthly / quarterly / YTD, formulas)
assets/js/charts.js     Chart.js exhibits
assets/js/app.js        UI, upload, storage
build.py                Bundles everything into dist/mis-dashboard.html
```

Libraries (version-pinned, loaded from cdnjs): SheetJS 0.18.5 (reads .xls/.xlsx), ExcelJS 4.4.0 (writes the formatted workbook), Chart.js 4.4.1.

## Known limitations

- **Depreciation** is taken only from what is booked in Tally. If it is booked quarterly or yearly, monthly EBIT/PAT look better than they are, and a data check flags this.
- **Receivables include GST** while revenue excludes it, so DSO reads about 5–12% high.
- Supported export: the *Detailed* TB (primary groups with one level below), with closing Debit/Credit columns. Multi-level expanded exports are not supported: if the groups don't add up to the Grand Total, the upload shows a warning.
