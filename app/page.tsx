import { loadStartups } from "@/lib/data";
import Desktop from "@/app/components/Desktop";

/**
 * Server component: load the record set once, hand it to the shell.
 *
 * Goes through lib/data.ts rather than reading the JSON with fs, for the two
 * reasons that module documents. It STATICALLY imports the data, so Vercel's
 * file tracer is guaranteed to ship it (an fs.readFile of data/ can be traced
 * out of the bundle: works locally, 404s the data in production). And it
 * coerces any record whose rootCauseCategory predates the field to "unknown",
 * so the shell and /api/report read the same corpus rather than two.
 */
export default async function Page() {
  return <Desktop startups={loadStartups()} />;
}
