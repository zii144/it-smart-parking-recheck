FROM nginx:1.30-alpine
# The base image's OS packages lag behind Alpine's own repos (e.g.
# CVE-2026-14456, an OpenSSL DoS fixed upstream in libcrypto3 3.5.8-r0 well
# before this base image was last rebuilt).
RUN apk update && apk upgrade --no-cache
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8090
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
    CMD wget -qO- http://127.0.0.1:8090/api/health >/dev/null || exit 1
