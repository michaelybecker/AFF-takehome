# Generative Pipeline — local application

Updated September 8, 2026. Marvel Studios / Powered by Firefly Foundry. Hypothetical Disney interview prototype; this folder is the application boundary. Source footage, EXRs, training archives and plans remain in the parent workspace.

This README covers application setup, workflow, APIs and storage. See [build notes](BUILD_NOTES.md) for implementation evidence and [assistant instructions](server/assistant-skills.md) for the runtime communication contract.

## Run locally

Node 22+ recommended. Clone the application repository (its root is the webapp; there is no additional webapp subdirectory):

```sh
git clone git@github.com:michaelybecker/AFF-takehome.git
cd AFF-takehome
```

Install dependencies and start the local application:

```sh
npm ci
npm run dev
```

The checked-in browser media is sufficient for browsing the demo without provider keys. Do not run media preparation for a normal clone: those optional scripts require the original source workspace. Private jobs and project state are not included in Git. When Blob sync is configured, local and hosted sessions share the migrated workspace.

To enable live services, copy `.env.example` to `.env.local` (PowerShell: `Copy-Item .env.example .env.local`; macOS/Linux: `cp .env.example .env.local`), fill in the relevant server credentials and restart Vite. Generation also depends on access to the configured model/checkpoint and hosted references; credentials alone do not recreate the original training environment. Do not overwrite an existing `.env.local`.

Default local URL: http://127.0.0.1:5173. Vite can choose another port if occupied. `npm run build` performs TypeScript/Vite checks. `npm run preview` serves the static build only; it does not run local API middleware. Motion format preparation requires ffmpeg on PATH. Sharp and ag-psd handle still preview/PSD preparation.

Use `.env.example` as the complete configuration checklist. Add values to `.env.local` without replacing existing secrets. Restart the dev server after configuration changes. Never use VITE_ prefixes for secrets or include private files in public assets.

| Capability | Configuration |
| --- | --- |
| Assistant | OPENAI_API_KEY; optional OPENAI_MODEL (code default gpt-5.4) |
| Stills | RUNCOMFY_API_KEY; CONTENT_STUDIO_STILL_BACKEND=krea; CONTENT_STUDIO_LIVE_ENABLED=true |
| Motion | RUNCOMFY_API_KEY; CONTENT_STUDIO_MOTION_ENABLED=true |
| Shared workspace and references | BLOB_READ_WRITE_TOKEN for the same public Vercel Blob store locally and on Vercel |
| Demo access | Temporarily open for browsing, generation, curation and export; no access code required |
| Private media directories | CONTENT_STUDIO_DATA_DIR and CONTENT_STUDIO_MOTION_DATA_DIR; default .local-data/stills and .local-data/motion |
| Metadata utility | CONTENT_STUDIO_FFPROBE_PATH, or ffprobe on PATH |

Historical direct-Comfy configuration exists for recovery, not new Krea submissions. No cumulative application generation allowance is enforced. Personal payment confirmation is absent from the enterprise UI; availability, same-origin/session validation, concurrency and unknown-job recovery still apply.

## Product routes and persistence

IDENTITY / CREATE / ANIMATE / DELIVER are peer header tabs. Hash routes are #/identity and #/activate/create, #/activate/animate, #/activate/deliver; ACTIVATE is not a visible parent. Sidebars link to contextual sections, not duplicated workspace tabs. Michael Becker's account panel is a Firefly-inspired mock signed-in view, not hosted authentication.

Master/source choices, mode and framing are session-only and reset on reload. Explicit Save brief and project create/edit/delete operations are device-local. Format preset edits/removals are session-only. Assistant conversation/evidence is session state.

Sandbox combines prepared candidates with completed jobs recovered from the shared durable history. Removal uses server tombstones in `.local-data/explorations.json`, reconciled with browser state. It survives reload; never clear that ledger to reset a gallery. Removal keeps private generation provenance and shared identity media; removal hides the item without deleting shared media or provenance. Both still/motion galleries allow drag to master and assistant, card actions and modal handoffs. Galleries/pickers paginate after eight (nine for Sample results); viewer arrows stay within the full category. Page controls do not explicitly scroll.

