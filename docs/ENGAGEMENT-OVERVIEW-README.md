# Engagement Overview — NetSuite → PDF / Slack (runbook)

Cómo armar el overview de horas/invoices de un cliente desde NetSuite y entregarlo
como **PDF BPC-branded** o como **texto para Slack**. Este es el mismo flujo que usa
`/api/ms-hours/refresh` en el worker (`worker/worker.js` → `runMsHoursRefresh`).

**Atajos si trabajás con Claude:** `/ns-hours-report <cliente>` genera el PDF + draft
de Slack de una; `/ns-hours-note <cliente>` genera el markdown para una nota del hub.
Este runbook documenta lo que esos skills hacen por dentro.

---

## 1 · Traer los datos (SuiteQL, read-only)

Endpoint: `POST https://<acct>.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql?limit=1000`
con body `{ "q": "<SQL>" }` y header `Prefer: transient` (auth TBA — ver `nsOauthHeader` en worker.js).

### 1a. Cliente y SOWs

```sql
SELECT id, entityid, companyname FROM customer WHERE UPPER(companyname) LIKE UPPER('%<nombre>%');
SELECT id, entityid, companyname AS title FROM job WHERE parent = <customerId>;
```

Tipo de engagement: si las tasks del job tienen `custevent_bpc_prepaid_hours > 0`
es **retainer mensual**; si no, **proyecto fixed-scope**.

### 1b. Horas contratadas vs usadas — SIEMPRE de `projecttask`, nunca sumando timebills

```sql
-- Retainer (una task por mes, título "2026-04 - April")
SELECT pt.id, pt.title, pt.custevent_bpc_prepaid_hours AS prepaid, pt.actualwork
FROM projecttask pt
WHERE pt.project = <jobId>
  AND pt.custevent_bpc_prepaid_hours IS NOT NULL AND pt.custevent_bpc_prepaid_hours > 0
ORDER BY pt.title;

-- Proyecto
SELECT pt.id, pt.title, pt.estimatedwork, pt.actualwork
FROM projecttask pt WHERE pt.project = <jobId> ORDER BY pt.title;
```

- `contracted` = `prepaid` (retainer) o `estimatedwork` (proyecto); `used` = `actualwork` (vivo).
- Label del mes: regex `^(\d{4})-(\d{2})` sobre el título → "April 2026".

### 1c. Time log (`timebill`)

```sql
SELECT t.trandate, e.entityid AS who, t.hours, t.memo
FROM timebill t LEFT JOIN employee e ON e.id = t.employee
WHERE t.customer = <jobId> AND t.memo IS NOT NULL
  AND t.isbillable = 'T'              -- solo retainer; proyecto: sin filtro
  AND t.trandate >= (SYSDATE - 130)   -- retainer 130 días; proyecto 45
ORDER BY t.trandate;
```

- `trandate` viene como string `MM/DD/YYYY` — parsear.
- Descartar filas con horas ≤ 0 o memo vacío tras la limpieza.
- **Limpieza de memos** (es lo que ve el cliente — mismas reglas que `cleanMemo()` en worker.js):
  sacar prefijos internos (`Offline |`, `Internal:`, `Cliente | SOW |`), hashes de commit,
  `"(covering ...)"`; colapsar saltos de línea a `"; "`; "Weekly PM Update…" → texto estándar;
  truncar a 320 chars.

### 1d. Invoices (a nivel customer, no job)

```sql
SELECT t.id, t.tranid, t.trandate, t.status, t.foreigntotal, t.foreignamountunpaid, t.currency
FROM transaction t
WHERE t.type = 'CustInvc' AND t.entity = <customerId>
ORDER BY t.trandate DESC;
```

Gotchas: montos en `foreigntotal`/`foreignamountunpaid`; `status` es código corto
(`A`=Open, `B`=Paid In Full); líneas via `transactionline` con `mainline = 'F'`.

### 1e. Cálculos

- `billableOverage` = Σ por mes de `max(0, used − contracted)` — recalcular siempre, nunca copiar.
- Totales y horas a 2 decimales. Si falta un dato, decirlo — no rellenar con ceros.

---

## 2 · Entregable A — PDF BPC-branded

Plantilla de referencia: [`engagement-hours-report.js`](engagement-hours-report.js)
(Overture SOW3). Para un cliente nuevo:

1. Copiar el script, cambiar `CLIENT` y pegar los datos del paso 1 en `MONTHS`,
   `RATE`, `RETAINER_PAID` y la tabla de timebill.
2. Assets: logo BPC se toma de `desgincode/assets/logo/bpc-logo.png` automáticamente;
   `.circles.b64` / `.hero.b64` opcionales en `clients/<cliente>/`.
3. Correr con Chrome headless en CDP:

```bash
"C:\Program Files\nodejs\node.exe" tools/engagement-hours-report.js   # usa CDP_PORT=9222
```

4. Output: `clients/<cliente>/` → HTML + PDF. QA antes de enviar:
   - Totales del PDF == totales de NetSuite (recalcular, no confiar en el copy-paste).
   - Todo consejo framing "suggested changes" — nunca certezas.
   - Sin memos internos sin limpiar, sin nombres/hashes que no deba ver el cliente.
5. Versión final con fecha → `clients/<cliente>/deliverables/`.

---

## 3 · Entregable B — texto para Slack (sin PDF)

Slack **no renderiza tablas markdown** (`| a | b |` sale como texto plano).
Usar este formato: bold + bullets para el resumen, code block alineado para la tabla.

```
*Acme Corp — Managed Services, horas al 13-jul-2026*

*Resumen*
• Contratadas: *45 hrs* · Consumidas: *60.75 hrs* · Overage facturable: *15.75 hrs*
• Retainer facturado: $10,350.00 (INV19226) — <link a invoice en NS>

*Por mes*
```
Mes           Contratadas   Usadas   Δ
April 2026        15         48.00   +33.00
May 2026          15         10.25   −4.75
June 2026         15          2.50   −12.50
```
*Actividad reciente* (billable, últimos 130 días)
• Apr 3 — BGallo, 1.5h — Invoice review and approval
• Apr 7 — JPerez, 3.0h — Forecast form updates; rule tuning
…(top 8–10 filas; el detalle completo va en el PDF o en el hub)

_Detalle completo: <https://bpccustomerhub.web.app/... |Customer Hub → Hours>_
```

Reglas:
- Links en formato Slack `<url|texto>`, no markdown `[texto](url)`.
- Máximo ~10 filas de timebill; el resto se referencia al hub/PDF.
- Δ negativo = horas a favor; positivo = overage. Marcar el overage total en bold.
- Mismo QA que el PDF: números recalculados, memos limpios, framing "suggested".

---

## 4 · Persistencia en el Customer Hub (opcional)

El snapshot JSON (shape en `runMsHoursRefresh`) se guarda en Firestore
`client_engagement/<envKey>` con `updateMask` sobre `snapshot`/`updatedAt`/`updatedBy`
para no pisar `published`. El refresh en vivo es `POST /api/ms-hours/refresh {envKey}`.
