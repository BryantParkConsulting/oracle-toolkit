#!/usr/bin/env python
"""
Deploy a Calculation Manager rule to an EPM Cloud Planning app with NO UI step.

A rule lives as TWO artifacts, and which one you ship decides whether it is
deployed:

  CALC-Calculation Manager/resource/Planning/<App>/<Cube>/Rules/<Name>
      the Calculation Manager source. Carries the <deployobjects> block.
  HP-<App>/resource/Cube/<Cube>/Calculation Manager Rules/<Name>.xml
      what Planning actually executes. Carries no <deployobjects> at all.

The HP artifact is the deployment. Tested on a 26.07 pod with two probe rules
imported in one snapshot: the one with <deployobjects> and no HP artifact was
not callable ("A job with specified name and type was not found"); the one with
an HP artifact and no <deployobjects> ran. A full build snapshot ships both
trees, which is why the block is widely credited with the deploy.

So this script writes both, and keeps <deployobjects> on the CALC copy for
fidelity with what Calculation Manager itself exports -- not because it deploys.

Ship only the CALC copy and you get a rule that reads correctly in the UI and
runs the old logic, which is the worst of both.

Usage
-----
  python deploy_rule.py --app NetSuite --cube Plan \
      --rule "MY_RULE=path/to/script.csc" [--rule "OTHER=other.csc"] \
      [--type calcscript|groovy] [--desc "text"] [--run] [--dry-run]

Every --rule is packaged into one snapshot, so a batch of rules deploys in a
single import.

Set EPMAUTOMATE to override the CLI path. Sessions expire; restore one with
  epmautomate login USER path\\to\\pod.epw https://<pod>.oraclecloud.com
"""

import argparse
import datetime
import os
import re
import subprocess
import sys
import zipfile

EPMAUTOMATE = os.environ.get(
    "EPMAUTOMATE", r"C:\Oracle\EPM Automate\bin\epmautomate.bat"
)

SOURCE_INFO = """<?xml version="1.0" encoding="UTF-8"?>
<sourceInfo>
   <Application>CalcApp</Application>
   <Product>CALC</Product>
   <ProductVersion>11.1.2.3</ProductVersion>
   <Project>Foundation</Project>
   <usesFriendlyNames>false</usesFriendlyNames>
   <metadataFileSupported>false</metadataFileSupported>
   <groupingSupported>true</groupingSupported>
   <LCMVersion>11.1.2</LCMVersion>
</sourceInfo>
"""

CALC_IMPORT = """<?xml version="1.0" encoding="UTF-8"?>
<Package>
   <LOCALE>en_US</LOCALE>
   <User name="" password=""/>
   <Task>
      <Source type="FileSystem" filePath="/"/>
      <Target type="Application" product="CALC" project="Foundation" application="Calculation Manager"/>
      <Artifact recursive="true" parentPath="/" pattern="*"/>
   </Task>
</Package>
"""

ROOT_IMPORT = """<?xml version="1.0" encoding="UTF-8"?>
<Package>
   <LOCALE>en_US</LOCALE>
   <User name="" password=""/>
   <Task>
      <Source type="FileSystem" filePath="/CALC-Calculation Manager"/>
      <Target type="Application" product="CALC" project="Foundation" application="Calculation Manager"/>
      <Artifact recursive="true" parentPath="/" pattern="*"/>
   </Task>
</Package>
"""


def esc(text):
    """XML-escape for element text.

    Escape & and < only. Planning does not unescape &gt; before compiling, so an
    escaped > arrives literally as "&gt;" and every Groovy closure arrow (->)
    fails to compile with no diagnostic at all.
    """
    return text.replace("&", "&amp;").replace("<", "&lt;")


