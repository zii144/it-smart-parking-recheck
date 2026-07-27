FROM nginx:1.30-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8090
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
    CMD wget -qO- http://127.0.0.1:8090/api/health >/dev/null || exit 1
