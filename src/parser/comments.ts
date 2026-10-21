import JSZip from 'jszip';

export interface ParsedComment {
  author?: string;
  date?: string; // ISO yyyy-mm-dd
  header?: string; // "Author    (2025-11-02 11:34:53)", kept for round-trip
  text: string;
}

const HEADER_RE = /^(.*?)\s*\((\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)\)\s*$/;

/**
 * Parses a note as exported by Google Sheets:
 *   ======\nID#AAAB1234\nAna Silva    (2025-11-24 13:48:37)\nfatura
 * Replies appear as further "======" blocks; their texts are joined with " / ".
 * Plain notes (no Google header) are returned as-is.
 */
export function parseComment(raw: string): ParsedComment {
  const text = raw.replace(/\r\n?/g, '\n');
  if (!text.includes('======')) return { text: text.trim() };

  const blocks = text.split(/^======\s*$/m).map((b) => b.trim()).filter(Boolean);
  const texts: string[] = [];
  let first: Omit<ParsedComment, 'text'> | undefined;
  for (const block of blocks) {
    const lines = block.split('\n');
    let i = 0;
    if (lines[i]?.startsWith('ID#')) i++;
    const m = lines[i] ? HEADER_RE.exec(lines[i]) : null;
    if (m) {
      if (!first) first = { author: m[1].trim(), date: m[2], header: lines[i].trim() };
      i++;
    }
    const body = lines.slice(i).join('\n').trim();
    if (body) texts.push(body);
  }
  return { ...(first ?? {}), text: texts.join(' / ') };
}

/** Builds a note in the same Google layout, so a re-import parses it identically. */
export function formatComment(text: string, header?: string): string {
  return header ? `======\n${header}\n${text}` : text;
}

/** ExcelJS note value -> plain string. */
export function noteToString(note: unknown): string | undefined {
  if (note == null) return undefined;
  if (typeof note === 'string') return note;
  const texts = (note as { texts?: { text?: string }[] }).texts;
  if (Array.isArray(texts)) return texts.map((t) => t.text ?? '').join('');
  return undefined;
}

/**
 * Fallback reader: pulls legacy comments for one sheet straight from the zip.
 * The sheet is resolved by name through workbook.xml and its rels, since sheetN.xml numbering
 * does not follow sheet order. Returns cell ref -> raw text.
 */
export async function readCommentsFromZip(data: ArrayBuffer | Uint8Array, sheetName: string): Promise<Map<string, string>> {
  const zip = await JSZip.loadAsync(data);
  const cells = new Map<string, string>();
  const workbook = await zip.file('xl/workbook.xml')?.async('string');
  const wbRels = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  if (!workbook || !wbRels) return cells;

  const sheetTag = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]).find((t) => attr(t, 'name') === sheetName);
  const rid = sheetTag && (attr(sheetTag, 'r:id') ?? attr(sheetTag, 'id'));
  const sheetTarget = rid && relTarget(wbRels, rid);
  if (!sheetTarget) return cells;
  const sheetPath = resolvePath('xl/', sheetTarget);

  const sheetDir = sheetPath.slice(0, sheetPath.lastIndexOf('/') + 1);
  const relsPath = sheetDir + '_rels/' + sheetPath.slice(sheetDir.length) + '.rels';
  const rels = await zip.file(relsPath)?.async('string');
  const commentsTarget = rels && [...rels.matchAll(/<Relationship\b[^>]*>/g)]
    .map((m) => m[0])
    .find((t) => /\/comments$/.test(attr(t, 'Type') ?? ''));
  const target = commentsTarget && attr(commentsTarget, 'Target');
  if (!target) return cells;
  const xml = await zip.file(resolvePath(sheetDir, target))?.async('string');
  if (!xml) return cells;

  for (const m of xml.matchAll(/<comment\b[^>]*\bref="([A-Z]+\d+)"[^>]*>([\s\S]*?)<\/comment>/g)) {
    const parts = [...m[2].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1]));
    cells.set(m[1], parts.join(''));
  }
  return cells;
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name.replace(':', '\\:')}="([^"]*)"`).exec(tag);
  return m?.[1];
}

function relTarget(rels: string, id: string): string | undefined {
  const tag = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((t) => attr(t, 'Id') === id);
  return tag && attr(tag, 'Target');
}

/** Resolves a rels Target against the directory of the part that owns the rels. */
export function resolvePath(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = baseDir.split('/').filter(Boolean);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.' && seg) parts.push(seg);
  }
  return parts.join('/');
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}
