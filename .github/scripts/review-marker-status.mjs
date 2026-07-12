import { createHash } from "node:crypto";

const REVIEWERS = Object.freeze(["claude", "codex"]);
const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const MARKER_PREFIX = "<!-- reciprocal-review:";
const MARKER_PATTERN = /<!-- reciprocal-review:v1 reviewer=(claude|codex) head=([0-9a-f]{40}) base=([0-9a-f]{40}) result=sha256:([0-9a-f]{64}) outcome=(pass|changes-requested|blocked) -->/g;

export function normalizeLineEndings(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n");
}
export function canonicalVisibleBody(value) {
  return normalizeLineEndings(value).trim();
}

export function digestVisibleBody(value) {
  return createHash("sha256").update(canonicalVisibleBody(value), "utf8").digest("hex");
}

/**
 * Parse one wrapper-owned review comment.
 *
 * The marker must be unique and be the final non-whitespace content. Any extra
 * marker prefix is rejected so quoted or injected markers cannot be mistaken
 * for the wrapper's attestation. The digest covers the visible review body
 * after CRLF/CR line endings are normalised and surrounding whitespace removed.
 */
export function parseReviewComment(body) {
  const normalized = normalizeLineEndings(body);
  const headingReviewer = normalized.match(/^\s*###\s+(Claude|Codex) PR review\b/iu)?.[1]?.toLowerCase();
  const invalid = (reason, reviewer = headingReviewer) => reviewer
    ? { kind: "invalid", reviewer, reason }
    : { kind: "invalid", reason };
  const prefixCount = normalized.split(MARKER_PREFIX).length - 1;
  if (prefixCount === 0) return { kind: "none" };
  if (prefixCount !== 1) return invalid("multiple review markers");

  const matches = [...normalized.matchAll(MARKER_PATTERN)];
  if (matches.length !== 1) return invalid("malformed review marker");

  const match = matches[0];
  const markerEnd = (match.index ?? 0) + match[0].length;
  if (normalized.slice(markerEnd).trim() !== "") {
    return invalid("review marker is not final");
  }

  const visibleBody = canonicalVisibleBody(
    normalized.slice(0, match.index) + normalized.slice(markerEnd),
  );
  if (!visibleBody) return invalid("review body is empty");
  if (visibleBody.includes(MARKER_PREFIX)) {
    return invalid("review body contains a marker");
  }

  const [, reviewer, head, base, result, outcome] = match;
  const actualDigest = digestVisibleBody(visibleBody);
  if (actualDigest !== result) {
    return invalid("review body digest does not match", reviewer);
  }

  return {
    kind: "review",
    reviewer,
    head,
    base,
    result,
    outcome,
    visibleBody,
  };
}

function commentOrder(comment, index) {
  const timestamp = Date.parse(comment.created_at ?? "");
  return {
    timestamp: Number.isFinite(timestamp) ? timestamp : 0,
    id: String(comment.id ?? index),
    index,
  };
}

function isLater(left, right) {
  if (!right) return true;
  if (left.timestamp !== right.timestamp) return left.timestamp > right.timestamp;
  const idComparison = left.id.localeCompare(right.id, "en", { numeric: true });
  if (idComparison !== 0) return idComparison > 0;
  return left.index > right.index;
}

/**
 * Select the latest marker claim for each reviewer from trusted issue-comment
 * authors, then validate that claim and bind both attestations to the PR's
 * exact current head and base commits. A newer malformed or digest-invalid
 * claim must shadow an older pass instead of being skipped.
 */
export function evaluateReviewMarkers({ comments, headSha, baseSha }) {
  if (!/^[0-9a-f]{40}$/.test(headSha ?? "") || !/^[0-9a-f]{40}$/.test(baseSha ?? "")) {
    throw new TypeError("headSha and baseSha must be lowercase 40-character commit SHAs");
  }

  const latest = new Map();
  for (const [index, comment] of (comments ?? []).entries()) {
    const association = String(comment.author_association ?? "").toUpperCase();
    if (!TRUSTED_ASSOCIATIONS.has(association)) continue;

    const parsed = parseReviewComment(comment.body);
    if (parsed.kind === "none" || (parsed.kind === "invalid" && !parsed.reviewer)) continue;

    const order = commentOrder(comment, index);
    const claimedReviewers = [parsed.reviewer];
    for (const reviewer of claimedReviewers) {
      const current = latest.get(reviewer);
      if (isLater(order, current?.order)) {
        latest.set(reviewer, {
          marker: parsed,
          order,
          commentId: comment.id ?? null,
          author: comment.user?.login ?? null,
          association,
        });
      }
    }
  }

  const reviewers = {};
  const failures = [];
  for (const reviewer of REVIEWERS) {
    const selected = latest.get(reviewer);
    if (!selected) {
      reviewers[reviewer] = { status: "missing" };
      failures.push(`${reviewer}: missing trusted review marker`);
      continue;
    }

    const { marker } = selected;
    if (marker.kind === "invalid") {
      reviewers[reviewer] = {
        status: "invalid",
        reason: marker.reason,
        commentId: selected.commentId,
        author: selected.author,
        association: selected.association,
      };
      failures.push(`${reviewer}: invalid`);
      continue;
    }
    let status = "pass";
    if (marker.head !== headSha) status = "stale-head";
    else if (marker.base !== baseSha) status = "stale-base";
    else if (marker.outcome !== "pass") status = marker.outcome;

    reviewers[reviewer] = {
      status,
      outcome: marker.outcome,
      head: marker.head,
      base: marker.base,
      commentId: selected.commentId,
      author: selected.author,
      association: selected.association,
    };
    if (status !== "pass") failures.push(`${reviewer}: ${status}`);
  }

  const ok = failures.length === 0;
  return {
    ok,
    state: ok ? "success" : "failure",
    description: ok
      ? "Claude and Codex reviewed this exact head and base"
      : failures.join("; ").slice(0, 140),
    reviewers,
  };
}
