# Verification — TKT-075: Rebuild the inspection-address corpus in-repo — correct provider attribution + geocodes

## Verdict
PENDING

## Evidence
(not yet verified)

## Pending / gaps
Implementation not started. Blocked on TKT-074 (terminal commands blocked) for any run/test.

## How to re-verify
Per the ticket's **Verification requirements**: Python unit tests + determinism hash check;
scripted PII scan of the emitted CSV + `git check-ignore` on the source `.xlsx`; double
scratch-DB apply of the DDL delta + `920` seed with before/after counts (confirmed rows
preserved); verify-all + check-doc-links green. The live reseed is verified under TKT-080.
