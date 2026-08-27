#!/usr/bin/env python
"""
Load dimension metadata without silently destroying it.

WHY THIS EXISTS
---------------
An Import Metadata job carries its own delete behaviour and the file you send does
not reveal it. A job with member deletion enabled treats your file as *the whole
dimension*: every member not in it is pruned, and pruning a member destroys its
data and orphans every smart-list value that pointed at it.

It reports success. In the incident this script comes from, a 7-row file meant to
set a UDA took an Item dimension from 182 members to 41 and orphaned the BoM
recipes -- `Component Item` cells turned into raw ids like `3.482835779077E15`,
because the members came back from a restore with new Data Ids. The load returned
`One or more child jobs have failed`, which reads like the usual harmless refresh
warning, and every check aimed at the intended change PASSED: all 7 UDAs were set
correctly. Verifying that your change landed is not verification.

WHAT THIS DOES
--------------
Refuses to run an unsafe load, then proves the safe one was safe:

  1. Exports the dimension first, and keeps that file as the restore point.
  2. REFUSES a partial file. If your file has fewer members than the dimension,
     it stops -- unless you pass --full-dimension to confirm you really are
     sending the complete member set, or --allow-partial with an explicit
     acknowledgement that the target job has deletion OFF.
  3. Loads.
  4. Exports again and diffs the member set. Any member present before and absent
     after is a hard failure, reported by name.

Usage
-----
  python metadata_guard.py --app NetSuite --dim Item \
      --export-job ZZ_Item_Export --import-job ZZ_Item_Add --file Item.csv \
      [--full-dimension | --allow-partial "checked in UI: delete option is OFF"]

There is no REST field that reliably reports a job's delete setting. Confirm it in
Application > Overview > Actions > Jobs, and record what you saw in
--allow-partial. Prefer --full-dimension: send the whole dimension back and the
setting cannot hurt you.
"""

import argparse
import io
import os
import subprocess
import sys
import zipfile

EPMAUTOMATE = os.environ.get(
    "EPMAUTOMATE", r"C:\Oracle\EPM Automate\bin\epmautomate.bat"
)


def epm(*args):
    r = subprocess.run([EPMAUTOMATE] + list(args), capture_output=True, text=True)
    out = (r.stdout or "") + (r.stderr or "")
    return r.returncode, out.strip()


def members_of(csv_text):
    """Distinct member names in an OutlineLoad CSV, header row located by name."""
    lines = [l.rstrip("\r") for l in csv_text.split("\n")]
    hdr = next((i for i, l in enumerate(lines) if "," in l and l.split(",")[1].strip() == "Parent"), 0)
    out = set()
    for l in lines[hdr + 1:]:
        p = [x.strip() for x in l.split(",")]
        if len(p) > 1 and p[0]:
            out.add(p[0])
    return out


def export_dimension(app, job, dim, dest):
    code, out = epm("exportmetadata", job)
    if code:
        sys.exit("export failed: %s" % out)
    name = job + ".zip"
    epm("downloadfile", name)
    src = os.path.join(os.path.dirname(EPMAUTOMATE), "..", name)
    src = os.path.normpath(src)
    if not os.path.exists(src):                       # default install layout
        src = os.path.join(r"C:\ProgramData\Oracle\EPM Automate", name)
    if not os.path.exists(src):
        sys.exit("could not find the downloaded export -- epmautomate writes into "
                 "its own directory, not the working directory")
    z = zipfile.ZipFile(src)
    inner = next((n for n in z.namelist() if n.lower().endswith(".csv")), None)
    text = z.read(inner).decode("utf-8-sig", "replace")
    io.open(dest, "w", encoding="utf-8", newline="\n").write(text)
    return members_of(text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True)
    ap.add_argument("--dim", required=True)
    ap.add_argument("--export-job", required=True)
    ap.add_argument("--import-job", required=True)
    ap.add_argument("--file", required=True)
    ap.add_argument("--full-dimension", action="store_true",
                    help="the file is the complete member set")
    ap.add_argument("--allow-partial", metavar="EVIDENCE",
                    help="send a partial file anyway; pass what you saw in the job's UI")
    a = ap.parse_args()

    baseline = "%s_before.csv" % a.dim
    before = export_dimension(a.app, a.export_job, a.dim, baseline)
    print("  before      : %d members  (restore point: %s)" % (len(before), baseline))

    sending = members_of(io.open(a.file, encoding="utf-8-sig").read())
    print("  file        : %d members" % len(sending))

    missing = before - sending
    if missing and not (a.full_dimension or a.allow_partial):
        sys.exit(
            "\n  REFUSING: the file omits %d members that exist in %s.\n"
            "  If the import job has member deletion enabled, those members and their\n"
            "  data will be destroyed. Either send the whole dimension\n"
            "  (--full-dimension, edit %s and resend it), or confirm the job's delete\n"
            "  setting in the UI and pass --allow-partial with what you saw.\n"
            "  Examples of what would be lost: %s\n"
            % (len(missing), a.dim, baseline, sorted(missing)[:8])
        )
    if missing and a.allow_partial:
        print("  partial OK  : %s" % a.allow_partial)

    code, out = epm("importmetadata", a.import_job, os.path.basename(a.file))
    print("  import      : %s" % (out.splitlines()[-1] if out else "(no output)"))
    # A failed child job is usually the embedded refresh, and the load may still have
    # applied. That is exactly why the diff below is not optional.
    epm("refreshcube")

    after = export_dimension(a.app, a.export_job, a.dim, "%s_after.csv" % a.dim)
    lost = before - after
    print("  after       : %d members" % len(after))
    if lost:
        sys.exit("\n  MEMBERS LOST: %d\n  %s\n\n  Recover with a full snapshot restore "
                 "INCLUDING data (recreate the app, then importsnapshot). Reloading the\n"
                 "  dimension alone brings the members back EMPTY and leaves every\n"
                 "  smart-list reference to them orphaned.\n"
                 % (len(lost), sorted(lost)[:20]))
    print("  OK          : no members lost (%d gained)" % len(after - before))


if __name__ == "__main__":
    main()
