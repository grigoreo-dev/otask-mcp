FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN bun run build

FROM oven/bun:1-slim

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile --production

COPY --from=builder /app/dist ./dist

ENV PORT=3847
EXPOSE 3847

CMD ["bun", "run", "dist/http-server.js"]
