FROM node:20-alpine

WORKDIR /app

# Copy package manifest
COPY package*.json ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Expose HTTP port
EXPOSE 3333

ENV NODE_ENV=production
ENV PORT=3333

# Start the Jev Brain Web Daemon & Discord Sentinel Bot
CMD ["node", "bin/brain.js", "serve", "--port", "3333"]
