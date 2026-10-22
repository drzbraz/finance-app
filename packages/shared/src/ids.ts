/** Random id that also works outside secure contexts (crypto.randomUUID needs https/localhost). */
export function newId(prefix = 'tx'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