## Generation and source lineage

CREATE uses RunComfy Models `runcomfy/krea2-turbo`, bespoke RAW-trained LoRA checkpoint 1500, 1280×720, 8 steps, guidance 1 and strength 1. Server owns model/settings; no arbitrary client graph, URLs or model switch. FLUX.2 Klein 4B/750 remains historical baseline evidence. The 18-pair user preference result favors Krea but does not prove controlled identity fidelity.

ANIMATE uses H3 Max image-to-video with one explicit starting image, mode=image-to-video and referenceIds=[]. Animate this still is an explicit handoff; opening the tab alone does not choose an image. Runtime catalog determines which project stills/curated images are executable. The image LoRA contributes through source pixels, not video-model weights. The separate H3 video-LoRA pilot was canceled and is research only.

`node scripts/host-references.mjs` explicitly publishes reference images using Blob configuration, verifies content hashes and writes `server/hosted-references.json`. Source and generated references retain distinct lineage. Public URLs remain available until removed; rebuilding a catalog does not delete old objects. No arbitrary user-upload flow is implied.

`/api/stills` and `/api/motion` use the shared authenticated workspace when Blob sync is enabled, or local sessions and files without it. Preserve request UUIDs for idempotent recovery. There is one unresolved job per service and submission spacing; queued/unknown outcomes must be reconciled before replacements. Do not delete ledgers/locks to bypass unresolved work. Provider cancellation must be confirmed; a local stop is not cancellation proof. Keep the stopped tenth breadth job excluded.

Completed results retain input/model/checkpoint/source metadata and hashes. Motion metadata is measured with ffprobe when available; fallback/requested duration must retain its provenance. Source aspect/duration requests are not proof of exact output dimensions/timing. Media endpoints support authenticated retrieval and video byte ranges. Provider errors and keys stay server-side.

## Assistant transport and communication

The OpenAI-backed AI Assistant (Beta) receives supplied conversation, app snapshot and optional visual evidence. It is neither Adobe Firefly Assistant nor Codex. [assistant-skills.md](server/assistant-skills.md) is loaded as runtime instructions; `server/assistant.mjs` owns strict schemas and validation, `src/assistant-bridge.ts` owns frontend execution/receipts, and `src/StudioAssistant.tsx` owns conversation/proposals.

One chronological docked/expanded conversation supports project/brief proposals, navigation, master selection, requested generation, regeneration and review. Explicit create/animate/iterate requests set confirmRequired=false and start directly. Prompt-only options use true and stay editable. Navigation/identity inspection run directly; project/brief/master changes retain Apply controls. Attachment or critique alone does not generate. Regenerate keeps the original and uses a fresh seed.

Asset drag or Ask assistant about this supplies the actual selected asset. Review sends still pixels or ten timestamped video samples with up to four comparisons. The evidence panel distinguishes source references from fallback comparisons. Samples do not certify continuous motion or audio. Tools remain available on visual turns for explicitly requested iteration; review is not a reason to refuse an available generation action.

The assistant resolves titles/attachments/lineage, asks only for missing choices, and proposes imaginative requested shots. Proposals are not execution receipts. Queued means submitted, completed means completed; unsupported success claims are prohibited. No assistant tool exists for PSD preparation/export, cloud upload, deletion or custom placement creation. Explain the UI controls instead.

`GET /api/assistant?action=status` reports configuration, not proven provider health. `POST /api/assistant` requires JSON and X-Content-Studio: 1, with `{messages, context, review?}`. Responses contain `{text, actions}`; action UUIDs are not job IDs. Review images are bounded inline JPEGs, not arbitrary fetched URLs.

Responses API calls use store:false, strict schemas, tool_choice:auto, parallel_tool_calls:false and max_output_tokens:2400. One provider request is made per turn; the server does not execute returned functions. Runtime defaults/limits are authoritative in the code: 8 MB body, 64 KiB text context, 24 messages, 6000 characters/message, up to 14 evidence images, 40-second upstream timeout, at most four returned actions, one active request with spacing/rate limits. No automatic retry. store:false does not itself guarantee zero provider retention.

