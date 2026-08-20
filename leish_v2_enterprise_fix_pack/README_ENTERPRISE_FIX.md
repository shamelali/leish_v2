# Leish v2 - Enterprise Fixes Applied

This pack contains drop-in replacements that bring leish_v2 to enterprise grade.
Copy these files over your repo root (overwrite).

## What was fixed
- ENV fail-fast with zod
- Dual DB facade hardened against SQL injection
- scrypt with pepper + timingSafeEqual
- JWT rotation + jti blacklist for logout
- Middleware auth + CSP nonce per request
- Redis rate limit with fallback
- Billplz HMAC + idempotency
- API handler wrapper
- Booking state machine enforcement
- Health check, logger redaction, Dockerfile, security headers

## How to apply
cp -r leish_v2_fix_pack/* /path/to/leish_v2/
npm run lint
npm run typecheck
npm test
npm run build

## Env required (.env.local)
SESSION_SECRET=$(openssl rand -base64 32)
NEXT_PUBLIC_SITE_URL=https://leish.my
DATABASE_URL=postgresql://...
BILLPLZ_API_KEY=...
BILLPLZ_COLLECTION_ID=...
BILLPLZ_X_SIGNATURE=...
EMAIL_PROVIDER=resend
RESEND_API_KEY=...
REDIS_URL=...
REDIS_TOKEN=...
PASSWORD_PEPPER=...
