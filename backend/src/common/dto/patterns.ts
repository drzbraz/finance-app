/** yyyy-mm-dd */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** A1-style cell address, e.g. "E24". */
export const CELL_ADDRESS = /^[A-Z]+\d+$/;
/** An ISO 8601 timestamp, e.g. "2026-10-22T09:30:00.000Z". */
export const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
