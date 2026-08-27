# Navigation flows

A navigation flow imported by LCM either activates or is refused wholesale with
**"The navigation flow is invalid. Delete the navigation flow and create a new one."**
There is no partial failure and no indication of which part is wrong. The import
itself always reports `completed successfully` — the rejection only appears when a
person clicks Activate.

So do not hand-author one. **Clone a flow that already works in that pod and replace
its cards.** Four separate attempts at building the XML from the documented shape
were all refused; cloning worked on the first try.

## The file

```
<fuseStructure name="..." properties="1" templateName="Default" ...>
  <usageXML><![CDATA[ ...cards and tabs... ]]></usageXML>
  <upgradeScriptXML><![CDATA[ ...StructureUpgradeDetails... ]]></upgradeScriptXML>
</fuseStructure>
```

Both CDATA blocks are mandatory. A flow with only `usageXML` is refused. The
`upgradeScriptXML` in a shipped flow is ~47KB of historical `changeDef` entries;
carry it over from the clone source verbatim rather than trying to write a minimal one.

## The four things that get it refused

**`properties="0"`.** Shipped/system flows carry `0`; custom flows carry `1`. Cloning
a system flow and forgetting to flip this is refused.

**Renaming the category.** The flow's name lives in the `name` attribute of
`<fuseStructure>`. The `<category id="...">` inside `usageXML` keeps the *original*
id — in a NetSuite pod that is `NSPB`. Renaming it to match your flow breaks the
reference. Confirmed against a working custom flow in a second pod, which kept
`id="NSPB"` while its `name` was something else entirely.

**Skipping the container tab.** Forms do not hang off a card directly. The hierarchy is:

```
card                    refObjectDefId="CUSTOM_CARD"
 └── tab (container)    refObjectDefId="EFS_CHILD_TABS_TF"
      └── tab (leaf)    refObjectDefId="FORMS_RT_TF"    ← the form
```

A card whose form tabs sit at the first level is structurally invalid.

**Invented ids.** Cards and tabs use `CST_CA_nnn` and `CST_TA_nnn`. `CST_` marks them
custom. Any other prefix is not recognised as a card.

## Referencing a form from a tab

```xml
<tfParameter artifactUID="7~~~My Form Name" name="formId"
             artifactName="My Form Name" valueTypeClass="java.lang.Integer" .../>
```

The `7~~~` prefix plus the form's exact label. Dashboards use
`refObjectDefId="DASHBOARDS_RT_TF"` on the leaf tab instead.

## Icons must exist

An icon name that is not present in the pod renders as a wrong default glyph — or, on a
card, as **no icon at all**. No error either way.

**Card icons and tab icons are two different catalogues.** In a NetSuite pod, 41 names
are used on cards and 39 on tabs, and the sets do not match. `navi_assumption.svg` — the
obvious pick for an assumptions card — appears *only* on tabs; put it on a card and the
card comes up blank. Harvest them separately:

```
grep -o '<card [^>]*icon="[^"]*"' NSPB.xml | grep -o 'icon="[^"]*"' | sort -u
grep -o '<tab [^>]*icon="[^"]*"'  NSPB.xml | grep -o 'icon="[^"]*"' | sort -u
```

Anything you make up — `navi_planning.svg`, `navi_allocation.svg`, `navi_forecast.svg`
— silently falls back.

Card-safe names that map well onto planning concepts: `navi_user_variable.svg`,
`navi_budget_adjustments.svg`, `navi_capital.svg`, `navi_operational_effectiveness.svg`,
`navi_sales_forecasting.svg`, `navi_balance_sheet.svg`, `navi_cashflow.svg`,
`navi_existing_assets.svg`, `navi_compensation.svg`. Tab-only: `navi_assumption.svg`,
`navi_growth.svg`, `navi_data_map.svg`, `navi_queries.svg`.

Icons appear at three levels — card, container tab, and leaf tab — and reusing one name
across them looks careless in a demo. Give each level its own. `horizontalTabIcon` is a
separate attribute and only ever `navi_edittable.svg` or `navi_piechart.svg`.

