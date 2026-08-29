/**
 * Landing page. PLACEHOLDER — owner: Darryl (flow) + Sam (visual system).
 *
 * Deliberately plain. It exists to prove the path works end to end on day one:
 * type an idea -> /graveyard?q=... -> /api/search -> tombstones. Replace the
 * look entirely; keep the flow.
 */
import Link from "next/link";
import { isUsingMockData } from "@/lib/data";
import { MockDataBanner } from "@/app/components/MockDataBanner";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      {isUsingMockData() && <MockDataBanner />}

      <header className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">Graveyard</h1>
        <p className="text-lg text-muted">
          Paste your startup idea. Meet the companies that already tried it —
          and find out what actually killed them.
        </p>
      </header>

      {/* Plain GET form: no client JS needed to reach the results page. */}
      <form action="/graveyard" method="get" className="space-y-4">
        <label htmlFor="q" className="block text-sm font-medium text-muted">
          Your idea
        </label>
        <textarea
          id="q"
          name="q"
          rows={4}
          required
          placeholder="e.g. a subscription app that delivers groceries to suburban homes within the hour"
          className="w-full resize-y rounded-md border border-border bg-black/30 p-4 text-base outline-none placeholder:text-muted/60 focus-visible:ring-2 focus-visible:ring-accent"
        />
        <button
          type="submit"
          className="rounded-md bg-accent px-5 py-2.5 font-medium text-black transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Dig
        </button>
      </form>

      <p className="text-sm text-muted">
        Scaffold build.{" "}
        <Link href="/graveyard?q=grocery+delivery" className="underline">
          Jump to a sample result
        </Link>
        .
      </p>
    </main>
  );
}
