import { createRequire } from 'node:module';
import { dirname } from 'node:path';

/** One piece of text on a page, with where it starts and ends (PDF points, left to right). */
export interface PdfItem {
  text: string;
  x: number;
  right: number;
}

/** Items that share a baseline (within a point or two), left to right. */
export interface PdfLine {
  page: number;
  y: number;
  items: PdfItem[];
  text: string;
}

/** Text a little above or below the line still belongs to it (the bank prints descriptions 1pt higher). */
const SAME_LINE = 2.5;

const STANDARD_FONTS = `${dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'))}/standard_fonts/`;

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let pdfjs: Promise<PdfJs> | undefined;

/** The legacy build runs in Node without a DOM; loaded on first use, it is large. */
function loadPdfJs(): Promise<PdfJs> {
  const require = createRequire(import.meta.url);
  pdfjs ??= import(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')) as Promise<PdfJs>;
  return pdfjs;
}

/**
 * The PDF's text as lines, top to bottom, page by page. Read locally with pdf.js: nothing
 * is sent anywhere and no fonts are fetched.
 */
export async function readPdfLines(data: Uint8Array): Promise<PdfLine[]> {
  const { getDocument } = await loadPdfJs();
  const task = getDocument({
    data: new Uint8Array(data),
    // The 14 standard PDF fonts ship with pdf.js; without them it warns on files that do not embed them.
    standardFontDataUrl: STANDARD_FONTS,
    useSystemFonts: false,
    disableFontFace: true,
    useWorkerFetch: false,
    stopAtErrors: true,
  });
  try {
    const doc = await task.promise;
    const lines: PdfLine[] = [];
    for (let page = 1; page <= doc.numPages; page++) {
      const content = await (await doc.getPage(page)).getTextContent();
      const items: (PdfItem & { y: number })[] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        const [, , , , x, y] = item.transform as number[];
        items.push({ text: item.str.trim(), x, right: x + item.width, y });
      }
      lines.push(...groupLines(page, items));
    }
    return lines;
  } finally {
    await task.destroy();
  }
}

/** Exported for tests: clusters items by baseline (PDF y grows upwards) and orders each line. */
export function groupLines(page: number, items: (PdfItem & { y: number })[]): PdfLine[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PdfLine[] = [];
  let current: PdfLine | undefined;
  for (const { y, ...item } of sorted) {
    if (!current || current.y - y > SAME_LINE) {
      current = { page, y, items: [], text: '' };
      lines.push(current);
    }
    current.items.push(item);
  }
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    line.text = line.items.map((i) => i.text).join(' ');
  }
  return lines;
}
