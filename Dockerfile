FROM node:20-alpine

WORKDIR /app

COPY synq-api/package*.json ./
RUN npm ci --omit=dev

COPY synq-api/src ./src

EXPOSE 3200

CMD ["node", "src/server.js"]
