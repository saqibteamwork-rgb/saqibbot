FROM node:22-bookworm-slim

# Install system dependencies (ffmpeg is essential for WhatsApp stickers and audio/video conversions)
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package descriptors first to take advantage of Docker layer caching
COPY package*.json ./

# Install all npm dependencies
RUN npm install --production=false

# Copy application source code
COPY . .

ENV NODE_ENV=production
ENV NODE_OPTIONS="--experimental-require-module --expose-gc --max-old-space-size=460"

EXPOSE 3000

# Start the bot with experimental ESM require support and memory management
CMD ["node", "--experimental-require-module", "--expose-gc", "--max-old-space-size=460", "index.js"]
