/**
 * One-off: pull MiniLM weights into models/ so they can be committed.
 * Owner: Yeriel.
 *
 * This is the ONLY place allowRemoteModels is true. Run it once, commit the
 * output, and never run it again — production reads the committed copy.
 *
 * Run: pnpm fetch-model
 */
import path from "node:path";
import { pipeline, env } from "@xenova/transformers";

env.allowRemoteModels = true;
// NOT the default cache dir — /.cache is gitignored, and the whole point is to
// commit these files. transformers.js uses the same <org>/<model>/ layout for
// cacheDir and localModelPath, so models/ works as both.
env.cacheDir = path.join(process.cwd(), "models");

async function main(): Promise<void> {
  console.log("downloading Xenova/all-MiniLM-L6-v2 into models/ ...");
  await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { quantized: true });
  console.log("done — commit models/, and leave allowRemoteModels = false in lib/embed.ts");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
