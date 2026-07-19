import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createHashedSignatureMatcher } from "./hashed-signature-matcher.mjs";

// Cross-language synchronization contract for the forbidden-signature matcher mirror.
// The Node matcher (hashed-signature-matcher.mjs) and the Python matcher
// (hashed_signature_matcher.py) both build a synthetic matcher from the shared
// forbidden-signature-vectors.json and must return identical signature IDs for every
// match vector and identical corpus-rejection outcomes for every rejection document.
// The real forbidden vocabulary stays hashed-only in forbidden-signatures.json; these
// vectors use synthetic non-sensitive terms. See forbidden-signature-matcher-parity.md.

const vectorsUrl = new URL("./forbidden-signature-vectors.json", import.meta.url);
const vectorsPath = fileURLToPath(vectorsUrl);
const fixture = JSON.parse(readFileSync(vectorsUrl, "utf8"));

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function fnv1a32(value) {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193) >>> 0;
  }
  return result.toString(16).padStart(8, "0");
}

function syntheticDocument() {
  return {
    version: 2,
    prefilter: "fnv1a32",
    digest: "sha256",
    maxAdjacentTokens: fixture.maxAdjacentTokens,
    signatures: fixture.signatureTerms.map(({ id, term }) => ({
      id,
      fnv1a32: fnv1a32(term),
      sha256: sha256(term),
      normalizedLength: term.length,
    })),
  };
}

function nodeResults() {
  const matcher = createHashedSignatureMatcher(syntheticDocument());
  const matches = {};
  for (const vector of fixture.matchVectors) matches[vector.name] = matcher(vector.input);
  const rejections = {};
  for (const vector of fixture.rejectionDocuments) {
    let rejected = false;
    try {
      createHashedSignatureMatcher(vector.document);
    } catch {
      rejected = true;
    }
    rejections[vector.name] = rejected;
  }
  return { matches, rejections };
}

function pythonResults() {
  const script = fileURLToPath(new URL("./hashed_signature_matcher.py", import.meta.url));
  const candidates = process.env.CS_PYTHON ? [process.env.CS_PYTHON] : ["python", "python3"];
  let lastError;
  for (const candidate of candidates) {
    const result = spawnSync(candidate, [script, "--vectors", vectorsPath], { encoding: "utf8" });
    if (result.error) {
      if (result.error.code === "ENOENT") {
        lastError = result.error;
        continue;
      }
      throw result.error;
    }
    assert.equal(result.status, 0, `Python parity harness exited ${result.status}: ${result.stderr}`);
    return JSON.parse(result.stdout);
  }
  throw new Error(
    `no Python interpreter found (tried ${candidates.join(", ")}): ${lastError?.message ?? "unknown"}`,
  );
}

test("Node matcher reproduces every pinned fixture expectation", () => {
  const { matches, rejections } = nodeResults();
  for (const vector of fixture.matchVectors) {
    assert.deepEqual(matches[vector.name], vector.expected, `match vector: ${vector.name}`);
  }
  for (const vector of fixture.rejectionDocuments) {
    assert.equal(rejections[vector.name], true, `rejection vector must fail closed: ${vector.name}`);
  }
});

test("Node and Python matchers agree on every shared vector", () => {
  const node = nodeResults();
  const python = pythonResults();
  assert.deepEqual(python.matches, node.matches, "signature IDs diverge across the Node/Python mirror");
  assert.deepEqual(python.rejections, node.rejections, "rejection outcomes diverge across the mirror");
  for (const vector of fixture.matchVectors) {
    assert.deepEqual(python.matches[vector.name], vector.expected, `python match vector: ${vector.name}`);
  }
  for (const vector of fixture.rejectionDocuments) {
    assert.equal(python.rejections[vector.name], true, `python rejection vector: ${vector.name}`);
  }
});
