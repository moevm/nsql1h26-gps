FROM oven/bun:1.3.14 AS frontend
WORKDIR /build
COPY frontend/package.json frontend/bun.lock ./frontend/
RUN cd frontend && bun install --frozen-lockfile
COPY frontend/ ./frontend/
RUN cd frontend && bun run build

FROM oven/bun:1.3.14
WORKDIR /app
COPY backend/package.json backend/bun.lock ./
RUN bun install --frozen-lockfile --production
COPY backend/ .
COPY --from=frontend /build/backend/public ./public

EXPOSE 8081
CMD ["bun", "index.ts"]
