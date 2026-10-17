# FullComercy Web — build estático servido por nginx. Contexto = raiz do monorepo.
FROM node:20-alpine AS build
WORKDIR /repo
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
COPY package*.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund -w apps/web
COPY apps/web apps/web
RUN npm run -w apps/web build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
