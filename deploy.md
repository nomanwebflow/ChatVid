# ChatVid Deployment Guide

This document describes how to deploy and maintain ChatVid on the production VPS.

---

## 1. Architecture Overview

* **Host:** Debian VPS (`167.114.152.92`)
* **Deployment Path:** `/opt/chatvid`
* **Public Domain:** [https://chatvid.nomanahmed.io](https://chatvid.nomanahmed.io)
* **Container Name:** `chatvid-render`
* **Internal Port:** `4000` (Node.js + Express + Remotion headless render engine + static Vite client)
* **Reverse Proxy:** Host Caddy joining the external Docker bridge network `navex-shared`
* **Cloud Database & Auth:** Convex Cloud (`https://rapid-duck-327.eu-west-1.convex.cloud`)

---

## 2. Prerequisites

1. **SSH Access:** SSH key configured for `debian@167.114.152.92` (e.g. `ssh debian@167.114.152.92`).
2. **Local CLI Tools:** `rsync`, `ssh`, `node`, `npm`.
3. **VPS Environment:** Docker and Docker Compose plugin installed, with `navex-shared` network existing.

---

## 3. Quick Deployment (One-Liner)

You can deploy using the npm shortcut from the `app` directory:

```bash
cd app && npm run deploy
```

Or run the rsync command directly from the root:

```bash
rsync -avz \
  --exclude="node_modules" \
  --exclude="dist" \
  --exclude=".env.local" \
  --exclude="test-results" \
  --exclude=".git" \
  --exclude="data/outputs" \
  --exclude="data/projects/*.json" \
  app/ debian@167.114.152.92:/opt/chatvid/ && \
ssh debian@167.114.152.92 'cd /opt/chatvid && docker compose build && docker compose up -d'
```

---

## 4. Step-by-Step Deployment

### Step 1: Validate Local Build & Tests
Before deploying, make sure the frontend builds with zero TypeScript errors:

```bash
cd app
npm run build
```

### Step 2: Sync Code to VPS
Use `rsync` to transfer the updated `app/` files to `/opt/chatvid` while skipping local build artifacts and node modules:

```bash
rsync -avz \
  --exclude="node_modules" \
  --exclude="dist" \
  --exclude=".env.local" \
  --exclude="test-results" \
  --exclude=".git" \
  --exclude="data/outputs" \
  --exclude="data/projects/*.json" \
  app/ debian@167.114.152.92:/opt/chatvid/
```

> **Note:** The production environment file `/opt/chatvid/.env` on the VPS is preserved and not overwritten.

### Step 3: Build & Restart the Container
SSH into the server and run Docker Compose to build the new image and recreate the container with minimal downtime:

```bash
ssh debian@167.114.152.92 'cd /opt/chatvid && docker compose build && docker compose up -d'
```

### Step 4: Verify Deployment Status
Check that the container is running and inspect the logs:

```bash
ssh debian@167.114.152.92 'cd /opt/chatvid && docker compose ps && docker compose logs --tail 25'
```

Verify that the site responds with `200 OK` and serves the latest assets:

```bash
curl -sIL https://chatvid.nomanahmed.io
```

---

## 5. VPS Configuration & Files

### Directory Structure on VPS (`/opt/chatvid`)

```
/opt/chatvid/
├── .env                  # Production secrets (e.g. CHATVID_OAUTH_SECRET)
├── Dockerfile            # Multi-stage build (Vite build + Node 22 + Chromium headless libs)
├── docker-compose.yml    # Compose specification joining navex-shared network
├── server/               # Express server (render.mjs, oauth.mjs, mcp-tools.mjs)
├── src/                  # React + Remotion frontend source code
├── public/               # Static assets, fonts, icons, sfx
├── package.json
└── package-lock.json
```

### Environment Variables (`/opt/chatvid/.env`)

The `.env` file on the VPS must define the OAuth signing secret:

```bash
CHATVID_OAUTH_SECRET=<random-32-byte-hex-string>
```

### Docker Compose Service (`docker-compose.yml`)

The service runs `chatvid-render:latest` and exposes port `4000` solely inside the `navex-shared` Docker network (no host ports mapped):

* **Volumes:**
  * `chatvid_browser`: caches Chrome headless shell downloaded by Remotion.
  * `chatvid_media`: stores uploaded audio/photos/avatars.
  * `chatvid_tmp`: temporary video rendering outputs.
* **Network:** `navex-shared` (external).

### Caddy Reverse Proxy Configuration

The shared Caddy instance routes traffic for the domain to the container:

```caddyfile
chatvid.nomanahmed.io {
    reverse_proxy chatvid-render:4000
}
```

---

## 6. Troubleshooting & Useful Commands

### Live Log Streaming
```bash
ssh debian@167.114.152.92 'docker compose -f /opt/chatvid/docker-compose.yml logs -f'
```

### Hard Restart Container
```bash
ssh debian@167.114.152.92 'cd /opt/chatvid && docker compose restart render'
```

### Check Available Disk & Memory
```bash
ssh debian@167.114.152.92 'docker stats --no-stream && df -h'
```

### Clean Old Docker Build Cache
If disk space runs low on the VPS:
```bash
ssh debian@167.114.152.92 'docker image prune -f'
```
