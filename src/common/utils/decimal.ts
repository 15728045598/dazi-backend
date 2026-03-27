export function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v !== null && 'toNumber' in v) {
    const n = (v as { toNumber: () => number }).toNumber();
    if (typeof n === 'number' && !Number.isNaN(n)) return n;
  }
  return Number(v);
}
