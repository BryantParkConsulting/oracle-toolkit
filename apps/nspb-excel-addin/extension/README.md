# NSPB AI — Extensión (Edge/Chrome) · v0.1

Side-panel con el chat NSPB que **maneja la consola real de Planning**: abrí
forms, variables, reglas, jobs, audit, dimensiones, etc. **desde el chat** — la
extensión navega la consola por vos, **explica qué es** cada parte y **hace
recomendaciones**. El cerebro AI (Worker) responde; la consola pone las manos.

## Cómo funciona la navegación
Oracle JET solo navega con **clicks reales (trusted)** — los clicks sintéticos
de un content script no funcionan. Por eso la extensión usa el permiso
**`chrome.debugger`** para mandar clicks trusted (igual que harías a mano).
- **Forms** → ruta `cluster → card → grupo → tab` (de `kb.navIndex`).
- **Variables/Rules/Audit/Jobs/…** → abre el **Navigator (☰)** y clickea el ítem.

> ⚠️ La primera vez que la extensión maneja la consola, el navegador muestra
> un cartel **"…está depurando este navegador"**. Es normal — es la extensión
> clickeando por vos. (Para uso interno es tolerable.)

## Cargar / actualizar (modo developer)
1. `edge://extensions/` → **Modo de desarrollador** ON.
2. **Cargar desempaquetada** → carpeta `C:\apps\nspb-migrate-fresh\extension`.
3. Al recargar, Edge va a pedir aceptar el **nuevo permiso "debugger"** → aceptá.
4. Clic en el ícono **NSPB AI** → se abre el side panel.

## Setup (⚙)
- **Planning URL** → `https://nspb-squarespace.epm.us-ashburn-1.ocs.oraclecloud.com`
- **Tenant KB** → `clients/squarespace/tenant-kb.json` (el que tiene `navIndex`)
- **Usuario/Password** → opcionales (solo para tools REST del chat)
- **AI API key** → opcional (si no, usa la compartida)

## Comandos
**Abrir cosas en la consola real** (la extensión navega + explica + recomienda):
- `open form <nombre>` — abre el form (cluster → card → grupo → tab)
- `open variables` / `variables` — panel de Variables
- `open rules` / `analyze rules` — reglas de cálculo
- `open jobs` · `open dimensions` · `open audit` · `open data exchange`
  `open valid intersections` · `open smart lists` · `open currency`
  `open forms` · `open settings` · `open approvals` · `open migration` · …
- `open console` — solo abre/enfoca la pestaña de Planning

**Chat AI** (KB-backed, vía Worker): `explain <regla>`, preguntas, etc.
**Utilidad**: `?` (lista) · `debug` / `debug last` · `reset`

## Archivos
```
extension/
├── manifest.json    MV3 — permisos (incl. debugger), side panel
├── background.js    motor de navegación trusted-click (chrome.debugger)
├── navmap.js        catálogo de destinos del Navigator (desc + recomendaciones)
├── sidepanel.html   UI: settings + chat
├── sidepanel.css    estilos (incl. chips clickeables)
├── sidepanel.js     chat ↔ Worker, ruteo de comandos, explicaciones
└── README.md        este archivo
```

## Estado
- ✅ Chat ↔ Worker (KB-backed)
- ✅ Abrir **forms** en la consola (clicks trusted, ruta completa)
- ✅ Abrir **~29 destinos del Navigator** (variables, rules, jobs, audit, …) + explicación + recomendación
- ✅ Chips clickeables, modo debug, import KB, AI key opcional
- ⏳ Recomendaciones *en vivo* (hoy son del catálogo; el siguiente paso es que el
  Worker analice el panel abierto y recomiende sobre datos reales)
