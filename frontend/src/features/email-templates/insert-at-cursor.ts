// Puts `token` into `text` where the cursor is: it replaces the selection from `start` to
// `end` (the same number when nothing is selected). `caret` is where the cursor belongs
// afterwards, right behind what was inserted. Positions outside the text, or the wrong
// way round, are brought back into it, so a stale selection can never lose text.
export function insertAtCursor(
  text: string,
  start: number,
  end: number,
  token: string,
): { text: string; caret: number } {
  const clamp = (position: number) => Math.min(Math.max(Math.trunc(position), 0), text.length);
  const from = Math.min(clamp(start), clamp(end));
  const to = Math.max(clamp(start), clamp(end));
  return {
    text: `${text.slice(0, from)}${token}${text.slice(to)}`,
    caret: from + token.length,
  };
}
