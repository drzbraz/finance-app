import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { cellNumber, cellResult, cellText, colLetter, fillArgb, isFormula, parseAddress, parseLooseNumber } from '../../src/parser/cells';
import { argbToHsl, isLightYellow, isNeutral, isPaidGreen } from '../../src/parser/color';
import { formatComment, noteToString, parseComment, readCommentsFromZip, resolvePath } from '../../src/parser/comments';
import { readConfig } from '../../src/parser/config';
import { normalize } from '../../src/parser/normalize';
import { detectSections, findMonthHeader } from '../../src/parser/sections';
import type { ParseWarning } from '../../src/types';
import { buildWorkbook, googleNote, loadSheet } from '../fixtures/workbook';

const cellWith = (value: ExcelJS.CellValue) => {
  const ws = new ExcelJS.Workbook().addWorksheet('s');
  ws.getCell('A1').value = value;
  return ws.getCell('A1');
};

describe('normalize', () => {
  it('strips accents, lowercases and collapses whitespace', () => {
    expect(normalize('  Despesas   Variáveis ')).toBe('despesas variaveis');
    expect(normalize('Açoes')).toBe(normalize('Ações'.replace('õ', 'o')));
    expect(normalize('MARÇO')).toBe('marco');
  });
});

describe('cells', () => {
  it.each([
    ['10,50', 10.5],
    ['1.032,00', 1032],
    ['1.032', 1032],
    ['1,032.50', 1032.5],
    ['12.5', 12.5],
    ['€ 30', 30],
    ['R$ 30', 30],
    ['R$ 1.200,90', 1200.9],
    ['-10,5', -10.5],
    ['1 200', 1200],
  ])('parseLooseNumber(%j) = %d', (raw, n) => expect(parseLooseNumber(raw)).toBe(n));

  it.each([' ', '', 'abc', '10,50,3', '#DIV/0!', '1.2.3'])('parseLooseNumber(%j) = null', (raw) =>
    expect(parseLooseNumber(raw)).toBeNull(),
  );

  it('resolves formulas to their cached result and errors to null', () => {
    expect(cellResult(cellWith({ formula: 'A2', result: 5 }))).toBe(5);
    expect(cellResult(cellWith({ formula: 'A2' }))).toBeNull();
    const err = cellWith({ formula: 'A2/0', result: { error: '#DIV/0!' } } as ExcelJS.CellValue);
    expect(cellResult(err)).toBeNull();
    expect(cellText(err)).toBe('');
    expect(cellNumber(err)).toBeNull();
    expect(isFormula(err)).toBe(true);
    expect(isFormula(cellWith(5))).toBe(false);
    expect(cellResult(cellWith({ error: '#N/A' } as ExcelJS.CellValue))).toBeNull();
  });

  it('flattens rich text and hyperlinks', () => {
    expect(cellText(cellWith({ richText: [{ text: 'Desp' }, { text: 'esas' }] }))).toBe('Despesas');
    expect(cellText(cellWith({ text: 'link', hyperlink: 'x' }))).toBe('link');
  });

  it('reads numbers from numeric and text cells', () => {
    expect(cellNumber(cellWith(3))).toBe(3);
    expect(cellNumber(cellWith('10,50'))).toBe(10.5);
    expect(cellNumber(cellWith('texto'))).toBeNull();
    expect(cellNumber(cellWith(null))).toBeNull();
  });

  it('returns the uppercase ARGB of solid fills only', () => {
    const c = cellWith(1);
    expect(fillArgb(c)).toBeUndefined();
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'ffd9ead3' } };
    expect(fillArgb(c)).toBe('FFD9EAD3');
    c.fill = { type: 'pattern', pattern: 'none' };
    expect(fillArgb(c)).toBeUndefined();
  });

  it('converts between column numbers and A1 addresses', () => {
    expect([1, 13, 26, 27, 52, 703].map(colLetter)).toEqual(['A', 'M', 'Z', 'AA', 'AZ', 'AAA']);
    expect(parseAddress('AA12')).toEqual({ col: 27, row: 12 });
    for (const c of [1, 26, 27, 700]) expect(parseAddress(colLetter(c) + 1).col).toBe(c);
    expect(() => parseAddress('$A$1')).toThrow();
  });
});

