# The tool's responsibility ends at EVA submission + Box archival (the EVA handoff)

The spike's scope ends when a Case is submitted to EVA and archived to Box — the "EVA handoff." The
subsequent **engineer assessment, report generation, and return-to-client are out of scope**: they
happen in EVA / by the engineers, not in this tool. The tool's job is to **intake, parse, enrich,
validate (readiness), and hand off** cases — it does not perform or track the assessment itself.
Terminal Case statuses are `eva_submitted` / `box_synced`.
