import DOMPurify from "isomorphic-dompurify";

// Allow only safe formatting for artist bio
const BIO_CONFIG = {
  ALLOWED_TAGS: ["b","i","em","strong","p","br","ul","ol","li"],
  ALLOWED_ATTR: [],
  KEEP_CONTENT: true,
};

export function sanitizeBio(input: string): string {
  if (!input) return "";
  // Strip all tags not in allowlist, remove scripts
  return DOMPurify.sanitize(input, BIO_CONFIG as any).slice(0, 2000);
}

export function sanitizeText(input: string): string {
  return DOMPurify.sanitize(input || "", { ALLOWED_TAGS: [], KEEP_CONTENT: true }).trim().slice(0, 1000);
}

export function maskEmail(email: string): string {
  if (!email) return "";
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  return `${user[0]}***@${domain}`;
}

export function maskPhone(phone: string): string {
  if (!phone || phone.length < 4) return "***";
  return phone.slice(0,2) + "***" + phone.slice(-2);
}