describe('color', () => {
  it('converts ARGB and RGB to HSL', () => {
    expect(argbToHsl('FFFFFFFF')).toEqual({ h: 0, s: 0, l: 1 });
    const g = argbToHsl('D9EAD3')!;
    expect(g.h).toBeCloseTo(104.3, 0);
    expect(argbToHsl('nope')).toBeNull();
    expect(argbToHsl(undefined)).toBeNull();
  });

  it.each(['FFD9EAD3', 'FFB6D7A8', 'FFD9F2D0'])('%s is paid green', (c) => expect(isPaidGreen(c)).toBe(true));
  it.each(['FF0B5394', 'FF351C75', 'FFFFF2CC', 'FFFFFFFF', 'FF00FF00', undefined])('%s is not paid green', (c) =>
    expect(isPaidGreen(c)).toBe(false),
  );

  it('detects the grocery yellow only', () => {
    expect(isLightYellow('FFFFF2CC')).toBe(true);
    expect(isLightYellow('FFFFE599')).toBe(true);
    expect(isLightYellow('FFD9EAD3')).toBe(false);
    expect(isLightYellow('FF0B5394')).toBe(false);
  });

  it('treats white, greys and no fill as neutral', () => {
    expect([undefined, 'FFFFFFFF', 'FFEFEFEF', 'FF000000'].every(isNeutral)).toBe(true);
    expect(isNeutral('FFFFF2CC')).toBe(false);
  });
});

