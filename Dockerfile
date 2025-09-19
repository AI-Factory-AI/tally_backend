# syntax=docker/dockerfile:1.6

FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# Install OS deps if needed (openssl etc.)
RUN apk add --no-cache bash python3 make g++

# Only copy package files first for better caching
COPY package*.json ./

# Install deps
RUN npm ci --omit=dev && npm cache clean --force

# Build stage with dev deps
FROM base AS build
ENV NODE_ENV=development
RUN npm install --include=dev
COPY tsconfig.json ./
COPY src ./src
COPY app.ts ./
COPY server.ts ./
COPY src/contracts/abis ./src/contracts/abis
RUN npm run build

# Runtime image
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Copy only runtime deps and built files
COPY --from=base /app/node_modules ./node_modules
COPY package*.json ./
COPY --from=build /app/dist ./dist

# Use PORT env if provided (Render sets it)
ENV PORT=10000
EXPOSE 10000

CMD ["node", "dist/server.js"]
