import sanitizeHtml from "sanitize-html";

/**
 * Tight allowlist suitable for comment bodies. Lexical's HTML output for
 * the post composer is constrained to inline formatting, links, and a few
 * block elements — anything outside this set gets stripped. No script tags,
 * no event handlers, no inline styles, no iframes.
 *
 * Links are forced to open in a new tab with `rel="noopener noreferrer"`
 * and restricted to safe schemes.
 */
const COMMENT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "span",
    "strong",
    "em",
    "u",
    "s",
    "code",
    "pre",
    "blockquote",
    "ul",
    "ol",
    "li",
    "a",
  ],
  allowedAttributes: {
    a: ["href", "title"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  // Add rel and target to all links — defense in depth against tabnabbing.
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      rel: "noopener noreferrer ugc",
      target: "_blank",
    }),
  },
  // Drop empty paragraphs/spans that Lexical sometimes emits.
  exclusiveFilter: (frame) =>
    (frame.tag === "p" || frame.tag === "span") &&
    !frame.text.trim() &&
    !Object.keys(frame.attribs ?? {}).length,
};

const COMMENT_MAX_CHARS = 10_000;

/**
 * Sanitize HTML intended as a comment body. Truncates pathologically large
 * input before sanitizing.
 */
export function sanitizeCommentHtml(input: string): string {
  if (!input) return "";
  const truncated = input.length > COMMENT_MAX_CHARS
    ? input.slice(0, COMMENT_MAX_CHARS)
    : input;
  return sanitizeHtml(truncated, COMMENT_OPTIONS);
}
