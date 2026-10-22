# Backend changelog

Versions follow [semver](https://semver.org). Released with `npm run release -- backend <bump>`.

## Unreleased

## 1.0.0 (2026-10-22)

- NestJS 12 + MongoDB 8 API under `/api`, with no login (local use only).
- Transactions with soft delete, category rules (re-applied when a rule is added), settings, budgets,
  goals and recurring bills.
- Spreadsheet import with preview (`Controle financeiro` layout, comments, green "paid" cells,
  yellow grocery block) and export back into the same file, re-pointing entries to their new cells.
- Full JSON backup and restore (accepts v1 and v2 backups).
- Multi-step writes (import, export, restore, rename) run in MongoDB transactions.