describe('comments', () => {
  it('parses the Google header', () => {
    expect(parseComment(googleNote('fatura', '2025-11-24 13:48:37', 'Ana Silva'))).toEqual({
      author: 'Ana Silva',
      date: '2025-11-24',
      header: 'Ana Silva    (2025-11-24 13:48:37)',
      text: 'fatura',
    });
  });

  it('joins replies and keeps the first header', () => {
    const raw = `${googleNote('jantar', '2026-01-03 20:00:00', 'A')}\n${googleNote('com a Ana', '2026-01-04 09:00:00', 'B')}`;
    expect(parseComment(raw)).toMatchObject({ author: 'A', date: '2026-01-03', text: 'jantar / com a Ana' });
  });

  it('handles CRLF, multi-line bodies and plain notes', () => {
    expect(parseComment('======\r\nID#X\r\nA    (2026-02-01 10:00)\r\nlinha 1\r\nlinha 2').text).toBe('linha 1\nlinha 2');
    expect(parseComment('  só texto  ')).toEqual({ text: 'só texto' });
    expect(parseComment('======\nID#X\nsem cabeçalho')).toEqual({ text: 'sem cabeçalho' });
  });

  it('round-trips through formatComment', () => {
    const p = parseComment(googleNote('uber #trabalho'));
    expect(parseComment(formatComment(p.text, p.header))).toEqual(p);
    expect(formatComment('livre')).toBe('livre');
  });

  it('flattens ExcelJS note shapes', () => {
    expect(noteToString('x')).toBe('x');
    expect(noteToString({ texts: [{ text: 'a' }, { text: 'b' }] })).toBe('ab');
    expect(noteToString(undefined)).toBeUndefined();
    expect(noteToString({})).toBeUndefined();
  });

  it('resolves rels targets', () => {
    expect(resolvePath('xl/', 'worksheets/sheet1.xml')).toBe('xl/worksheets/sheet1.xml');
    expect(resolvePath('xl/worksheets/', '../comments1.xml')).toBe('xl/comments1.xml');
    expect(resolvePath('xl/worksheets/', 'comments1.xml')).toBe('xl/worksheets/comments1.xml');
    expect(resolvePath('xl/worksheets/', '/xl/comments2.xml')).toBe('xl/comments2.xml');
    expect(resolvePath('xl/', './a/../b.xml')).toBe('xl/b.xml');
  });

  it('reads comments from the zip for the named sheet, not by file number', async () => {
    const zip = new JSZip();
    zip.file(
      'xl/workbook.xml',
      `<workbook xmlns:r="r"><sheets><sheet name="Outra" sheetId="1" r:id="rId1"/><sheet name="Listas de itens" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    );
    zip.file(
      'xl/_rels/workbook.xml.rels',
      `<Relationships><Relationship Id="rId1" Type="x/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId2" Type="x/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    );
    zip.file(
      'xl/worksheets/_rels/sheet1.xml.rels',
      `<Relationships><Relationship Id="c" Type="http://schemas/relationships/comments" Target="../comments1.xml"/></Relationships>`,
    );
    zip.file(
      'xl/worksheets/_rels/sheet2.xml.rels',
      `<Relationships><Relationship Id="c" Type="http://schemas/relationships/comments" Target="../comments2.xml"/></Relationships>`,
    );
    zip.file(
      'xl/comments1.xml',
      `<comments><commentList><comment ref="B15" authorId="0"><text><r><t xml:space="preserve">======\nID#A\nX    (2026-01-02 10:00:00)\n</t></r><r><t>caf&#233; &amp; p&#xE3;o &lt;3</t></r></text></comment></commentList></comments>`,
    );
    zip.file('xl/comments2.xml', `<comments><commentList><comment ref="A1"><text><t>errado</t></text></comment></commentList></comments>`);
    const data = await zip.generateAsync({ type: 'uint8array' });

    const notes = await readCommentsFromZip(data, 'Listas de itens');
    expect([...notes.keys()]).toEqual(['B15']);
    expect(parseComment(notes.get('B15')!).text).toBe('café & pão <3');
    expect((await readCommentsFromZip(data, 'Nenhuma')).size).toBe(0);
  });
});

describe('sections', () => {
  it('maps the month header row to columns', async () => {
    const ws = await loadSheet(await buildWorkbook());
    const h = findMonthHeader(ws)!;
    expect(h.row).toBe(2);
    expect(h.columns.get(2)).toBe(1);
    expect(h.columns.get(4)).toBe(3); // "Março" with the accent
    expect(h.columns.get(13)).toBe(12);
  });

  it('does not end at a "Receita" item inside a section', async () => {
    const ws = await loadSheet(
      await buildWorkbook({ extra: (s, row) => { s.getCell(`A${row(4)}`).value = 'Receita'; } }),
    );
    const { sections, summaryRow } = detectSections(ws, 2);
    expect(sections.map((s) => s.type)).toEqual(['income', 'investment', 'fixed', 'variable', 'additional']);
    expect(summaryRow).toBe(23);
  });

  it('closes a section without a Total at the next label', async () => {
    const ws = await loadSheet(await buildWorkbook({ extra: (s, row) => { s.getCell(`A${row(9)}`).value = null; } }));
    const inv = detectSections(ws, 2).sections.find((s) => s.type === 'investment')!;
    expect(inv).toMatchObject({ firstRow: 8, lastRow: 9 });
    expect(inv.totalRow).toBeUndefined();
  });
});

describe('readConfig', () => {
  it('warns and leaves patrimony unset when its headers are missing', async () => {
    const ws = await loadSheet(
      await buildWorkbook({ extra: (s) => { s.getCell('O6').value = null; s.getCell('P6').value = null; } }),
    );
    const warnings: ParseWarning[] = [];
    const { settings } = readConfig(ws, 14, warnings);
    expect(settings).not.toHaveProperty('patrimonyBR');
    expect(settings).not.toHaveProperty('patrimonyEU');
    expect(warnings.filter((w) => w.kind === 'config')).toHaveLength(2);
  });

  it('treats an empty cell under a found header as 0', async () => {
    const ws = await loadSheet(await buildWorkbook({ extra: (s) => { s.getCell('O7').value = null; } }));
    expect(readConfig(ws, 14, []).settings.patrimonyBR).toBe(0);
  });

  it('does not read past the next header row', async () => {
    // META empty; the row two below is not a header, so it is still read…
    const ws = await loadSheet(
      await buildWorkbook({ extra: (s) => { s.getCell('O10').value = null; s.getCell('O11').value = 5; } }),
    );
    expect(readConfig(ws, 14, []).settings.goalBRL).toBe(5);
    // …but when it is another header row (RESERVA moved up to row 11), META stays unset.
    const ws2 = await loadSheet(
      await buildWorkbook({
        extra: (s) => {
          s.getCell('O10').value = null;
          s.getCell('O12').value = null;
          s.getCell('O13').value = null;
          s.getCell('O11').value = 'RESERVA';
          s.getCell('O12').value = 3000;
        },
      }),
    );
    const { settings } = readConfig(ws2, 14, []);
    expect(settings.goalBRL).toBeUndefined();
    expect(settings.reserveEUR).toBe(3000);
  });

  it('warns when the exchange rate is missing', async () => {
    const ws = await loadSheet(await buildWorkbook({ extra: (s) => { s.getCell('P2').value = null; } }));
    const warnings: ParseWarning[] = [];
    expect(readConfig(ws, 14, warnings).settings.eurBrlRate).toBeUndefined();
    expect(warnings).toContainEqual(expect.objectContaining({ kind: 'config' }));
  });
});
