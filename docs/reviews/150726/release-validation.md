# Release validation — PR #100

## Decision

The reviewed application at `806d2372d0801dcd086e5f6acc11346df7212b2c` was deployed to the existing
development resources on 2026-07-16. The release is healthy under the required safety posture. This was a
code/schema rollout, not a live Archive, mailbox, public-capture or EVA cutover.

## Database

- Applied only `database/migrations/2026-07-15-tkt165-evidence-added-audit.sql` after confirming the other
  required additive objects were already present.
- Read back `100000049 / evidence_added / Evidence Added` and passed live parity for all 22 numeric code
  tables.
- Verified 78 public base tables and the eight required new columns.
- Verified forced row-level security and policies on the 12 required capture, Archive-holding, MCP image,
  evidence-deletion and provider-idempotency tables.
- Verified the guarded `complete_evidence_deletion(uuid, uuid)` function signature.
- Every exact-IP temporary firewall rule was removed; no `codex-pr100-*` rule remained.

## Deployment

| Surface | Result |
| --- | --- |
| Archive function | Running; 16 registered functions |
| EVA function | Running; one canonical `eva_instruction_inspection` function |
| Data API | Running; 144 registered functions |
| Orchestration | Running; 101 registered functions |
| Staff web app | Existing production URL returned 200 |

The first Data API publish contained the bundle and lockfile but not production dependencies, so it
registered zero functions. Publishing stopped before orchestration. The cause was established, production
dependencies were installed, and the corrected package registered all 144 functions. The API was then
repackaged for Azure's Linux x64/glibc runtime; `file` identified Sharp and libvips as x86-64 ELF shared
objects before the final successful publish. Repository CI now builds the same self-contained artifact.

The short API-unavailable window produced eight `boxFileRequestOutboxDrainActivity` exceptions, latest at
00:03:21 UTC. From the completed orchestration deployment at 00:08:08 UTC through the 00:15 UTC readback,
both API and orchestration telemetry contained zero exceptions and zero failed/5xx requests.

## Safety readback

- `OUTLOOK_MOVE_ENABLED=false` on both the Data API and orchestration. The Graph service principal had no
  tenant-wide Microsoft Graph application role or delegated grant; scoped mail reads remain under the
  existing Exchange application boundary.
- `BOX_ALLOWED_ROOT_ID=392761581105`, the approved test folder. No Box endpoint was invoked with a key and
  no Archive write was used as proof.
- `EVA_API_ENABLED` remained false or absent. No EVA request was sent.
- `DELETE_CASE_IMAGE_ENABLED`, `PUBLIC_CAPTURE_ENABLED`, `CAPTURE_CLEANUP_ENABLED` and
  `MCP_IMAGE_INGEST_ENABLED` remained absent/default-off. These capabilities are deployed dark because
  their ticket-specific live evidence is incomplete.
- The existing read-only MCP server was not reimplemented. The retired reciprocal review hook was not
  restored or replaced.
- No role assignment, production Archive root, traffic switch or live cutover was changed.

## Ticket decision

Deployment is not substituted for acceptance evidence. TKT-055, TKT-154, TKT-160, TKT-165, TKT-200 and
TKT-216 remain in their current non-done folders until their legitimate-key, dedicated-principal,
designated-test, device or external-provider proofs exist. TKT-210 remains `now` while six exact source-size
ratchets remain. BOARD generation enforces the resulting folder/frontmatter parity.
