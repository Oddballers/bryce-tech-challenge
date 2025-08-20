# Multi-stage build for Vite React app
FROM oven/bun:1 AS frontend-builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the app
RUN bun run build

# Production stage for serving the built app
FROM nginx:alpine AS frontend

# Copy built app from builder stage
COPY --from=frontend-builder /app/dist /usr/share/nginx/html

# Copy nginx configuration if needed
# COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

# Firebase Functions stage
FROM node:22-alpine AS functions

WORKDIR /app

# Install Firebase CLI globally
RUN npm install -g firebase-tools

# Copy Firebase config files
COPY firebase.json ./
COPY firestore.* ./

# Copy function package files
COPY functions/package*.json ./functions/

WORKDIR /app/functions

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy function source
COPY functions/ .

# Build functions
RUN npm run build

WORKDIR /app

EXPOSE 5001

CMD ["npm", "run", "serve", "--prefix", "functions"]