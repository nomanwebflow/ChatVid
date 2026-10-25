# ChatVid — render server + built editor, single container.
# Isolated image; does not touch any other service on the host.

# ---- build the editor (Vite dist) ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
# npm install (not ci): tolerant of lockfile drift from Remotion dep bumps
RUN npm install --no-audit --no-fund
COPY . .
# Vite inlines this at build time (Convex Auth + database)
ARG VITE_CONVEX_URL
ENV VITE_CONVEX_URL=$VITE_CONVEX_URL
RUN npm run build

# ---- runtime: Node + headless-Chrome system libs + FFmpeg ----
FROM node:22-bookworm-slim AS runtime
# Chrome Headless Shell (downloaded by Remotion at first render) needs these.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      ca-certificates fonts-liberation fonts-noto-color-emoji fonts-noto-cjk \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
      libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
      libpango-1.0-0 libcairo2 libatspi2.0-0 libxshmfence1 libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
# Remotion caches its browser here (persisted via a named volume in compose)
ENV REMOTION_BROWSER_CACHE=/app/.remotion-browser

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
# server needs the Remotion entry + composition source + public assets to bundle
COPY server ./server
COPY src ./src
COPY public ./public
COPY tsconfig*.json vite.config.ts index.html ./
COPY --from=build /app/dist ./dist

EXPOSE 4000
CMD ["node", "server/render.mjs"]
