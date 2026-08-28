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

# This container is admin/design-only — InspectorApp is served separately as
# a public static bundle (see vite.public.config.js). Building only
# admin.html's entry point means AdminApp/DesignSystemApp never ship a public
# build (see vite.admin.config.js, scripts/verify-build-split.sh).
RUN npm run build:admin

# ---- serve stage ----
FROM nginx:1.30-alpine

# The base image's OS packages lag behind Alpine's own repos (e.g.
# CVE-2026-14456, an OpenSSL DoS fixed upstream in libcrypto3 3.5.8-r0 well
# before this base image was last rebuilt).
RUN apk update && apk upgrade --no-cache

COPY --from=build /app/dist/admin /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# 127.0.0.1, not localhost: nginx only listens on IPv4 (`listen 80;`), but
# some container network configs resolve "localhost" to ::1 first, which
# then fails with a false-negative "unhealthy" despite nginx working fine.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
    CMD wget -qO- http://127.0.0.1:80/ >/dev/null || exit 1
