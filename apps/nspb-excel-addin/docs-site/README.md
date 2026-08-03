# NSPB MCP — docs site

Public-facing documentation + pitch deck for **NSPB MCP Assistant**.
Hosted at **https://nspbmcp.web.app** via Firebase Hosting.

**© 2026 Bruno Gallo. All rights reserved.**

## Stack

- React 19 + TypeScript + Vite
- Markdown content under `public/help/` rendered by `ContentArea.tsx`
- Firebase Hosting only (no Functions, no Auth, no Firestore)

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
```

## Deploy

```bash
npm run build        # → dist/
firebase deploy --only hosting
```

Requires being logged in via `firebase login` with the project owner
account (currently `gallobruno@gmail.com`, project `nspbmcp`).

## Update content

- Help docs:    `public/help/*.md`  (rendered as MD in the panel)
- Pitch deck:   `public/pitch/*.html`
- Sidebar nav:  `src/components/Sidebar.tsx`
- Login gate:   `src/components/Login.tsx`  (demoadmin / demoadmin by default)
