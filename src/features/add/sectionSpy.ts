/**
 * Which category the child is looking at: the last section whose top has passed the line under the sticky header.
 * At the very bottom the last section wins, because a short last category can never reach that line.
 */
export function activeSection(tops: number[], line: number, atBottom: boolean): number {
  if (!tops.length) return -1;
  if (atBottom) return tops.length - 1;
  let active = 0;
  tops.forEach((top, index) => {
    if (top <= line) active = index;
  });
  return active;
}
