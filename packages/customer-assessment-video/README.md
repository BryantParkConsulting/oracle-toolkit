# BPC Customer Assessment video templates

Reusable Remotion project for two separate Bryant Park Consulting videos:

1. **Client Data Preparation Guide** — a 3:25 operational walkthrough showing
   how to prepare secure NetSuite and Oracle NSPB inputs.
2. **Customer Assessment Overview** — a 2:18 commercial explanation of what
   BPC analyzes, what the assessment produces, and when clients should use it.

The split is intentional. The client guide can be paused and followed step by
step; the overview remains focused on service value and reusable sales content.

## Current technical decisions

- NetSuite uses Token-Based Authentication only. OAuth 2.0 Authorization Code
  Grant remains unchecked.
- The Access Token is created under Setup -> Users/Roles -> Access Tokens -> New.
- Consumer Key, Consumer Secret, Token ID, and Token Secret are one-time values
  and must be transferred through an approved secure channel.
- The primary NSPB input is a complete Migration backup, not a selected-category
  Export.
- Level-zero data for each cube and the latest Activity Report provide deeper
  usage and performance evidence.
- Both videos use English narration, 1920 x 1080 output, no subtitles, and no
  avatar. A later Trupper pass may add music or restrained motion without
  changing the technical timing or privacy covers.

## Local setup

```powershell
npm install --workspaces=false
python -m pip install -r requirements.txt
python scripts/generate-split-voiceovers.py
npm run verify:assets --workspaces=false
npm run lint --workspaces=false
```

Render both compositions:

```powershell
npm run render --workspaces=false
```

Or render them independently:

```powershell
npm run render:data-guide --workspaces=false
npm run render:overview --workspaces=false
```

## Narration sources

- `data-preparation-guide-script.md`
- `assessment-overview-script.md`

The corresponding plain-text files in `public/audio` are consumed by the voice
generation script.

## Required local evidence

See `public/stills-v2/README.md` and `public/stills-v4/README.md`. The verification
script lists every missing file. Client recordings, exact screenshots,
credentials, generated audio, and rendered videos are intentionally excluded
from Git.

## Safe publishing checklist

- Confirm every credential and identifying field is covered by an opaque block.
- Inspect frames from the final MP4, not only the Remotion preview.
- Never commit `public/source`, evidence stills, generated audio, `render`, or
  `analysis`.
- Rotate or revoke any credential that appeared in an original recording.
