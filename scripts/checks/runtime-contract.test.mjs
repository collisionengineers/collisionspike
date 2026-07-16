import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compareRuntimeContractSnapshots,
  extractAuthPolicyIdentifiers,
  extractDtoDeclarations,
  extractJsonSchemas,
  extractPostgresBaseline,
  extractPythonRoutes,
  extractTypeScriptRoutes,
  numericCodeContract,
  resourceNamesFromLiveFacts,
  validateApprovedDeltas,
} from "./runtime-contract-lib.mjs";

function document(path, lines) {
  return { path, source: lines.join("\n") + "\n" };
}

test("detects HTTP method, path, platform-auth, and route-policy drift", () => {
  const expected = extractTypeScriptRoutes([
    document("services/data-api/src/routes.ts", [
      "app.http('caseById', {",
      "  methods: ['GET'],",
      "  authLevel: 'anonymous',",
      "  route: 'cases/{id}',",
      "  handler: withRole('CollisionSpike.User', async () => ({ status: 200 })),",
      "});",
    ]),
  ]);
  const actual = extractTypeScriptRoutes([
    document("services/data-api/src/routes.ts", [
      "app.http('caseById', {",
      "  methods: ['POST'],",
      "  authLevel: 'function',",
      "  route: 'case/{id}',",
      "  handler: withRole('CollisionSpike.Superuser', async () => ({ status: 200 })),",
      "});",
    ]),
  ]);
  const differences = compareRuntimeContractSnapshots(expected, actual);
  assert.ok(differences.some((difference) => difference.includes("methods")));
  assert.ok(differences.some((difference) => difference.includes("publicPath")));
  assert.ok(differences.some((difference) => difference.includes("authLevel")));
  assert.ok(differences.some((difference) => difference.includes("policyIdentifiers")));
});

test("extracts Python route defaults and detects an explicit auth change", () => {
  const expected = extractPythonRoutes([
    document("services/functions/sample/function_app.py", [
      "app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)",
      "@app.route(route='parse', methods=['POST'])",
      "def parse_document(req):",
      "    return response",
    ]),
  ]);
  const actual = extractPythonRoutes([
    document("services/functions/sample/function_app.py", [
      "app = func.FunctionApp(http_auth_level=func.AuthLevel.FUNCTION)",
      "@app.route(route='parse', methods=['POST'], auth_level=func.AuthLevel.ANONYMOUS)",
      "def parse_document(req):",
      "    return response",
    ]),
  ]);
  assert.equal(expected[0].authLevel, "function");
  assert.equal(actual[0].authLevel, "anonymous");
  assert.ok(compareRuntimeContractSnapshots(expected, actual).some((difference) =>
    difference.includes("authLevel")));
});

test("detects exported DTO member and canonical JSON-schema drift", () => {
  const beforeDto = extractDtoDeclarations([
    document("packages/domain/src/dto/index.ts", [
      "export interface RequestDto {",
      "  id: string;",
      "}",
    ]),
  ]);
  const afterDto = extractDtoDeclarations([
    document("packages/domain/src/dto/index.ts", [
      "export interface RequestDto {",
      "  id: string;",
      "  reason?: string;",
      "}",
    ]),
  ]);
  assert.ok(compareRuntimeContractSnapshots(beforeDto, afterDto).some((difference) =>
    difference.includes("signature")));

  const beforeSchema = extractJsonSchemas([
    document("contracts/request.schema.json", [
      "{",
      "  \"type\": \"object\",",
      "  \"properties\": { \"id\": { \"type\": \"string\" } }",
      "}",
    ]),
  ]);
  const reformattedSchema = extractJsonSchemas([
    document("contracts/request.schema.json", [
      "{\"properties\":{\"id\":{\"type\":\"string\"}},\"type\":\"object\"}",
    ]),
  ]);
  assert.deepEqual(beforeSchema, reformattedSchema);
  const changedSchema = extractJsonSchemas([
    document("contracts/request.schema.json", [
      "{\"properties\":{\"id\":{\"type\":\"number\"}},\"type\":\"object\"}",
    ]),
  ]);
  assert.ok(compareRuntimeContractSnapshots(beforeSchema, changedSchema).some((difference) =>
    difference.includes("sha256")));
});

