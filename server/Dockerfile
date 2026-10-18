# Ether Mines game server: a small Node.js process, no build step.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
# the game's own scripts the server shares (world, rules, block shapes, mobs), copied in by the deploy
COPY shared ./shared
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER node
CMD ["node", "src/server.js"]
