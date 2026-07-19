import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import { createContentHash, sha256Bytes, sha256File } from "./content-hash.mjs";

const temporaryFiles = [];

// Split a buffer at arbitrary boundaries — including mid-multibyte-sequence — to
// mimic how `git cat-file --batch` hands out blob content across stream reads.
function gitBlobStyleChunks(bytes, boundaries) {
  const chunks = [];
  let start = 0;
  for (const boundary of [...boundaries, bytes.length]) {
    chunks.push(bytes.subarray(start, boundary));
    start = boundary;
  }
  return chunks;
}

afterEach(async () => {
  await Promise.all(temporaryFiles.splice(0).map((file) => rm(file, { recursive: true, force: true })));
});

test("known-answer digest for the same bytes as one buffer, chunks, and a stream", async () => {
  // NIST FIPS 180-4 SHA-256 known answer for the ASCII string "abc".
  const expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
  const bytes = Buffer.from("abc", "utf8");

  const oneBuffer = sha256Bytes(bytes);
  assert.equal(oneBuffer, expected);

  const chunked = createContentHash();
  for (const chunk of gitBlobStyleChunks(bytes, [1, 2])) chunked.update(chunk);
  assert.equal(chunked.digestHex(), expected);

  const directory = await mkdtemp(path.join(os.tmpdir(), "content-hash-"));
  temporaryFiles.push(directory);
  const file = path.join(directory, "abc.bin");
  await writeFile(file, bytes);
  assert.equal(await sha256File(file), expected);
});

test("identical digest across one buffer, git-blob-style chunks, and a filesystem stream for binary bytes", async () => {
  // 8 KiB of non-trivial binary content, larger than a single stream read, with
  // multibyte UTF-8 sequences and NUL/0x0a bytes that the git blob path relies on.
  const parts = [];
  for (let index = 0; index < 512; index += 1) {
    parts.push(Buffer.from(`row-${index}é\u{1f600}\n`, "utf8"));
    parts.push(Buffer.from([index % 256, 0x00, 0x0a, 0xff]));
  }
  const bytes = Buffer.concat(parts);

  const reference = createHash("sha256").update(bytes).digest("hex");

  const oneBuffer = sha256Bytes(bytes);

  // Chunk boundaries that deliberately fall inside multibyte sequences.
  const boundaries = [1, 7, 8, 9, 13, 100, 101, 4095, 4096, 4097, bytes.length - 1];
  const chunked = createContentHash();
  for (const chunk of gitBlobStyleChunks(bytes, boundaries)) chunked.update(chunk);
  const streamedChunks = chunked.digestHex();

  const directory = await mkdtemp(path.join(os.tmpdir(), "content-hash-"));
  temporaryFiles.push(directory);
  const file = path.join(directory, "payload.bin");
  await writeFile(file, bytes);
  const fromFile = await sha256File(file);

  assert.equal(oneBuffer, reference);
  assert.equal(streamedChunks, reference);
  assert.equal(fromFile, reference);
});

test("empty input hashes to the SHA-256 empty-string digest across every path", async () => {
  const expected = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const empty = Buffer.alloc(0);

  assert.equal(sha256Bytes(empty), expected);
  assert.equal(createContentHash().digestHex(), expected);

  const directory = await mkdtemp(path.join(os.tmpdir(), "content-hash-"));
  temporaryFiles.push(directory);
  const file = path.join(directory, "empty.bin");
  await writeFile(file, empty);
  assert.equal(await sha256File(file), expected);
});
