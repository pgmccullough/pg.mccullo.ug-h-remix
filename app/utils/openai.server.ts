/**
 * OpenAI helpers — currently just a tight vision-based alt-text
 * generator. Uses gpt-4o-mini (cheap + fast) via the chat/completions
 * endpoint's multimodal message shape.
 *
 * No SDK dep needed — a plain fetch to /v1/chat/completions is all we
 * do. Silent no-op if OPENAI_API_KEY isn't configured so a missing
 * env var doesn't break upload flows.
 */

const MODEL = "gpt-4o-mini";
const ENDPOINT = "https://api.openai.com/v1/chat/completions";

const ALT_TEXT_PROMPT = [
  "Write a single sentence describing this image, suitable as HTML alt text.",
  "Rules:",
  "- Under 140 characters.",
  "- Plain, factual, no phrases like \"image of\" or \"photo of\".",
  "- No trailing period.",
  "- If the image has readable text, quote the most important 1-3 words.",
  "- If unclear or empty, say \"decorative image\".",
].join(" ");

export function openAiConfigured(): boolean {
  return !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.length);
}

// ---------------------------------------------------------------------------
// SEO metadata: URL slug + meta description in one shot
// ---------------------------------------------------------------------------

const SEO_META_PROMPT = [
  "You'll receive the plain text of a personal blog post.",
  "Return JSON with exactly three fields:",
  "  slug: a URL slug — 3 to 6 lowercase words, hyphen-separated, no punctuation, no filler words,",
  "        no numbers unless meaningful. Should read like a phrase describing the topic.",
  "  description: a meta description — max 150 characters, one sentence, factual, no clickbait,",
  "        no phrases like \"this post is about\", written as a summary of the post's topic.",
  "  tags: an array of 1 to 4 topical tags — each tag is one lowercase word or two words",
  "        joined by a hyphen. Pick broad reusable topics (e.g. \"music\", \"new-york\",",
  "        \"programming\", \"writing\", \"family\"), NOT hyper-specific per-post nouns.",
  "        Skip generic filler like \"post\", \"blog\", \"personal\", \"life\".",
].join(" ");

/**
 * Sanitize an LLM-produced slug into a safe URL segment. Returns null
 * if what came back was garbage (empty, entirely numeric, too short).
 */
function sanitizeSlug(raw: string): string | null {
  if (typeof raw !== "string") return null;
  let s = raw
    .toLowerCase()
    .replace(/[‘’“”]/g, "") // curly quotes
    .replace(/[^a-z0-9\s-]/g, " ")             // strip everything else
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (s.length < 3) return null;
  if (/^[0-9-]+$/.test(s)) return null; // reject pure-number slugs
  if (s.length > 80) s = s.slice(0, 80).replace(/-+$/, "");
  return s;
}

/**
 * Sanitize the description: trim, collapse whitespace, hard cap at
 * 155 chars so it stays inside social preview limits.
 */
function sanitizeDescription(raw: string): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim().replace(/\s+/g, " ").replace(/^"|"$/g, "").trim();
  if (!s) return null;
  if (s.length > 155) s = s.slice(0, 154).trimEnd() + "…";
  return s;
}

// Blocklist of tags too generic to be useful. If the model returns any
// of these, drop them silently — they'd cluster everything into one
// undifferentiated bucket, defeating the point.
const TAG_BLOCKLIST = new Set([
  "post", "posts", "blog", "personal", "life", "misc", "miscellaneous",
  "general", "notes", "note", "update", "updates", "thoughts", "diary",
  "journal", "daily", "random", "stuff", "things",
]);

/**
 * Sanitize an array of LLM-produced tags into a de-duplicated,
 * URL-safe list. Filters blocklist entries and enforces basic shape
 * rules. Returns [] rather than null so callers can `??` safely.
 */
function sanitizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    let t = item
      .toLowerCase()
      .replace(/[‘’“”"']/g, "")
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!t || t.length < 2 || t.length > 32) continue;
    if (/^[0-9-]+$/.test(t)) continue;
    if (TAG_BLOCKLIST.has(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 4) break;
  }
  return out;
}

/**
 * Ask the model to write a slug, meta description, and topical tags
 * for a post from its stripped body text. Returns the sanitized trio
 * on success, or null if the model / network / parse failed.
 *
 * Uses JSON mode so we get parseable structured output. Cheap: one
 * gpt-4o-mini call, ~300 tokens round trip. Tags come back sanitized
 * (blocklist filtered, deduped) — an empty tags array is legit and
 * means the sanitizer discarded everything the model proposed.
 */
