# Production image for the Fleet Management API. Builds on the same
# node:20-alpine base the CI workflow uses (actions/setup-node@v4 node-version 20),
# so behavior matches what's already verified in CI.
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate

RUN addgroup -S fleet && adduser -S fleet -G fleet
USER fleet

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
