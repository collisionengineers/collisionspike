import { strict as assert } from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  authMarkersIn,
  evaluateInventory,
  scanPaths,
  scanTree,
  stripPythonProse,
  BEHAVIOURS,
} from "./check-auth-inventory.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(here, "fixtures", "auth-inventory");

test("the current tree passes: every auth/retry site is accounted for in the inventory", () => {
  const { findings } = scanTree();
  assert.deepEqual(findings, [], `unexpected findings:\n${findings.map((f) => `[${f.kind}] ${f.detail}`).join("\n")}`);
});

test("markers are detected in code but NOT in comments or docstrings", () => {
  assert.deepEqual(authMarkersIn("x = _CachedToken()\n"), ["_CachedToken"]);
  assert.deepEqual(authMarkersIn("# a comment mentioning _CachedToken and _RETRY_SAFE_STATUS\n"), []);
  assert.deepEqual(authMarkersIn('"""docstring mentioning DefaultAzureCredential"""\n'), []);
  assert.ok(stripPythonProse('"""_CachedToken"""\ncode  # _RETRY_SAFE_STATUS').includes("code"));
});

test("--scan a fixtures dir flags a new unlisted auth site", () => {
  const { findings } = scanPaths({ dir: FIXTURE_DIR });
  assert.ok(
    findings.some((f) => f.kind === "unlisted-auth-site" && f.detail.includes("new-unlisted-client")),
    "a marker-bearing module absent from the inventory must trip unlisted-auth-site",
  );
});

test("evaluateInventory flags an unlisted site, an invalid claim, and a vanished file", () => {
  const sites = [{ path: "services/functions/x/mystery_client.py", markers: ["_CachedToken"] }];
  const inventory = {
    clients: [
      { path: "services/functions/x/known.py", claims: ["expiry-aware-reuse"], exists: true },
      { path: "services/functions/x/gone.py", claims: ["bounded-transient-retry"], exists: false },
      { path: "services/functions/x/bad.py", claims: ["teleport"], exists: true },
    ],
    excluded: [],
  };
  const findings = evaluateInventory(sites, inventory);
  assert.ok(findings.some((f) => f.kind === "unlisted-auth-site"), "mystery_client is unlisted");
  assert.ok(findings.some((f) => f.kind === "invalid-claim"), "'teleport' is not a real behaviour");
  assert.ok(findings.some((f) => f.kind === "stale-inventory"), "gone.py no longer exists");
});

test("the four behaviours are the fixed vocabulary", () => {
  assert.deepEqual([...BEHAVIOURS].sort(), ["bounded-transient-retry", "expiry-aware-reuse", "one-time-refresh", "retry-after"]);
});
