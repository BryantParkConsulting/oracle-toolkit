# Production workflow

## 1. Establish the source of truth

Read the client brief, scripts, assessment reports, and source recordings. Build
an evidence inventory before editing. Separate confirmed facts from proposals,
and ask for missing evidence when it would materially change the message.

## 2. Define the two narratives

The data-preparation guide is procedural: prerequisites, navigation, selections,
one-time values, secure transfer, backup, optional deeper data, and final
checklist. The assessment overview is commercial: purpose, inputs, current-state
inventory, real usage, module status, performance, recommendations, impact,
deliverables, and use cases.

Write the English narration first. Generate or record the voice before assigning
scene durations. Keep procedural screens visible long enough to follow.

## 3. Prepare local assets

Use the client's ignored workspace created by:

```powershell
.\video-toolkit.ps1 new-client -Client <slug> -ClientName "<name>"
```

Source recordings stay under `source`. Put sanitized exact stills into
`stills-v2` or `stills-v4` using the package manifests. Put customized narration
into `audio`. Do not reuse a previous client's staged files.

## 4. Build the edit

Use the existing V4 compositions as the baseline. Preserve the BPC theme and
visual roles. Use explanatory slides for concepts and exact evidence stills for
procedures. Each highlight must point to the control being narrated at that
moment. Avoid arbitrary zooms, continuous acceleration, subtitles, avatars, and
music unless the user requests them.

## 5. Verify before delivery

Run:

```powershell
npm run lint --workspaces=false
npm run build --workspaces=false
.\video-toolkit.ps1 render -Client <slug> -Video all
```

Use FFmpeg or FFprobe to confirm duration, 1920 x 1080 video, H.264, AAC audio,
and absence of subtitle streams. Extract frames from credential, backup,
highlight, and closing scenes from the final MP4. Inspect those rendered frames
for alignment, clipping, stale client content, and exposed identifiers.

## 6. Handoff

Deliver separate packages for the data guide and commercial overview. Include
the MP4, approved narration script, and timing metadata when available. Exclude
raw client media and credentials. A later finishing tool may add restrained
music or motion, but must not change factual timing or privacy covers.
