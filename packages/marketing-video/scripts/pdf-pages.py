"""Render assessment PDF pages to PNG for the Assessments videos.

    python -X utf8 scripts/pdf-pages.py <netsuite.pdf> <nspb.pdf>

Writes public/pages/ns-XX.png / pb-XX.png at 3x and the hero pages as *-hi.png at 5x.
Use the public ACME / Northwind example PDFs (Customer Hub downloads), never a real client's report.
"""
import os, sys
import fitz

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "pages")
HI = {"ns": [1, 3, 5, 7, 11, 12], "pb": [1, 3, 11, 14, 17]}
os.makedirs(OUT, exist_ok=True)
for path, tag in zip(sys.argv[1:3], ("ns", "pb")):
    doc = fitz.open(path)
    for i, page in enumerate(doc, 1):
        page.get_pixmap(matrix=fitz.Matrix(3, 3)).save(os.path.join(OUT, f"{tag}-{i:02d}.png"))
        if i in HI[tag]:
            page.get_pixmap(matrix=fitz.Matrix(5, 5)).save(os.path.join(OUT, f"{tag}-{i:02d}-hi.png"))
    print(tag, len(doc), "pages")
