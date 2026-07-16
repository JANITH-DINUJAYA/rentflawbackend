# ─── Build Stage ─────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy package configurations
COPY package*.json ./
COPY prisma ./prisma/

# Install build dependencies
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# Copy application source
COPY . .

# Build application
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# ─── Production Stage ─────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

# Copy built code and pruned node_modules from builder
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
