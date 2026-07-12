import assert from "node:assert/strict";
import test from "node:test";

import {
  digestVisibleBody,
  evaluateReviewMarkers,
  parseReviewComment,
} from "./review-marker-status.mjs";

const HEAD = "1".repeat(40);
const BASE = "2".repeat(40);
const STALE_HEAD = "3".repeat(40);
const STALE_BASE = "4".repeat(40);

function marker({ reviewer, body, head = HEAD, base = BASE, outcome = "pass" }) {
  return `<!-- reciprocal-review:v1 reviewer=${reviewer} head=${head} base=${base} result=sha256:${digestVisibleBody(body)} outcome=${outcome} -->`;
}

function reviewComment({
  id,
  reviewer,
  body = `${reviewer} reviewed the complete diff. No blocking findings.`,
  head = HEAD,
  base = BASE,
  outcome = "pass",
  association = "MEMBER",
  updatedAt,
}) {
  return {
    id,
    body: `${body}\n\n${marker({ reviewer, body, head, base, outcome })}`,
    author_association: association,
    created_at: updatedAt ?? `2026-07-12T12:00:${String(id).padStart(2, "0")}Z`,
    updated_at: updatedAt,
    user: { login: `${reviewer}-reviewer` },
  };
}

function evaluate(comments) {
  return evaluateReviewMarkers({ comments, headSha: HEAD, baseSha: BASE });
}

