## photo-wall — single-image production build.
## - stage `build`: install deps and produce dist/client + dist/server
## - stage `runtime`: minimal node image that runs the built server
##
## The runtime image expects:
##   /photos  (read-only)  — source library
##   /data    (writable)   — snapshots, derivative cache, playlists

# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS build
WORKDIR /app

ENV NODE_ENV=development

COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --no-audit --no-fund --include=dev

COPY tsconfig.base.json tsconfig.json tsconfig.server.json tsconfig.client.json tsconfig.test.json ./
COPY vite.config.ts ./
COPY src ./src
COPY fixtures ./fixtures

RUN npm run build

# Drop dev dependencies for the runtime image.
RUN npm prune --omit=dev


FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PHOTO_WALL_LIBRARY_ROOT=/photos \
    PHOTO_WALL_DATA_ROOT=/data \
    PHOTO_WALL_BIND_HOST=0.0.0.0 \
    PHOTO_WALL_PORT=3001

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

VOLUME ["/photos", "/data"]
EXPOSE 3001

HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PHOTO_WALL_PORT+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/server/index.js"]
