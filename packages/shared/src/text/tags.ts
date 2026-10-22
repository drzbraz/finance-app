/** "jantar #Lisboa #amigos" -> ["lisboa", "amigos"]. */
export function extractTags(text: string): string[] {
  return [...new Set([...text.matchAll(/#([\p{L}\p{N}_-]+)/gu)].map((m) => m[1].toLowerCase()))];
}
