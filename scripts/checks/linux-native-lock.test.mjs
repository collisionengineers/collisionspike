import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);

test("locks the Linux native packages required by clean CI builds", async () => {
  const packageDocument = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const lock = JSON.parse(await readFile(new URL("package-lock.json", root), "utf8"));
  const expected = new Map(Object.entries(packageDocument.optionalDependencies ?? {}));

  for (const [name, version] of expected) {
    const entry = lock.packages?.[`node_modules/${name}`];
    assert.ok(entry, `package-lock.json is missing the optional package ${name}`);
    assert.equal(entry.version, version, `${name} does not match the exact root pin`);
    assert.equal(entry.optional, true, `${name} is not locked as optional`);
    assert.ok(entry.os?.includes("linux"), `${name} is not a Linux package`);
    assert.ok(entry.cpu?.includes("x64"), `${name} is not an x64 package`);
  }
});
