/**
 * "New since your last visit" for the Live feed. The time of the previous
 * visit is kept in this browser, per account, and replaced when the page is
 * left, so badges stay put while the list is open.
 */
const key = (userId: string) => `jobgenie.liveFeed.lastVisit.${userId}`;

export function readLastVisit(userId: string | null | undefined): string | null {
  if (!userId || typeof localStorage === 'undefined') return null;
  const value = localStorage.getItem(key(userId));
  return value && !Number.isNaN(Date.parse(value)) ? value : null;
}

export function writeLastVisit(userId: string | null | undefined, at: string = new Date().toISOString()): void {
  if (!userId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key(userId), at);
  } catch {
    // storage full or blocked: badges simply will not show next time
  }
}

const firstRead = new Map<string, string | null>();

/**
 * The previous visit as it was when this page load first asked, so recording
 * this visit (on leaving, or a re-mount) never clears the badges being shown.
 */
export function previousVisit(userId: string | null | undefined): string | null {
  if (!userId) return null;
  if (!firstRead.has(userId)) firstRead.set(userId, readLastVisit(userId));
  return firstRead.get(userId) ?? null;
}

/** First seen after the previous visit. With no previous visit nothing is "new". */
export function isNewSince(firstSeenAt: string | null | undefined, lastVisit: string | null): boolean {
  if (!lastVisit || !firstSeenAt) return false;
  return Date.parse(firstSeenAt) > Date.parse(lastVisit);
}
