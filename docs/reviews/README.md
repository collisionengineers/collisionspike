# Reviews — binding manual user reviews

`docs/reviews/` holds **manual reviews authored by the user**. A review is the **authoritative
statement of requirements** for the areas it covers: it **corrects any drift** in the code/docs and
**sets the spec**. Treat a review as binding.

> **Precedence:** the only thing that can supersede a review is a **later review**. A review outranks
> older docs, plans, ADRs, and prior code. Where a review and an older document disagree, the review
> wins — then update the older document to match (and note it was reconciled to the review).

## How a review folder is structured

```
docs/reviews/<DDMMYY>/            dated folder, e.g. 190626 = 19 June 2026
  overview.md                     the entry point — one lead task, then a pointer to each subfolder
  process.md                      how to action the review (tools to use, the working method)
  checklist.md                    the sign-off sheet — one section per task, each with a
                                  "Changes made and actions taken:" block to complete
  <area>/                         one subfolder per area under review, e.g.
    review.md                     the area's findings/requirements (numbered issues)
    *.png                         annotated screenshots / spec images for that area
```

Area subfolders seen so far: `broad-review`, `dashboard`, `nav-bar`, `new-case`,
`queues-cases/queues`, `queues-cases/caseview`, `corpus-admin`, plus supporting detail folders like
`evacreation` (referenced by another area's `review.md`).

## How to action a review (the method)

1. Start at `overview.md`, then `checklist.md`.
2. For **each** area subfolder: **view every image**, turn each step in its `review.md` into a tracked
   to-do, implement all the requirements, then fill that task's **"Changes made and actions taken"**
   block in `checklist.md`.
3. Proceed through every task until `checklist.md` is complete and no issues remain.
4. Use the tools `process.md` lists (Microsoft Learn for any code change; Azure / Power Platform CLI;
   Playwright / Chrome DevTools for live UI verification) and the project agents where they fit.

## Watch-outs

- **Count check.** `checklist.md` states the issue count per task (e.g. "17 issues raised on new-case").
  Reconcile against the area's `review.md` so nothing is missed.
- **Label vs content.** `overview.md` labels and `checklist.md` labels can disagree (in `190626`,
  overview maps 5a→queues / 5b→caseview, but the checklist maps **5a→caseview (11 issues)** and
  **5b→queues (3 issues)**). The **checklist is the sheet you sign off**, so follow its content mapping
  and flag the discrepancy.
- **Honesty over green ticks.** Some requirements are gated on operator/live steps (live inboxes,
  connector binding, EVA dev sign-off). Implement everything implementable offline, and record what is
  operator-gated plainly in the checklist rather than faking completion.

## Index of reviews

| Date | Folder | Scope | Status |
|---|---|---|---|
| 2026-06-19 | [`190626/`](./190626/) | Dashboard, nav bar, new case, queues, case view, provider/corpus admin, EVA fields, enrichment status | actioned — see `190626/checklist.md` |
