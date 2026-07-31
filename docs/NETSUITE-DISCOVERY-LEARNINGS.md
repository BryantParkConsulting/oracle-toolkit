# NetSuite discovery — lo aprendido en campo

Bitácora técnica de lo que se descubrió construyendo el pipeline de discovery contra una
cuenta de producción real (~345K transacciones, 1.95M líneas, OneWorld, 2018→hoy).

Todo acá está **verificado contra la cuenta**, no inferido de documentación. Donde algo se
creyó y resultó falso, queda anotado como corrección: repetir el error es más caro que leerlo.

> Complementa `NS-ERP-README.md` (el playbook: qué pedir, cómo correr, QA pre-entrega).
> Esto es el "por qué" y las trampas.

---

## 1. La regla que gobierna todo: una ausencia es ambigua

SuiteQL solo expone un record type si **la feature está habilitada Y el rol tiene permiso**.
`Record 'x' was not found` no distingue las dos cosas.

Por eso el pipeline usa un **quinto estado, `unknown`**, además de los cuatro del catálogo
(`active/partial/dormant/absent`). Reportar `absent` sobre algo que no se puede ver es la
forma más rápida de que te desarmen el informe en la reunión.

**El rol importa más que las credenciales.** El MCP de NetSuite de BPC corre con un rol
restringido: contra su propia cuenta no veía `subsidiary`, `department`, `location`,
`accountingbook` ni `role`. Con un token propio de rol amplio, todas responden. Si el rol es
angosto, el informe reporta módulos ausentes que en realidad existen.

---

## 2. Correcciones — cosas que creímos y eran falsas

### ❌ "Los workflows no se exponen en SuiteQL"
**Falso.** La tabla `workflow` existe y responde (26 en la cuenta de prueba). Estuvo mal
documentado en el playbook y clasificaba SuiteFlow como `unknown` sin necesidad.

### ❌ "Sin transacciones Expense Report ⇒ no se puede saber"
**Falso, y la distinción vale oro.** La tabla `expensereport` existe: si responde, la feature
está prendida. Cero filas es **uso nulo medido** (`dormant`), no ausencia de dato (`unknown`).
Lo mismo con `opportunity`. Distinguir "lo tienen prendido y no lo usan" de "no sabemos" es
la diferencia entre un hallazgo y un hueco.

### ❌ "FAM = Fixed Assets"
**Depende de la industria.** En eventos y turismo, *FAM* es **familiarization trip**. La
cuenta analizada tenía ítems `FAM & Passthrough` que no tenían nada que ver con activos fijos.
Mismo problema con "Program": software en un nicho, evento en otro.

### ❌ "El cliente factura ~$200M y opera a break-even"
**Impreciso.** Salía de mirar un solo año. Con el P&L por año completo el resultado **oscila
fuerte**: −$17.8M (2021), +$3.6M, −$9.2M, −$6.5M, +$0.7M (2025). Nunca concluir tendencia
desde un corte.

**Cómo bajar los `unknown`:** el primer barrido dejó 10; probando tablas candidatas
(`workflow`, `expensereport`, `opportunity`, `allocationschedule`, `website`,
`amortizationschedule`, `statisticalschedule`) bajaron a **5**. El probe es barato — vale
iterar antes de rendirse y mandar a SDF.

---

## 3. Trampas de datos

### Los módulos transaccionales no son tablas
AR, AP, journals, opportunities son valores de `transaction.type`. El uso real sale de
`GROUP BY BUILTIN.DF(t.type), año`, no de probar tablas.

### Ceros que no significan "sin uso"
`loginaudit`, `systemnote`, `deletedrecord`, `transactionhistory` dependen de retención y
permisos. Curiosidad: `COUNT(*) FROM loginaudit` devolvió 0 mientras que el mismo dato
agregado por mes devolvió 98 filas. Excluirlas del cálculo de uso.

### `customfield` mezcla dos cosas
`fieldtype = 'SCRIPT'` son **parámetros de script**, no campos de datos. En la cuenta de
prueba eran 349 de 3.187: contarlos infla la deuda de customización un 12%.

### `isstored = 'F'` no es columna
Los campos de fórmula no se pueden consultar. Sin filtrarlos, **284 de 445 mediciones** de
fill-rate rebotan a consulta individual — lento y con cobertura falsa.

### Un `custentity_` vive en cuatro tablas a la vez
Existe en `customer`, `vendor`, `employee` y `job` simultáneamente. Que esté vacío en uno
**no lo hace muerto**: puede no aplicar ahí. El único número defendible es el campo vacío en
**todas** las tablas donde se midió.

### Los schedules proyectan al futuro
Revenue y amortización generan asientos con fecha futura — la cuenta analizada llegaba a
**2035**. Filtrar los años sin movimiento real o el P&L sale con columnas vacías.

### Signos del GL
NetSuite guarda Income y pasivos como **crédito (negativo)**. Para presentar un P&L hay que
invertirlos. Es el error más común al reconstruir estados desde el GL.

---

## 4. Cómo se identifica lo que no está en ningún listado

### SuiteApps: por prefijo, y con nombre autoritativo
Cada SuiteApp namespacea sus objetos. El histograma de prefijos sobre custom fields + custom
records + scripts da la huella; **`bundleinstallationscript` le pone el nombre real**.

Sin esa tabla, `laa` es un prefijo opaco con 1.217 objetos. Con ella, es **NetLease** — y
resulta ser la SuiteApp más pesada de la cuenta.

Prefijos vistos: `NSPBCS_` (connector NSPB), `ncfar_`/`fam_`/`altdepr_` (FAM), `CELIGO_`,
`APM_`/`NSAPM_`, `EP_` (Electronic Payments), `SFDC_`, `LAA_` (NetLease).