| Tool | Contract |
| --- | --- |
| create_mission | Project metadata; wait for frontend-assigned project ID receipt |
| update_brief | missionId and complete nullable fields object; null means unchanged |
| generate_still | missionId, direction, confirmRequired boolean |
| generate_motion | missionId, sourceId, direction, duration 5–15, mode=image-to-video, referenceIds=[], confirmRequired boolean |
| inspect_identity | Existing section enum; navigation only |
| navigate | identity/create/animate/adapt |
| select_master | Same-project masterId and matching still/motion kind |

Legacy mission identifiers remain internal. update_brief retains old copy/graphics fields for schema compatibility; they do not enable DELIVER typography. Its placement enum remains A01–A04; custom placements are UI-only. Check `assistantTools` for exact field constraints instead of inventing capabilities.

## DELIVER: prepare applicable formats, then export individually

`server/deliveries.mjs`, `src/Activate.tsx`, `src/DeliveryOutputs.tsx` and `src/DeliveryPreview.tsx` implement format preparation. No provider inference is called. Choose one source artwork, frame it, then click Prepare formats to prepare every applicable preset (including custom placements) sequentially. Motion sources supply motion formats and their first decoded frame supplies still PSDs. Still sources supply still formats; motion presets are N/A. Review and export one output at a time. Saved history is scoped to both the selected source and placement. Entering DELIVER from CREATE/ANIMATE carries that workspace’s selected master.

Default dimensions: A01 1600×2400 still; A02 1600×2000 still; A03 1080×1920 motion; A04 1920×1080 motion. Custom dimensions 64–4096 per axis, even for motion. These are demo canvases, not delivery compliance.

Stills use Sharp for a transparent PNG preview and ag-psd for a PSD containing an embedded original Smart Object with editable transform. Source bytes are unchanged; resizing affects preview/display sampling. An enlargement note does not imply restored detail. No AI upscale, outpainting, typography or anniversary graphics. Continue finishing in Photoshop.

Motion uses ffmpeg scale/crop/pad and H.264/AAC MP4 with available source audio. It is flattened media for downstream editing, not a native Premiere/After Effects project. Existing flattened PNG/MP4 outputs remain intact and labeled.

POST /api/deliveries validates workspace access, selected source, layout and dimensions, prepares one version and returns metadata. GET with action=list and campaignId lists saved records; action=file&id=... serves preview/media; format=psd serves the editable file; download=1 uses attachment disposition. Source files resolve from trusted project job/asset records, not arbitrary client paths. Work is serialized and request IDs are idempotent. PNG/MP4/PSD and JSON use Blob in shared mode, or `.local-data/deliveries` in local mode; metadata is published after preparation succeeds. Preparation batches applicable formats; export remains individual. No bulk export or native video project format is implemented.

