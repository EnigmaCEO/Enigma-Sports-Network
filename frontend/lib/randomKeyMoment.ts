export function pickRandomKeyMomentIndex(keyMoments?: string[]): number {
  if (!Array.isArray(keyMoments) || keyMoments.length === 0) {
    return 0;
  }
  if (keyMoments.length === 1) {
    return 0;
  }
  const max = Math.min(keyMoments.length, 5);
  return Math.floor(Math.random() * max);
}
