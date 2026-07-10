FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lockb ./
COPY packages ./packages
RUN bun install --frozen-lockfile
RUN bun run build

FROM oven/bun:1-slim

WORKDIR /app

COPY package.json bun.lockb ./
COPY packages ./packages
RUN bun install --frozen-lockfile --production
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/http-node/dist ./packages/http-node/dist

ENV PORT=3847
EXPOSE 3847

CMD ["bun", "run", "packages/http-node/dist/mcp-http.js"]
