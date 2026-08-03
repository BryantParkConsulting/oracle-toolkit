# Test samples

Standalone files used for manual testing / repro. Not part of the build.

| File | What it is | When to use |
|---|---|---|
| `NSPB_Agent_Workbook.xlsx` | Sample Excel workbook with NSPB grids | Open in Excel to test the add-in against a real grid |
| `export_NSP_NFS.zip` | Sample level-0 export CSV (from the demo tenant) | Reference shape for the DuckDB pipeline (P4 roadmap) |

These are gitignored (`*.xlsx`, `export_*.zip` in `.gitignore`). They live here so they're easy to find when reproducing issues — not because they're shipped with the product.
