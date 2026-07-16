#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  TICKET_DIR,
  OPERATOR_ACTIONS_PATH,
  discoverPlans,
  discoverTickets,
  renderBoard,
  renderIndex,
  renderOperatorActions,
  renderPlan,
  ticketsByPlan,
} from "./ticket-system.mjs";

const CHECK = process.argv.slice(2).includes("--check");
const unknown = process.argv.slice(2).filter((argument) => argument !== "--check");
if (unknown.length > 0) {
  throw new Error(`Unknown option(s): ${unknown.join(", ")}`);
}

const { tickets, directoryIssues } = discoverTickets();
if (directoryIssues.length > 0) {
  throw new Error(directoryIssues.join("\n"));
}
const plans = discoverPlans();
const byPlan = ticketsByPlan(tickets);
const outputs = new Map([
  [join(TICKET_DIR, "BOARD.md"), renderBoard(tickets)],
  [join(TICKET_DIR, "README.md"), renderIndex(tickets, plans)],
  [OPERATOR_ACTIONS_PATH, renderOperatorActions(tickets)],
]);
for (const plan of plans) {
  outputs.set(plan.absolute, renderPlan(plan, byPlan.get(plan.frontmatter.id) ?? []));
}

const drift = [];
for (const [absolute, expected] of outputs) {
  const actual = existsSync(absolute) ? readFileSync(absolute, "utf8") : null;
  if (actual === expected) continue;
  if (CHECK) drift.push(absolute);
  else writeFileSync(absolute, expected);
}

if (drift.length > 0) {
  console.error("Generated ticket views are stale:");
  for (const absolute of drift) console.error(`- ${absolute}`);
  console.error("Run: node scripts/maintenance/ticket-generate.mjs");
  process.exit(1);
}

console.log(
  CHECK
    ? `Ticket generation parity OK (${tickets.length} tickets, ${plans.length} plans).`
    : `Generated ticket views (${tickets.length} tickets, ${plans.length} plans).`,
);