def rule_artifact(name, script, app, cube, script_type, desc):
    desc_prop = (
        '<property name="description">%s</property>' % esc(desc) if desc else ""
    )
    return (
        "<?xml version = '1.0' encoding = 'UTF-8'?>\n"
        "<HBRRepo><variables/><rulesets/><rules>"
        '<rule id="1" name="%(name)s" product="Planning">'
        "%(desc)s"
        '<property name="application">%(app)s</property>'
        '<property name="plantype">%(cube)s</property>'
        '<script type="%(stype)s">%(script)s</script>'
        "</rule></rules><components/>"
        # Kept for fidelity with a real Calculation Manager export. It is NOT what
        # deploys the rule -- the HP-side artifact is. See the module docstring.
        "<deployobjects>"
        '<deployobject product="2" application="%(lapp)s" plantype="%(lcube)s"'
        ' obj_id="1" obj_type="1" name="%(name)s"/>'
        "</deployobjects></HBRRepo>"
        % {
            "name": esc(name),
            "desc": desc_prop,
            "app": esc(app),
            "cube": esc(cube),
            "lapp": esc(app.lower()),
            "lcube": esc(cube.lower()),
            "stype": script_type,
            "script": esc(script),
        }
    )


def hp_rule_artifact(name, script, app, cube, script_type, desc):
    """The Planning-side copy -- this is the one that makes the rule callable.

    Its script sits in CDATA, so nothing inside is escaped: no &amp;, no &lt;, and
    substitution variables stay as &CurrentYr rather than &amp;CurrentYr. Do not feed it
    esc() output.
    """
    assert "]]>" not in script, "script contains a CDATA terminator"
    desc_prop = (
        '<property name="description">%s</property>' % esc(desc) if desc else ""
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" ?>\n'
        "<HBRRepo>\n  <variables></variables>\n  <rulesets></rulesets>\n  <rules>\n"
        '    <rule id="1" name="%(name)s" product="Planning">\n'
        "      %(desc)s\n"
        '      <property name="application">%(app)s</property>\n'
        '      <property name="plantype">%(cube)s</property>\n'
        '      <script type="%(stype)s"><![CDATA[%(script)s]]></script>\n'
        "    </rule>\n  </rules>\n  <components></components>\n</HBRRepo>\n"
        % {
            "name": esc(name),
            "desc": desc_prop,
            "app": esc(app),
            "cube": esc(cube),
            "stype": script_type,
            "script": script,
        }
    )


def hp_listing(rules, cube, user, desc):
    path = "/Cube/%s/Calculation Manager Rules" % cube
    stamp = int(datetime.datetime.now().timestamp() * 1000)
    entries = "".join(
        '<resource name="%s" id="%s" type="Rule" cloneOnly="false" size="0"'
        ' path="%s" pathAlias="%s" modifiedBy="%s" lastUpdated="%d"'
        ' description="%s" />'
        % (esc(n), esc(n), path, path, esc(user), stamp, esc(desc))
        for n in rules
    )
    return '<?xml version="1.0" encoding="utf-8"?><artifactListing>%s</artifactListing>' % entries


def listing(rules, app, cube, user, desc):
    path = "/Planning/%s/%s/Rules" % (app, cube)
    stamp = int(datetime.datetime.now().timestamp() * 1000)
    entries = "".join(
        '<resource name="%s" id="%s" type="Rule" cloneOnly="false" size="0"'
        ' path="%s" pathAlias="%s" modifiedBy="%s" lastUpdated="%d"'
        ' description="%s" />'
        % (esc(n), esc(n), path, path, esc(user), stamp, esc(desc))
        for n in rules
    )
    return '<?xml version="1.0" encoding="utf-8"?><artifactListing>%s</artifactListing>' % entries


def root_import(app, cube, rules):
    """One Task per application folder.

    filePath names the folder INSIDE the zip. Copying the filePath="/" that an application's
    own inner Import.xml carries makes the import fail with a bare
    "EPMAT-1:Command failed to execute". Patterns are literal rule names, not a wildcard.
    """
    def task(folder, product, project, application, parent):
        arts = "".join(
            '      <Artifact recursive="true" parentPath="%s" pattern="%s"/>\n'
            % (parent, esc(n))
            for n in rules
        )
        return (
            "   <Task>\n"
            '      <Source type="FileSystem" filePath="/%s"/>\n'
            '      <Target type="Application" product="%s" project="%s" application="%s"/>\n'
            "%s   </Task>\n" % (folder, product, project, application, arts)
        )

    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n<Package>\n'
        "   <LOCALE>en_US</LOCALE>\n"
        '   <User name="" password=""/>\n'
        + task("CALC-Calculation Manager", "CALC", "Foundation", "Calculation Manager",
               "/Planning/%s/%s/Rules" % (app, cube))
        + task("HP-%s" % app, "HP", "Planning", app,
               "/Cube/%s/Calculation Manager Rules" % cube)
        + "</Package>\n"
    )


