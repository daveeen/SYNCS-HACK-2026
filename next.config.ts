import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * @xenova/transformers pulls in onnxruntime-node, which loads native .node
   * binaries. Bundling those breaks; they must stay external and be required
   * at runtime. Without this, `pnpm build` fails the moment embed() is
   * actually implemented.
   */
  serverExternalPackages: ["@xenova/transformers", "onnxruntime-node", "sharp"],

  /**
   * The MiniLM weights live in models/ and are read at runtime by path. Next's
   * tracer follows imports, not fs paths, so without this it ships the code and
   * drops the weights: works locally, 404s the model in production.
   */
  outputFileTracingIncludes: {
    "/api/search": ["./models/**/*"],
    "/api/embed-smoke": ["./models/**/*"],
  },

  /**
   * Next 16's `next dev` appends its own "agent rules" block to CLAUDE.md and
   * writes an AGENTS.md. Our CLAUDE.md is hand-authored and is the team's
   * contract — we don't want a framework rewriting it under people mid-sprint.
   */
  agentRules: false,
};

export default nextConfig;
