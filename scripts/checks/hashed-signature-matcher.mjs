import { hash } from "node:crypto";

function digest(value) {
  return hash("sha256", value, "hex");
}

function fnv1a32(value) {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193) >>> 0;
  }
  return result.toString(16).padStart(8, "0");
}

function signatureIndex(document) {
  if (document?.version !== 2 || document?.prefilter !== "fnv1a32" || document?.digest !== "sha256") {
    throw new Error("Unsupported signature document");
  }
  if (!Number.isSafeInteger(document.maxAdjacentTokens) || document.maxAdjacentTokens < 1) {
    throw new Error("Signature document requires a positive maxAdjacentTokens");
  }

  const byLength = new Map();
  for (const signature of document.signatures ?? []) {
    if (!/^S\d{3}$/.test(signature.id)
      || !/^[a-f0-9]{8}$/.test(signature.fnv1a32)
      || !/^[a-f0-9]{64}$/.test(signature.sha256)
      || !Number.isSafeInteger(signature.normalizedLength)
      || signature.normalizedLength < 1) {
      throw new Error(`Invalid hashed signature: ${JSON.stringify(signature)}`);
    }
    const byPrefilter = byLength.get(signature.normalizedLength) ?? new Map();
    const candidates = byPrefilter.get(signature.fnv1a32) ?? [];
    candidates.push({ sha256: signature.sha256, id: signature.id });
    byPrefilter.set(signature.fnv1a32, candidates);
    byLength.set(signature.normalizedLength, byPrefilter);
  }
  return byLength;
}

export function createHashedSignatureMatcher(document) {
  const byLength = signatureIndex(document);
  const lengths = [...byLength.keys()].sort((left, right) => left - right);
  const maxLength = lengths.at(-1) ?? 0;
  const maxAdjacentTokens = document.maxAdjacentTokens;

  return function signatureIdsFor(value) {
    const ids = new Set();
    const variants = new Set([String(value)]);
    let decoded = String(value);
    for (let pass = 0; pass < 2; pass += 1) {
      try {
        const next = decodeURIComponent(decoded.replaceAll("+", "%20"));
        if (next === decoded) break;
        variants.add(next);
        decoded = next;
      } catch {
        break;
      }
    }

    for (const variant of variants) {
      const tokens = variant.toLowerCase().match(/[a-z0-9]+/g) ?? [];
      const tested = new Set();

      function testCandidate(candidate) {
        const byPrefilter = byLength.get(candidate.length);
        if (!byPrefilter || tested.has(candidate)) return;
        tested.add(candidate);
        const candidates = byPrefilter.get(fnv1a32(candidate));
        if (!candidates) return;
        const sha256 = digest(candidate);
        for (const signature of candidates) {
          if (signature.sha256 === sha256) ids.add(signature.id);
        }
      }

      for (const token of tokens) {
        if (token.length >= 40 && /^[a-f0-9]+$/.test(token)) continue;
        for (const length of lengths) {
          if (length > token.length) break;
          for (let offset = 0; offset <= token.length - length; offset += 1) {
            testCandidate(token.slice(offset, offset + length));
          }
        }
      }

      for (let start = 0; start < tokens.length; start += 1) {
        let candidate = "";
        const limit = Math.min(tokens.length, start + maxAdjacentTokens);
        for (let end = start; end < limit; end += 1) {
          candidate += tokens[end];
          if (candidate.length > maxLength) break;
          if (end > start) testCandidate(candidate);
        }
      }
    }

    return [...ids].sort();
  };
}
