FROM node:20-slim
WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --no-frozen-lockfile

# Copy source and build server
COPY . .
RUN pnpm build:server

EXPOSE 3000
CMD ["node", "dist/server/index.js"]
