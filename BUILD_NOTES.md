# Build and Verification Notes

Current summary — September 8, 2026. See [runtime/setup](README.md) for application operation. Checks below are recorded observations, not blanket production certification.

## Repository handoff — September 8, 2026

- `npm run build` passed TypeScript compilation and Vite production bundling for this handoff.
- Vite reports chunks above 500 kB; this is a bundle-size warning, not a build failure.
- README and environment template document fresh-clone setup, optional service configuration, media prerequisites and local-versus-hosted limitations.
- Public gallery media and downloadable datasets are included. The largest file is approximately 76 MB; private job data, credentials, source workspace and model weights are excluded.
- This handoff does not add a new live-generation run or certify Photoshop compatibility. Earlier interaction/media checks and their limits are recorded below.

## Current implementation evidence

- React/TypeScript/Vite app with identity/media inspection and four peer IDENTITY/CREATE/ANIMATE/ADAPT destinations. Header/route changes were built and browser-inspected.
- Generative Identity Kit naming, mock Firefly-style Michael Becker account, persistent projects/Sandbox/master choices, durable curation, drag-to-master/assistant, modal actions, category navigation and eight-item pagination are implemented. Final integrated rehearsal remains a separate check.
- Real Krea still and H3 Max image-to-video services, visual review and assistant proposals/receipts exist locally. Review is user-led; explicitly requested generation executes directly, draft-only requests remain editable. The assistant is a separate OpenAI-backed app feature, not Codex/Adobe's assistant.
- Stratosphere, After the landing and Harajuku landing were added to both sample catalogs. Existing Sandbox removals were preserved. Nine breadth runs completed; the tenth was stopped/excluded, not a successful tenth output.
- ADAPT now prepares a single format. Existing/custom presets remain; output history is placement-scoped. Typography and anniversary graphics were removed. Preparation opens a result viewer; exports are separate.

## PSD and export verification

Browser Prepare format produced A01 from After the landing at 1600×2400. Export returned HTTP 200, image/vnd.adobe.photoshop and a .psd attachment. Parsing verified its artwork Smart Object and transform. The embedded source SHA-256 matched the original bytes exactly. PNG preview corner alpha was zero; checkerboard transparency was visually inspected. The viewer reported source enlargement to 125%.

Direct opening, editing and saving in Photoshop has NOT been verified. PSD parsing is not a substitute for that compatibility check. Preview resampling changes displayed pixels; the original embedded source is preserved. No generative edit or AI upscale is involved.

Earlier MP4 checks verified expected 1080×1920 dimensions, source audio, duration metadata and browser playback/range serving. Current motion handoff remains flattened MP4, not a native Adobe video project. Creative Cloud export remains a disabled destination preview.

TypeScript/Vite build passed after implementation. The current documentation pass changes documentation/runtime guidance only and does not establish additional media or Photoshop validation.

## Historical Phase 1 record — September 7

The following is preserved as evidence of that build, not current instructions or outstanding scope. References to older names, REUSE, awaiting-output scaffolding, session-only results or planned generation describe that date. Use the current docs above for operation.

# Phase 1 Build Evidence

Date: 2026-09-07.

Historical implementation/verification record. The later anniversary mission changes planned scope, not what these checks demonstrated. The initial activation skeleton is not yet the planned CREATE -> ADAPT campaign journey.

## Implemented

The app lives in webapp, separately from original source media and planning. Vite/React/TypeScript provide the application shell. Three.js loads the existing GLB and uses a local neutral studio HDR; video and turntable components share expanded-view conventions.

Asset preparation copied 17 web clips, extracted posters, converted 144 render images to WebP, extracted 48 mattes from verified alpha, and removed one byte-identical duplicate from the concept collection. Eight unique concepts are shown. Original files were not changed.

All five Identity sections are represented. The existing footage and concepts include alternate armor designs, so their source-review status remains pending. Derived Identity explicitly awaits R&D. REUSE / CREATE / ADAPT preserve the agreed labels and accept campaign briefs. Requests use a prepared provider contract and return awaiting-output until genuine R&D results are registered.

## Verification

- Production TypeScript/Vite build passed.
- Desktop rendering inspected at 1440 x 1000; mobile at 390 x 844. No horizontal overflow or broken loaded images observed.
- The Three.js asset loaded. Pointer orbit changed the rendered view; screenshot analysis identified 6,833 colored pixels and 17,611 changed pixels between orbit captures.
- Double-clicking a production clip opened the modal. Playback reported readyState 4 and paused false; seeking and close worked.
- Hover-scrub moved a 6.206-second clip to 4.344 seconds at approximately 70% across its tile; the preview completed decoding and remained muted.
- Paused turntable pass switching retained frame 17 across Beauty and Depth. All four pass views shared the current frame.
- Search for walking returned two matching production clips.
- Campaign selection updated the brief fields. Preparing a brief produced an awaiting-output record and saved its draft locally.
- CREATE opened its identity-grounding view. ADAPT saved a 9:16 selection, which remained selected after reload.
- Browser error log was empty in the inspected session.

Temporary visual captures are stored in .verification, which is ignored. These are interaction/rendering checks, not a unit or regression test suite.

## Remaining Work

The revised mission requires real image-LoRA training/use/comparison, curated Mark III references, selected anniversary still and new-motion masters, and result registration. Planned R&D order is RunComfy image-LoRA training -> reviewed still generation -> H3 Max on RunComfy using the selected still -> reviewed motion -> ADAPT. H3 Max receives pixels, not the FLUX adapter; Wan/LTX remain fallback/challenger options. Migrate the app to CREATE-first anniversary briefing and ADAPT master-to-placement previews/exports. The gaps checklist owns remaining acceptance work. REUSE/ID-V2V is experimental if time, no longer required; a direct video LoRA is a separate follow-on experiment. No H3 Max run or live integration is claimed by this documentation update. The current UI does not invent results or claim live inference.

Later interaction refinement (same date): single-click media expansion superseded the initially tested double-click entry, and canonical tiles gained independent hover playback while expanded pass switching retained frame synchronization. Labels now read Canonical Identity Kit and Authoritative asset representation; the workspace uses the Marvel logo in a square tile. Earlier verification bullets are retained as historical observations rather than rewritten as new tests.

Public deployment, Git staging, and commits have not been performed. The local server is available for review; staging and committing remain behind explicit user approval.
