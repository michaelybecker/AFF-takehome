# Build and Verification Notes

Current summary — September 8, 2026. See [runtime/setup](README.md) for application operation. Checks below are recorded observations, not blanket production certification.

## Repository handoff — September 8, 2026

- `npm run build` passed TypeScript compilation and Vite production bundling for this handoff.
- Vite reports chunks above 500 kB; this is a bundle-size warning, not a build failure.
- README and environment template document fresh-clone setup, optional service configuration, media prerequisites and local-versus-hosted limitations.
- Public gallery media and downloadable datasets are included. The largest file is approximately 76 MB; private job data, credentials, source workspace and model weights are excluded.
- This handoff does not add a new live-generation run or certify Photoshop compatibility. Earlier interaction/media checks and their limits are recorded below.

## Current implementation evidence

- React/TypeScript/Vite app with identity/media inspection and four peer IDENTITY/CREATE/ANIMATE/DELIVER destinations. Header/route changes were built and browser-inspected.
- Generative Pipeline naming, mock Firefly-style Michael Becker account, device-local projects, persistent Sandbox and session-only master choices, durable curation, drag-to-master/assistant, modal actions, category navigation and eight-item pagination are implemented. Final integrated rehearsal remains a separate check.
- Real Krea still and H3 Max image-to-video services, visual review and assistant proposals/receipts exist locally. Review is user-led; explicitly requested generation executes directly, draft-only requests remain editable. The assistant is a separate OpenAI-backed app feature, not Codex/Adobe's assistant.
- Stratosphere, After the landing and Harajuku landing were added to both sample catalogs. Existing Sandbox removals were preserved. Nine breadth runs completed; the tenth was stopped/excluded, not a successful tenth output.
- DELIVER now prepares a single format. Existing/custom presets remain; output history is placement-scoped. Typography and anniversary graphics were removed. Preparation opens a result viewer; exports are separate.

## PSD and export verification

Browser Prepare format produced A01 from After the landing at 1600×2400. Export returned HTTP 200, image/vnd.adobe.photoshop and a .psd attachment. Parsing verified its artwork Smart Object and transform. The embedded source SHA-256 matched the original bytes exactly. PNG preview corner alpha was zero; checkerboard transparency was visually inspected. The viewer reported source enlargement to 125%.

Direct opening, editing and saving in Photoshop has NOT been verified. PSD parsing is not a substitute for that compatibility check. Preview resampling changes displayed pixels; the original embedded source is preserved. No generative edit or AI upscale is involved.

Earlier MP4 checks verified expected 1080×1920 dimensions, source audio, duration metadata and browser playback/range serving. Current motion handoff remains flattened MP4, not a native Adobe video project. Creative Cloud export remains a disabled destination preview.

TypeScript/Vite build passed after implementation. The current documentation pass changes documentation/runtime guidance only and does not establish additional media or Photoshop validation.

## Historical Phase 1 record — September 7

The following is preserved as evidence of that build, not current instructions or outstanding scope. References to older names, REUSE, awaiting-output scaffolding, session-only results or planned generation describe that date. Use the current docs above for operation.

# Phase 1 Build Evidence

Date: 2026-09-07.

Historical implementation/verification record. The later anniversary mission changes planned scope, not what these checks demonstrated. The initial activation skeleton is not yet the planned CREATE -> DELIVER campaign journey.

## Implemented

The app lives in webapp, separately from original source media and planning. Vite/React/TypeScript provide the application shell. Three.js loads the existing GLB and uses a local neutral studio HDR; video and turntable components share expanded-view conventions.

Asset preparation copied 17 web clips, extracted posters, converted 144 render images to WebP, extracted 48 mattes from verified alpha, and removed one byte-identical duplicate from the concept collection. Eight unique concepts are shown. Original files were not changed.

All five Identity sections are represented. The existing footage and concepts include alternate armor designs, so their source-review status remains pending. Derived Identity explicitly awaits R&D. REUSE / CREATE / DELIVER preserve the agreed labels and accept campaign briefs. Requests use a prepared provider contract and return awaiting-output until genuine R&D results are registered.

## Verification

- Production TypeScript/Vite build passed.
- Desktop rendering inspected at 1440 x 1000; mobile at 390 x 844. No horizontal overflow or broken loaded images observed.
- The Three.js asset loaded. Pointer orbit changed the rendered view; screenshot analysis identified 6,833 colored pixels and 17,611 changed pixels between orbit captures.
- Double-clicking a production clip opened the modal. Playback reported readyState 4 and paused false; seeking and close worked.
- Hover-scrub moved a 6.206-second clip to 4.344 seconds at approximately 70% across its tile; the preview completed decoding and remained muted.
- Paused turntable pass switching retained frame 17 across Beauty and Depth. All four pass views shared the current frame.
- Search for walking returned two matching production clips.
- Campaign selection updated the brief fields. Preparing a brief produced an awaiting-output record and saved its draft locally.
- CREATE opened its identity-grounding view. DELIVER saved a 9:16 selection, which remained selected after reload.
- Browser error log was empty in the inspected session.

Temporary visual captures are stored in .verification, which is ignored. These are interaction/rendering checks, not a unit or regression test suite.

## Remaining Work

