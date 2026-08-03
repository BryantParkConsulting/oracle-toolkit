# Getting started — de cero a un entregable

Guía para alguien que acaba de clonar el repo y nunca corrió esto. No asume contexto previo.

Hay **dos rutas independientes**. Podés correr una, la otra, o las dos:

| ruta | qué necesitás pedirle al cliente | qué produce |
| --- | --- | --- |
| **A. NSPB / Planning** | un LCM export (un zip) | KB del entorno, current state, optimization review |
| **B. NetSuite ERP** | un token de integración | inventario de módulos, mapa de conectores, ABR con recomendaciones |

---

## 0. Requisitos

```bash
node --version    # 20 o superior
```

```bash
npm install
```

```bash
node scripts/check-all.js
```

Para generar PDFs hace falta además **Chrome o Edge**, y para la ruta A una **API key de
Gemini** (el parser la usa para resumir reglas y forms).

---

# Ruta A — NSPB / Planning

## A1. Conseguir el LCM export

Es lo único que necesitás, y **lo saca el cliente en dos minutos** desde su entorno de
Planning. Pedíselo así:

> En NSPB, entrá a **Application → Migration → Snapshot**. Vas a ver un snapshot llamado
> `Artifact Snapshot` con la fecha del último backup nocturno. Tocá el ícono de descarga y
> mandanos el `.zip`.

No hace falta que corra nada ni que nos den acceso: el snapshot ya existe, se genera solo
todas las noches.

**Qué contiene:** la definición completa de la aplicación — dimensiones, forms, business
rules, variables de sustitución, dashboards, reportes financieros, configuración de FDMEE y
la navegación. **No contiene datos**, solo metadata. Eso hace que sea fácil de conseguir:
no hay información financiera adentro.

> Si el cliente pregunta por qué no alcanza con una captura de pantalla: el snapshot es lo que
> permite analizar el entorno completo de forma consistente y reproducible, en lugar de
> revisar pantalla por pantalla.

## A2. Descomprimirlo y parsear

Descomprimí el zip en `lcm-export/` (o donde quieras y pasá `LCM_ROOT`).

```bash
CLIENT=<cliente> GEMINI_API_KEY=<tu-key> node packages/lcm/parse-lcm.js
```

Genera `clients/<cliente>/tenant-kb.json`: forms, rules, variables, dimensiones, dashboards,
FRs, FDMEE y navegación, con un resumen generado por IA para cada objeto.

## A3. Los informes

```bash
CLIENT=<cliente> node packages/analysis/architecture-report.js
```

Para el **Optimization Review** hacen falta dos insumos más, que también los saca el cliente:

- **Export nivel-0 de cada cubo** — Application → Overview → Actions → *Export Data*, eligiendo
  Level 0. Es un zip por cubo.
- **Activity Report** — Application → Jobs → *Daily Maintenance*, o desde Access Control →
  Activity Report. Es el que dice qué se usa de verdad.

```bash
CLIENT=<cliente> node packages/analysis/parse-level0.js
```

```bash
CLIENT=<cliente> node packages/analysis/cube-optimize.js
```

> Antes de escribir el informe, leé `docs/CUBE-OPTIMIZATION-README.md` — tiene las reglas de
> interpretación de Essbase y el checklist de QA previo a la entrega.

---

# Ruta B — NetSuite ERP

## B1. Conseguir el token

Esto **no lo podés hacer vos**: lo tiene que crear alguien con rol de Administrator en la
cuenta del cliente. Mandale estos cuatro pasos tal cual.

### Paso 1 — Habilitar las features

**Setup → Company → Enable Features → SuiteCloud**. Tienen que estar tildadas:

- `REST WEB SERVICES`
- `TOKEN-BASED AUTHENTICATION`

### Paso 2 — Crear la integración

**Setup → Integration → Manage Integrations → New**

| campo | valor |
| --- | --- |
| Name | `BPC Discovery — read-only export` |
| State | Enabled |
| **Token-Based Authentication** | ✅ **tildar** |
| TBA: issuetoken Endpoint | dejar sin tildar |
| TBA: Authorization Flow | dejar sin tildar |
| Todo el bloque OAuth 2.0 | dejar sin tildar |
| User Credentials | dejar sin tildar |

Al guardar, NetSuite muestra el **Consumer Key** y el **Consumer Secret**. ⚠️ **Se muestran
una sola vez.** Si se cierra la pantalla sin copiarlos hay que resetear las credenciales.

### Paso 3 — Crear un rol read-only

Este paso es el que más incide en el resultado. **Un rol angosto produce falsos "el cliente no
tiene ese módulo"**, porque SuiteQL no distingue entre una feature apagada y una que el rol no
puede ver.

**Setup → Users/Roles → Manage Roles → New**, nombre `BPC Discovery (Read Only)`:

