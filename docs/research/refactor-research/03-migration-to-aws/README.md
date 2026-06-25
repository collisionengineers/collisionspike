# 03 — Migration to AWS

> **One-line verdict.** Comparable run-cost to Azure PaaS (**~$22–25/mo cheapest-sane**, dominated by
> the **RDS Postgres ~$16/mo** floor; ~$125–150/mo robust), but a **full Functions rewrite** (Azure
> → Lambda) and **new lock-in** (Cognito, Step Functions ASL). Only compelling if leaving Microsoft
> *entirely* is a strategic goal — otherwise Azure PaaS achieves the same cost with far less effort.
>
> Pricing confidence: AWS serverless rates (Lambda, Step Functions, EventBridge, Cognito, SES,
> CloudFront) are **published and region-uniform**; **RDS/Aurora instance + storage rates are
> published us-east-1 base with a London (eu-west-2) estimate** applied — confirm in the AWS Pricing
> Calculator before committing.

See [`00-current-architecture-baseline`](../00-current-architecture-baseline/README.md).

---

## The stack (eu-west-2, London)

| Layer | AWS target |
|---|---|
| UI | **S3 + CloudFront** (or Amplify Hosting) — ~$0 at this traffic |
| Compute | **AWS Lambda** — 6 functions, stays in free tier (1M req + 400k GB-s) |
| Data | **RDS PostgreSQL** db.t4g.micro/small (recommended) *or* Aurora Serverless v2 |
| Orchestration | **Step Functions** (Standard) + **EventBridge** |
| Auth | **Amazon Cognito** (10k MAU free) |
| Email intake | **Microsoft Graph → API Gateway/Lambda webhook** (Outlook stays — see [10](../10-outlook-m365-integration/README.md)). SES only for *outbound* notifications, if any |
| Files | **Box** — unchanged |

## Monthly run-cost

| Component | Cheapest sane | Robust | Note |
|---|---|---|---|
| SPA (S3 + CloudFront) | ~$0.50 | ~$6 (+WAF) | CloudFront free: 1 TB egress + 10M req/mo |
| Lambda (6 functions) | **$0** | ~$5 | Stays in free tier at this volume |
| **Database (RDS db.t4g.micro + 20 GB gp3)** | **~$16** | t4g.small Multi-AZ **~$60** | The dominant line-item |
| *(alt Aurora Serverless v2)* | ~$15–30 (scale-to-0) | ~$50–100 | 0.5-ACU floor ~$51/mo if pinned; can now scale to 0 (~15 s cold start) |
| Step Functions + EventBridge | ~$0.50 | ~$1 | 4,000 transitions/mo free |
| Cognito | **$0** | ~$0.20 | 10k MAU free |
| Email intake (Microsoft Graph) | **~$0** | ~$0 | Graph is free with existing M365 licences; build cost is the webhook + renewal, see [10](../10-outlook-m365-integration/README.md) |
| SES (optional *outbound* only) | ~$0.50 (≈$0 yr 1) | ~$1 | 3,000 msgs/mo free for 12 months; **not** used for intake |
| Supporting (CloudWatch, Secrets Mgr) | ~$5 | ~$20 | |
| **TOTAL** | **~$22–25/mo** | **~$125–150/mo** | |

⚠️ **Hidden-cost flag:** if Lambdas run in a VPC to reach RDS privately *and* need outbound internet,
a **NAT Gateway adds ~$33/mo**. Avoid with VPC endpoints / same-subnet RDS, or cheapest-sane jumps to
~$55–60/mo.

## Billing model

Pure consumption; no per-user licensing. RDS is the one always-on fixed cost. **Bill does not grow
with staff headcount.**

## What you'd rebuild

- **6 Functions → 6 Lambda:** near 1:1 Python repackage (cheapest part), but the AWS event-wiring +
  IAM glue is new. Package as containers to cut even that. ~1 week.
- **React app:** ports to S3/CloudFront; you lose Power Apps' auto-generated data services and must
  hand-build the API client + Cognito auth.
- **Dataverse → RDS Postgres:** schema + the row-level security, audit, business rules, choice
  metadata Dataverse gave for free.
- **15 flows → Step Functions (ASL) + EventBridge + Lambda:** the expensive rewrite. Email intake
  shifts from the native Outlook connector to a **Microsoft Graph subscription + webhook + renewal
  loop** (Outlook stays the mail system — see [10-outlook-m365-integration](../10-outlook-m365-integration/README.md)).
  This Graph integration is the one Microsoft-flavoured workstream that leaving Azure doesn't shed.

## Vendor lock-in profile — **MEDIUM** (LOW if you keep RDS Postgres + containers)

| Choice | Lock-in |
|---|---|
| RDS PostgreSQL | **Low** — `pg_dump` anywhere |
| React SPA / S3 | Low–Medium |
| Lambda / containers | Medium |
| **Cognito** | **High** — password hashes aren't exportable; user migration = reset flow |
| **Step Functions (ASL)** | **High** — proprietary states language, rewritten to move |
| DynamoDB | High — *not* in the recommended build (RDS chosen to avoid it) |

Keeping RDS Postgres + portable containers holds this at MEDIUM; leaning on DynamoDB + deep IAM would
push it HIGH.

## UK/EU data residency

✅ **eu-west-2 (London), 3 AZs.** GDPR DPA covers UK + EU GDPR; ISO 27001/27017/27018, SOC, Cyber
Essentials Plus, G-Cloud; pin data at rest to eu-west-2. **Caveats:** AWS Inc. is US-HQ (US CLOUD Act
is a theoretical vector — the separate AWS European Sovereign Cloud is the answer for strict
sovereignty, not the London commercial region); a few global control-plane/edge services run
out-of-region.

## Pros / Cons

**Pros:** mature, deep service catalogue; RDS Postgres is portable; comparable cost to Azure PaaS;
moves the *app* fully off Microsoft. **Cons:** full Functions rewrite (vs zero on Azure PaaS);
Cognito + Step Functions add fresh high-lock-in surfaces; NAT Gateway foot-gun; more IAM/ops
complexity than the indie options for the same small workload; **email intake still depends on M365
via Microsoft Graph — Outlook isn't escaped**, and that subscription/webhook/renewal build is extra
effort vs Azure's native connector (see [10](../10-outlook-m365-integration/README.md)).

## Sources

- Lambda — https://aws.amazon.com/lambda/pricing/ · RDS Postgres — https://aws.amazon.com/rds/postgresql/pricing/ · Aurora (scale-to-0) — https://aws.amazon.com/rds/aurora/pricing/ + https://aws.amazon.com/about-aws/whats-new/2024/11/amazon-aurora-serverless-v2-scaling-zero-capacity/
- Step Functions — https://aws.amazon.com/step-functions/pricing/ · EventBridge — https://aws.amazon.com/eventbridge/pricing/
- Cognito — https://aws.amazon.com/cognito/pricing/ · SES — https://aws.amazon.com/ses/pricing/ · CloudFront — https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/ · S3 — https://aws.amazon.com/s3/pricing/ · Amplify — https://aws.amazon.com/amplify/pricing/
- Confirm eu-west-2 instance rates — https://calculator.aws/
