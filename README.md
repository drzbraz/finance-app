# Finanças: local personal finance app

Imports the "Controle financeiro" Google Sheets export (.xlsx), turns it into categorized
transactions, and gives you a dashboard with insights, bills, budgets, goals and year-over-year
comparison. It exports back to .xlsx in the same layout.

**Runs on your computer only.** Three Docker containers: the React frontend (nginx), the NestJS
API and MongoDB. There is no login, so nothing is published beyond `127.0.0.1`: the app is reachable
from this machine only, never from your network. No telemetry, no calls to outside services; the
built frontend ships a Content-Security-Policy that only allows its own origin.

## Run it

Requirements: Docker Desktop (running).

```sh
npm run up      # docker compose up --build -d: database, backend and frontend
open http://localhost:8080
npm run logs    # follow the logs
npm run down    # stop (your data stays in the "mongo-data" volume)
```

Without npm: `docker compose up --build -d`. Another port: `FRONTEND_PORT=9000 npm run up`.

Your data lives in the Docker volume `finance-app_mongo-data`. `docker compose down -v` **deletes
it**; use **Exportar → Backup completo (.json)** first if you want a copy.

### Moving data from the browser-only version

Versions before 1.0.0 kept everything in the browser. Open the old version, use **Exportar →
Backup completo (.json)**, then drop that file on the new app (http://localhost:8080) and choose
**Restaurar backup**.

## Architecture

```
browser ──► frontend (nginx :8080 on 127.0.0.1) ──/api──► backend (NestJS :3000) ──► MongoDB 8 (replica set rs0)
```

| Folder | What | Version |
| --- | --- | --- |
| `frontend/` | React 18 + Vite + Tailwind. Screens and analytics (pure functions); data comes from `/api`. | `frontend/package.json` |
| `backend/` | NestJS 12 + Mongoose. Storage, spreadsheet import/export, rules, backups. | `backend/package.json` |
| `packages/shared/` | Types (the API contract), category rules engine, text helpers. Used by both. | not released |

**Why MongoDB.** The data is already document-shaped: a transaction carries its tags and source
cell, a goal its contributions, settings are one object, and the backup is a JSON file that maps
one-to-one onto the collections. There are no joins or reports that need SQL, and it is a single
user. PostgreSQL would be the better choice if you later want ad-hoc SQL reporting or strict
relational constraints; nothing in the services depends on Mongo beyond the repositories.

The database runs as a single-node replica set because imports, exports, restores and bill renames
write several collections in one **transaction** (all or nothing).

### Backend layout

Each feature is a Nest module with a `*.controller.ts` (HTTP only), a `*.service.ts` (the rules)
and a `*.repository.ts` (MongoDB only):

```
backend/src/
  transactions/ rules/ settings/ budgets/ goals/ recurring/   one module per collection
  years/          year list, status ("changes not exported"), delete a year
  spreadsheets/   preview + import + export; domain/parser and domain/export are the xlsx logic
  backup/         full JSON backup / restore
  workbooks/      the stored .xlsx per year (repository only)
  database/       DocumentRepository (natural key = _id) and UnitOfWork (transactions)
  common/ config/ health/ seed/
```

### API

All under `/api`; bodies are the types in `packages/shared/src`.

| Method and path | Does |
| --- | --- |
| `GET health` | `{ status, version }`, 503 when the database is down |
| `GET transactions?year=` | the year's live entries |
| `PUT transactions/:id` · `POST transactions/bulk` | save (stamped with `updatedAt`) |
| `POST transactions/:id/restore` | undo: put an entry back exactly as it was |
| `DELETE transactions/:id` · `POST transactions/bulk-delete` | soft delete for spreadsheet rows, hard delete otherwise |
| `GET/POST rules` · `DELETE rules/:id` | a new rule re-categorises automatic entries |
| `GET/PATCH settings` | |
| `GET budgets` · `PUT budgets/:category` · `POST budgets/bulk` · `POST budgets/bulk-delete` | a limit ≤ 0 removes the budget |
| `GET goals` · `PUT/DELETE goals/:id` | |
| `GET recurring` · `PUT/DELETE recurring/:key` · `POST recurring/update` | bills; a rename tombstones the old key |
| `GET years` · `GET/DELETE years/:year` | status = exists, app-only entries, changes not exported |
| `POST spreadsheets/preview?year=` | multipart `file`: what an import would do, saves nothing |
| `PUT years/:year/spreadsheet` | multipart `file`: import (max 15 MB) |
| `POST years/:year/spreadsheet/export` | the .xlsx; warnings in the `X-Export-Warnings` header |
| `GET/POST backup` | full backup / restore (v1 and v2 files) |

## Development

Node 22.12+.

```sh
npm install            # all workspaces; also enables the pre-commit hook
npm run db             # only MongoDB in Docker, published on 127.0.0.1:27017 (docker-compose.dev.yml)
npm run dev:backend    # API on :3000 with reload
npm run dev:frontend   # http://localhost:5173, /api proxied to :3000
npm run check          # every workspace: typecheck + tests (+ coverage thresholds)
```

## Versions and releases

The frontend and the backend are versioned **independently** (semver, each in its own
`package.json` and `CHANGELOG.md`), and each release is a git tag: `frontend-v1.0.0`, `backend-v1.0.0`.

```sh
# 1. write what changed under "## Unreleased" in backend/CHANGELOG.md
npm run release -- backend minor     # or patch / major / 1.4.0 → bumps, commits, tags backend-v1.1.0
git push --follow-tags               # publishes
```

Pushing the tag starts the **Release** workflow (`.github/workflows/release.yml`): it checks that the tag
matches `package.json`, runs that app's tests, pushes its Docker image to
`ghcr.io/<owner>/finance-app-<app>:<version>` and creates the GitHub release with the changelog notes.
**CI** (`ci.yml`) runs every check and builds both images on each push and pull request.

To run an exact released version instead of building from source:

```sh
BACKEND_IMAGE=ghcr.io/<owner>/finance-app-backend:1.0.0 \
FRONTEND_IMAGE=ghcr.io/<owner>/finance-app-frontend:1.0.0 \
docker compose up -d --no-build
```

The running versions are visible at `/api/health` (backend).

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

Exports start from the **originally imported file** (kept in MongoDB), so formatting, formulas,
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

`npm run check` (or `npm test`) runs every workspace:

- **backend** (Vitest, `backend/`):
  - unit: every service and controller with mocked repositories (`src/**/*.spec.ts`), plus the
    spreadsheet parser and exporter on synthetic workbooks built with ExcelJS;
  - integration: the repositories and transactions against a real MongoDB replica set
    (`*.integration-spec.ts`, mongodb-memory-server);
  - end to end: every endpoint over HTTP with supertest (`test/*.e2e-spec.ts`), including
    import → edit → export → re-import round trips.
- **shared**: rules engine and text helpers.
- **frontend**: analytics, and every screen used like a person would (jsdom + Testing Library)
  against an in-memory fake of the API. "Today" is frozen at 22/10/2026.

Coverage thresholds fail the check when they drop. The git pre-commit hook (`.githooks/pre-commit`,
enabled by `npm install`) runs `npm run check`. No test uses personal data.
