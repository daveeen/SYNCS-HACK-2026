/**
 * Does the report cache actually work against this Supabase project?
 *
 * Separate from `pnpm check` on purpose: that script must stay offline and
 * keyless so it can gate every commit. This one needs the network and the
 * service-role key, and answers one question after someone applies
 * supabase/schema.sql: is `report_cache` really there, writable, and granted.
 *
 * Run: pnpm smoke:cache
 *
 * Writes one row under a reserved key, reads it back, exercises the hit
 * counter, then deletes it. Never touches a real cached report.
 *
 * It talks to supabase-js directly rather than importing lib/report-cache.ts,
 * because that module reaches Supabase through lib/supabase/admin.ts, which
 * carries `import "server-only"` and throws under plain Node. The pure part of
 * the cache, the key, is covered offline in scripts/check.ts instead.
 *
 * The env comes from Node's --env-file-if-exists (see package.json), not
 * dotenv. `tsx script.ts` on its own loads nothing: .env.local is a Next
 * convention and these scripts are plain Node.
 */
import { createClient } from "@supabase/supabase-js";
import { cacheKey } from "../lib/report-key";

const KEY_MODEL = "smoke-model";

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.",
    );
    process.exit(1);
  }

  const supabase = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const key = cacheKey(KEY_MODEL, "  SMOKE   test   query ", [{ id: "smoke-b" }, { id: "smoke-a" }]);
  let failed = 0;
  const ok = (pass: boolean, message: string) => {
    if (!pass) failed++;
    console.log(`  ${pass ? "ok  " : "FAIL"} ${message}`);
  };

  const { error: insertError } = await supabase.from("report_cache").upsert(
    {
      cache_key: key,
      query: "smoke test query",
      startup_ids: ["smoke-b", "smoke-a"],
      model: KEY_MODEL,
      report: "## Smoke\n\nWritten by scripts/smoke-report-cache.ts.",
      input_tokens: 1,
      output_tokens: 2,
    },
    { onConflict: "cache_key" },
  );

  if (insertError) {
    console.error(`\ninsert failed: ${insertError.message}`);
    console.error(
      insertError.message.includes("report_cache")
        ? "\nThe table is missing. Apply supabase/schema.sql in the Supabase SQL editor."
        : "",
    );
    process.exit(1);
  }
  ok(true, "insert");

  const { data: row, error: readError } = await supabase
    .from("report_cache")
    .select("report, model, hit_count, input_tokens, output_tokens")
    .eq("cache_key", key)
    .maybeSingle();

  ok(!readError && Boolean(row), "read back");
  ok(row?.model === KEY_MODEL, "model persisted");
  ok(row?.input_tokens === 1 && row?.output_tokens === 2, "token counts logged");

  const { error: rpcError } = await supabase.rpc("touch_report_cache", { key });
  ok(!rpcError, `touch_report_cache() callable${rpcError ? `: ${rpcError.message}` : ""}`);

  const { data: after } = await supabase
    .from("report_cache")
    .select("hit_count")
    .eq("cache_key", key)
    .maybeSingle();
  ok((after?.hit_count ?? 0) === 1, `hit_count incremented (${after?.hit_count ?? 0})`);

  // The rails that keep one visitor's typed idea away from another's browser.
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (anon) {
    const asAnon = createClient(url, anon, { auth: { persistSession: false } });
    const { data: leaked } = await asAnon.from("report_cache").select("cache_key").limit(1);
    ok(!leaked || leaked.length === 0, "anon cannot read cached reports");
  }

  // Checked, not assumed. `delete` needs its own grant on this project, and an
  // unchecked cleanup that hardcodes ok(true) reports success while leaving a
  // smoke row in the log on every run.
  const { error: deleteError } = await supabase.from("report_cache").delete().eq("cache_key", key);
  ok(!deleteError, `cleaned up${deleteError ? `: ${deleteError.message}` : ""}`);

  console.log(failed === 0 ? "\nreport cache is live" : `\n${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\nsmoke failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
