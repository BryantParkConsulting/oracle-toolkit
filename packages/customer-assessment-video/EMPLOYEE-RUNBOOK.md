# BPC Video Toolkit — Windows employee runbook

The employee needs only Git. A single PowerShell command clones or updates the
official BPC repository, installs the video stack, validates it, and installs
the `$bpc-customer-video` skill in Codex.

## One-line installation

Open PowerShell and paste this line:

```powershell
$d=Join-Path $env:LOCALAPPDATA 'BPC\oracle-toolkit'; if(Test-Path (Join-Path $d '.git')){git -C $d pull --ff-only}else{git clone https://github.com/BryantParkConsulting/oracle-toolkit.git $d}; if($LASTEXITCODE){exit $LASTEXITCODE}; powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $d 'scripts\install-bpc-video-toolkit.ps1')
```

If the repository is private, Git Credential Manager asks the employee to sign
in to GitHub. The repository remains at:

```text
%LOCALAPPDATA%\BPC\oracle-toolkit
```

Running the same line again performs a fast-forward `git pull` and reruns the
safe, repeatable setup.

Restart Codex after the first installation so it discovers the new
`$bpc-customer-video` skill.

## What the command installs

- Node.js LTS 20 or newer and npm.
- Python 3.12 and a private `.venv` for AI voice generation.
- FFmpeg for media inspection.
- Remotion and the exact JavaScript dependencies pinned by the repository.
- The English narration dependencies.
- The repository skill `$bpc-customer-video` under the employee's Codex skills.

Missing system prerequisites are installed through Windows Package Manager.
The package IDs are `OpenJS.NodeJS.LTS`, `Python.Python.3.12`, and
`Gyan.FFmpeg`. Git is the only prerequisite expected before running the line.

## Verify the notebook

```powershell
$d=Join-Path $env:LOCALAPPDATA 'BPC\oracle-toolkit'
& "$d\packages\customer-assessment-video\video-toolkit.ps1" doctor
```

Every check should show `OK`.

## Start a client

```powershell
$d=Join-Path $env:LOCALAPPDATA 'BPC\oracle-toolkit'
& "$d\packages\customer-assessment-video\video-toolkit.ps1" new-client -Client acme -ClientName "Acme Inc."
```

The toolkit creates a Git-ignored workspace under
`packages\customer-assessment-video\local-clients\acme` with:

- `CLIENT-BRIEF.md` for facts, audience, and scope;
- `PROMPT-FOR-CODEX.md` ready to paste into Codex;
- `ASSET-CHECKLIST.md` with the exact local filenames;
- separate folders for NetSuite and NSPB source material;
- sanitized still, narration, render, and handoff folders.

## Produce the video

1. Complete the client brief and copy the authorized evidence into the client
   workspace.
2. Paste `PROMPT-FOR-CODEX.md` into Codex. The installed skill supplies the BPC
   visual, pacing, evidence, and privacy rules.
3. Approve the English scripts before rendering.
4. Preview in Remotion Studio:

```powershell
& "$d\packages\customer-assessment-video\video-toolkit.ps1" studio -Client acme
```

5. Render one or both videos:

```powershell
& "$d\packages\customer-assessment-video\video-toolkit.ps1" render -Client acme -Video all
```

Final MP4 files are copied into the client's local `render` folder.

## Security boundary

Client recordings, screenshots, reports, credentials, generated audio, and
renders remain inside ignored local folders. They are never added to Git.
Staging removes prior client images before copying the selected client's assets
to prevent cross-client reuse. Standard narration is restored from an ignored
base-audio folder before any approved client-specific narration is applied.
Credentials require opaque covers and final-MP4 inspection; blur alone is not
sufficient.

The toolkit standardizes production. It does not invent assessment findings:
technical and functional claims must come from approved source evidence.