The revised mission requires real image-LoRA training/use/comparison, curated Mark III references, selected anniversary still and new-motion masters, and result registration. Planned R&D order is RunComfy image-LoRA training -> reviewed still generation -> H3 Max on RunComfy using the selected still -> reviewed motion -> DELIVER. H3 Max receives pixels, not the FLUX adapter; Wan/LTX remain fallback/challenger options. Migrate the app to CREATE-first anniversary briefing and DELIVER master-to-placement previews/exports. The gaps checklist owns remaining acceptance work. REUSE/ID-V2V is experimental if time, no longer required; a direct video LoRA is a separate follow-on experiment. No H3 Max run or live integration is claimed by this documentation update. The current UI does not invent results or claim live inference.

Later interaction refinement (same date): single-click media expansion superseded the initially tested double-click entry, and canonical tiles gained independent hover playback while expanded pass switching retained frame synchronization. Labels now read Canonical Identity Kit and Authoritative asset representation; the workspace uses the Marvel logo in a square tile. Earlier verification bullets are retained as historical observations rather than rewritten as new tests.

Public deployment, Git staging, and commits have not been performed. The local server is available for review; staging and committing remain behind explicit user approval.

## Shared workspace implementation (September 8)

`server/workspace-store.mjs` adapts the existing file-based services to an encrypted Blob snapshot with immutable media and conditional writer leases. `server/workspace.mjs` supplies the hosted access cookie, same-origin checks, shared assistant request spacing, media redirects and request-scoped temporary files. Both Vite and the Vercel API adapters use this path.

`src/workspaceSync.ts` reads legacy shared definitions without uploading browser settings; `WorkspaceGate` hydrates settings before loading the application. Sandbox tombstones, generation reservations and DELIVER outputs persist through their server handlers. Provider polling resumes existing jobs; no inference is needed to migrate records.

Migration verified 61 media hashes, 17 original JSON records and 21 removal tombstones against the local originals. Browser project settings were imported separately. Focused checks cover competing writers, failed-operation rollback, stale browser revisions, saved job lists and Blob media redirects. TypeScript/Vite build passes. Hosted provider execution and direct Photoshop editing require separate validation; no new inference is claimed by these checks.

Vercel deployed commit `93c93c7` successfully. Production `/api/workspace` correctly returns 401 before sign-in. Its existing write-only `CONTENT_STUDIO_REVIEWER_TOKEN` differs from the local derived code; authenticated production recovery is pending sign-in with that configured value. The local shared adapter and a simulated hosted request verified login/session and cross-origin rejection. An isolated format preparation from migrated sources produced a 1600×2000 PSD with its original embedded; it did not add a test output to the shared gallery.

## Temporary open demo access

At the owner’s explicit request, all workspace services now operate without an access code or session cookie. The opening screen only hydrates shared state; it has no sign-in form. Existing reviewer-token environment values do not gate the shared adapter. Same-origin validation, request schemas, job recovery and conditional writes remain. This supersedes the deployment sign-in requirement above.

## Pending local fix: writer cleanup before response

The shared adapter previously ended the actual HTTP response inside the lease scope. A serverless host could suspend cleanup after the response, leaving the 330-second writer lease behind. Responses are now buffered until lease release and temporary-file cleanup finish. Lease release retries uncertain writes using freshly checked ownership and committed state. This change is local only pending the next approved release.

## Pending local DELIVER source and batch preparation

Prepare formats now processes all compatible presets/custom placements sequentially from one source. Motion-to-still preparation extracts the first decoded frame and embeds that PNG unchanged in the PSD Smart Object; a still cannot create motion. Source selection remains session-only, workspace handoffs select the corresponding master, and history is filtered by source plus placement. Exports remain individual. Isolated preparation checks verified motion-to-still, motion-to-motion, still-to-still, and rejection of still-to-motion; the first-frame preview bytes match the PSD embedded source. No verification outputs were added to shared history.


### Session-only workspace controls
Shot/master selection, mode changes and framing stay in memory and reset on page refresh. CREATE and ANIMATE open with no selected master; the motion master is labeled Key shot. Save brief and custom placement definitions are device-local. Browser settings never POST to Blob. Existing generated Sandbox media, generation recovery records, prepared outputs and curation/deletion remain shared and durable.

Assistant requests compact background catalogs and omit bulk training captions, media URLs and unrelated asset provenance. Attached/selected asset details are prioritized; recent conversation turns are fitted to a 60 KiB text budget below the server limit. Verified a 100-asset, 24-turn payload shrank from 1.14 MB to 58 KB while preserving the latest request and focused assets. No inference was submitted for verification.


### Identity workspace and delivery projects
CREATE and ANIMATE are scoped to Iron Man / Mark III, with one identity-wide Sandbox and session-only master/source choices. They have no project selector or inherited anniversary campaign brief. New generations use the identity workspace; historical generated assets remain accessible without rewriting their provenance. DELIVER introduces the project selector and defaults to the anniversary project. Any asset in the identity workspace can supply a delivery project; prepared outputs remain grouped by delivery project and format. This prototype contains one identity; multi-identity isolation is not implemented.

Hosted motion preparation failure: Vercel logs confirmed the bundled FFmpeg rejects force_divisible_by. Replaced it with a second scale filter using even-dimension expressions compatible with the bundled renderer. The exact failing source was rendered locally in contain and cover modes; ffprobe verified both outputs as 1920x1080. Checks used temporary read-only workspace hydration and added no shared outputs. Hosted verification remains pending deployment.
