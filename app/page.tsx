import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FailedStartup } from "@/lib/types";
import Desktop from "@/app/components/Desktop";

/**
 * Server component: load the record set once, hand it to the shell.
 *
 * Reading the committed JSON directly keeps the demo path free of a fetch on
 * first paint. lib/data.ts is the right home for this once it settles.
 */
async function loadStartups(): Promise<FailedStartup[]> {
  const file = path.join(process.cwd(), "data", "startups.enriched.json");
  return JSON.parse(await readFile(file, "utf8")) as FailedStartup[];
}

export default async function Page() {
  const startups = await loadStartups();
  return <Desktop startups={startups} />;
}
