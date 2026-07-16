import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = path.resolve(HERE, "../../..");
export const DEFAULT_EVIDENCE_MANIFEST = path.join(
  REPOSITORY_ROOT,
  "tests/fixtures/manifests/evidence.json",
);

let cachedPath;
let cachedManifest;

function normaliseRepositoryPath(value) {
  return String(value ?? "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "");
}

export function loadEvidenceManifest(manifestPath = DEFAULT_EVIDENCE_MANIFEST) {
  const absolute = path.resolve(manifestPath);
  if (cachedPath !== absolute) {
    cachedManifest = JSON.parse(fs.readFileSync(absolute, "utf8"));
    cachedPath = absolute;
  }
  return cachedManifest;
}

export function resolveEvidence(
  selector,
  {
    manifestPath = DEFAULT_EVIDENCE_MANIFEST,
    repositoryRoot = REPOSITORY_ROOT,
    requireFile = true,
  } = {},
) {
  const manifest = loadEvidenceManifest(manifestPath);
  const requestedSha = normaliseRepositoryPath(selector?.sha256 ?? "").toLowerCase();
  const requestedPath = normaliseRepositoryPath(selector?.originalPath ?? selector);

  let sha256 = requestedSha;
  if (!sha256 && requestedPath) {
    const usage = manifest.usages.find(
      (entry) => normaliseRepositoryPath(entry.originalPath) === requestedPath,
    );
    sha256 = usage?.sha256 ?? "";
  }
  if (!sha256) {
    throw new Error(`Evidence usage not found: ${requestedPath || "(empty selector)"}`);
  }

  const blob = manifest.blobs.find((entry) => entry.sha256 === sha256);
  if (!blob) {
    throw new Error(`Evidence blob not found in manifest: ${sha256}`);
  }

  const absolutePath = path.resolve(repositoryRoot, blob.storagePath);
  const relative = path.relative(path.resolve(repositoryRoot), absolutePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Evidence storage path escapes the repository: ${blob.storagePath}`);
  }
  if (requireFile && !fs.existsSync(absolutePath)) {
    throw new Error(`Evidence blob is missing: ${blob.storagePath}`);
  }
  return { ...blob, absolutePath };
}
