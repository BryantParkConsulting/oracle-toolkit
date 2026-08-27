# BPC Customer Assessment video template

Reusable Remotion project for a short Bryant Park Consulting explainer covering
NetSuite and Oracle NSPB customer assessments.

This repository contains the narrative structure, scene system, normalized
highlight engine, timing plan, and voiceover source. It deliberately excludes
all client recordings, report screenshots, credentials, rendered videos, and
generated audio.

## What changed in V2

The first cut treated the screen recording as the story. V2 treats client
evidence as supporting material inside a service narrative.

| Area           | V1 problem                                         | V2 approach                                                                            |
| -------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Opening        | Began inside product steps                         | Introduces the service, the questions it answers, and the one-business-day target      |
| Story          | Tool walkthrough                                   | Secure inputs -> evidence analysis -> business impact -> action plan                   |
| Pace           | Uniform compression                                | Gives client setup steps enough time to follow, then pauses for decisions and evidence |
| Highlights     | Boxes were positioned against the video canvas     | Boxes use percentages relative to the displayed evidence image                         |
| Moving screens | Highlights drifted while pages scrolled            | The recording crossfades to an exact frozen frame before a highlight appears           |
| Security       | Credential screens were difficult to reuse safely  | Token ID and Token Secret receive an opaque redaction before any client-facing render  |
| Delivery       | Creative layers were mixed into the technical edit | Remotion owns the factual base; Trupper can add avatar, cinematic zoom, and music      |

## Design rules

1. Establish the service and client outcome before showing setup steps.
2. Keep every factual screen readable long enough to understand why it matters.
3. Never attach a highlight to a scrolling or scaled source. Freeze first.
4. Express highlight geometry as percentages of the evidence image, not pixels of
   the 1920 x 1080 composition.
5. Keep client setup instructions at a readable pace; accelerate only repetitive navigation.
6. Redact secrets in the source asset and verify the final rendered frame.
7. Keep avatar, music, and cinematic zoom optional so they cannot obscure
   evidence or security controls.

## Local setup

```powershell
npm install --workspaces=false
npm run verify:assets --workspaces=false
npm run dev --workspaces=false
```

Generate the English narration after installing the small Python dependency:

```powershell
python -m pip install -r requirements.txt
python scripts/generate-voiceover.py
```

Render the 1920 x 1080, 30 fps composition:

```powershell
npm run render --workspaces=false
```

The current timing is 5,397 frames, approximately 3 minutes. Update
scene durations in `src/v2/CompositionV2.tsx` only after the narration is final.

## Required local evidence

See `public/source/README.md` and `public/stills-v2/README.md`. The verification
script lists every missing file. These folders are ignored by Git on purpose.

## Safe publishing checklist

- Run `npm run verify:assets` locally.
- Confirm every token or secret is covered by an opaque redaction.
- Search frames for client names, account IDs, email addresses, and URLs.
- Do not commit `public/source`, `public/stills-v2`, `render`, or `analysis`.
- Review `git status` and the staged diff before pushing.
- Rotate or revoke any credential that appeared in an original recording.

## Trupper finishing pass

The base edit intentionally has no subtitles. Recommended optional additions:

- avatar only during the opening and closing;
- zoom only after the evidence frame has frozen, following the existing focus;
- instrumental music without vocals, approximately 18-24 dB below narration;
- no changes to redaction layers or factual screen timing.

The full handoff timing is documented in `timing-plan.md`.
