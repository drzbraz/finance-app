# Frontend changelog

Versions follow [semver](https://semver.org). Released with `npm run release -- frontend <bump>`.

## Unreleased

## 1.0.0 (2026-10-22)

- Data now lives in the backend (`/api`) instead of the browser's IndexedDB; every screen is unchanged.
- Spreadsheet import, xlsx export and JSON backups go through the server.
- Served by nginx in Docker, which proxies `/api` to the backend (CSP `connect-src 'self'`).