Prepare formats saves each completed output and shows batch progress without downloading. Select a preset to review its saved outputs. Export to computer downloads that saved PSD/MP4. Export to Creative Cloud opens an explicit disabled destination mockup, not an upload. [Adobe's cloud-export documentation](https://helpx.adobe.com/photoshop/desktop/save-and-export/export-files-to-different-formats/export-to-cloud.html) informed the proposed destination; no SDK integration is claimed.

PSD structure, source-byte equality, transparency and download have been verified. Direct opening/editing in Photoshop remains outstanding. Review source sharpness and actual delivery requirements separately.

## Media preparation, evidence and deployment

`public/media` contains deployable browser assets/manifest; do not copy the full source workspace, private jobs or weights there. `npm run prepare:media` requires sibling source/brand folders and ffmpeg/ffprobe. It preserves registered campaign masters. Sample-results records must remain consistent between the manifest and derived sample catalog. Training collection versions/checksums should not be silently replaced. Internal derived paths retain historical naming.

The source collections and generated showcase are distinct. Requested additions are Stratosphere, After the landing and Harajuku landing. Showcase selection is not approval. User curation overrides automatic imports. See [build notes](BUILD_NOTES.md) for implementation evidence and verification limits.

Vite middleware and Vercel API functions use the same shared-workspace adapter. `vercel.json` includes the manifest, runtime instructions/catalogs and Linux ffmpeg binary. Vercel serves public reference media as static files; functions fetch trusted references when needed. API functions have a 300-second maximum duration. Provider configuration and access must also exist in the deployment environment; a successful build alone does not prove provider execution.

## Shared Blob workspace and migration

Use the **same** `BLOB_READ_WRITE_TOKEN` in `.env.local` and Vercel Production. No Redis/database variable is required. Existing source-reference URLs remain intact.

Before first use, run from the repository root:

```sh
npm run migrate:workspace
```

The command backs up local ledgers/exports, uploads media, and publishes encrypted state. It refuses to replace an existing workspace. Rerunning verifies the existing store. The local originals and migration backup remain untouched. Existing completed/failed jobs, exports, Sandbox entries and removal tombstones are retained. For a fresh workspace with no local history, the command initializes empty ledgers.

Existing shared project definitions are read for compatibility only when device-local settings are absent. The browser no longer uploads workspace settings or selections to Blob.

Generated assets, job history, prepared outputs and Sandbox curation remain durable through their server endpoints. Shot selection, mode changes and framing do not write to Blob. Gallery/job data refresh on access/polling.

This is event-driven synchronization of app operations, not a directory watcher. Editing local JSON with an external script does **not** publish it. Code and bundled media still deploy through Git push. Use the hosted app for a single operational workspace, or localhost for development against the same state.

The demo is temporarily open by explicit owner request: browsing, assistant, generation, shared saves, curation and exports require no access code or cookie. `CONTENT_STUDIO_REVIEWER_TOKEN` is ignored by the shared adapter. Same-origin request validation remains. Server credentials never go to the browser. Generation reservations are persisted before provider submission; polling resumes existing jobs after a serverless restart. No background worker is required: provider work continues, and the next active browser poll retrieves its result.

Metadata is encrypted with AES-256-GCM because the existing Blob store is public. Media remains public to anyone with its URL, as it was before. A conditional writer lease serializes mutations. Public Blob caches mutable content, so authoritative HEAD ETags select immutable encrypted snapshots; conditional writes reject concurrent updates. Expired leases can be recovered after 330 seconds. Failed writes do not publish uncommitted metadata. Historical snapshots/media are retained; garbage collection is intentionally not automatic.

Optional settings: `CONTENT_STUDIO_BLOB_PREFIX` selects a separate workspace; `CONTENT_STUDIO_BLOB_SYNC=false` retains local-only operation. `CONTENT_STUDIO_STATE_SECRET` controls encryption when set, otherwise the Blob token derives the key. **Do not rotate the token or change the state secret without re-encrypting existing state using the old key.** Keep configuration identical locally and remotely. A new prefix needs its own migration. This open, single-workspace demo has no user authorization or enterprise SSO.

About → Technical inspector checks RunComfy configuration/connection; assistant Context and connection reports its own status. A successful lookup is not a successful generation. Cached public media can run without provider keys.

Repository is rooted in webapp. Do not stage/commit without explicit approval. Existing ignored/private paths remain private. Verify builds and actual UI/media behavior; do not build prototype unit/regression suites. Documentation changes are not evidence that a pending check passed.

Prepared-format cards include **Delete format**. Removal persists in the shared record (`deletedAt`), hides it from history and disables its app export URL. Source masters and retained Blob media/provenance are not erased. Repeating a delete is safe; retrying the original preparation ID does not restore a deleted version.


### Session-only workspace controls
Shot/master selection, mode changes and framing stay in memory and reset on page refresh. CREATE and ANIMATE open with no selected master; the motion master is labeled Key shot. Save brief and custom placement definitions are device-local. Browser settings never POST to Blob. Existing generated Sandbox media, generation recovery records, prepared outputs and curation/deletion remain shared and durable.
