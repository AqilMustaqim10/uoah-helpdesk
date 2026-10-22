// "Suggested articles" while creating a ticket. Mounted at /api/kb/suggest (login required),
// BEFORE the main knowledge base routes, so "suggest" is never mistaken for an article id.
// Only PUBLISHED articles are suggested, and only ones this user may see (articleScope).
import { Router } from "express";
import { query } from "../db/pool";
import { ah } from "../lib/http";
import { escapeLike } from "../lib/sql";
import { articleScope } from "../security/scope";

const router = Router();

// Very common words say nothing about the problem, so they are not used for matching
const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "not",
  "are",
  "was",
  "were",
  "can",
  "cant",
  "cannot",
  "how",
  "why",
  "what",
  "when",
  "where",
  "which",
  "who",
  "please",
  "help",
  "need",
  "needs",
  "have",
  "has",
  "had",
  "does",
  "did",
  "dont",
  "doesnt",
  "didnt",
  "this",
  "that",
  "these",
  "those",
  "from",
  "into",
  "onto",
  "still",
  "again",
  "very",
  "been",
  "will",
  "would",
  "could",
  "should",
  "able",
  "unable",
  "get",
  "got",
  "working",
  "issue",
  "problem",
  "urgent",
  "asap",
  "request",
  "our",
  "your",
  "you",
  "its",
  "but",
  "all",
  "any",
  "some",
  "tidak",
  "boleh",
  "yang",
  "dan",
  "untuk",
  "dengan",
  "saya",
  "tolong",
  "masalah",
  "ada",
  "pada",
  "ini",
  "itu",
]);

/** The useful words of a title: lowercase, at least 3 letters, no stop words, no repeats, at most 6. */
function suggestWords(text: string): string[] {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  return [...new Set(words)].slice(0, 6);
}

// GET /api/kb/suggest?q=printer offline
router.get(
  "/",
  ah(async (req, res) => {
    const user = req.user!;
    const raw =
      typeof req.query.q === "string" ? req.query.q.slice(0, 200) : "";
    const words = suggestWords(raw);
    if (words.length === 0) {
      res.json({ articles: [] });
      return;
    }

    // 1) Visibility first, from articleScope (its parameters come first: $1, ...)
    const scope = articleScope(user, 1, "a");
    const params: unknown[] = [...scope.params];

    // 2) One match test and one score per word. Only OUR code builds this text; the words travel as parameters.
    const matches: string[] = [];
    const scores: string[] = [];
    for (const w of words) {
      params.push(`%${escapeLike(w)}%`);
      const n = params.length;
      const inTags = `EXISTS (SELECT 1 FROM unnest(a.tags) AS tg WHERE tg ILIKE $${n})`;
      matches.push(
        `(CASE WHEN a.title ILIKE $${n} OR a.body ILIKE $${n} OR ${inTags} THEN 1 ELSE 0 END)`,
      );
      scores.push(
        `(CASE WHEN a.title ILIKE $${n} THEN 3 ELSE 0 END + CASE WHEN ${inTags} THEN 2 ELSE 0 END + CASE WHEN a.body ILIKE $${n} THEN 1 ELSE 0 END)`,
      );
    }
    // A one-word title needs that word to match. Longer titles need at least two words to match.
    const need = Math.min(2, words.length);

    const r = await query(
      `SELECT id, title, excerpt, unit_code, tags
         FROM (
           SELECT a.id, a.title, left(a.body, 160) AS excerpt, bu.code AS unit_code, a.tags,
                  (${matches.join(" + ")}) AS matched,
                  (${scores.join(" + ")}) AS score
             FROM articles a
             LEFT JOIN business_units bu ON bu.id = a.business_unit_id
            WHERE ${scope.sql} AND a.status = 'PUBLISHED'
         ) s
        WHERE matched >= ${need}
        ORDER BY score DESC, id DESC
        LIMIT 5`,
      params,
    );

    res.json({ articles: r.rows });
  }),
);

export default router;