## The conversion note is narrower than it reads

If the app was converted from Standard/Reporting to Enterprise, the error text points
at a documentation page saying *"custom navigation flows are not converted. You need
to recreate them after you convert the application."*

That describes the one-time conversion, **not** an ongoing prohibition on LCM import.
A custom flow imported by LCM into a converted pod does activate. Do not read that
sentence as "this cannot be done" and send the user to the UI — it cost an hour and
was wrong.

## Method

1. Export or locate a flow that works in that pod. A shipped one is fine as the skeleton.
2. Extract one real `<card>` and one real leaf `<tab>` as templates.
3. Rebuild the cards you want using those templates verbatim, changing only ids, labels
   and form references.
4. Splice them into the existing `<category>` block, leaving the category id alone.
5. Change `name`, `description`, and `properties="1"` on the `<fuseStructure>`.
6. Keep `upgradeScriptXML` untouched.

Activation is a UI step. There is no epmautomate command to activate a flow, so it
joins rule deployment in the batch of things a human has to click.

## Grouping: `<cardCluster>`, and cards that must live inside one

The Navigator's headings — Application, Tools, Financials — are not decoration; they are
`<cardCluster refObjectDefId="CUSTOM_CLUSTER">` elements wrapping their cards. A flow
built from bare `<card>` elements renders as one flat list and *looks* like the
groupings were lost, because they were.

System cards also depend on it. Lift `Jobs` (`EPM_CA_124`) out of the Application
cluster and drop it in at top level and it renders **greyed out and inert** — no error,
it just does not work. Same for the Tools cards.

So do not cherry-pick system cards. Copy the whole `<cardCluster>` verbatim from a
working flow:

- `EPM_CL_22` — **Application**: Overview, Settings, Valid Intersections, Cell Level
  Security, Data Exchange, Jobs
- `EPM_CL_23` — **Tools**: Appearance, Variables, Announcements, Access Control,
  **Navigation Flows**, Daily Maintenance, Connections, Migration, Audit, User
  Preferences, Rules, Artifact Labels, Clone Environment

**Navigation Flows lives in the Tools cluster.** Omit it and an administrator has no way
to switch flows or get back to the default — they are stuck inside the custom flow.
Ship it in every custom flow, always.

## A dashboard is not referenced like a form — and the wrong reference is silent

A card's sub-tab points at its content through `refObjectDefId` and an
`artifactUID` whose numeric prefix encodes the artifact type. Forms and
dashboards use different values for **both**:

| | Form | Dashboard |
|---|---|---|
| `refObjectDefId` | `FORMS_RT_TF` | `DASHBOARDS_RT_TF` |
| `artifactUID` prefix | `7~~~<name>` | `107~~~<name>` |
| `displayHeader` parameter | present | absent |

Point a tab at a dashboard with the form values and the import reports
`completed successfully`, the tab is present in the flow XML you export back
from the pod, and **the UI silently does not render it**. Verifying the
artifact is not enough here: the XML is exactly what you shipped, and it is
still wrong.

Recover the right prefix from the pod rather than guessing — the shipped flow
already contains working examples:

```
artifactUID="(\d+)~~~([^"]+)"
```

grouped by prefix over `Global Artifacts/Navigation Flows/*.xml` shows which
numbers map to which artifact names (`7` forms, `107` dashboards, `1000`
Financial Reports, whose UID is a whole JSON blob rather than a name).

## Dashboards are containers, not charts

A dashboard artifact holds panes and blocks; each block names an **existing
form** and a `chartType`. The chart draws that form's grid. So a dashboard
needs small purpose-built source forms — one or two rows by twelve months —
and those source forms should stay **out** of the navigation flow: the planner
should see the dashboard, not the four one-row grids behind it.

Chart types seen in the shipped app: `1` bar, `4` line/trend, `5` pie,
`8` and `9` other bar variants, `11` KPI tile. The long `chartformat` string
can be copied verbatim from a shipped dashboard.

Dashboards live under `Global Artifacts/Dashboards/...` and declare as
`type="Dashboard"` in `listing.xml`.
