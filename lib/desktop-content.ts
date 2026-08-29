/**
 * Content for the desktop folders (the "about us" side of the shell).
 *
 * These are the folders sitting on the desktop. The trash holds the dead
 * startups; these hold Archived itself.
 *
 * Copy note: no em dashes anywhere in user-facing strings (CLAUDE.md design
 * rule 9). Keep it plain.
 */

import type { IconName } from "@/app/components/FolderGlyph";

export type DeskDoc = {
  id: string;
  /** Which glyph represents this item on the desktop. */
  icon: IconName;
  /** Folder label on the desktop. */
  label: string;
  /** Small line under the label. */
  sub: string;
  /** Window title when opened. */
  title: string;
  /** Body paragraphs. */
  body: string[];
};

export const DESK_DOCS: DeskDoc[] = [
  {
    id: "readme",
    icon: "doc",
    label: "read_me",
    sub: "what this is",
    title: "read_me.txt",
    body: [
      "Archived is a diligence tool for founders. You paste the idea you are about to spend two years on. We find the real companies that already tried it, and we tell you what actually killed them.",
      "Not a list of tips. Real companies, with real funding numbers, real shutdown years, and sources you can go read yourself.",
      "The useful part is the gap between the symptom and the disease. Almost every post mortem says the company ran out of money. That is true and it is useless. Running out of money is what happens at the end. We care about the thing that started it.",
    ],
  },
  {
    id: "method",
    icon: "flow",
    label: "method",
    sub: "how it works",
    title: "method.txt",
    body: [
      "Your idea gets embedded locally and matched by meaning, not keywords. A pitch about renting camera gear finds the companies that tried renting camera gear, even when they never used your words.",
      "The matches go to Claude with their full failure record. It reasons over the pattern across several dead companies at once and writes up what it sees, including the parts that do not fit your idea.",
      "Every match carries its sources. If we cannot verify a cause of death, the field says unknown. We do not fill gaps with plausible guesses.",
    ],
  },
  {
    id: "causes",
    icon: "vitals",
    label: "causes",
    sub: "symptom vs disease",
    title: "causes.txt",
    body: [
      "Each record separates the proximate cause from the root cause.",
      "Proximate cause is the symptom. Ran out of cash. Lost the anchor customer. Failed to close the round.",
      "Root cause is the disease. No product market fit. Wrong side of a regulatory shift. Built for a market that was five years out. Unit economics that never worked at any scale.",
      "Timing gets its own field, because being early and being wrong look identical in a post mortem and are completely different mistakes.",
    ],
  },
  {
    id: "team",
    icon: "users",
    label: "team",
    sub: "who built this",
    title: "team.txt",
    body: [
      "Built at SYNCS Hack 2026.",
      "Darryl: app flow, page composition, integration, deploy.",
      "Sam: frontend and the visual system.",
      "Yeriel: route handlers, the data contract, embeddings.",
      "Asher: data pipeline and the quality of the record set.",
      "Davin: research, the deeply sourced companies, and accuracy review.",
    ],
  },
];
