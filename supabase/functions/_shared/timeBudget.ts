/**
 * A tailoring run's time budget. The hosting platform stops a request that
 * runs too long ("Request idle timeout limit (150s) reached", Grafana Labs,
 * 6 Nov), so optional AI passes are skipped once the run is late, and every
 * optional call is cut short before the hard limit.
 */
export const HARD_LIMIT_MS = 140_000;

/** True when an optional pass with this start limit should be skipped. */
export function overBudget(startedAt: number, now: number, limitMs: number): boolean {
  return now - startedAt > limitMs;
}

/** How long an optional call may still take, never less than the floor. */
export function remainingMs(startedAt: number, now: number, hardMs = HARD_LIMIT_MS, floorMs = 5_000): number {
  return Math.max(floorMs, hardMs - (now - startedAt));
}

/** The body a keep-alive response ends with: the result, or the error with its status. */
export function keepAliveBody(ok: boolean, status: number, body: string): string {
  if (ok) return body;
  let parsed: Record<string, unknown> = {};
  try { const p = JSON.parse(body); if (p && typeof p === "object") parsed = p; } catch { parsed = { error: body || "Tailoring failed" }; }
  return JSON.stringify({ ...parsed, error: parsed.error || "Tailoring failed", status });
}

/** Whether a request asked for keep-alive spaces while it works. */
export function wantsKeepAlive(url: string): boolean {
  try { return new URL(url).searchParams.get("keepalive") === "1"; } catch { return false; }
}
