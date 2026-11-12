# Сборка из корня репозитория: docker build -t complex-pc .
FROM node:22-alpine AS build
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/web/package.json apps/web/
COPY apps/web/prisma apps/web/prisma
COPY apps/web/prisma.config.ts apps/web/
RUN npm ci
COPY . .
# NEXT_PUBLIC_* вшиваются в клиентский код при сборке
ARG NEXT_PUBLIC_BOT_URL=
ENV NEXT_PUBLIC_BOT_URL=$NEXT_PUBLIC_BOT_URL
RUN npm run build -w @complex/web

FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
