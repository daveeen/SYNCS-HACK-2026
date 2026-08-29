/**
 * Wayback snapshot resolution. Owner: Yeriel.
 *
 * Separate from the route so scripts/check.ts and scripts/pipeline/wayback.ts
 * can use it without pulling in a route module.
 */

const AVAILABILITY_API = "https://archive.org/wayback/available";

/** Shape of the Availability API response. `archived_snapshots` is {} when nothing exists. */
type AvailabilityResponse = {
  archived_snapshots?: {
    closest?: { available?: boolean; url?: string; timestamp?: string; status?: string };
  };
};

export type LiveSnapshot = { snapshotUrl: string; timestamp: string } | null;

/**
 * Turn a Wayback URL into one that renders cleanly in an iframe.
 *
 * `if_` strips the Wayback toolbar and gives the closest thing to the original
 * page. Also upgrades the http the API hands back.
 *
 * Idempotent: a URL already carrying if_ passes through unchanged, so it is
 * safe to run over both live results and baked waybackUrl values.
 */
export function toEmbeddableSnapshot(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/^http:\/\/web\.archive\.org/, "https://web.archive.org")
    .replace(/(\/web\/\d{14})(?!if_)\//, "$1if_/");
}

/**
 * Ask the Internet Archive for the closest snapshot.
 *
 * Never throws. archive.org publishes no rate limit but does return 429 under
 * load, so: 3s timeout, one retry, then give up. A null answer is a normal,
 * expected result — most dead startups have no usable snapshot.
 */
export async function resolveLiveSnapshot(url: string, year?: number): Promise<LiveSnapshot> {
  const params = new URLSearchParams({ url });
  if (year) params.set("timestamp", String(year));
  const endpoint = `${AVAILABILITY_API}?${params.toString()}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) continue;
        return null;
      }
      const data = (await res.json()) as AvailabilityResponse;
      const closest = data.archived_snapshots?.closest;
      if (!closest?.available || !closest.url || !closest.timestamp) return null;
      return {
        snapshotUrl: toEmbeddableSnapshot(closest.url),
        timestamp: closest.timestamp,
      };
    } catch {
      // Timeout or network error. Fall through to the retry, then give up.
    }
  }
  return null;
}
