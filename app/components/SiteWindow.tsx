"use client";

import type { FailedStartup } from "@/lib/types";

/**
 * A dead company's homepage, pulled back out of the Wayback Machine.
 *
 * The URL is baked into the record by `pnpm pipeline:wayback` and already
 * carries the `if_` flag, which is what strips the Archive's own toolbar and
 * leaves the original page. So this makes ZERO network calls of its own: the
 * iframe loads archive.org directly and the demo path does not depend on our
 * server at all.
 *
 * POST /api/reconstruct exists for the case this cannot cover, an arbitrary
 * domain that was never in the corpus. 171 of 173 records are baked, and the
 * two that are not have no snapshot to fetch, so calling the route here would
 * be a round trip to be handed back the string we already hold.
 */

/**
 * Turn a Wayback timestamp (20160421075323) into "21 April 2016".
 *
 * The ranges are checked BEFORE constructing the Date. A multi-argument `new
 * Date` rolls out-of-range components over instead of returning Invalid Date,
 * so `new Date(2016, 12, 45)` is 14 February 2017: a malformed stamp would be
 * rendered as a confident, wrong capture date above a real archived page. An
 * isNaN check never fires here, because \d{8} has already excluded non-digits.
 */
function snapshotDate(waybackUrl: string): string | null {
  const stamp = waybackUrl.match(/\/web\/(\d{8})/)?.[1];
  if (!stamp) return null;

  const year = Number(stamp.slice(0, 4));
  const month = Number(stamp.slice(4, 6));
  const day = Number(stamp.slice(6, 8));
  // The Archive started crawling in 1996; anything outside that is a bad stamp.
  if (year < 1996 || year > 2100) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);
  // Catches the day-of-month overruns the range check cannot, such as 31 April.
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;

  return date.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
}

export default function SiteWindow({ s }: { s: FailedStartup }) {
  const captured = s.waybackUrl ? snapshotDate(s.waybackUrl) : null;

  if (!s.waybackUrl) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-5)", maxWidth: "58ch" }}>
        <h2 style={{ margin: 0, fontFamily: "var(--gy-font-display)", fontWeight: 400, fontSize: "var(--gy-t-head)", color: "var(--gy-ink)" }}>
          No snapshot survives
        </h2>
        <p style={{ margin: 0, fontSize: "var(--gy-t-body)", lineHeight: 1.6, color: "var(--gy-ink-dim)" }}>
          The Internet Archive holds nothing usable for {s.name}. Most companies
          this small leave no crawlable homepage behind, which is its own kind of
          answer.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-5)", height: "100%" }}>
      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "var(--gy-s-6)",
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: "var(--gy-t-micro)", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--gy-ink-faint)" }}>
          {captured ? `Captured ${captured}` : "Internet Archive snapshot"}
        </span>
        <a
          href={s.waybackUrl}
          target="_blank"
          rel="noreferrer"
          style={{ fontFamily: "var(--gy-font-mono)", fontSize: "var(--gy-t-micro)", color: "var(--gy-live)" }}
        >
          open in a new tab
        </a>
      </div>

      {/* Third-party archived HTML, so it is sandboxed: no scripts, no forms,
          no top-level navigation out of the frame. Pages from 2013 run scripts
          that would happily redirect the whole window. */}
      <iframe
        src={s.waybackUrl}
        title={`${s.name} homepage, archived`}
        sandbox=""
        referrerPolicy="no-referrer"
        style={{
          flex: "1 1 auto",
          width: "100%",
          minHeight: 320,
          border: "1px solid var(--gy-line)",
          borderRadius: "var(--gy-r-field)",
          background: "#ffffff",
          boxShadow: "var(--gy-e-inset)",
        }}
      />
    </div>
  );
}
