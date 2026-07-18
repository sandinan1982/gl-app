# ---- Build & run image untuk GL App ----
FROM node:20-bookworm-slim

# Tools untuk compile better-sqlite3 (native module)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependency backend dulu (memanfaatkan cache layer)
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

# Copy seluruh source
COPY backend ./backend
COPY frontend ./frontend

WORKDIR /app/backend

# Folder data (tempat file gl.db) - akan di-mount sebagai volume persisten
RUN mkdir -p /app/backend/data

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