export async function generateSeoMeta(args: {
  content: string;
  timeoutMs?: number;
}): Promise<{ slug: string; description: string; tags: string[] } | null> {
  if (!openAiConfigured()) return null;
  const body = args.content.trim();
  if (!body) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 15000);

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 260,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SEO_META_PROMPT },
          { role: "user", content: body.slice(0, 3000) },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(
        "[openai] seo-meta failed:",
        res.status,
        await res.text().catch(() => "")
      );
      return null;
    }
    const data: any = await res.json();
    const raw: string | undefined = data?.choices?.[0]?.message?.content;
    if (typeof raw !== "string") return null;
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { return null; }
    const slug = sanitizeSlug(parsed?.slug ?? "");
    const description = sanitizeDescription(parsed?.description ?? "");
    const tags = sanitizeTags(parsed?.tags);
    if (!slug || !description) return null;
    return { slug, description, tags };
  } catch (err) {
    console.error("[openai] seo-meta exception:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Text embeddings for semantic post similarity ("related posts").
// ---------------------------------------------------------------------------

const EMBEDDINGS_ENDPOINT = "https://api.openai.com/v1/embeddings";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMS = 512;

/**
 * L2-normalize a vector in place, then return it. After
 * normalization, cosine similarity between two vectors equals their
 * dot product — a nice shortcut for the related-posts ranker so we
 * don't recompute magnitudes on every comparison.
 */
function l2Normalize(v: number[]): number[] {
  let sumSq = 0;
  for (const x of v) sumSq += x * x;
  const norm = Math.sqrt(sumSq);
  if (norm === 0) return v;
  for (let i = 0; i < v.length; i++) v[i] = v[i] / norm;
  return v;
}

/**
 * Generate a text embedding for a post body. Returns a 512-dim
 * float array (L2-normalized so cosine = dot product), or null on
 * failure. Uses text-embedding-3-small at reduced dimensions — the
 * `dimensions` request-parameter chops the trailing dims that
 * carry the least signal, and 512 is plenty for personal-blog
 * scale similarity.
 *
 * Cost: ~0.02¢ per 1K tokens. A few hundred posts cost cents total.
 */
export async function generateEmbedding(args: {
  content: string;
  timeoutMs?: number;
}): Promise<number[] | null> {
  if (!openAiConfigured()) return null;
  const body = args.content.trim();
  if (!body) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 15000);

  try {
    const res = await fetch(EMBEDDINGS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        // OpenAI charges by input tokens; cap the payload so a long
        // post doesn't burn tokens on paragraphs the embedding won't
        // meaningfully distinguish anyway.
        input: body.slice(0, 8000),
        dimensions: EMBEDDING_DIMS,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(
        "[openai] embedding failed:",
        res.status,
        await res.text().catch(() => "")
      );
      return null;
    }
    const data: any = await res.json();
    const vec: unknown = data?.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIMS) return null;
    const nums = vec.map((x) => Number(x));
    if (nums.some((n) => !Number.isFinite(n))) return null;
    return l2Normalize(nums);
  } catch (err) {
    console.error("[openai] embedding exception:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const EMBEDDING_DIMENSIONS = EMBEDDING_DIMS;

// ---------------------------------------------------------------------------
// Bible-reading companion chat.
//
// Powers the sidebar Bible widget: user pastes a question or note
// about a chapter, we send the full chapter text + the conversation
// history + a scholarly-companion system prompt to gpt-4o-mini and
// return the reply.
//
// Each chapter is a fresh conversation (no cross-chapter memory).
// Callers pass the full message history each turn.
// ---------------------------------------------------------------------------

export async function bibleChat(args: {
  book: string;
  chapter: number;
  verses: string[];
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  timeoutMs?: number;
}): Promise<string | null> {
  if (!openAiConfigured()) return null;

  const chapterText = args.verses
    .map((v, i) => `${i + 1}. ${v}`)
    .join("\n");

  const systemPrompt = [
    `You are a knowledgeable and honest companion helping the user think through ${args.book} ${args.chapter} (KJV).`,
    `Draw freely on biblical scholarship, historical context, textual variants, comparative Ancient Near Eastern literature, and the range of interpretive traditions (Jewish, Catholic, Orthodox, Protestant mainline, evangelical, secular/academic).`,
    `Be honest about ambiguities, contradictions, and places where scholars or traditions genuinely disagree — don't paper over them.`,
    `Don't proselytize or offer devotional pep-talks unless explicitly asked. The user has already read the passage; skip preamble and get to substance.`,
    `Keep responses focused — 2 to 5 short paragraphs unless the question warrants more depth. Cite verse numbers when pointing to specifics.`,
    `The chapter text is provided below; you can quote from it directly.`,
    ``,
    `${args.book} ${args.chapter} (KJV):`,
    chapterText,
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 30000);

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 900,
        temperature: 0.4,
        messages: [
          { role: "system", content: systemPrompt },
          ...args.messages,
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(
        "[bible-chat] failed:",
        res.status,
        await res.text().catch(() => "")
      );
      return null;
    }
    const data: any = await res.json();
    const text: string | undefined = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) return null;
    return text.trim();
  } catch (err) {
    console.error("[bible-chat] exception:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generate alt text for a publicly-fetchable image URL. Returns the
 * text on success, or null on any failure (API error, timeout,
 * refusal, etc.). Caller should treat null as "no alt yet" and can
 * retry later.
 */
export async function generateAltText(args: {
  imageUrl: string;
  timeoutMs?: number;
}): Promise<string | null> {
  if (!openAiConfigured()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 15000);

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 120,
        temperature: 0.4,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: ALT_TEXT_PROMPT },
              { type: "image_url", image_url: { url: args.imageUrl } },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(
        "[openai] alt-text failed:",
        res.status,
        await res.text().catch(() => "")
      );
      return null;
    }

    const data: any = await res.json();
    const text: string | undefined = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) return null;

    // Trim, drop wrapping quotes if the model added them.
    let out = text.trim().replace(/^"|"$/g, "").trim();
    if (out.length > 200) out = out.slice(0, 199).trimEnd() + "…";
    return out;
  } catch (err) {
    console.error("[openai] alt-text exception:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
