"use client";

import { useMemo, useState } from "react";
import type { FailedStartup } from "@/lib/types";
import DesktopIcon from "./DesktopIcon";

/**
 * The trash: a folder full of folders, one per company that got thrown away.
 *
 * This is the browsable archive. It is deliberately not the product's main
 * flow; it is the depth behind it.
 */
export default function TrashWindow({
  startups,
  onOpenStartup,
}: {
  startups: FailedStartup[];
  onOpenStartup: (s: FailedStartup) => void;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return startups;
    return startups.filter(
      (s) =>
        s.name.toLowerCase().includes(needle) ||
        s.industry.toLowerCase().includes(needle) ||
        s.rootCause.toLowerCase().includes(needle),
    );
  }, [q, startups]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gy-s-6)", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--gy-s-5)", flex: "0 0 auto" }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="filter by name, industry, or cause"
          style={{
            flex: "1 1 auto",
            padding: "var(--gy-s-3) var(--gy-s-5)",
            fontSize: "var(--gy-t-ui)",
            fontFamily: "var(--gy-font-ui)",
            color: "var(--gy-ink)",
            background: "var(--gy-surface-sink)",
            border: "1px solid var(--gy-line)",
            borderRadius: "var(--gy-r-field)",
            boxShadow: "var(--gy-e-inset)",
            outline: "none",
          }}
        />
        <span style={{ fontFamily: "var(--gy-font-mono)", fontSize: "var(--gy-t-micro)", color: "var(--gy-ink-faint)", whiteSpace: "nowrap" }}>
          {shown.length} of {startups.length}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(116px, 1fr))",
          gap: "var(--gy-s-4)",
          alignContent: "start",
        }}
      >
        {shown.map((s) => (
          <DesktopIcon
            key={s.id}
            tone="dead"
            size={56}
            label={s.name}
            sub={`${s.foundedYear}-${s.diedYear}`}
            selected={sel === s.id}
            onSelect={() => setSel(s.id)}
            onOpen={() => onOpenStartup(s)}
          />
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
