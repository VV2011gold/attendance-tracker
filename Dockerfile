# ── IBM Cloud Code Engine — Attendance Tracker ────────────────────────────────
# Base: Red Hat UBI9 Node.js 22 minimal — public registry, no login required
FROM registry.access.redhat.com/ubi9/nodejs-22:latest

# Switch to root only for setup steps
USER root

# Set working directory
WORKDIR /app

# Copy package files first (layer cache — only reinstalls when deps change)
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy all application source files
COPY . .

# Create the data directory for SQLite (mounted as a volume in Code Engine)
RUN mkdir -p /app/data && chown -R 1001:0 /app/data && chmod -R g=u /app/data

# Drop to non-root user (required by IBM security policy)
USER 1001

# Code Engine injects PORT=8080 at runtime; local dev uses 3000 from .env
EXPOSE 8080

# Start the server
CMD ["node", "backend/server.js"]
