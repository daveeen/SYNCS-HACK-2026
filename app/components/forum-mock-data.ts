/**
 * Placeholder data for ForumWindow, shaped exactly like the real read path
 * (docs/forum-reads.md): posts carry `author` (stands in for the
 * `profiles(handle)` join), comments nest one level via `parentId`, and likes
 * are a plain count plus "did I like this" — same as `POST /api/forum/like`
 * returning `{liked, count}`.
 *
 * Nothing here calls Supabase or `/api/forum/*`. It's local state so the UI
 * is demoable with no `.env` at all. Swapping this for the real reads is the
 * documented follow-up, not a rewrite: see the TODOs in ForumWindow.tsx.
 */

export type MockComment = {
  id: string;
  postId: string;
  parentId: string | null;
  author: string;
  body: string;
  createdAt: string;
};

export type MockPost = {
  id: string;
  author: string;
  title: string;
  body: string;
  createdAt: string;
  /** Plain-text stand-in for the mentions table — resolved handles, rendered
      as tombstone chips. Real version resolves against the corpus
      (forum-reads.md "Rendering @mentions"). */
  mentions: string[];
};

export const MOCK_POSTS: MockPost[] = [
  {
    id: "p1",
    author: "priya_k",
    title: "Subscription box for artisanal hot sauce — anyone tried this already?",
    body:
      "Thinking about a monthly hot sauce box, 4-5 small-batch makers a month, curated by heat and region. Before I sink three months into this, has someone already tried and died doing it? What actually killed them?",
    createdAt: iso(-3, 4),
    mentions: ["@sauced"],
  },
  {
    id: "p2",
    author: "devon_o",
    title: "Peer-to-peer power tool rental app, neighbourhood radius only",
    body:
      "Idea is Airbnb for drills and saws, five block radius, insurance handled by us. The unit economics look fine on paper. What's the failure mode nobody warns you about?",
    createdAt: iso(-1, 9),
    mentions: [],
  },
  {
    id: "p3",
    author: "priya_k",
    title: "AI meeting notes that auto-file into your CRM",
    body:
      "Not another transcription tool — the pitch is zero-click filing: it listens, decides which deal the call belongs to, and updates the CRM stage on its own. Curious what's already been tried at that exact intersection.",
    createdAt: iso(-1, 18),
    mentions: ["@orbitalpost"],
  },
  {
    id: "p4",
    author: "mika_r",
    title: "A graveyard of graveyards: is this idea itself already a corpse?",
    body:
      "Half-joking. If Failory and GetAutopsy both exist and both went quiet, is that a sign the format doesn't hold users, or a sign nobody built the semantic search layer on top of it yet?",
    createdAt: iso(-6, 11),
    mentions: [],
  },
];

export const MOCK_COMMENTS: MockComment[] = [
  {
    id: "c1",
    postId: "p1",
    parentId: null,
    author: "mika_r",
    body: "Margins on perishable subscription boxes are brutal once churn kicks in around month four. Look at what actually killed the meal-kit wave, not just the hot-sauce niche.",
    createdAt: iso(-3, 2),
  },
  {
    id: "c2",
    postId: "p1",
    parentId: "c1",
    author: "priya_k",
    body: "That's fair, churn is the part I have no answer for yet. Do you know of a curated-food box that specifically died from that and not from funding?",
    createdAt: iso(-3, 1),
  },
  {
    id: "c3",
    postId: "p1",
    parentId: null,
    author: "devon_o",
    body: "The root cause is usually acquisition cost outrunning LTV, not the product itself. Worth checking CAC payback before you build anything.",
    createdAt: iso(-2, 20),
  },
  {
    id: "c4",
    postId: "p2",
    parentId: null,
    author: "priya_k",
    body: "Insurance is the whole business here, not a feature of it. Whoever underwrites a stranger's table saw is doing the hard part.",
    createdAt: iso(-1, 6),
  },
  {
    id: "c5",
    postId: "p3",
    parentId: null,
    author: "devon_o",
    body: "Auto-filing is the part that scares me, one wrong deal match and a rep stops trusting the tool permanently. Trust, once lost on this, doesn't come back.",
    createdAt: iso(-1, 15),
  },
];

export const MOCK_LIKES: Record<string, number> = { p1: 7, p2: 3, p3: 11, p4: 2 };

function iso(daysAgo: number, hoursAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAgo);
  d.setHours(d.getHours() - hoursAgo);
  return d.toISOString();
}

export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

/**
 * The body stores the raw text someone typed, @handles and all — that's the
 * contract (forum-reads.md "Rendering @mentions"). But once a mention is
 * pulled out into its own row of pills, leaving the same "@handle" sitting in
 * the body too just repeats it. This strips each resolved mention back out of
 * the DISPLAYED text only; the underlying body is never touched.
 */
export function stripMentions(body: string, mentions: string[]): string {
  if (mentions.length === 0) return body;
  let out = body;
  for (const m of mentions) {
    const escaped = m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Eat one leading space with the handle so removing it doesn't leave a
    // double space behind.
    out = out.replace(new RegExp(`\\s?${escaped}\\b`, "gi"), "");
  }
  return out.replace(/\s{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
}
