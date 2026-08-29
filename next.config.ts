import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * @xenova/transformers pulls in onnxruntime-node, which loads native .node
   * binaries. Bundling those breaks; they must stay external and be required
   * at runtime. Without this, `pnpm build` fails the moment embed() is
   * actually implemented.
   */
  serverExternalPackages: ["@xenova/transformers", "onnxruntime-node"],

  /**
   * Next 16's `next dev` appends its own "agent rules" block to CLAUDE.md and
   * writes an AGENTS.md. Our CLAUDE.md is hand-authored and is the team's
   * contract — we don't want a framework rewriting it under people mid-sprint.
   */
  agentRules: false,
};

export default nextConfig;
