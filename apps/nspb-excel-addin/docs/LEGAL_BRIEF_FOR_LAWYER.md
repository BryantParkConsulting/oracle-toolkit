# Resumen legal — NSPB MCP Assistant

**Para:** abogado/a especialista en SaaS / propiedad intelectual
**De:** Bruno Gallo
**Fecha:** Mayo 2026
**Tiempo estimado de lectura:** 5 min

---

## 1. Qué es el producto

**NSPB MCP Assistant** es un add-in de Excel que conecta a Oracle NSPB
(Netsuite Planning & Budgeting, anteriormente Hyperion Planning Cloud)
y agrega una capa de IA (Google Gemini + Anthropic Claude) que:

- Lee y escribe datos en el tenant Oracle del cliente
- Genera reportes de cierre mensual, análisis de variance, etc.
- Explica al usuario qué hacen las reglas y formularios de su tenant
- Está pensado para venderse como SaaS, $X/mes por cliente

El producto NO almacena la data del cliente — la procesa en tránsito vía
un worker en Cloudflare. La cuenta Oracle del cliente la usa **el cliente
mismo** con sus credenciales.

---

## 2. La pregunta concreta

**¿Es legalmente seguro vender comercialmente este producto, dado que
parte de las llamadas al API de Oracle usa endpoints que NO están
formalmente documentados como públicos?**

---

## 3. Detalle técnico (importante para la respuesta)

Oracle EPM Cloud expone HTTP endpoints en 3 categorías. Mi producto las
usa así (porcentajes aproximados del tráfico):

| Categoría | % de uso | Status |
|---|---|---|
| **REST API público documentado** (Oracle publica reference) | ~75% | Sin duda permitido — uso estándar |
| **SmartView XML protocol** (el mismo que usa el Smart View Excel add-in de Oracle) | ~15% | No documentado como API pública, pero todo el ecosistema third-party lo usa |
| **Endpoints internos** del web UI (`/aif/ui/model/...`, `efsvbuirest`, `HspFormRuntimeServlet`) | ~10% | No documentados. Subject to change without notice. |

(Documento técnico completo con cada endpoint disponible si querés: `docs/API_AUDIT.md`.)

---

## 4. Mi posición y los precedentes que creo aplican

### Argumentos a favor de que es legal:

1. **Google v. Oracle (Suprema Corte EEUU, 2021)** — establece que usar
   APIs ajenas para interoperabilidad es **fair use**. (Y nosotros sólo
   **llamamos** APIs, ni siquiera las re-implementamos.)

2. **Sega v. Accolade (9th Cir., 1992)** y **Sony v. Connectix (9th Cir.,
   2000)** — reverse engineering de protocolos para fines de
   interoperabilidad es lícito.

3. **hiQ Labs v. LinkedIn (9th Cir., 2019/2022)** — la CFAA (Computer
   Fraud and Abuse Act) no aplica si el usuario está autenticado y la
   información es accesible mediante sus propias credenciales.

4. **El cliente tiene su contrato con Oracle**, no nosotros. Las llamadas
   ocurren con las credenciales del cliente, no con un "scrape" o un
   bypass. Es lo mismo que el cliente haría manualmente vía el browser.

5. **Práctica industry-standard.** Equilibrium, OneStream, Datrose,
   Wishbone Analytics, Pigment, todas las consultoras NSPB con macros
   VBA, etc., usan exactamente este mix de APIs documentadas + Smart
   View XML. Oracle no ha demandado a ninguno.

### Argumentos en contra / riesgos:

1. **Oracle Cloud Terms of Service** del cliente puede tener cláusulas
   tipo "no scraping", "no automatización no autorizada", "no reverse
   engineering for competitive purposes". Si Oracle interpreta nuestro
   producto como uno de estos, puede suspender el tenant del cliente.

2. **Posible cause-of-action por inducción a violación de contrato:**
   si nuestro producto causa que el cliente viole su TOS con Oracle,
   teóricamente Oracle podría reclamarnos a nosotros por tortious
   interference.

3. **Trade secret claim débil** — los endpoints viajan en HTTPS visible
   en el browser del usuario autenticado, pero Oracle podría
   argumentar que ciertos endpoints internos son trade secret.

4. **CFAA en EEUU / Ley 26.388 en Argentina** — bajo interpretaciones
   amplias, "acceder a un sistema más allá de lo autorizado" puede
   incluir endpoints no documentados. Aunque jurisprudencia más reciente
   (hiQ Labs) lo ha acotado, no está cerrado del todo.

---

## 5. Preguntas concretas para vos (abogado/a)

1. **¿En qué jurisdicción aplica el contrato Oracle Cloud del cliente típico?**
   ¿California, Delaware, Argentina, otra? El análisis cambia.

2. **¿Conviene firmar con el cliente un Terms of Service que diga
   "el cliente es responsable de cumplir con su contrato con Oracle"?**
   ¿Eso me cubre del tortious interference? Si sí, ¿qué cláusulas
   específicas debo incluir?

3. **¿Conviene aplicar al Oracle Partner Network** (gratis aplicar)
   antes de salir a vender? ¿Eso reduce significativamente el riesgo
   legal?

4. **Si Oracle me manda un cease-and-desist:** ¿qué obligaciones reales
   tengo? ¿Tengo derecho a operar mientras se discute?

