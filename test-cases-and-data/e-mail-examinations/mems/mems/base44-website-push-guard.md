---
name: base44-website-push-guard
description: collision-engineers-website is the LIVE base44 site — never modify/push it autonomously; pushes must always be user-requested and double-checked
metadata: 
  node_type: memory
  type: feedback
  originSessionId: fa6f92ad-edcc-45a9-bb2e-d86bdd9b8bd5
---

`collision-engineers-website` (at `active/web-dev/current-website/collision-engineers-website/` inside [[collisionsuite-structure]]) is Collision Engineers' **LIVE company website, hosted on base44**. It is a standalone nested git repo.

**Why:** A git push to this repo changes the live production website. base44 dictates its structure, so the structure and contents must not be altered.

**How to apply:** Never modify its structure/contents and never commit or push it autonomously. Any commit/push to this repo must **always be explicitly requested by the user and double-checked first**. Its parent `active/web-dev/` is a separate repo (planning/design) — these guards apply only to the nested `collision-engineers-website` repo.
