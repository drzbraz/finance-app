import { attachment } from './content-disposition.js';

describe('attachment', () => {
  it('keeps plain names as they are', () => {
    expect(attachment('Controle financeiro 2026.xlsx')).toBe(
      `attachment; filename="Controle financeiro 2026.xlsx"; filename*=UTF-8''Controle%20financeiro%202026.xlsx`,
    );
  });

  it('gives non-ASCII names an ASCII fallback plus the exact UTF-8 name', () => {
    const header = attachment('Lançamentos "2026".xlsx');
    expect(header).toContain('filename="Lan_amentos _2026_.xlsx"');
    expect(header).toContain(`filename*=UTF-8''Lan%C3%A7amentos%20%222026%22.xlsx`);
  });
});