### Integraciones: `oauthtoken`
Es donde aparece lo que **no instala bundle** — y suele ser lo más relevante
comercialmente. En la cuenta analizada reveló **FloQast** (cierre y conciliación), **Ramp**,
**Concur** y **Celigo Salesforce**. Ir a proponer conciliación de cuentas sin saber que ya
tienen FloQast desde 2021 es un papelón evitable.

También muestra la **línea de tiempo**: `PBCS Token` (2019) → `PBCS Integration` (2021) →
`NSPB Integration` (2023), con los viejos revocados. Se lee la historia de migración.

⚠ `oauthtoken` cubre **solo TBA**. OAuth 2.0, SOAP con credenciales de usuario y
SuiteAnalytics Connect no aparecen: el ecosistema puede ser más grande de lo que muestra.

⚠ Los tokens llevan **nombre de persona** (`"AppLink - Dan Ambrose, Administrator"`). Agregar
por aplicación antes de que llegue a un entregable.

### Micro-vertical: por vocabulario
"Servicios profesionales" no sirve para recomendar nada — una agencia de eventos y una
consultora de software caen ahí y necesitan cosas opuestas.

La señal más fuerte son **los nombres de los ítems**: es literalmente a qué le factura la
empresa. En la cuenta analizada: *Audio Visual, Décor/Scenic, Set/Strike, Dine Around,
Gratuities, Production Support* → agencia de eventos / DMC, sin ambigüedad. Después pesan
tipos de transacción, custom records propios y nombres de cuentas.

---

## 5. Lo que SuiteQL no puede ver

Va declarado en cada entregable, no se estima:

- **Enable Features** completo → SDF o la pantalla
- **Definiciones** de saved search y reportes de Report Builder
- **ARCS** (Account Reconciliation): app aparte, sin rastro
- **SuiteAnalytics Connect / Workbook**: licencia y ODBC
- **Approval routing** nativo
- **Demand planning** sin inventario
- **El dolor de cierre**: cuánto tarda, cuántas conciliaciones viven en Excel
- **El lado NSPB**: sin LCM de Planning no se puede evaluar la implementación existente

---

## 6. Consultas que rinden

```sql
-- Módulos transaccionales reales, por año
SELECT BUILTIN.DF(t.type) AS tipo, TO_CHAR(t.trandate,'YYYY') AS anio, COUNT(*) AS n
FROM transaction t GROUP BY BUILTIN.DF(t.type), TO_CHAR(t.trandate,'YYYY')

-- P&L desde el GL (ojo con el signo de Income)
SELECT TO_CHAR(t.trandate,'YYYY') AS anio, a.accttype, ROUND(SUM(tal.amount)) AS monto
FROM transactionaccountingline tal
JOIN transaction t ON t.id = tal.transaction
JOIN account a ON a.id = tal.account
WHERE tal.posting = 'T' GROUP BY TO_CHAR(t.trandate,'YYYY'), a.accttype

-- Cuentas sin un solo asiento (candidatas a excluir del mapeo a Planning)
SELECT a.id, a.acctnumber, a.acctname FROM account a
WHERE NOT EXISTS (SELECT 1 FROM transactionaccountingline tal WHERE tal.account = a.id)

-- Nombre real de cada bundle instalado
SELECT name, scriptid FROM bundleinstallationscript ORDER BY name

-- Ecosistema conectado (agregar por app antes de publicar)
SELECT tba_token_name, dcreated, binactive, brevoked FROM oauthtoken ORDER BY dcreated
```

**Tablas confirmadas que responden** y no son obvias: `bundleinstallationscript`,
`oauthtoken`, `workflow`, `allocationschedule`, `amortizationschedule`, `statisticalschedule`,
`expensereport`, `opportunity`, `website`, `customfield`, `customrecordtype`, `customlist`,
`subsidiarysettings`, `billingschedule`, `scheduledscriptinstance`, `deletedrecord`.

**Confirmadas que NO existen:** `installedbundle`, `bundle`, `integration`,
`integrationapplication`, `dataset`, `workbook`, `approvalrule`, `revrecschedule`,
`tokenauthentication`, `suiteapp`.

---

## 7. Para la integración con NSPB

De la estructura del COA salen las decisiones de la dimensión Account:

- Se mapean las **hojas**, no el total. En la cuenta analizada: 410 hojas de 445 cuentas.
  Los 35 rollups los reconstruye la jerarquía de Planning.
- Las **hojas sin movimiento** (127 de 410) son candidatas a excluir: arrastrarlas infla la
  dimensión sin aportar dato.
- La **profundidad del árbol** (3 niveles acá) es el mínimo que Planning necesita para
  reproducir el rollup nativo.
- Las cuentas **Statistical** se mapean pero no cargan moneda: definir el tratamiento antes.

Y una señal de negocio que vale más que todo lo técnico: si aparece el bundle `NSPBCS_`
**junto con** carga de budget nativo, hay dos fuentes de verdad para el mismo presupuesto.
No es una oportunidad de venta nueva — es un problema de adopción de algo que el cliente ya
paga, y es la conversación de mayor valor del assessment.

---

## 8. Operación

- **Serializar.** SuiteQL REST tiene límite de concurrencia por integración; el pipeline va
  secuencial con pausas cortas a propósito.
- **Nunca dumpear detalle.** Todo agregado server-side. `transactionline` tiene 1.95M filas.
- **PII fuera.** Customers, employees y contacts no van a una KB ni a un entregable: contar
  y agregar, nunca copiar.
- **Rotar credenciales** al terminar el assessment. Son de la producción del cliente.
