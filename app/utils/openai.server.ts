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
