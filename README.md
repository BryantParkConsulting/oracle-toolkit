# EPM Toolkit — BPC

Todo lo necesario para una entrega EPM en un solo lugar: **NSPB / Oracle Planning** y
**NetSuite ERP**, desde la extracción cruda hasta el PDF con marca BPC.

Antes vivía repartido en `oracle-epm-mcp`, `epm-planning-forge`, `engagement-report-kit`,
`bpc-claude-plugins` y `nspb-migrate-fresh/tools`. Consolidado el 2026-07-31.

---

## Estructura

```
epm-toolkit/
├── packages/
│   ├── mcp-planning/   MCP de Planning: LCM + REST en vivo, desde Claude
│   ├── forge/          genera dimensiones y forms (era un repo aparte Y una copia adentro del MCP)
│   ├── lcm/            parse-lcm, enrich-kb, sanitize, navflow, audit → tenant-kb.json
│   ├── planning/       operaciones en vivo: auth probe, dataslice load, validaciones
│   ├── analysis/       cube-optimize, level-0, IPM, architecture/optimization report
│   ├── netsuite/       export SuiteQL/TBA, assess de módulos, mapa de conectores
│   ├── recon/          NetSuite ↔ NSPB (semilla: revenue recon de Talogy)
│   ├── reports/        md → PDF con el shell BPC (Chrome CDP :9222)
│   └── engagement/     horas de engagement y reporte al cliente
├── skills/             skill guiado epm-assessment + comandos /ns-* de NetSuite
├── assets/             shell de diseño BPC (logo, hero, circles en base64)
├── docs/               playbooks: cube optimization, NS-ERP, runbook de datos, specs
└── clients/            datos de cliente — GITIGNORED EN BLOQUE, nunca a un remoto
```

## Empezar

```bash
npm install
node scripts/check-all.js     # sintaxis de todo el toolkit
```

El punto de entrada real es el **skill**: `skills/epm-assessment/SKILL.md`. Va pidiendo lo
que falta de a un paso (token de NetSuite, LCM, level-0) en vez de exigir todo al principio,
y usa la carpeta del cliente como estado.

## Las dos rutas

**NSPB** — arranca con el LCM export y nada más:

```bash
CLIENT=<c> GEMINI_API_KEY=... node packages/lcm/parse-lcm.js
CLIENT=<c> node packages/analysis/architecture-report.js
```

**NetSuite** — arranca con un token TBA de la cuenta del cliente (receta en
`docs/NS-ERP-README.md` §3):

```bash
CLIENT=<c> node packages/netsuite/netsuite-export.js
CLIENT=<c> node packages/netsuite/ns-erp-assess.js
CLIENT=<c> node packages/netsuite/ns-connector-map.js
```

> Corré `ns-connector-map.js` **temprano**. Es lo que evita proponer algo que el cliente ya
> compró: si aparece FloQast o BlackLine el caso de NSAR cambia; si aparece el bundle
> `NSPBCS_`, NSPB no es un upsell sino un problema de adopción.

## Reglas

1. **Los datos de cliente nunca salen de `clients/`**, ignorada en bloque con regla negativa.
   No es paranoia: son exports completos de sistemas financieros reales.
2. **Credenciales en `.env`**, las pega el usuario, se rotan al terminar el assessment.
3. **Una ausencia no es una ausencia**: SuiteQL solo expone lo que la feature habilita *y*
   el rol permite. Se reporta `unknown`, nunca `absent`.
4. **Todo lo prescriptivo va como "suggested changes"** a validar con el cliente.
5. **Sin números inventados.** Si no se extrajo, se dice "no extraído".

## Convenciones

CJS y ESM conviven **por paquete**: `mcp-planning` y `forge` son ESM (`"type": "module"`),
el resto es CJS heredado de `tools/`. `check-all.js` valida cada archivo con el parser que
le toca; no unificar a la fuerza.

Los generadores de PDF necesitan **Chrome con debug abierto en `:9222`** y leen el shell de
`assets/`.

## Lo que quedó afuera a propósito

`nspb-migrate-fresh` (worker + add-in + docs-site: es un producto desplegado, no un toolkit),
`nspbhub` (Customer Hub), `SourceWise`, `foundry` y `GSAAssistant` (SOW/change orders, otro
dominio). Se consolidó el tooling de entrega, no todo lo que había en `C:\apps`.
