import pino from "pino";
export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: { paths: ["req.headers.authorization","req.headers.cookie","password","*.password","*.email","billplz_key","x_signature"], censor:"[REDACTED]" },
  formatters: { level: (l) => ({ level: l }) },
  transport: process.env.NODE_ENV!=="production" ? { target:"pino-pretty" } : undefined,
});
