import DOMPurify from "isomorphic-dompurify";

/** Safe biography formatting for artist profiles.
 * - Only allow a minimal tag whitelist (no rehypeRaw).
 * - Strip data: URIs and svg tags with event handlers.
 * - Cap length to prevent DOM bloat.
 */
export function sanitizeArtistBio(input: string): string {
  if (!input) return "";
  const config = {
    ALLOWED_TAGS: ["b", "i", "em", "strong", "p", "br", "ul", "ol", "li"],
    ALLOWED_ATTR: [],
    // Disallow data: URIs and javascript: protocols
    FORBIDDEN_PROTOCOLS: ["data:", "javascript:"],
    KEEP_CONTENT: true,
  };
  // DOMPurify with conservative config
  const cleaned = DOMPurify.sanitize(input, config as any);
  // Additional: remove any remaining data: URIs in href/src
  return cleaned
    .replace(/data:[^;]*;/g, "")
    .replace(/src="data:[^"]*"/g, "")
    .replace(/href="data:[^"]*"/g, "")
    .slice(0, 2000);
}

/** General text sanitization — no HTML tags allowed. */
export function sanitizeText(input: string): string {
  if (!input) return "";
  // Disallow any HTML/JS, keep only plain text
  const cleaned = DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });
  return cleaned.trim().slice(0, 1000);
}

/** Email masking for PDPA compliance — show only first char + *** */
export function maskEmail(email: string): string {
  if (!email) return "";
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  return `${user[0]}***@${domain}`;
}

/** Phone masking for PDPA compliance */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 4) return "***";
  return phone.slice(0, 2) + "***" + phone.slice(-2);
}
