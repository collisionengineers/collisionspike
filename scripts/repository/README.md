# Repository inventory and hygiene checks

These scripts provide a deterministic inventory and two cleanup gates without adding package-script wiring.

Generate the normal tracked-file inventory:

```powershell
node scripts/repository/generate-inventory.mjs
```

Include unignored working-tree additions or select another repository-relative output path:

```powershell
node scripts/repository/generate-inventory.mjs --include-untracked --output .plan-006-baseline/repository-inventory.json
```

The inventory uses repository-relative POSIX paths and stable path ordering. It has no timestamp. Directories
have a null digest because they have no byte stream. The inventory file also has a null digest because a file
cannot contain a stable digest of itself; its byte size is calculated to a fixed point and is exact.

Run the tracked-output gate:

```powershell
node scripts/repository/check-tracked-outputs.mjs
```

Evidence archives under the case corpus, ticket evidence, and reviews are allowed. Deployment staging trees,
local run output, cache/build folders, generated-source markers, and unexplained archives fail the check.

Run the retired-surface gate:

```powershell
node scripts/repository/check-retired-platform.mjs
```

Configured signatures are stored as neutral Base64 values so the checker does not reintroduce the text it is
designed to remove. The check scans tracked repository paths and text. It also reads XML and relationship parts
inside ZIP-based Office documents using Node's built-in ZIP/deflate support. Encrypted entries, ZIP64 structures,
unsupported compression methods, or configured expansion limits produce scan errors and a distinct exit code.

Both checks accept `--json`. The retired-surface gate also accepts `--limit <count>` for concise console output.
Exit code `0` means pass, `1` means policy violations, and `2` means the content scan was incomplete.