def build_snapshot(zip_path, rules, app, cube, script_type, desc, user):
    calc = "CALC-Calculation Manager"
    hp = "HP-%s" % app
    cpath = "%s/resource/Planning/%s/%s/Rules" % (calc, app, cube)
    hpath = "%s/resource/Cube/%s/Calculation Manager Rules" % (hp, cube)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("Import.xml", root_import(app, cube, list(rules)))

        # Calculation Manager: the source the UI shows
        z.writestr("%s/Import.xml" % calc, CALC_IMPORT)
        z.writestr("%s/info/sourceInfo.xml" % calc, SOURCE_INFO)
        z.writestr(
            "%s/info/listing.xml" % calc,
            listing(list(rules), app, cube, user, desc),
        )
        for name, script in rules.items():
            z.writestr(
                "%s/%s" % (cpath, name),
                rule_artifact(name, script, app, cube, script_type, desc),
            )

        # Planning: the copy that actually executes, and therefore the deployment
        z.writestr("%s/info/sourceInfo.xml" % hp, SOURCE_INFO)
        z.writestr("%s/info/listing.xml" % hp, hp_listing(list(rules), cube, user, desc))
        for name, script in rules.items():
            z.writestr(
                "%s/%s.xml" % (hpath, name),
                hp_rule_artifact(name, script, app, cube, script_type, desc),
            )
    return zip_path


def run(*args):
    print("+ epmautomate %s" % " ".join(args))
    p = subprocess.run(
        [EPMAUTOMATE] + list(args), capture_output=True, text=True, shell=False
    )
    out = (p.stdout or "") + (p.stderr or "")
    print(out.strip())
    if p.returncode != 0:
        raise SystemExit("epmautomate %s failed (%d)" % (args[0], p.returncode))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--app", required=True, help="Planning application name, e.g. NetSuite")
    ap.add_argument("--cube", required=True, help="Plan type / cube, e.g. Plan")
    ap.add_argument(
        "--rule",
        action="append",
        required=True,
        metavar="NAME=FILE",
        help="rule name and the file holding its script; repeatable",
    )
    ap.add_argument("--type", default="calcscript", choices=["calcscript", "groovy"])
    ap.add_argument("--desc", default="", help="description stored on the rule")
    ap.add_argument("--user", default="epmautomate", help="modifiedBy value in listing.xml")
    ap.add_argument("--snapshot", default=None, help="snapshot name (default: timestamped)")
    ap.add_argument("--run", action="store_true", help="run each rule after import")
    ap.add_argument("--dry-run", action="store_true", help="build the zip, do not upload")
    a = ap.parse_args()

    rules = {}
    for spec in a.rule:
        if "=" not in spec:
            raise SystemExit("--rule expects NAME=FILE, got %r" % spec)
        name, _, path = spec.partition("=")
        name = name.strip()
        with open(path, "r", encoding="utf-8") as fh:
            script = fh.read()
        if a.type == "groovy" and not re.search(r"\breturn\s+null\b", script):
            print(
                "WARNING: %s is Groovy and never returns null. A returned String "
                "is executed as a calc script." % name
            )
        rules[name] = script

    # A snapshot name already present on the pod makes uploadfile fail outright,
    # so every run gets a fresh one.
    snap = a.snapshot or "DEPLOY_%s" % datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    zip_path = os.path.abspath(snap + ".zip")
    build_snapshot(zip_path, rules, a.app, a.cube, a.type, a.desc, a.user)
    print("built %s (%d rule(s): %s)" % (zip_path, len(rules), ", ".join(rules)))

    if a.dry_run:
        return

    run("uploadfile", zip_path)
    run("importsnapshot", snap)
    print("imported %s -- rules are deployed and runnable" % snap)

    if a.run:
        for name in rules:
            run("runbusinessrule", name)


if __name__ == "__main__":
    main()