5. **¿Conviene tener un disclaimer público** ("uses Oracle EPM Cloud
   APIs and Smart View interop protocol — not officially affiliated
   with Oracle") en marketing? ¿Eso ayuda?

6. **¿Hay precedentes en mi jurisdicción** (Argentina / EEUU según
   donde se constituya la empresa) de demandas similares? Caso de
   software third-party sobre plataformas SaaS comerciales.

7. **Costo aproximado y plazos** si llegamos a recibir un C&D o
   demanda formal.

---

## 6. Lo que NO estoy haciendo (para que quede claro)

- ❌ No estoy decompilando software de Oracle
- ❌ No estoy distribuyendo software de Oracle modificado
- ❌ No estoy bypaseando ningún DRM o autenticación
- ❌ No estoy almacenando data confidential de Oracle/cliente fuera del flujo del usuario
- ❌ No me estoy presentando como Oracle ni como producto oficial de Oracle
- ❌ No estoy copiando código de Oracle

---

## 6.bis ⚠️ Antecedente importante — Google Apps Script previo en Workspace BPC

**Descubrimiento reciente que cambia materialmente el cuadro:**

Mientras trabajaba en BPC como consultor, construí un **Google Apps Script
"NSPB Pharma"** para un cliente de BPC (NSPB Pharma). Está alojado en el
Google Workspace de BPC (`@bryantparkconsulting.com`), por lo tanto:

- **BPC es dueño legal de ese código** (work-for-hire, hosting en su
  infraestructura, construido para su cliente)
- BPC admins pueden verlo cuando quieran — no es "secreto"
- Yo lo construí cuando era consultor BPC

**El Apps Script implementa conceptos similares al producto actual:**

| Apps Script (BPC) | Producto actual (mío) |
|---|---|
| `Analysis.gs` — three-output analysis (BvA, AvF, YoY) | `analyze_active_sheet` + `generate_close_report` |
| `Forms.gs` / `FormsBrowser.html` — form browser | `open_form` + `show inventory` |
| `LcmCache.gs` — KB caching desde LCM export | `tools/parse-lcm.js` + tenant-kb.json |
| `Gemini.gs` / `Claude.gs` — AI integration | Worker `worker.js` integration con Gemini/Claude |
| `Commands.gs` — command palette | `INTENT_TREE` en `taskpane.js` |
| `Chat.html` — chat UI | Chat panel en el taskpane |

**El producto actual NO es una copia literal:**
- Arquitectura totalmente diferente (Cloudflare Worker + Office.js vs
  Google Apps Script bound a Sheets)
- Código JavaScript reescrito desde cero
- Pero diseñado por la misma persona (yo) con el know-how adquirido
  construyendo el de BPC

**Preguntas críticas para vos (abogado/a) sobre este punto:**

1. **¿BPC tiene un IP claim sólido sobre el producto actual** bajo la
   doctrina de derivative work? ¿O alcanza con que sea una reescritura
   en otro lenguaje / arquitectura para considerarlo independiente?
2. **¿Mi conocimiento adquirido construyendo el Apps Script** (técnicas,
   patrones de UX, parsing del LCM) cuenta como "trade secret de BPC"
   que no puedo usar en otro producto?
3. **¿El contrato de empleo / consultoría con BPC que firmé** tiene
   cláusula IP assignment / non-compete? Tengo que buscar copia y
   pasártela. ¿Qué cláusulas son las más importantes a revisar?
4. **¿Conviene dejar el Apps Script intacto** (no tocarlo) o hacer alguna
   acción? Mi intuición: no tocarlo (destruir evidencia sería peor).
5. **¿Conviene auto-reportarle esto a BPC** antes de que ellos lo
   descubran? ¿Hay forma de negociar una cesión / compra del IP del
   Apps Script o del producto actual?
6. **¿Debo parar el desarrollo y comercialización** del producto actual
   hasta resolver esto, o puedo seguir construyendo (pero no vendiendo)?

**Mi posición preliminar (sujeta a tu opinión):**
- No tocar el Apps Script
- No vender al primer cliente hasta que tengamos clarity
- Considerar un acercamiento amigable a BPC (carving out / license / buyout)
  antes de que ellos detecten el producto actual
- Continuar desarrollo limitado para no perder el momentum, pero NO
  hacer features que sean copias 1:1 de lo del Apps Script

## 7. Documentación adjunta disponible

- `docs/API_AUDIT.md` — lista completa de cada endpoint llamado, categorizado
- `README.md` — descripción técnica del producto
- Código fuente — repo privado en GitHub, accesible si lo necesitás

---

## 8. Próximo paso pedido

**Consulta corta (~1 hora) para responder los puntos del §5.** Mi
objetivo: tener claridad antes de salir a vender al primer cliente,
y saber si necesito:

- (a) Estructura societaria específica (LLC EEUU, SA Argentina, etc.)
- (b) ToS para cliente — y si redactarlo lo hacés vos o lo hago yo y vos revisás
- (c) Comunicación con Oracle (partner program, disclaimer, etc.)
- (d) Algún cambio técnico para reducir riesgo (migrar más endpoints
  internos al REST documentado, por ejemplo)

Quedo a disposición.

**Bruno Gallo**
gallobruno@gmail.com
