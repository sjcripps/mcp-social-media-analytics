FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json ./
RUN bun install --frozen-lockfile || bun install
COPY server.ts ./
COPY lib/ ./lib/
COPY tools/ ./tools/
COPY pages/ ./pages/
COPY static/ ./static/
COPY server.json ./
COPY smithery.yaml ./
EXPOSE 4200
CMD ["bun", "run", "server.ts"]
