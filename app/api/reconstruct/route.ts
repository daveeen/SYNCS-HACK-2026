/**
 * POST /api/reconstruct — pull a dead startup's old homepage out of the
 * Wayback Machine. Owner: Yeriel. This is the demo's "wow" moment.
 *
 * Contract: ReconstructRequest in, ReconstructResponse out. See
 * docs/backend-spec.md §8.
 *
 * Baked-first: pnpm pipeline:wayback resolves waybackUrl for every record, so
 * the demo path reads a string out of JSON and makes zero network calls. The
 * live lookup exists for anything the pipeline missed.
 *
 * This route must never throw and must never break the results page.
 */
import { NextResponse } from "next/server";
import { loadStartups } from "@/lib/data";
import { toEmbeddableSnapshot, resolveLiveSnapshot } from "@/lib/wayback";
import type { ApiError, ReconstructRequest, ReconstructResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_URL_CHARS = 200;
const SAFE_URL = /^[a-z0-9.\-/:_%?=&]+$/i;

/** Strip protocol, www and path so a record match is possible. */
function bareDomain(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

/** Pull the 14-digit timestamp out of a Wayback URL. */
function timestampOf(waybackUrl: string): string | null {
  return waybackUrl.match(/\/web\/(\d{14})/)?.[1] ?? null;
}

export async function POST(
  request: Request,
): Promise<NextResponse<ReconstructResponse | ApiError>> {
  let body: ReconstructRequest;
  try {
    body = (await request.json()) as ReconstructRequest;
  } catch {
    return NextResponse.json({ error: "body must be valid JSON" }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  // Trust boundary: this route takes user input and makes an outbound request.
  // The host is hardcoded and the input only lands in a query parameter, so the
  // blast radius is small — validate anyway.
  if (url.length > MAX_URL_CHARS || !SAFE_URL.test(url)) {
    return NextResponse.json({ error: "url is not a valid domain or URL" }, { status: 400 });
  }

  const year =
    typeof body.year === "number" &&
    Number.isInteger(body.year) &&
    body.year >= 1990 &&
    body.year <= new Date().getFullYear()
      ? body.year
      : undefined;

  // 1. Baked — the demo path. No network.
  const domain = bareDomain(url);
  const record = loadStartups().find(
    (s) => s.waybackUrl && s.waybackUrl.toLowerCase().includes(domain),
  );
  if (record?.waybackUrl) {
    const snapshotUrl = toEmbeddableSnapshot(record.waybackUrl);
    return NextResponse.json({
      url,
      snapshotUrl,
      timestamp: timestampOf(snapshotUrl),
      available: true,
      source: "baked",
    });
  }

  // 2. Live — for anything the pipeline missed. Never throws.
  const live = await resolveLiveSnapshot(url, year);
  if (live) {
    return NextResponse.json({
      url,
      snapshotUrl: live.snapshotUrl,
      timestamp: live.timestamp,
      available: true,
      source: "live",
    });
  }

  // 3. Nothing. A normal, expected answer — most dead startups have no usable
  // snapshot. HTTP 200, not an error.
  return NextResponse.json({
    url,
    snapshotUrl: null,
    timestamp: null,
    available: false,
    source: "none",
  });
}