test("both trusted passing reviews bind to the exact current head and base", () => {
  const result = evaluate([
    reviewComment({ id: 1, reviewer: "claude", association: "OWNER" }),
    reviewComment({ id: 2, reviewer: "codex", association: "COLLABORATOR" }),
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.state, "success");
  assert.equal(result.reviewers.claude.status, "pass");
  assert.equal(result.reviewers.codex.status, "pass");
});

test("a stale head is rejected", () => {
  const result = evaluate([
    reviewComment({ id: 1, reviewer: "claude", head: STALE_HEAD }),
    reviewComment({ id: 2, reviewer: "codex" }),
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.reviewers.claude.status, "stale-head");
});

test("a stale base is rejected", () => {
  const result = evaluate([
    reviewComment({ id: 1, reviewer: "claude", base: STALE_BASE }),
    reviewComment({ id: 2, reviewer: "codex" }),
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.reviewers.claude.status, "stale-base");
});

test("tampering with the visible body invalidates its digest", () => {
  const claude = reviewComment({ id: 1, reviewer: "claude" });
  claude.body = claude.body.replace("No blocking findings.", "Blocking finding removed.");
  const result = evaluate([claude, reviewComment({ id: 2, reviewer: "codex" })]);
  assert.equal(parseReviewComment(claude.body).kind, "invalid");
  assert.equal(result.reviewers.claude.status, "invalid");
});

test("a newer trusted invalid claim shadows an older valid pass", () => {
  const older = reviewComment({
    id: 1,
    reviewer: "claude",
    outcome: "pass",
    updatedAt: "2026-07-12T10:00:00Z",
  });
  const newer = reviewComment({
    id: 3,
    reviewer: "claude",
    outcome: "changes-requested",
    updatedAt: "2026-07-12T11:00:00Z",
  });
  newer.body = newer.body.replace("No blocking findings.", "Tampered after review.");

  const result = evaluate([
    older,
    reviewComment({ id: 2, reviewer: "codex", updatedAt: "2026-07-12T10:30:00Z" }),
    newer,
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.reviewers.claude.status, "invalid");
  assert.equal(result.reviewers.claude.commentId, 3);
});

test("editing an older comment does not make it newer than a later claim", () => {
  const older = reviewComment({
    id: 1,
    reviewer: "claude",
    outcome: "pass",
    updatedAt: "2026-07-12T10:00:00Z",
  });
  older.updated_at = "2026-07-12T12:00:00Z";
  const newer = reviewComment({
    id: 3,
    reviewer: "claude",
    outcome: "changes-requested",
    updatedAt: "2026-07-12T11:00:00Z",
  });

  const result = evaluate([older, reviewComment({ id: 2, reviewer: "codex" }), newer]);
  assert.equal(result.ok, false);
  assert.equal(result.reviewers.claude.status, "changes-requested");
  assert.equal(result.reviewers.claude.commentId, 3);
});

test("a duplicate marker in one comment is rejected", () => {
  const claude = reviewComment({ id: 1, reviewer: "claude" });
  claude.body += `\n${marker({ reviewer: "claude", body: "ignored" })}`;
  assert.deepEqual(parseReviewComment(claude.body), {
    kind: "invalid",
    reason: "multiple review markers",
  });
});

test("a trusted human merely quoting marker syntax does not shadow wrapper reviews", () => {
  const result = evaluate([
    reviewComment({ id: 1, reviewer: "claude" }),
    reviewComment({ id: 2, reviewer: "codex" }),
    {
      id: 3,
      body: "Documentation example: <!-- reciprocal-review:not-a-wrapper-marker -->",
      author_association: "OWNER",
      created_at: "2026-07-12T13:00:00Z",
      user: { login: "maintainer" },
    },
  ]);
  assert.equal(result.ok, true);
});

test("the latest valid marker for a reviewer is authoritative", () => {
  const result = evaluate([
    reviewComment({ id: 1, reviewer: "claude", outcome: "changes-requested" }),
    reviewComment({ id: 2, reviewer: "codex" }),
    reviewComment({ id: 3, reviewer: "claude", outcome: "pass" }),
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.reviewers.claude.commentId, 3);

  const rejected = evaluate([
    reviewComment({ id: 1, reviewer: "claude", outcome: "pass" }),
    reviewComment({ id: 2, reviewer: "codex" }),
    reviewComment({ id: 3, reviewer: "claude", outcome: "changes-requested" }),
  ]);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reviewers.claude.status, "changes-requested");
});

test("markers from untrusted author associations are ignored", () => {
  for (const association of ["CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR", "NONE"]) {
    const result = evaluate([
      reviewComment({ id: 1, reviewer: "claude", association }),
      reviewComment({ id: 2, reviewer: "codex" }),
    ]);
    assert.equal(result.ok, false);
    assert.equal(result.reviewers.claude.status, "missing");
  }
});

test("missing and non-passing outcomes fail the status", () => {
  const missing = evaluate([reviewComment({ id: 1, reviewer: "claude" })]);
  assert.equal(missing.reviewers.codex.status, "missing");

  for (const outcome of ["changes-requested", "blocked"]) {
    const result = evaluate([
      reviewComment({ id: 1, reviewer: "claude", outcome }),
      reviewComment({ id: 2, reviewer: "codex" }),
    ]);
    assert.equal(result.ok, false);
    assert.equal(result.reviewers.claude.status, outcome);
  }
});

test("marker injection and content after a marker are rejected", () => {
  const body = "Visible review";
  const valid = marker({ reviewer: "claude", body });
  const injected = `${MARKER_SAMPLE}\n${body}\n${valid}`;
  assert.equal(parseReviewComment(injected).kind, "invalid");
  assert.deepEqual(parseReviewComment(`${body}\n${valid}\nappended text`), {
    kind: "invalid",
    reason: "review marker is not final",
  });
});

test("CRLF and CR line endings are normalized before digest verification", () => {
  const canonicalBody = "Line one\nLine two\nLine three";
  const comment = `${canonicalBody.replaceAll("\n", "\r\n")}\r\n\r\n${marker({
    reviewer: "claude",
    body: canonicalBody,
  })}`;
  const parsed = parseReviewComment(comment);
  assert.equal(parsed.kind, "review");
  assert.equal(parsed.visibleBody, canonicalBody);
});

const MARKER_SAMPLE = "<!-- reciprocal-review:v1 reviewer=claude head=" + HEAD
  + " base=" + BASE + " result=sha256:" + "0".repeat(64) + " outcome=pass -->";
