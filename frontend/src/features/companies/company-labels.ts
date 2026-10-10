// "1 contact", "4 contacts": how many of a company's contacts the user may see.
export function contactCountLabel(count: number): string {
  return count === 1 ? "1 contact" : `${String(count)} contacts`;
}
