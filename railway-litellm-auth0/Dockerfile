FROM node:22.22.2-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY gateway ./gateway
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "--import", "tsx", "gateway/server.ts"]
