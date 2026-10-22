# Finanças: local personal finance app

Imports the "Controle financeiro" Google Sheets export (.xlsx), turns it into categorized
transactions, and gives you a dashboard with insights, bills, budgets, goals and year-over-year
comparison. It exports back to .xlsx in the same layout.

**Local only.** No backend, no API calls, no telemetry. Data lives in the browser's IndexedDB.
The production build ships a Content-Security-Policy with `connect-src 'none'`, so the app
cannot open network connections even by accident.

## Setup

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: logic + screen tests
npm run check      # types + tests + minimum coverage (runs before every commit)
npm run build      # static files in dist/
npm run preview    # serve dist/ on http://localhost:4173
```

`dist/` uses relative paths and works from any static server. Opening `dist/index.html` straight
from disk (`file://`) is **not recommended**: browsers block ES module scripts on `file://`, and some
give IndexedDB a throwaway origin there, so your data may not persist. Use `npm run preview`, or
`python3 -m http.server -d dist` to serve the folder locally.

Data belongs to the browser profile and origin (e.g. `http://localhost:4173`). Use
**Importar / Exportar → Backup .json** to move or keep it safe.

## Using the app

The top bar is always there: **‹ month ›** switcher · **Importar** · **Exportar** · theme. Add an
entry with **+ Novo lançamento**, the round **+** on phones, or the **N** key.

- **Importar**: click it, or **drop an .xlsx (or a .json backup) anywhere on the window**. You get a
  plain summary ("Encontramos 196 lançamentos de 2026…") and one button. Re-importing a year keeps
  categories you chose by hand and entries created in the app. Importing an older year never
  changes your current settings (exchange rate, patrimony, goal).
- **Exportar**: "Planilha .xlsx" (your original layout) or "Backup .json" (everything). A badge
  counts changes made since the last export. After an export, that file becomes the baseline, so
  re-importing it never duplicates entries.
- **Novo lançamento** puts the amount first. Typing `25 jantar #lisboa` fills amount, description and
  tag in one go. The category is suggested from your rules and past entries. Enter saves,
  ⌘/Ctrl+Enter saves and keeps the dialog open, and every save/delete/toggle offers **Desfazer**.

### Pages

- **Início**: month KPIs (**Livre para gastar** for the current month = income − fixed bills −
  investments − groceries (the Mercado limit, or your average, reserved up front) − other variable
  spending already made, with a per-day amount and a "ver a conta" breakdown; saldo for past months;
  spent so far vs projected;
  savings rate; main goal), insight cards ("Saúde está 598% acima da sua média", "No ritmo atual o
  mês fecha em −€X"…), budgets near their limit, upcoming bills, and the charts.
- **Transações**: entries grouped by day, with search, filter chips (type, pending/paid, #tags),
  category filter, and "Ano todo". Click a row to edit it in a side sheet; the round check toggles paid.
- **Contas**: recurring bills and income (rent, salary, subscriptions…) found from your sheet,
  sorted into Atrasadas / Próximos 7 dias / Mais tarde / Pagas. One click marks an item paid (the
  green cell in the sheet). **+ Nova conta** adds a bill or income line; click a line (or ✎) to
  change its name, type, monthly amount, due day or this month's amount, to deactivate it, or to
  delete it (past entries stay in the history). **Iniciar mês** creates the month's pending bills;
  **↺ Desfazer início** removes the ones still pending (paid ones stay), even days later.
  **Limites de gasto**: set a monthly amount for a category (e.g. Lazer €200) and see how much
  is left, with a per-day amount for the rest of the month. These are the same limits as Orçamentos.
- **Orçamentos**: a monthly limit per category, with progress and states (✓ ok · ⚠ 80% · ✕ estourou).
  "Sugerir pela média" fills limits from your history.
- **Metas**: several savings goals in € or R$. "Patrimônio" follows your patrimony (BR + EU ×
  rate) and the sheet's META; other goals use manual contributions. Each card shows the amount
  needed per month to reach the deadline and the projected date at your current pace.
- **Comparar**: one year against another (e.g. 2025 vs 2026), same period or full year, by month
  and by category.
- **Configurações**: exchange rate, patrimony, reserve, savings-rate target, theme
  (auto/light/dark), your category rules, and deleting a year.

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

## Tests

`npm test` runs two layers:

- **Logic** (`tests/*.test.ts`, `tests/parser`, `tests/export`): parser, export round trip, rules,
  analytics, database, on synthetic workbooks built with ExcelJS.
- **Screens** (`tests/ui`, jsdom + Testing Library): each page used like a person would: Novo
  lançamento, Transações, Contas (Iniciar mês and its undo, add/edit/delete bills, limits), Início
  (Livre para gastar), Orçamentos, Metas, Comparar, Configurações, Importar/Exportar, the N shortcut and
  drag-and-drop. "Today" is frozen at 22/10/2026 and every test starts from an empty database.

`npm run check` = typecheck + tests + coverage thresholds (95% lines, 90% branches). A git
pre-commit hook (`.githooks/pre-commit`, enabled by `npm install`) runs it and blocks the commit when
something breaks. When you add a feature, add its test next to the page's file in `tests/ui`.

## Project layout

```
src/parser/     xlsx → transactions (sections, colours, comments, config)
src/rules/      default categories + keyword rules engine
src/analytics/  pure functions: totals, saldo, savings rate, deviations, checklist, bills,
                budgets, goals, forecast + insights, year over year
src/db/         Dexie schema (v2 migration), repository, export action, JSON backup (v1/v2)
src/export/     write back into the original workbook; formula row shifting
src/components/ shell (sidebar, top bar, tabs), Quick Add, Import/Export, sheets, charts, UI kit
src/pages/      Início, Transações, Contas, Orçamentos, Metas, Comparar, Configurações
tests/          Vitest (synthetic fixtures built with ExcelJS; no personal data); tests/ui = screens
```