- Setup → **REST Web Services** — Full
- Setup → **Log in using Access Tokens** — Full
- Setup → **SuiteAnalytics Workbook** — Edit
- Todo lo demás en **View**, lo más ancho posible: Transactions, Lists, Reports, Setup
- **Sin restricción por subsidiary, department o class**

### Paso 4 — Emitir el token

**Setup → Users/Roles → Access Tokens → New**: elegir la integración del paso 2, un usuario y
el rol del paso 3. Al guardar aparecen el **Token ID** y el **Token Secret**, también una
sola vez.

### Paso 5 — Guardarlos

Creá un archivo `.env` en la raíz del repo (está gitignored, nunca se sube):

```
NS_ACCOUNT=1234567
NS_CONSUMER_KEY=...
NS_CONSUMER_SECRET=...
NS_TOKEN_ID=...
NS_TOKEN_SECRET=...
GEMINI_API_KEY=...
```

`NS_ACCOUNT` es el número que aparece en la URL de NetSuite del cliente
(`https://1234567.app.netsuite.com`). Si es un sandbox va con sufijo: `1234567_SB1`.

> **Pediles que los peguen ellos en el archivo.** Que no te los manden por chat, mail ni
> Slack: quedan registrados. Y **rotá las credenciales cuando termine el assessment** — son
> de la producción del cliente.

Probá que funcione:

```bash
node packages/netsuite/ns-sql.js "SELECT COUNT(*) AS n FROM account"
```

## B2. Extraer

```bash
CLIENT=<cliente> node packages/netsuite/netsuite-export.js
```

Cinco fases, unos 10-15 minutos en una cuenta grande. Todo agregado del lado del servidor:
**nunca se descargan filas de detalle**.

| fase | qué hace |
| --- | --- |
| `probe` | prueba ~95 tablas: ¿responde? ¿cuántas filas? ¿última actividad? |
| `shape` | volumetría y breakdowns por tipo de transacción, cuenta, ítem |
| `metadata` | diccionario de campos vía REST metadata-catalog |
| `fields` | fill-rate por custom field — cuáles nunca se poblaron |
| `financials` | COA, balances, P&L, estacionalidad, costos y clientes |

Se puede correr una sola: `--phase=probe`.

## B3. Analizar

```bash
CLIENT=<cliente> node packages/netsuite/ns-erp-assess.js
```

```bash
CLIENT=<cliente> node packages/netsuite/ns-connector-map.js
```

```bash
CLIENT=<cliente> node packages/netsuite/ns-vertical.js
```

```bash
CLIENT=<cliente> node packages/netsuite/ns-financials.js
```

> **Mirá el mapa de conectores antes que nada.** Es lo que evita proponer algo que el cliente
> ya compró: si aparece FloQast o BlackLine el caso de conciliación cambia por completo, y si
> aparece el bundle `NSPBCS_` significa que ya tienen Planning y el trabajo es de adopción,
> no de venta.

## B4. El entregable

Levantá Chrome con debug abierto (los PDFs se renderizan por ahí):

```bash
chrome.exe --headless=new --remote-debugging-port=9222 --user-data-dir=%TEMP%\cdp about:blank
```

```bash
CLIENT=<cliente> CLIENT_NAME=<Nombre> node packages/reports/netsuite-abr-full.js
```

Sale en `clients/<cliente>/<cliente>-netsuite-abr-full.pdf`: ABR completo con marca BPC,
recomendaciones fundadas en la evidencia y una sección de qué no pudimos ver.

Hay dos versiones cortas por si las necesitás sueltas: `netsuite-abr-pdf.js` (solo negocio) y
`nspb-integration-pdf.js` (técnico, para el equipo de Planning).

---

## Antes de entregar

- [ ] Ningún módulo marcado `absent` sin evidencia — la ausencia en SuiteQL es ambigua y va
      como `unknown`.
- [ ] Todo lo prescriptivo redactado como sugerencia a validar, nunca como certeza.
- [ ] El PDF **en inglés**, con números en formato `en-US`.
- [ ] Sin lenguaje comercial interno en el documento del cliente.
- [ ] Ventana de telemetría declarada en la portada.
- [ ] Credenciales rotadas.

## Si algo falla

| síntoma | causa habitual |
| --- | --- |
| `401` en cualquier consulta | credenciales mal copiadas, o se resetearon después de emitir el token |
| `403` | al rol le falta `REST Web Services` o `Log in using Access Tokens` |
| muchos módulos en `unknown` | el rol es demasiado angosto — volvé al paso 3 |
| `CDP no responde en :9222` | falta levantar el Chrome con debug |
| el PDF sale con secciones vacías | falta correr alguna fase; las secciones son condicionales a propósito |

Las trampas de datos (signos del GL, campos de fórmula, tablas que existen y cuáles no) están
en [`NETSUITE-DISCOVERY-LEARNINGS.md`](NETSUITE-DISCOVERY-LEARNINGS.md). Leelo antes de
interpretar cualquier número.
