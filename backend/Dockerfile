# The backend uses the admin's pages and content engine from ../Admin, so it is
# built from the repository's root:
#
#   docker build -f backend/Dockerfile -t atlas-backend .
#   docker run -p 4320:4320 --env-file backend/.env atlas-backend
#
# Without DATABASE_URL it keeps a Postgres of its own (PGlite) in /app/backend/.data:
# mount a volume there (-v atlas-data:/app/backend/.data) so it outlives the container.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production ADMIN_HOST=0.0.0.0 PORT=4320
COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci --omit=dev && npm cache clean --force
COPY Admin/package.json Admin/package.json
COPY Admin/public Admin/public
COPY Admin/server Admin/server
COPY backend backend
RUN mkdir -p backend/.data && chown -R node:node backend/.data
USER node
VOLUME /app/backend/.data
EXPOSE 4320
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4320/healthz >/dev/null || exit 1
CMD ["node", "backend/server.mjs"]
