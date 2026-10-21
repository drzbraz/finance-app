# Finanças: local personal finance app

Imports the "Controle financeiro" Google Sheets export (.xlsx), turns it into categorized
transactions, shows a monthly checklist, a spreadsheet-like grid and a dashboard, and exports
back to .xlsx in the same layout.

**Local only.** No backend, no API calls, no telemetry. Data lives in the browser's IndexedDB.
The production build ships a Content-Security-Policy with `connect-src 'none'`, so the app
cannot open network connections even by accident.

## Setup

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest unit tests
npm run build      # static files in dist/
npm run preview    # serve dist/ on http://localhost:4173
```

`dist/` uses relative paths and works from any static server. Opening `dist/index.html` straight
from disk (`file://`) is **not recommended**: browsers block ES module scripts on `file://`, and some
give IndexedDB a throwaway origin there, so your data may not persist. Use `npm run preview`, or
`python3 -m http.server -d dist` to serve the folder locally.

Data belongs to the browser profile and origin (e.g. `http://localhost:4173`). Use
**Importar / Exportar → Backup .json** to move or keep it safe.

## Screens

- **Checklist do mês** (home): one checkbox per recurring item (income, investments, fixed
  expenses). Ticking it is the same as painting the cell green in the sheet. Items not recorded yet
  this month show last month's amount as "~expected"; ticking one creates it.
- **Grade mensal**: the sheet's layout (sections × months), computed from transactions. Green =
  paid. Click a cell to edit its transactions; use the small checkbox to toggle paid.
- **Lançamentos**: filter by month, type, category, tag, and paid status; inline edit; add; delete.
  Changing a category offers to create a keyword rule and re-categorize matching entries.
- **Dashboard**: savings rate (monthly, year-to-date, target), spending by category, top 5
  expenses, fixed/variable/additional/investment per month, cumulative balance, category vs.
  average (>30% flagged), goal progress in BRL with a projection, and pending items.
- **Configurações**: exchange rate, goal, patrimony, reserve, savings target; your custom rules.

## Parsing assumptions

Sheet `Listas de itens` (falls back to the first sheet).

- **Months**: the first row where ≥10 cells are Portuguese month names (accents ignored).
- **Year**: a number in A1, else a 4-digit year in the file name, else asked for in the preview.
- **Sections** are found by their **column A label**, never by row number (rows move between
  years): `Receitas`, `Investimentos`, `Despesas variáveis`, `Despesas fixas`, `Despesas adicionais`.
  Each ends at its next `Total`. `% sobre Receita` rows are skipped. A `Receita` label *after* a Total
  starts the summary block and ends the scan.
- **Formula cells are ignored** (Totals, %, Saldo, the `Mercado` SUM row, config formulas). The app
  recomputes everything. Formula cells are never overwritten on export.
- **Labeled sections**: each non-empty month cell is one transaction, described by its column A label.
- **Variable expenses**: the description is the cell's comment. Google exports comments as
  `======` / `ID#…` / `Author (YYYY-MM-DD HH:MM:SS)` / text, so the header is parsed for the date and
  kept for round-trip; replies are joined with " / ". Cells without a comment become "(sem descrição)" with a warning.
- **Dates**: the comment timestamp when it falls in the column's month and year, else the 1st of that
  month. The column always decides the month.
- **Paid** = a light green fill, detected by hue (80–160°), lightness ≥ 0.6 and saturation ≥ 0.1, so
  Google's `#D9EAD3` and similar shades count, while the dark green/blue headers don't. Only income,
  investments, and fixed expenses use it. Variable and additional expenses are paid by default
  (the sheet almost never marks them).
- **Yellow block** (`#FFF2CC`) inside the variable section = groceries: description `Mercado`,
  category Mercado unless a keyword says otherwise, `subgroup` = the fill colour. The sheet counts these
  twice (variable Total *and* the fixed `Mercado` SUM row). **The app counts them once**, as variable
  expenses. The import preview lists every month where the app's totals differ from the sheet's.
- **Numbers stored as text** (`"10,50"`, `"1.032,00"`, `"R$ 30"`) are parsed, with a warning.
- **Config block** (right of the month grid), found by its header labels with the value one or two rows
  below: `REAL` → EUR→BRL rate (the cached GOOGLEFINANCE result), `BRASIL` (BRL) / `EU` (EUR) → patrimony,
  `META` → goal in BRL, `RESERVA` → reserve. The app can't fetch exchange rates, so update the rate in Configurações.
- ExcelJS reads Google's comments with empty text, so comments are read from the raw
  `xl/comments*.xml` (resolved via the workbook rels) whenever ExcelJS finds none.

## Export

Exports start from the **originally imported file** (kept in IndexedDB), so formatting, formulas,
and conditional formats survive:

- values, comments (Google header kept), and green fills go back to each transaction's source cell
- deleted imported entries clear their cell
- an entry whose month, type, or (fixed/income) name changed is removed from the old cell and placed again
- new variable expenses go to the first empty cell of their month column (groceries: the yellow rows). New
  fixed/income items reuse a row with the same label. When there's no room, a row is inserted
  (above the yellow block, or before the section Total) and every formula, conditional format, and comment
  below is shifted. Section Totals and the Mercado SUM are stretched to include the new row
- a `Lançamentos` sheet lists every transaction

Known limits: merged cells and data validations aren't shifted on row insert (the sheet has none
today). Google's proprietary `commentsmeta` part is dropped, so comments come back as classic notes.

Re-importing a year replaces its imported entries. Manual categories/tags on the same cell are
kept, and entries created only in the app are kept too.

## Project layout

```
src/parser/     xlsx → transactions (sections, colours, comments, config)
src/rules/      default categories + keyword rules engine
src/analytics/  pure aggregations: totals, saldo, savings rate, deviations, goal, checklist
src/db/         Dexie schema, repository, JSON backup
src/export/     write back into the original workbook; formula row shifting
src/components/ React views
tests/          Vitest (synthetic fixtures built with ExcelJS; no personal data)
```
