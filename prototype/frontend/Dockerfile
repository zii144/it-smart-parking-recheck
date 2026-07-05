# Multi-stage build: compile the Vite app, then serve the static output
# through nginx. nginx also reverse-proxies /api/ and /uploads/ to the
# backend container, so the browser only ever talks to one origin and the
# built JS can use relative API paths (see VITE_API_BASE below and
# src/api.js).

# ---- build stage ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Relative paths in the production build; nginx.conf proxies them to the
# backend service. Local `npm run dev` still uses the absolute URL in .env.
ENV VITE_API_BASE=""

RUN npm run build

# ---- serve stage ----
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
    CMD wget -qO- http://localhost:80/ >/dev/null || exit 1
