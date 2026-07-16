#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifests = path.join(root, "tests", "fixtures", "manifests");
const catalog = JSON.parse(fs.readFileSync(path.join(manifests, "evidence.json"), "utf8"));
const review = JSON.parse(fs.readFileSync(path.join(manifests, "image-review.json"), "utf8"));

const imageBlobs = catalog.blobs.filter((blob) => blob.mediaType.startsWith("image/"));
const candidateHashes = imageBlobs.map((blob) => blob.sha256).sort();
const candidateSet = new Set(candidateHashes);
const candidateSetSha256 = crypto
  .createHash("sha256")
  .update(`${candidateHashes.join("\n")}\n`)
  .digest("hex");
const rolesByHash = new Map(candidateHashes.map((sha256) => [sha256, new Set()]));
for (const usage of catalog.usages) {
  if (candidateSet.has(usage.sha256)) rolesByHash.get(usage.sha256).add(usage.role);
}

const failures = [];
if (review.schemaVersion !== 2) failures.push("unsupported image-review schema");
if (review.result !== "clean" || !Array.isArray(review.findings) || review.findings.length !== 0) {
  failures.push("image review is not clean");
}
if (review.uniqueBlobCount !== candidateHashes.length) {
  failures.push(`review covers ${review.uniqueBlobCount} blobs; catalog contains ${candidateHashes.length} image blobs`);
}
if (review.candidateSetSha256 !== candidateSetSha256) {
  failures.push("reviewed candidate set differs from the current evidence catalog");
}
if (!Array.isArray(review.records)) failures.push("image review records are missing");

const records = Array.isArray(review.records) ? review.records : [];
const recordsByHash = new Map();
for (const record of records) {
  if (recordsByHash.has(record.sha256)) failures.push(`duplicate review record for ${record.sha256}`);
  recordsByHash.set(record.sha256, record);
}
for (const sha256 of candidateHashes) {
  if (!recordsByHash.has(sha256)) failures.push(`missing review record for ${sha256}`);
}
for (const sha256 of recordsByHash.keys()) {
  if (!candidateSet.has(sha256)) failures.push(`review record is not a retained image blob: ${sha256}`);
}

const classificationCounts = {};
let ocrCount = 0;
let ocrLineCount = 0;
let visualOnlyCount = 0;
for (const record of records) {
  const roles = [...(rolesByHash.get(record.sha256) ?? [])].sort();
  const sourceRoles = Array.isArray(record.sourceRoles) ? [...record.sourceRoles].sort() : [];
  if (JSON.stringify(sourceRoles) !== JSON.stringify(roles)) {
    failures.push(`source-role mismatch for ${record.sha256}`);
  }

  const hasTicketRole = roles.includes("ticket-image");
  const hasDemoRole = roles.includes("demo-image");
  const hasCaseRole = roles.includes("case-fixture-image");
  const allowedCaseClassifications = new Set(["case-document-or-interface-image", "non-document-case-photo"]);
  if (hasTicketRole && record.classification !== "ticket-evidence-image") {
    failures.push(`ticket image has invalid classification: ${record.sha256}`);
  } else if (!hasTicketRole && hasDemoRole && record.classification !== "product-demo-image") {
    failures.push(`demo image has invalid classification: ${record.sha256}`);
  } else if (!hasTicketRole && !hasDemoRole && hasCaseRole && !allowedCaseClassifications.has(record.classification)) {
    failures.push(`case image has invalid classification: ${record.sha256}`);
  } else if (!hasTicketRole && !hasDemoRole && !hasCaseRole) {
    failures.push(`image has no recognised evidence role: ${record.sha256}`);
  }

  classificationCounts[record.classification] = (classificationCounts[record.classification] ?? 0) + 1;
  if (record.visualReview?.method !== "hash-labelled-contact-sheet" || record.visualReview?.result !== "clean") {
    failures.push(`visual review is incomplete for ${record.sha256}`);
  }

  if (record.classification === "non-document-case-photo") {
    visualOnlyCount += 1;
    if (record.ocrReview?.method !== "not-applicable" || record.ocrReview?.result !== "not-applicable") {
      failures.push(`non-document case photo has invalid OCR disposition: ${record.sha256}`);
    }
    if (typeof record.ocrReview?.reason !== "string" || record.ocrReview.reason.length < 20) {
      failures.push(`non-document case photo lacks a review rationale: ${record.sha256}`);
    }
  } else {
    ocrCount += 1;
    if (record.ocrReview?.method !== "rapidocr-onnx-targeted" || record.ocrReview?.result !== "clean") {
      failures.push(`targeted OCR review is incomplete for ${record.sha256}`);
    }
    if (!Number.isInteger(record.ocrReview?.lineCount) || record.ocrReview.lineCount < 0) {
      failures.push(`targeted OCR line count is invalid for ${record.sha256}`);
    } else {
      ocrLineCount += record.ocrReview.lineCount;
    }
    if (!/^[a-f0-9]{64}$/.test(record.ocrReview?.textSha256 ?? "")) {
      failures.push(`targeted OCR digest is invalid for ${record.sha256}`);
    }
    if (record.ocrReview?.signatureMatchCount !== 0) {
      failures.push(`targeted OCR signature scan is not clean for ${record.sha256}`);
    }
  }
}

const expectedCounts = Object.fromEntries(Object.entries(classificationCounts).sort(([left], [right]) => left.localeCompare(right)));
if (JSON.stringify(review.classificationCounts) !== JSON.stringify(expectedCounts)) {
  failures.push("classification counts do not match review records");
}
if (review.methods?.visual?.reviewedBlobCount !== candidateHashes.length || review.methods?.visual?.result !== "clean") {
  failures.push("visual-review summary is incomplete");
}
if (review.methods?.ocr?.reviewedBlobCount !== ocrCount || review.methods?.ocr?.recognizedLineCount !== ocrLineCount || review.methods?.ocr?.result !== "clean") {
  failures.push("OCR-review summary does not match review records");
}
if (review.methods?.visualOnly?.reviewedBlobCount !== visualOnlyCount || review.methods?.visualOnly?.result !== "clean") {
  failures.push("visual-only summary does not match review records");
}

if (failures.length > 0) {
  for (const failure of failures) process.stderr.write(`- ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Image-review parity passed for ${candidateHashes.length} unique blobs (${ocrCount} OCR-reviewed, ${visualOnlyCount} non-document case photos visually reviewed).\n`,
  );
}
