#!/usr/bin/env python
"""
Thin REST client for an EPM Cloud Planning pod -- the calls epmautomate cannot make.

Why this exists: the CLI cannot return a rendered form, a dimension hierarchy, a user's
variable values, or the error messages behind "One or more child jobs have failed". Those
are REST-only, and they are exactly the evidence this skill keeps asking for.

  grid      the evaluated form grid: POV, rows, columns after suppression and expansion
  slice     exportdataslice at an arbitrary intersection, suppression off by default
  summary   the markdown application summary (26.04+); orientation only, shape is unstable
  dims      dimensions of a cube, or one dimension's hierarchy
  member    one member's parent and dataStorage
  vars      substitution variables and per-user user-variable values
  rule      POST .../jobs with jobType=Rules, poll, and print child-job ERRORs on failure

Auth: OAuth 2 only. Basic auth would need the plaintext password, and the .epw files are
decryptable by epmautomate alone. Set:

  EPM_POD           https://<pod>.oraclecloud.com
  EPM_APP           application name
  EPM_IDCS          https://idcs-<hex>.identity.oraclecloud.com
  EPM_CLIENT_ID     from the domain admin
  EPM_TOKEN_FILE    a JSON file holding {"refresh_token": "..."}; rewritten on every call

Each refresh token is SINGLE USE -- the token response carries its replacement. That is why
EPM_TOKEN_FILE is rewritten rather than read-only: re-sending a spent refresh token returns a
400 that reads like a bad client id. Refresh tokens also expire after 7 days of inactivity.

Access tokens last an hour and are never printed or written to disk.

Usage
-----
  python epm_rest.py grid    --form "Plan Revenue" [--expanded] [--page "Widget"]
  python epm_rest.py slice   --cube Plan1 --pov Year=FY25,Scenario=Plan \
                             --rows Account=Sales --cols Period=Jan,Feb
  python epm_rest.py summary [--dims Entity,Account]
  python epm_rest.py dims    --cube Plan1 [--dim Entity]
  python epm_rest.py member  --dim Entity --member "North America"
  python epm_rest.py vars    [--user someone@example.com]
  python epm_rest.py rule    --name MY_RULE --param planType=Plan1 --param ToEntity=CA

NOT yet exercised against a pod -- every path and payload below is transcribed from Oracle's
REST reference, not from a run. Treat the first invocation against any pod as the test, and
follow this skill's own rule: read the result back before believing it.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

POD = os.environ.get("EPM_POD", "").rstrip("/")
APP = os.environ.get("EPM_APP", "")
IDCS = os.environ.get("EPM_IDCS", "").rstrip("/")
CLIENT_ID = os.environ.get("EPM_CLIENT_ID", "")
TOKEN_FILE = os.environ.get("EPM_TOKEN_FILE", "")

BASE = "{pod}/HyperionPlanning/rest/v3/applications/{app}"


def _request(url, method="GET", body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:2000]
        # A 404 here is as often a 26.03-or-older pod, an unencoded space in a member name,
        # or the wrong api_version as it is a wrong path.
        sys.exit("HTTP %s on %s\n%s" % (e.code, url, detail))
    return json.loads(raw) if raw.strip() else {}


def token():
    """Exchange the stored refresh token, then persist the replacement it hands back."""
    for name, val in (("EPM_IDCS", IDCS), ("EPM_CLIENT_ID", CLIENT_ID),
                      ("EPM_TOKEN_FILE", TOKEN_FILE)):
        if not val:
            sys.exit("%s is not set" % name)
    with open(TOKEN_FILE) as fh:
        store = json.load(fh)
    payload = urllib.parse.urlencode({
        "grant_type": "refresh_token",
        "client_id": CLIENT_ID,
        "refresh_token": store["refresh_token"],
    }).encode()
    req = urllib.request.Request(IDCS + "/oauth2/v1/token", data=payload, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    with urllib.request.urlopen(req) as r:
        got = json.loads(r.read().decode())
    if got.get("refresh_token"):
        store["refresh_token"] = got["refresh_token"]
        with open(TOKEN_FILE, "w") as fh:
            json.dump(store, fh)
    return got["access_token"]


def api(path, method="GET", body=None, **params):
    if not POD or not APP:
        sys.exit("EPM_POD and EPM_APP must be set")
    url = BASE.format(pod=POD, app=urllib.parse.quote(APP)) + path
    params = {k: v for k, v in params.items() if v is not None}
    if params:
        url += "?" + urllib.parse.urlencode(params)
    return _request(url, method, body, {
        "Authorization": "Bearer " + token(),
        "Content-Type": "application/json",
    })


def _axis(spec):
    """'Account=Sales,COGS' -> {"dimensions": ["Account"], "members": [["Sales", "COGS"]]}"""
    dim, members = spec.split("=", 1)
    return {"dimensions": [dim], "members": [members.split(",")]}


def _pov(spec):
    dims, members = [], []
    for part in spec.split(","):
        if "=" in part:
            d, m = part.split("=", 1)
            dims.append(d)
            members.append([m])
    return {"dimensions": dims, "members": members}


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("grid")
    g.add_argument("--form", required=True)
    g.add_argument("--page")
    g.add_argument("--expanded", action="store_true")
    g.add_argument("--fields", default="gridInfo,pov,rows,columns")

    s = sub.add_parser("slice")
    s.add_argument("--cube", required=True)
    s.add_argument("--pov", required=True)
    s.add_argument("--rows", required=True)
    s.add_argument("--cols", required=True)
    s.add_argument("--suppress", action="store_true", help="off by default, and keep it off")

    m = sub.add_parser("summary")
    m.add_argument("--dims")

    d = sub.add_parser("dims")
    d.add_argument("--cube", required=True)
    d.add_argument("--dim")

    b = sub.add_parser("member")
    b.add_argument("--dim", required=True)
    b.add_argument("--member", required=True)

    v = sub.add_parser("vars")
    v.add_argument("--user")

    r = sub.add_parser("rule")
    r.add_argument("--name", required=True)
    r.add_argument("--param", action="append", default=[])

    a = ap.parse_args()
    q = urllib.parse.quote

    if a.cmd == "grid":
        out = api("/forms/%s/data" % q(a.form), fields=a.fields,
                  pageMbrList=a.page,
                  forceStartExpanded="true" if a.expanded else None,
                  displayMemberAs="MEMBER_NAME_THEN_ALIAS")
    elif a.cmd == "slice":
        out = api("/plantypes/%s/exportdataslice" % q(a.cube), "POST", {
            "exportPlanningData": False,
            "gridDefinition": {
                "suppressMissingBlocks": a.suppress,
                "suppressMissingRows": a.suppress,
                "suppressMissingColumns": a.suppress,
                "pov": _pov(a.pov),
                "columns": [_axis(a.cols)],
                "rows": [_axis(a.rows)],
            },
        })
    elif a.cmd == "summary":
        out = api("/summary", dimensionsToInclude=a.dims)
    elif a.cmd == "dims":
        path = "/plantypes/%s/dimensions" % q(a.cube)
        out = api(path + ("/" + q(a.dim) if a.dim else ""), limit=-1)
    elif a.cmd == "member":
        out = api("/dimensions/%s/members/%s" % (q(a.dim), q(a.member)))
    elif a.cmd == "vars":
        out = {
            "substitutionVariables": api("/substitutionvariables"),
            "userVariableValues": api("/uservariablevalues", limit=-1),
        }
        if a.user:
            items = out["userVariableValues"].get("items", [])
            out["userVariableValues"]["items"] = [
                i for i in items if i.get("userName") == a.user
            ]
    elif a.cmd == "rule":
        params = dict(p.split("=", 1) for p in a.param)
        job = api("/jobs", "POST",
                  {"jobType": "Rules", "jobName": a.name, "parameters": params})
        out = job
        job_id = job.get("jobId") or job.get("jobID")
        if job_id:
            status = api("/jobs/%s" % job_id)
            out = {"submitted": job, "status": status}
            # -1 == in progress, 0 == success, anything else is a failure worth reading
            if status.get("status") not in (0, -1):
                for child in status.get("children", []) or []:
                    cid = child.get("jobId")
                    if cid:
                        out.setdefault("childErrors", {})[cid] = api(
                            "/jobs/%s/childjobs/%s/details" % (job_id, cid),
                            q=json.dumps({"messageType": "ERROR"}), limit=-1)

    json.dump(out, sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
