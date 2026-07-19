import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

// One incremental SHA-256 content-hash primitive shared by the inventory generators.
//
// A single hasher instance accepts byte chunks from any source — streamed
// `git cat-file --batch` blob bytes, a filesystem read stream, or direct
// in-memory bytes — so every inventory hashing path yields identical digests
// for identical byte sequences regardless of how the bytes are delivered. The
// inventory ledgers are load-bearing, so hashing lives in exactly one place.

// Create an incremental SHA-256 hasher. Feed it byte chunks in order with
// update(chunk) and finalize with digestHex(); update() chains.
export function createContentHash() {
  const hash = createHash("sha256");
  return {
    update(chunk) {
      hash.update(chunk);
      return this;
    },
    digestHex() {
      return hash.digest("hex");
    },
  };
}

// Hash direct in-memory bytes (e.g. a symlink target) in one shot.
export function sha256Bytes(bytes) {
  return createContentHash().update(bytes).digestHex();
}

// Hash a filesystem file by streaming its bytes through the shared primitive.
export async function sha256File(absolutePath) {
  const hash = createContentHash();
  for await (const chunk of createReadStream(absolutePath)) hash.update(chunk);
  return hash.digestHex();
}
