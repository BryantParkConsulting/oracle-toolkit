# Hand-building an LCM snapshot for one artifact

You rarely want to re-import a full application snapshot. Fabricating a minimal one — a single
form, rule, job, menu or navigation flow — is fast, repeatable, and scriptable.

## Structure

```
mysnapshot.zip
├── Import.xml                       ← what to import and where from
└── <APP>/                           ← e.g. HP-<AppName>, or CALC-Calculation Manager
    ├── Import.xml                   ← copied verbatim from a real export
    ├── info/
    │   ├── listing.xml              ← ONE <resource> entry for your artifact
    │   └── sourceInfo.xml           ← copied verbatim from a real export
    └── resource/<path>/<Artifact>.xml
```

Build it from a real export of the same pod so `Import.xml` and `sourceInfo.xml` match the
application exactly. Clone the `listing.xml` entry from an existing artifact **of the same
type**, changing only `name`, `id` and `lastUpdated`.

## The destination is decided by listing.xml, not by Import.xml

This is the trap that produces a completely silent no-op. `Import.xml` carries a `parentPath`
and a `pattern`:

```xml
<Artifact recursive="true" parentPath="/Cube/Plan/Data Forms/MyFolder" pattern="My Form"/>
```

If that `parentPath` does not agree with the folder implied by the cloned `listing.xml` entry,
the pattern matches nothing. The import reports `importsnapshot completed successfully` and
**creates nothing at all** — no error, no warning, no partial result.

So: whatever folder the artifact you cloned the listing entry from lives in, put your artifact
in that same folder, and point `parentPath` at it. If you want it somewhere else, move it in
the UI afterwards, or clone the listing entry from an artifact that already lives there.

Always verify by exporting a snapshot afterwards and confirming the file exists at the path you
expect.

## Escaping inside embedded scripts

Rules carry their script inside `<script>` in the artifact XML. Escape **only `&` and `<`**.
Leave `>` literal — Planning does not unescape `&gt;` before compiling, so an escaped `>` breaks
`->` in Groovy closures and cross-dimensional references alike. Generics inside the XML appear
as `Map&lt;String, Double>` — note the escaped `<` and the bare `>`.

If you are patching an existing rule, operate on the raw artifact text and never round-trip it
through an unescape/re-escape: user variables appear as `&amp;CurrentYr` and a careless round
trip corrupts them.

## Iterating

Every re-import needs a **fresh zip file name** — the pod rejects a re-upload of a name it
already holds. A simple counter or timestamp suffix is enough. When a change does not seem to
have landed, check whether the upload silently failed for this reason before debugging the
artifact itself.

## A minimal builder

```python
shutil.rmtree(BUILD, ignore_errors=True)
os.makedirs(os.path.join(BUILD, APP, "info"), exist_ok=True)
os.makedirs(os.path.join(BUILD, ARTIFACT_DIR), exist_ok=True)
io.open(os.path.join(BUILD, ARTIFACT_DIR, NAME + ".xml"), "w",
        encoding="utf-8").write(artifact_xml)

listing = io.open(os.path.join(LIVE, APP, "info", "listing.xml"), encoding="utf-8").read()
model = re.search(r'<resource name="%s"[^>]*/>' % re.escape(TEMPLATE), listing).group(0)
entry = model.replace('name="%s"' % TEMPLATE, 'name="%s"' % NAME) \
             .replace('id="%s"'   % TEMPLATE, 'id="%s"'   % NAME)
entry = re.sub(r'lastUpdated="\d+"', 'lastUpdated="%d"' % int(time.time()*1000), entry)
io.open(os.path.join(BUILD, APP, "info", "listing.xml"), "w", encoding="utf-8").write(
    listing[:listing.index("<resource")] + entry + "</artifactListing>")

for f in ("Import.xml", os.path.join("info", "sourceInfo.xml")):
    shutil.copy2(os.path.join(LIVE, APP, f), os.path.join(BUILD, APP, f))
```

Then write the outer `Import.xml` with a `parentPath` that agrees with where the artifact
actually is, and zip the whole tree.