test("detects auth-policy and live-resource identifier drift", () => {
  const authDocuments = [
    document("services/data-api/src/platform/auth/policy.ts", [
      "export type AppRole = 'CollisionSpike.User' | 'CollisionSpike.Superuser';",
    ]),
  ];
  const routes = [{
    policyIdentifiers: ["role:CollisionSpike.User"],
  }];
  const beforeFacts = {
    environment: { resourceGroup: "rg-example" },
    deployables: {
      api: { resource: "api-example" },
      database: { resource: "db-example", database: "cases" },
    },
    access: { roles: ["CollisionSpike.User", "CollisionSpike.Superuser"] },
  };
  const afterFacts = structuredClone(beforeFacts);
  afterFacts.deployables.api.resource = "api-renamed";
  afterFacts.access.roles = ["CollisionSpike.Superuser"];
  const before = {
    auth: extractAuthPolicyIdentifiers(authDocuments, routes, beforeFacts),
    resources: resourceNamesFromLiveFacts(beforeFacts),
  };
  const after = {
    auth: extractAuthPolicyIdentifiers(authDocuments, routes, afterFacts),
    resources: resourceNamesFromLiveFacts(afterFacts),
  };
  const differences = compareRuntimeContractSnapshots(before, after);
  assert.ok(differences.some((difference) => difference.includes("liveApplicationRoles")));
  assert.ok(differences.some((difference) => difference.includes("name")));
});

test("detects Postgres baseline column drift", () => {
  const before = extractPostgresBaseline([
    document("database/baseline/050_case.sql", [
      "CREATE TABLE case_ (",
      "  id uuid PRIMARY KEY,",
      "  case_po text NOT NULL,",
      "  CONSTRAINT case_po_not_blank CHECK (case_po <> '')",
      ");",
    ]),
  ]);
  const after = extractPostgresBaseline([
    document("database/baseline/050_case.sql", [
      "CREATE TABLE case_ (",
      "  id uuid PRIMARY KEY,",
      "  provider_ref text NOT NULL",
      ");",
    ]),
  ]);
  const differences = compareRuntimeContractSnapshots(before, after);
  assert.ok(differences.some((difference) => difference.includes("columns")));
  assert.ok(differences.some((difference) => difference.includes("sha256")));
});

test("detects stable numeric-code drift", () => {
  const before = numericCodeContract([
    document("packages/domain/src/data/code-tables/status.json", [
      "{\"kind\":\"code-table\",\"codeTableId\":\"status\",\"options\":[{\"value\":100000000,\"name\":\"open\"}]}",
    ]),
  ]);
  const after = numericCodeContract([
    document("packages/domain/src/data/code-tables/status.json", [
      "{\"kind\":\"code-table\",\"codeTableId\":\"status\",\"options\":[{\"value\":100000001,\"name\":\"open\"}]}",
    ]),
  ]);
  assert.notEqual(before.sha256, after.sha256);
  assert.ok(compareRuntimeContractSnapshots(before, after).some((difference) =>
    difference.includes("value")));
});

test("approved removals fail if the removed contract is reintroduced", () => {
  const snapshot = {
    httpRoutes: { routes: [] },
    domainDtos: {
      declarations: [{
        name: "RemoveCaseInput",
        source: "packages/domain/src/dto/index.ts",
        signature: "export interface RemoveCaseInput {\n    current?: boolean;\n}",
      }],
    },
  };
  const record = {
    schemaVersion: 1,
    approvals: [
      {
        id: "route-removal",
        authority: "TKT-1",
        reason: "approved",
        evidence: "ticket.md",
        category: "http-route",
        operation: "remove",
        before: {
          runtime: "python",
          functionName: "removed",
          methods: ["POST"],
          publicPath: "/api/removed",
        },
      },
      {
        id: "member-removal",
        authority: "PLAN-1",
        reason: "approved",
        evidence: "plan.md",
        category: "domain-dto-member",
        operation: "remove",
        declaration: "RemoveCaseInput",
        source: "packages/domain/src/dto/index.ts",
        before: { member: "alias?: boolean;" },
        after: { member: "current?: boolean;" },
      },
    ],
  };
  assert.deepEqual(validateApprovedDeltas(snapshot, record), []);
  snapshot.httpRoutes.routes.push({
    runtime: "python",
    functionName: "removed",
    methods: ["POST"],
    publicPath: "/api/removed",
  });
  snapshot.domainDtos.declarations[0].signature += "\n alias?: boolean;";
  const issues = validateApprovedDeltas(snapshot, record);
  assert.ok(issues.some((issue) => issue.includes("removed route is present")));
  assert.ok(issues.some((issue) => issue.includes("removed DTO member is still present")));
});
