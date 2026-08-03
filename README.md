# oracle-toolkit — BPC

Todo lo necesario para una entrega EPM en un solo lugar: **NSPB / Oracle Planning** y
**NetSuite ERP**, desde la extracción cruda hasta el PDF con marca BPC.

Antes vivía repartido en `oracle-epm-mcp`, `epm-planning-forge`, `engagement-report-kit`,
`bpc-claude-plugins` y `nspb-migrate-fresh/tools`. Consolidado el 2026-07-31.

> ## 👉 ¿Primera vez? [**docs/GETTING-STARTED.md**](docs/GETTING-STARTED.md)
>
> Instructivo completo de cero a entregable: **cómo pedirle el LCM al cliente**, **cómo se
> crea el token de NetSuite paso a paso**, qué correr y en qué orden, el checklist previo a
> entregar y qué hacer cuando algo falla. No asume contexto previo.
>
> Para entender el diseño y las reglas internas: [`CLAUDE.md`](CLAUDE.md).

---

## Estructura

```
oracle-toolkit/
├── packages/
│   ├── mcp-planning/   MCP de Planning: LCM + REST en vivo, desde Claude
│   ├── forge/          genera dimensiones y forms (era un repo aparte Y una copia dentro del MCP)
│   ├── lcm/            parse-lcm, enrich-kb, sanitize, navflow, audit → tenant-kb.json
│   ├── planning/       operaciones en vivo: auth probe, dataslice load, validaciones
│   ├── analysis/       cube-optimize, level-0, IPM, architecture/optimization report
│   ├── netsuite/       extracción SuiteQL, módulos, conectores, micro-vertical, COA/IS/BS
│   ├── recon/          NetSuite ↔ NSPB (semilla: revenue recon de Talogy)
│   ├── reports/        md/JSON → PDF con el shell BPC (Chrome CDP :9222)
│   └── engagement/     horas de engagement y reporte al cliente
├── skills/             skill guiado epm-assessment + comandos /ns-* de NetSuite
├── assets/             shell de diseño BPC (logo, hero, circles en base64)
├── docs/               playbooks y la bitácora de aprendizajes
└── clients/            datos de cliente — GITIGNORED EN BLOQUE, nunca a un remoto
```

## Empezar

```bash
npm install
node scripts/check-all.js
```

El punto de entrada guiado es `skills/epm-assessment/SKILL.md`: pide lo que falta de a un
paso en vez de exigir todo al principio, y usa la carpeta del cliente como estado.

---

## Ruta NSPB — arranca con el LCM export

```bash
CLIENT=<c> GEMINI_API_KEY=... node packages/lcm/parse-lcm.js
```

```bash
CLIENT=<c> node packages/analysis/architecture-report.js
```

Para el Optimization Review hacen falta además un export nivel-0 por cubo y el Activity
Report; después `packages/analysis/cube-optimize.js`.

## Ruta NetSuite — arranca con un token TBA del cliente

La receta para crear la integración, el token y el rol está en
[`docs/NS-ERP-README.md`](docs/NS-ERP-README.md) §3.

```bash
CLIENT=<c> node packages/netsuite/netsuite-export.js
```

```bash
CLIENT=<c> node packages/netsuite/ns-erp-assess.js
```

```bash
CLIENT=<c> node packages/netsuite/ns-connector-map.js
```

```bash
CLIENT=<c> node packages/netsuite/ns-vertical.js
```

```bash
CLIENT=<c> node packages/netsuite/ns-financials.js
```

```bash
CLIENT=<c> CLIENT_NAME=<Nombre> node packages/reports/netsuite-abr-full.js
```

Consultas ad-hoc y probe de tablas: `packages/netsuite/ns-sql.js`.

> Corré `ns-connector-map.js` **temprano**. Es lo que evita proponer algo que el cliente ya
> compró: si aparece FloQast o BlackLine el caso de conciliación cambia; si aparece el bundle
> `NSPBCS_`, Planning no es un upsell sino un problema de adopción.

### Qué produce cada script

| script | salida |
| --- | --- |
| `netsuite/netsuite-export.js` | `netsuite/{probe,shape,metadata,fields}.json` — la extracción cruda |
| `netsuite/ns-erp-assess.js` | `erp/modules.json` — 37 módulos en 5 estados |
| `netsuite/ns-connector-map.js` | `erp/CONNECTORS.md` — bundles, integraciones, prefijos |
| `netsuite/ns-vertical.js` | `erp/vertical.json` — micro-vertical + benchmark del nicho |
| `netsuite/ns-financials.js` | `erp/FINANCIALS.md` — COA, IS y BS para el mapeo a Planning |
| `netsuite/netsuite-assessment-report.js` | `netsuite/ASSESSMENT.md` — encaje de producto |
| `reports/netsuite-abr-full.js` | ⭐ **el entregable grande**: ABR + recomendaciones de BPC |
| `reports/netsuite-abr-pdf.js` | ABR corto, solo negocio |
| `reports/nspb-integration-pdf.js` | discovery técnico para el equipo de Planning |

Los generadores de PDF necesitan Chrome con `--remote-debugging-port=9222` y leen el shell
de `assets/`.

---

## Antes de tocar el pipeline de NetSuite

Leé **[`docs/NETSUITE-DISCOVERY-LEARNINGS.md`](docs/NETSUITE-DISCOVERY-LEARNINGS.md)**: qué
tablas existen y cuáles no, las trampas de datos, y cuatro cosas que dábamos por ciertas y
resultaron falsas.

---

## Reglas

1. **Los datos de cliente nunca salen de `clients/`**, ignorada en bloque con regla negativa.
   No es paranoia: son exports completos de sistemas financieros reales.
2. **Credenciales en `.env`**, las pega el usuario, se rotan al terminar el assessment.
3. **Una ausencia no es una ausencia**: SuiteQL solo expone lo que la feature habilita *y* el
   rol permite. Se reporta `unknown`, nunca `absent`.
4. **Todo entregable va en inglés**; código, comentarios y estos README en español.
5. **Todo lo prescriptivo va como "suggested change"** a validar con el cliente.
6. **Sin números inventados.** Si no se extrajo, se dice "no extraído".

## Convenciones

CJS y ESM conviven **por paquete**: `mcp-planning` y `forge` son ESM (`"type": "module"`), el
resto CJS heredado de `tools/`. `check-all.js` valida cada archivo con el parser que le toca;
no unificar a la fuerza.

## Lo que quedó afuera a propósito

`nspb-migrate-fresh` (worker + add-in + docs-site: producto desplegado, no toolkit),
`nspbhub` (Customer Hub), `SourceWise`, `foundry` y `GSAAssistant` (SOW/change orders, otro
dominio). Se consolidó el tooling de entrega, no todo lo que había en `C:\apps`.
