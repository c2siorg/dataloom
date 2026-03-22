FROM node:22-slim AS builder

WORKDIR /app

RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prefer-offline

FROM node:22-slim

WORKDIR /app

RUN corepack enable pnpm

COPY --from=builder /app/node_modules /app/node_modules
COPY . .

RUN groupadd -r appuser && useradd -r -g appuser -m --no-log-init appuser && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 3200

CMD ["pnpm", "run", "dev", "--host"]

