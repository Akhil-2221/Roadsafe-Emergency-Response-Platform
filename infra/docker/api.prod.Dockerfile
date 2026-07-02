FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat dumb-init
WORKDIR /app

# ─── Dependencies ────────────────────────────────────────────────
FROM base AS deps
COPY package.json ./
RUN npm ci --only=production && npm cache clean --force

# ─── Build ────────────────────────────────────────────────────────
FROM base AS builder
COPY package.json ./
RUN npm ci
COPY . .
RUN npm run build

# ─── Runner ───────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production

# Run as non-root
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 apiuser

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json ./

RUN mkdir -p logs && chown -R apiuser:nodejs logs

USER apiuser
EXPOSE 3001

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
