/**
 * Results page. PLACEHOLDER — owner: Darryl (flow) + Sam (tombstone visuals).
 *
 * Reads ?q= on the server, hands it to a client component that calls
 * /api/search from the browser. That is the same path the real app uses, so
 * this page proves the whole stack works on day one.
 */
import Link from "next/link";
import { isUsingMockData } from "@/lib/data";
import { MockDataBanner } from "@/app/components/MockDataBanner";
import { ResultsClient } from "@/app/graveyard/ResultsClient";

export default async function GraveyardPage({
  searchParams,
}: PageProps<"/graveyard">) {
  const params = await searchParams;
  const raw = params.q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-12">
      {isUsingMockData() && <MockDataBanner />}

      <header className="space-y-2">
        <Link href="/" className="text-sm text-muted underline">
          ← Back
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">The graveyard</h1>
        {query ? (
          <p className="text-muted">
            Digging for: <span className="text-foreground">{query}</span>
          </p>
        ) : (
          <p className="text-muted">No idea given. Go back and paste one.</p>
        )}
      </header>

      {/* key={query}: a new idea remounts the results, resetting to loading. */}
      {query && <ResultsClient key={query} query={query} />}
    </main>
  );
}
