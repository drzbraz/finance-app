import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';

/** A movement in the synthetic statement: `amount` > 0 is a debit, < 0 a credit. */
export interface FixtureMovement {
  date: string; // "9.01"
  text: string;
  amount: number;
}

export interface StatementFixtureOptions {
  holder?: string;
  from?: string; // "2026/09/01"
  to?: string;
  opening?: number;
  movements?: FixtureMovement[];
  /** Prints a wrong balance on this line (0-based), as a misread amount would. */
  wrongBalanceAt?: number;
  bank?: string;
}

export const FIXTURE_MOVEMENTS: FixtureMovement[] = [
  { date: '9.01', text: 'DD GracieBarraRio 82849480274 PT67120072', amount: 80 },
  { date: '9.01', text: 'COMPRA 1254 CONTINENTE 4435-665 BAG CONTACTLESS', amount: 29.23 },
  { date: '9.01', text: 'TRF P/ Ana Maria Teste Silva', amount: 2500 },
  { date: '9.03', text: 'COMPRA 1254 Google Chrome 65 USD TC 0.8620000', amount: 4.31 },
  { date: '9.03', text: 'COM.CONTA PLANO AB PLUS 082026', amount: 3.99 },
  { date: '9.10', text: 'Mangopay', amount: -8.8 },
  { date: '9.12', text: 'TRF MB WAY P/ JOAO EXEMPLO', amount: 57.08 },
  { date: '9.15', text: 'COMPRA 1254 SINFONIA AMARELA TEL 22 CONTACTLESS', amount: 4.2 },
  { date: '9.29', text: 'TRF. P/O Ana Maria Teste Silva', amount: -1540 },
];

const DEBIT_RIGHT = 381;
const CREDIT_RIGHT = 460;
const BALANCE_RIGHT = 553;

/**
 * An ActivoBank-like "Extrato Combinado" with made-up people and numbers, laid out as the real
 * one: headers over right-aligned amounts, thousands as a separate piece of text ("2" "500.00"),
 * the description 1pt above the dates.
 */
export async function buildStatement(options: StatementFixtureOptions = {}): Promise<Buffer> {
  const { holder = 'ANA TESTE SILVA', from = '2026/09/01', to = '2026/09/30', opening = 6611, movements = FIXTURE_MOVEMENTS } = options;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  const text = (s: string, x: number, y: number) => page.drawText(s, { x, y, size: 7, font });

  text('#S#', 300, 790);
  text(holder, 302, 790);
  text('#E#', 377, 790);
  text('EXTRATO DE', 57, 770);
  text(from, 114, 770);
  text('A', 173, 770);
  text(to, 184, 770);
  text('DESCRITIVO', 117, 740);
  text('DEBITO', DEBIT_RIGHT - font.widthOfTextAtSize('DEBITO', 7), 740);
  text('CREDITO', CREDIT_RIGHT - font.widthOfTextAtSize('CREDITO', 7), 740);
  text('SALDO', BALANCE_RIGHT - font.widthOfTextAtSize('SALDO', 7), 740);

  let y = 730;
  text('SALDO INICIAL', 114, y - 1);
  money(page, font, opening, BALANCE_RIGHT, y);
  let balance = opening;
  movements.forEach((m, i) => {
    y -= 9;
    balance = Math.round((balance - m.amount) * 100) / 100;
    text(m.date, 57, y);
    text(m.date, 87, y);
    text(m.text, 114, y + 1);
    money(page, font, Math.abs(m.amount), m.amount > 0 ? DEBIT_RIGHT : CREDIT_RIGHT, y);
    money(page, font, i === options.wrongBalanceAt ? balance + 10 : balance, BALANCE_RIGHT, y);
  });
  text('SALDO FINAL', 114, y - 9);
  money(page, font, balance, BALANCE_RIGHT, y - 9);
  text(`Banco ${options.bank ?? 'ActivoBank'}, S.A. - Sede: Rua Exemplo, 1, Lisboa`, 40, 40);
  return Buffer.from(await pdf.save());
}

/** "2 500.00" drawn as "2" and "500.00", right edge at `right`. */
function money(page: PDFPage, font: PDFFont, value: number, right: number, y: number): void {
  const [int, cents] = value.toFixed(2).split('.');
  const groups = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ').split(' ');
  groups[groups.length - 1] += `.${cents}`;
  let x = right;
  for (const group of [...groups].reverse()) {
    x -= font.widthOfTextAtSize(group, 7);
    page.drawText(group, { x, y, size: 7, font });
    x -= 4;
  }
}
