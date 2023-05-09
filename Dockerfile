FROM node:18-alpine as builder

RUN mkdir /app
WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD true
ENV NODE_ENV production

COPY . .

# --production=false to force NPM to install all devDependencies as some are needed for building. We could also re-organize them.
RUN npm ci --production=false
RUN npm run build-server 
RUN npm run build-client

FROM node:18-alpine

LABEL fly_launch_runtime="nodejs"

COPY --from=builder /app /app

WORKDIR /app
ENV NODE_ENV production

CMD if [[ ! -z "$SWAP" ]]; then fallocate -l $(($(stat -f -c "(%a*%s/10)*7" .))) _swapfile && mkswap _swapfile && swapon _swapfile && ls -hla; fi; free -m; node --experimental-json-modules .
