FROM node:22-alpine as builder

RUN mkdir /app
WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD true
ENV NODE_ENV production

COPY package*.json ./
# --production=false to force NPM to install all devDependencies as some are needed for building. We could also re-organize them.
RUN npm ci --production=false
COPY data data
COPY tsconfig.json .
COPY src src
RUN npm run build-server
COPY client client
RUN npm run build-client

FROM node:22-alpine

COPY --from=builder /app /app

RUN apk add nginx
RUN apk add nginx-mod-http-brotli

COPY nginx.conf /etc/nginx/http.d/default.conf

RUN nginx -t

WORKDIR /app
ENV NODE_ENV production

CMD if [[ ! -z "$SWAP" ]]; then fallocate -l $(($(stat -f -c "(%a*%s/10)*7" .))) _swapfile && mkswap _swapfile && swapon _swapfile && ls -hla; fi; free -m; nginx && node --experimental-json-modules --max-old-space-size=8192 .
