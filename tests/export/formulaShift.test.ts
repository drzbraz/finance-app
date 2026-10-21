import { shiftFormulaRows } from '../../src/export/formulaShift';

describe('shiftFormulaRows', () => {
  it.each([
    ['SUM(B24:B46)', 39, 'SUM(B24:B47)'],
    ['SUM(B39:B46)', 39, 'SUM(B40:B47)'],
    ['SUM(B10:B20)', 39, 'SUM(B10:B20)'],
    ['B70-B71', 39, 'B71-B72'],
    ['B38+B39', 39, 'B38+B40'],
    ['$B$40*2', 39, '$B$41*2'],
    ['B$40+$C40', 39, 'B$41+$C41'],
    ['SUM($B$24:$B$46)', 39, 'SUM($B$24:$B$47)'],
    ['Sheet1!A50', 39, 'Sheet1!A51'],
    ["'Listas de itens'!A50", 39, "'Listas de itens'!A51"],
    ['AA100+XFD100', 39, 'AA101+XFD101'],
  ])('%s, insert at %d → %s', (f, at, expected) => expect(shiftFormulaRows(f, at)).toBe(expected));

  it('shifts by count', () => {
    expect(shiftFormulaRows('SUM(B24:B46)', 30, 3)).toBe('SUM(B24:B49)');
  });

  it('leaves strings and function names alone', () => {
    expect(shiftFormulaRows('IF(B50>0,"B50 ok","")', 39)).toBe('IF(B51>0,"B50 ok","")');
    expect(shiftFormulaRows('"say ""A50"""&A50', 39)).toBe('"say ""A50"""&A51');
    expect(shiftFormulaRows('LOG10(A50)+ATAN2(A50,1)', 39)).toBe('LOG10(A51)+ATAN2(A51,1)');
    expect(shiftFormulaRows('__xludf.DUMMYFUNCTION("GOOGLEFINANCE(""CURRENCY:EURBRL"")")', 1)).toBe(
      '__xludf.DUMMYFUNCTION("GOOGLEFINANCE(""CURRENCY:EURBRL"")")',
    );
    expect(shiftFormulaRows('MY_NAME50+A50', 39)).toBe('MY_NAME50+A51');
  });

  it('stretches ranges that end right above the inserted row', () => {
    // Inserting before a Total at row 47: the section range B24:B46 must include the new row.
    expect(shiftFormulaRows('SUM(B24:B46)', 47, 1, 46)).toBe('SUM(B24:B47)');
    expect(shiftFormulaRows('SUM(H24:H38)', 39, 1, 38)).toBe('SUM(H24:H39)');
    // Without extendEndingAt the range stays put.
    expect(shiftFormulaRows('SUM(B24:B46)', 47)).toBe('SUM(B24:B46)');
    // A single ref on that row is not a range: unchanged.
    expect(shiftFormulaRows('B46', 47, 1, 46)).toBe('B46');
  });

  it('is a no-op for formulas without refs', () => {
    expect(shiftFormulaRows('1+2', 1)).toBe('1+2');
    expect(shiftFormulaRows('', 1)).toBe('');
  });
});
