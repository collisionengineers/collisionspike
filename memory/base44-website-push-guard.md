---
name: base44-website-push-guard
description: collision-engineers-website is the LIVE base44 production site (nested repo under web-dev/) — never modify or push it autonomously; any commit/push must be user-requested and double-checked.
metadata:
  type: feedback
---

`collision-engineers-website` (a nested git repo under `active/web-dev/current-website/` in the
suite — see [[suite-structure]]) is Collision Engineers' **LIVE company website, hosted on base44**.

**Why:** a git push to this repo changes the live production website. base44 dictates its structure, so
the structure and contents must not be altered.

**How to apply:** never modify its structure/contents and never commit or push it autonomously. Any
commit/push to this repo must be **explicitly requested by the user and double-checked first**. Its
parent `active/web-dev/` is a separate planning/design repo — the guard applies only to the nested
`collision-engineers-website` repo. (This is cross-project context; collisionspike work does not touch
the website.)
