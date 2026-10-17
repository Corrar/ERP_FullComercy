# FullComercy API — contexto de build = RAIZ do monorepo (docker compose já faz isso).
#   docker build -f apps/api/Dockerfile -t fullcomercy-api .
FROM node:20-alpine AS build
WORKDIR /repo
COPY package*.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund -w apps/api
COPY apps/api apps/api
RUN npm run -w apps/api prisma:generate && npm run -w apps/api build

FROM node:20-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY package*.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --no-audit --no-fund -w apps/api && npm cache clean --force
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/scripts apps/api/
RUN npx prisma generate --schema apps/api/prisma/schema.prisma
COPY --from=build /repo/apps/api/dist apps/api/dist
USER node
WORKDIR /repo/apps/api
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:3000/health/ready || exit 1
# Migrations rodam FORA do start (job de deploy): `npm run prisma:deploy && npm run db:rls`.
CMD ["node", "dist/src/server.js"]
