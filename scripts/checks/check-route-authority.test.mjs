import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  analyzeAuthHelpers,
  analyzeRouteRegistrations,
  evaluateAuthorities,
  evaluateTree,
  CANONICAL_TRUST_HELPER,
} from "./check-route-authority.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(here, "fixtures", "route-authority", "second-trust-helper.fixture.ts");

test("the current tree passes: one trust seam, no duplicate authority, sound delegation", () => {
  const { findings } = evaluateTree();
  assert.deepEqual(findings, [], `unexpected findings:\n${findings.map((f) => `[${f.kind}] ${f.detail}`).join("\n")}`);
});

test("the canonical audience-only trust seam is exactly one, at service-support.ts", () => {
  const text = readFileSync(CANONICAL_TRUST_HELPER, "utf8");
  const helpers = analyzeAuthHelpers(CANONICAL_TRUST_HELPER, text);
  assert.equal(helpers.length, 1);
  assert.equal(helpers[0].name, "withServiceAuth");
});

test("A3a — a re-introduced second withServiceAuth is flagged; a principal-gated wrapper is not", () => {
  const helpers = analyzeAuthHelpers(FIXTURE, readFileSync(FIXTURE, "utf8"));
  const names = helpers.map((h) => h.name);
  assert.ok(names.includes("reintroducedServiceAuth"), "the second audience-only wrapper must be flagged");
  assert.ok(!names.includes("gatedWrapper"), "the allowedPrincipal-gated wrapper must NOT be flagged (AST precision)");
});

test("route registrations are parsed with methods, route, authMode, and lane", () => {
  const text = [
    "import { app } from '@azure/functions';",
    "app.http('internalThing', { methods: ['POST'], authLevel: 'anonymous', route: 'internal/thing',",
    "  handler: async (req, ctx) => withServiceAuth(req, ctx, async () => ({ status: 200 })) });",
    "app.http('staffThing', { methods: ['GET'], authLevel: 'anonymous', route: 'cases/list',",
    "  handler: withRole('CollisionSpike.User', async () => ({ status: 200 })) });",
  ].join("\n");
  const routes = analyzeRouteRegistrations("services/data-api/src/x.ts", text);
  const internal = routes.find((r) => r.name === "internalThing");
  const staff = routes.find((r) => r.name === "staffThing");
  assert.equal(internal.lane, "internal-service");
  assert.equal(internal.authMode, "service-audience");
  assert.deepEqual(internal.methods, ["POST"]);
  assert.equal(staff.lane, "public-staff");
  assert.equal(staff.authMode, "staff-role");
});

test("A3b — two authoritative writers of the same (capability, transition) is a duplicate authority", () => {
  const inventory = [
    { owner: "a.ts", name: "aComplete", route: "internal/a/complete", methods: ["POST"], authMode: "service-audience", lane: "internal-service" },
    { owner: "b.ts", name: "bComplete", route: "internal/b/complete", methods: ["POST"], authMode: "service-audience", lane: "internal-service" },
  ];
  const manifest = {
    authorities: [
      { owner: "a.ts", name: "aComplete", route: "internal/a/complete", capability: "lane-x", transition: "completed", writeAuthority: true },
      { owner: "b.ts", name: "bComplete", route: "internal/b/complete", capability: "lane-x", transition: "completed", writeAuthority: true },
    ],
    delegations: [],
    downstreams: [],
  };
  const findings = evaluateAuthorities(inventory, manifest);
  assert.ok(findings.some((f) => f.kind === "duplicate-authority"), "same (capability,transition) writers must trip duplicate-authority");
});

test("distinct outbox capabilities each writing 'completed' do NOT trip duplicate-authority", () => {
  const inventory = [
    { owner: "m.ts", name: "mirrorComplete", route: "internal/archive-mirror-outbox/complete", methods: ["POST"], authMode: "service-audience", lane: "internal-service" },
    { owner: "p.ts", name: "providerComplete", route: "internal/provider-archive-outbox/complete", methods: ["POST"], authMode: "service-audience", lane: "internal-service" },
  ];
  const manifest = {
    authorities: [
      { owner: "m.ts", name: "mirrorComplete", route: "internal/archive-mirror-outbox/complete", capability: "archive-mirror-outbox", transition: "completed", writeAuthority: true },
      { owner: "p.ts", name: "providerComplete", route: "internal/provider-archive-outbox/complete", capability: "provider-archive-outbox", transition: "completed", writeAuthority: true },
    ],
    delegations: [],
    downstreams: [],
  };
  const findings = evaluateAuthorities(inventory, manifest);
  assert.ok(!findings.some((f) => f.kind === "duplicate-authority"), "distinct capabilities are distinct authorities");
});

test("A3c — an explicit delegation to a declared downstream passes; broken and cyclic fail", () => {
  const base = { authorities: [], downstreams: ["parser-fn"] };
  const ok = evaluateAuthorities([], { ...base, delegations: [{ capability: "parser", delegatesTo: "parser-fn" }] });
  assert.ok(!ok.some((f) => f.kind === "broken-delegation" || f.kind === "cyclic-delegation"), "resolved delegation passes");

  const broken = evaluateAuthorities([], { ...base, delegations: [{ capability: "parser", delegatesTo: "ghost-fn" }] });
  assert.ok(broken.some((f) => f.kind === "broken-delegation"), "delegation to an undeclared downstream fails");

  const cyclic = evaluateAuthorities([], {
    authorities: [],
    downstreams: ["a", "b"],
    delegations: [{ capability: "a", delegatesTo: "b" }, { capability: "b", delegatesTo: "a" }],
  });
  assert.ok(cyclic.some((f) => f.kind === "cyclic-delegation"), "a delegation cycle fails");
});

test("an internal-service route absent from the manifest is unowned", () => {
  const inventory = [
    { owner: "x.ts", name: "undeclared", route: "internal/x/thing", methods: ["POST"], authMode: "service-audience", lane: "internal-service" },
  ];
  const findings = evaluateAuthorities(inventory, { authorities: [], delegations: [], downstreams: [] });
  assert.ok(findings.some((f) => f.kind === "unowned-route"), "an undeclared internal route must be unowned");
});
