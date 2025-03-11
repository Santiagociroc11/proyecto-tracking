# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source files
COPY . .

# Build frontend and server
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Create logs directory and set permissions
RUN mkdir -p logs && chown -R node:node logs

# Set runtime environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose only the production server port
EXPOSE 3000

# Health check with increased timeout and start period
HEALTHCHECK --interval=30s --timeout=30s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

# Start the server
CMD ["node", "dist/server/server.js"]