FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/data/esp.db

EXPOSE 3000

VOLUME ["/data"]

CMD ["node", "src/server.js"]
