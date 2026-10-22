import { isActivoBank, parseActivoBank, UnknownStatementError, type ParsedStatement } from './activobank.js';
import { readPdfLines } from './pdf-lines.js';

/** Reads a bank statement PDF. Only ActivoBank's "Extrato Combinado" is known so far. */
export async function readStatement(data: Uint8Array): Promise<ParsedStatement> {
  const lines = await readPdfLines(data);
  if (isActivoBank(lines)) return parseActivoBank(lines);
  throw new UnknownStatementError('Bank statement format not supported yet (only ActivoBank "Extrato Combinado")');
}

export { UnknownStatementError };
