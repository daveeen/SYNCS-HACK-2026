"use client";

import { useMemo, useState } from "react";
import type { FailedStartup } from "@/lib/types";
import DesktopIcon from "./DesktopIcon";

/**
 * The trash: a folder full of folders, one per company that got thrown away.
 *
 * This is the browsable archive. It is deliberately not the product's main
 * flow; it is the depth behind it.
 *
 * 173 identical folders in whatever order the JSON happened to be written is
 * not an archive, it is a pile. The sort and the decade grouping below are what
 * make it navigable without a search term: you can look for the dot-com bust,
 * or for the 2015 on-demand die-off, and find them.
 */

type Sort = "died" | "name" | "raised";

const SORTS: Array<{ id: Sort; label: string }> = [
  { id: "died", label: "by year" },
  { id: "name", label: "A to Z" },
  { id: "raised", label: "by money burnt" },
];

/** "$122M" and "$3.2M" and "unknown" into a comparable number. */
function raisedValue(s: FailedStartup): number {
  const m = s.fundingRaised.match(/([\d.]+)\s*([bmk])/i);
  if (!m) return -1;
  const scale = { b: 1e9, m: 1e6, k: 1e3 }[m[2].toLowerCase() as "b" | "m" | "k"];
  return Number(m[1]) * scale;
}

export default function TrashWindow({
  startups,
  onOpenStartup,
}: {
  startups: FailedStartup[];
  onOpenStartup: (s: FailedStartup) => void;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("died");
  const [sel, setSel] = useState<string | null>(null);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? startups.filter(
          (s) =>
            s.name.toLowerCase().includes(needle) ||
            s.industry.toLowerCase().includes(needle) ||
            s.rootCause.toLowerCase().includes(needle),
        )
      : startups;

    const sorted = [...filtered];
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "raised") sorted.sort((a, b) => raisedValue(b) - raisedValue(a));
    // Newest death first: the recent failures are the ones a founder recognises,
    // and recognition is what makes the archive land.
    else sorted.sort((a, b) => b.diedYear - a.diedYear || a.name.localeCompare(b.name));
    return sorted;
  }, [q, sort, startups]);

  /**
   * Decade headers, but only under the year sort. Under A to Z or by money the
   * groups would cut across the ordering and mean nothing.
   */
  const groups = useMemo(() => {
    if (sort !== "died") return [{ label: null as string | null, items: shown }];
    const byDecade = new Map<number, FailedStartup[]>();
    for (const s of shown) {
      const decade = Math.floor(s.diedYear / 10) * 10;
      byDecade.set(decade, [...(byDecade.get(decade) ?? []), s]);
    }
    return [...byDecade.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([decade, items]) => ({ label: `${decade}s`, items }));
  }, [shown, sort]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-6)", height: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--gy-s-5)",
          flexWrap: "wrap",
          flex: "0 0 auto",
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="filter by name, industry, or cause"
          style={{
            flex: "1 1 180px",
            minWidth: 0,
            padding: "var(--gy-s-3) var(--gy-s-5)",
            // 16px minimum, or iOS Safari zooms the page on focus.
            fontSize: "max(16px, var(--gy-t-ui))",
            fontFamily: "var(--gy-font-ui)",
            color: "var(--gy-ink)",
            background: "var(--gy-surface-sink)",
            border: "1px solid var(--gy-line)",
            borderRadius: "var(--gy-r-field)",
            boxShadow: "var(--gy-e-inset)",
            outline: "none",
          }}
        />
        <span
          style={{
            fontFamily: "var(--gy-font-mono)",
            fontSize: "var(--gy-t-micro)",
            color: "var(--gy-ink-faint)",
            whiteSpace: "nowrap",
          }}
        >
          {shown.length} of {startups.length}
        </span>

        <div style={{ display: "flex", gap: "var(--gy-s-2)", flex: "0 0 auto" }}>
          {SORTS.map((s) => (
            <button
              key={s.id}
              className="gy-press gy-chip"
              onClick={() => setSort(s.id)}
              aria-pressed={sort === s.id}
              style={{
                padding: "var(--gy-s-2) var(--gy-s-5)",
                fontFamily: "var(--gy-font-ui)",
                fontSize: "var(--gy-t-micro)",
                whiteSpace: "nowrap",
                color: sort === s.id ? "var(--gy-ink)" : "var(--gy-ink-faint)",
                background: sort === s.id ? "var(--gy-surface-sink)" : "transparent",
                border: `1px solid ${sort === s.id ? "var(--gy-line)" : "var(--gy-line-soft)"}`,
                borderRadius: "var(--gy-r-pill)",
                cursor: "pointer",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-7)" }}>
        {groups.map((group) => (
          <section key={group.label ?? "all"} style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-4)" }}>
            {group.label && (
              <div style={{ display: "flex", alignItems: "center", gap: "var(--gy-s-5)" }}>
                <span
                  style={{
                    fontFamily: "var(--gy-font-mono)",
                    fontSize: "var(--gy-t-micro)",
                    letterSpacing: "0.1em",
                    color: "var(--gy-ink-faint)",
                  }}
                >
                  {group.label}
                </span>
                <span style={{ flex: "1 1 auto", height: 1, background: "var(--gy-line-soft)" }} />
                <span
                  style={{
                    fontFamily: "var(--gy-font-mono)",
                    fontSize: "var(--gy-t-micro)",
                    color: "var(--gy-ink-faint)",
                  }}
                >
                  {group.items.length}
                </span>
              </div>
            )}
            <div
              style={{
                display: "grid",
                // Tracks the viewport so a 390px window gets three columns
                // rather than two and a half.
                gridTemplateColumns: "repeat(auto-fill, minmax(clamp(88px, 24vw, 116px), 1fr))",
                gap: "var(--gy-s-4)",
                alignContent: "start",
              }}
            >
              {group.items.map((s) => (
                <DesktopIcon
                  key={s.id}
                  tone="dead"
                  size="clamp(44px, 12vw, 56px)"
                  label={s.name}
                  sub={`${s.foundedYear}-${s.diedYear}`}
                  selected={sel === s.id}
                  onSelect={() => setSel(s.id)}
                  onOpen={() => onOpenStartup(s)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {shown.length === 0 && (
        <p style={{ color: "var(--gy-ink-faint)", fontSize: "var(--gy-t-ui)" }}>
          Nothing in the trash matches that.
        </p>
      )}
    </div>
  );
}
