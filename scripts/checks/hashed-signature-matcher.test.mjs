import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createHashedSignatureMatcher } from "./hashed-signature-matcher.mjs";

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

const matcher = createHashedSignatureMatcher({
  version: 2,
  prefilter: "fnv1a32",
  digest: "sha256",
  maxAdjacentTokens: 4,
  signatures: [
    { id: "S001", fnv1a32: fnv1a32("orangesignal"), sha256: sha256("orangesignal"), normalizedLength: 12 },
    { id: "S002", fnv1a32: fnv1a32("violet"), sha256: sha256("violet"), normalizedLength: 6 },
  ],
});

test("matches adjacent tokens after punctuation and case normalisation", () => {
  assert.deepEqual(matcher("The ORANGE-signal is present."), ["S001"]);
});

test("matches a signature embedded in a longer token", () => {
  assert.deepEqual(matcher("prefixvioletsuffix"), ["S002"]);
});

test("matches URL-encoded and double-encoded variants", () => {
  assert.deepEqual(matcher("ORANGE%2Dsignal"), ["S001"]);
  assert.deepEqual(matcher("ORANGE%252Dsignal"), ["S001"]);
});

test("does not expose or match unrelated text", () => {
  assert.deepEqual(matcher("blue marker"), []);
});
