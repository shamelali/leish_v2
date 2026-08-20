FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.ts .npmrc* ./
RUN npm ci

COPY .env.example .env.local next.config.mjs tsconfig.json vitest.config.mts ./
COPY src ./src
COPY public ./public
COPY supabase ./supabase

RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]