---
name: windows-worktree-esbuild-lock-cleanup
description: Removing a git worktree on Windows fails while a vite/esbuild dev server left locked node binaries — kill the survivor processes first
metadata: 
  node_type: memory
  type: reference
  originSessionId: 8679fd3b-5072-4990-97ef-5cb3bd17046b
---

On this Windows box, `git worktree remove --force` (and `Remove-Item`/`rmdir /s`) fails with
"Invalid argument" / "Access is denied" / "being used by another process" on
`node_modules/@esbuild/win32-x64/esbuild.exe` and `@rollup|@rolldown/*.node`. Cause: a `vite`
dev server spawns a **long-lived `esbuild.exe` service** child that **survives `TaskStop`** of the
`npm run dev` background task, keeping those binaries locked.

Fix before removing a worktree: kill only the processes whose path is under that worktree, then rmdir + prune:
```
$wt='...\.worktrees\<name>'
Get-CimInstance Win32_Process |
  ? { ($_.ExecutablePath -like "$wt*") -or ($_.CommandLine -like "*$wt*") } |
  ? { $_.Name -in 'node.exe','esbuild.exe' } |          # avoid killing the current pwsh.exe (its cmdline also matches $wt)
  % { Stop-Process -Id $_.ProcessId -Force }
cmd /c "rmdir /s /q `"$wt`""
git -C <mainrepo> worktree prune
```
Don't `Stop-Process` the pwsh running the command — filter by process name. Related: worktrees are the
right isolation when the shared main checkout is in use by another agent (see how TKT-098 was built on
branch `feat/tkt-098-inbox-pagination`).
