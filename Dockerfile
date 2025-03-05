# Build stage
FROM node:18-alpine as builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build frontend and server
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --production

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY .env .env

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "dist/server.js"]