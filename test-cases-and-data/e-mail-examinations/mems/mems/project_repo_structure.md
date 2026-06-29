---
name: project-repo-structure
description: web-dev repo layout and critical git rule about the live website
metadata: 
  node_type: memory
  type: project
  originSessionId: a15a1a0b-9c8d-4880-acd3-1d89bc3120e8
---

The `web-dev/` directory is a planning/work repo. It contains two subdirectories:

- `current-website/collision-engineers-website/` — the live production website with its **own separate git repo**. It is excluded from the outer web-dev repo via `.gitignore`. The main GitHub branch of this inner repo must **never be pushed**.
- `new-designs/` — design work and prototypes

**Why:** The outer repo is for planning and new design work. The inner repo is the live site and needs its branch history kept separate and controlled.

**How to apply:** When working on the live website, operate inside `current-website/collision-engineers-website/` with its own git context. Never `git add` or commit anything from that path in the outer repo. Warn the user if any action risks pushing the inner repo's main branch.
