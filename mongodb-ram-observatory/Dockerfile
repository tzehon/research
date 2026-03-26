FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY client/package*.json ./client/
RUN npm install && cd client && npm install
COPY . .
RUN cd client && npm run build

FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY server/ ./server/
COPY scripts/ ./scripts/
COPY --from=builder /app/client/dist ./client/dist
EXPOSE 3000
CMD ["node", "server/index.js"]
