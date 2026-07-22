FROM node:22-alpine AS builder

RUN mkdir /app
WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV NODE_ENV=production

COPY package*.json ./
# --production=false to force NPM to install all devDependencies as some are needed for building. We could also re-organize them.
RUN npm ci --production=false
COPY data data
COPY tsconfig.json .
COPY src src
RUN npm run build-server
COPY client client
RUN npm run build-client

FROM node:22-alpine AS runner
EXPOSE 8080

RUN apk add nginx nginx-mod-http-brotli --no-cache

RUN mkdir -p /run/nginx && \
    chown -R node:node /var/lib/nginx /var/log/nginx /run/nginx /etc/nginx

USER node

COPY nginx.conf /etc/nginx/http.d/default.conf

RUN nginx -t

WORKDIR /app
ENV NODE_ENV=production

COPY --chown=node:node --from=builder /app/data ./data
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/client/dist ./client/dist
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/package.json ./

CMD nginx && node --experimental-json-modules --max-old-space-size=8192 .
