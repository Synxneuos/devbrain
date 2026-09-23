FROM node:22-alpine

WORKDIR /app

# Copy package manifest
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy application source code
COPY . .

# Expose HTTP port
EXPOSE 3333

ENV NODE_ENV=production
# Persistent data directory (SQLite credit ledger + state file).
# On Railway: attach a Volume mounted at /data — everything survives redeploys.
ENV JEV_DATA_DIR=/data
RUN mkdir -p /data

# Start the Jev Brain Web Daemon & Discord Sentinel Bot
CMD ["npm", "start"]
