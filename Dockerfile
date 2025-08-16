# ---- Base deps stage: install node deps without downloading Chrome ----
FROM node:22-slim AS deps
WORKDIR /app

# Avoid Puppeteer downloading its own Chromium; we'll install system Chromium later
ENV PUPPETEER_SKIP_DOWNLOAD=1
COPY package*.json ./
RUN npm ci

# ---- Runtime stage: system packages + app files ----
FROM node:22-slim
WORKDIR /app

# Install system Chromium (for puppeteer), Tesseract (OCR), libvips (sharp), and fonts
RUN apt-get update && apt-get install -y \
    chromium \
    tesseract-ocr \
    libvips \
    fonts-liberation \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy the rest of your project
COPY . .

# Build the “dist/” (your current build just copies src/public; keep it that way)
RUN npm run build

# Environment for puppeteer to find system Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
# Optional: if you wired a simple-fetch fallback for serverless, ensure we ENABLE puppeteer here
ENV PUPPETEER_DISABLED=0
# Use production port
ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

# Start your server from dist (or root if you run server.js at root)
# If your server is at project root:
CMD ["npm", "run", "start"]
# If you prefer dist build entry:
# CMD ["npm", "run", "start:prod"]
