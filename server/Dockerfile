# Build context is the repository root:  docker build -f server/Dockerfile .
FROM node:20-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --workspace server --include-workspace-root=false
COPY shared shared
COPY server server
RUN npm run build -w server
WORKDIR /app/server
ENV NODE_ENV=production PORT=4000 UPLOAD_DIR=/data/uploads
EXPOSE 4000
# Applies pending migrations, then starts the API.
CMD ["sh", "-c", "npx tsx src/db/migrate.ts && node dist/index.js"]
