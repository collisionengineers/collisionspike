import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const TICKET_DIR = join(ROOT, "docs", "tickets");
export const OPERATOR_ACTIONS_PATH = join(
  ROOT,
  "docs",
  "operations",
  "operator-actions.md",
);
export const STATUSES = ["now", "verify", "done", "next", "backlog", "blocked"];
export const LIFECYCLE_STATUSES = [
  "backlog",
  "now",
  "next",
  "verify",
  "done",
  "blocked",
];
export const PLAN_STATUSES = ["active", "done", "superseded"];
export const PRIORITIES = ["P0", "P1", "P2", "P3"];

// Machine-readable plan classification (TKT-271 / PLAN-012). Every plan declares one `plan-kind`.
//   feature       — delivers new product capability.
//   remediation   — fixes, reconciles, or cleans up existing state.
//   consolidation — removes structural duplication behind a terminal drift guard.
//   governance    — establishes rules, docs, or checks with no functional change.
export const PLAN_KINDS = ["feature", "remediation", "consolidation", "governance"];
export const CONSOLIDATION_PLAN_KIND = "consolidation";

// Anti-drift guard modes (TKT-271 A1). A consolidation plan's terminal guard declares the mode that
// matches its risk; naive lexical bans are never an accepted mode.
//   ast-import          — AST/import analysis of TypeScript source syntax.
//   import-reference    — import/reference analysis of shared-source policy.
//   behavioural-fixture — cross-language behavioural fixtures.
//   machine-evidence    — machine-readable evidence comparison for live state.
export const GUARD_MODES = [
  "ast-import",
  "import-reference",
  "behavioural-fixture",
  "machine-evidence",
];

// The flat frontmatter fields a consolidation plan must carry so the ticket parser can read them.
export const TERMINAL_GUARD_FIELDS = [
  "terminal-guard",
  "terminal-guard-command",
  "guard-mode",
];

const STATUS_TITLES = new Map([
  ["now", "Now"],
  ["verify", "Verify"],
  ["done", "Done"],
  ["next", "Next"],
  ["backlog", "Backlog"],
  ["blocked", "Blocked"],
]);

export function toPosix(value) {
  return value.split(sep).join("/");
}

export function repoRelative(value) {
  return toPosix(relative(ROOT, value));
}

export function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return null;
  const values = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const index = line.indexOf(":");
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    const comment = value.indexOf(" #");
    if (comment >= 0) value = value.slice(0, comment).trim();
    if (value.startsWith("[") && value.endsWith("]")) {
      values[key] = value
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    } else {
      values[key] = value.replace(/^['"]|['"]$/g, "");
    }
  }
  return values;
}

export function replaceFrontmatterField(raw, field, serializedValue) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error("missing frontmatter");
  const expression = new RegExp(`^${field}:\\s*.*$`, "m");
  const replacement = `${field}: ${serializedValue}`;
  if (expression.test(match[0])) {
    return raw.replace(expression, replacement);
  }
  return raw.replace(/^---\r?\n/, `---\n${replacement}\n`);
}

export function discoverTickets() {
  const tickets = [];
  const directoryIssues = [];

  for (const entry of readdirSync(TICKET_DIR, { withFileTypes: true })) {
    if (entry.isDirectory() && /^TKT-\d{3}-/.test(entry.name)) {
      directoryIssues.push(
        `ticket directory must be in a status folder: docs/tickets/${entry.name}`,
      );
    }
  }

  for (const status of LIFECYCLE_STATUSES) {
    const statusDirectory = join(TICKET_DIR, status);
    if (!existsSync(statusDirectory)) {
      directoryIssues.push(`missing status directory: docs/tickets/${status}`);
      continue;
    }
    for (const entry of readdirSync(statusDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!/^TKT-\d{3}-/.test(entry.name)) {
        directoryIssues.push(
          `unexpected directory under docs/tickets/${status}: ${entry.name}`,
        );
        continue;
      }
      const directory = join(statusDirectory, entry.name);
      const spec = join(directory, `${entry.name}.md`);
      if (!existsSync(spec)) {
        directoryIssues.push(`missing ticket spec: ${repoRelative(spec)}`);
        continue;
      }
      const raw = readFileSync(spec, "utf8");
      tickets.push({
        status,
        directory,
        directoryName: entry.name,
        spec,
        relativeSpec: repoRelative(spec),
        raw,
        frontmatter: parseFrontmatter(raw),
      });
    }
  }

  tickets.sort((left, right) => {
    const a = left.frontmatter?.id ?? left.directoryName;
    const b = right.frontmatter?.id ?? right.directoryName;
    return a.localeCompare(b, "en", { numeric: true });
  });
  return { tickets, directoryIssues };
}

export function discoverPlans() {
  const directory = join(TICKET_DIR, "plans");
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && /^PLAN-\d{3}-[a-z0-9-]+\.md$/i.test(entry.name),
    )
    .map((entry) => {
      const absolute = join(directory, entry.name);
      const raw = readFileSync(absolute, "utf8");
      return {
        absolute,
        relative: repoRelative(absolute),
        fileName: entry.name,
        raw,
        frontmatter: parseFrontmatter(raw),
      };
    })
    .sort((left, right) =>
      (left.frontmatter?.id ?? left.fileName).localeCompare(
        right.frontmatter?.id ?? right.fileName,
        "en",
        { numeric: true },
      ),
    );
}

export function ticketsByPlan(tickets) {
  const result = new Map();
  for (const ticket of tickets) {
    const plan = ticket.frontmatter?.plan;
    if (!plan) continue;
    if (!result.has(plan)) result.set(plan, []);
    result.get(plan).push(ticket);
  }
  return result;
}

function ticketLink(ticket, prefix = ".") {
  return `${prefix}/${ticket.status}/${ticket.directoryName}/${ticket.directoryName}.md`;
}

function ticketState(ticket) {
  const values = [ticket.frontmatter.priority, ticket.frontmatter.area];
  if (ticket.frontmatter.plan) values.push(ticket.frontmatter.plan);
  return values.filter(Boolean).join(" · ");
}

const OPERATOR_ACTION_FIELDS = [
  "operator-action",
  "operator-actions",
  "operator-owned-action",
  "operator-owned-actions",
];
const ACTION_TEXT_LIMIT = 340;

function explicitOperatorActions(ticket) {
  const actions = [];
  for (const field of OPERATOR_ACTION_FIELDS) {
    const value = ticket.frontmatter?.[field];
    if (Array.isArray(value)) actions.push(...value);
    else if (value) actions.push(value);
  }
  return actions.map((value) => String(value).trim()).filter(Boolean);
}

function withoutFrontmatter(raw) {
  return raw.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
}

function sectionText(raw, names) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const lines = withoutFrontmatter(raw).split(/\r?\n/);
  const result = [];
  let capture = false;
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      if (capture) break;
      capture = wanted.has(heading[1].trim().toLowerCase());
      continue;
    }
    if (capture) result.push(line);
  }
  return result.join("\n");
}

function markdownBlocks(raw) {
  const blocks = [];
  let current = [];
  let fenced = false;
  const flush = () => {
    if (current.length) blocks.push(current.join(" "));
    current = [];
  };

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^(```|~~~)/.test(trimmed)) {
      flush();
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    if (!trimmed || /^#{1,6}\s+/.test(trimmed)) {
      flush();
      continue;
    }
    const item = trimmed.match(/^(?:[-*+]\s+|\d+[.)]\s+)(.*)$/);
    if (item) {
      flush();
      current.push(item[1]);
      continue;
    }
    current.push(trimmed.replace(/^>\s?/, ""));
  }
  flush();
  return blocks;
}

function plainActionText(value) {
  return String(value)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[`*~]/g, "")
    .replace(/^\s*(?:[-+]|\d+[.)]|A\d+[.)])\s*/, "")
    .replace(/\/\s+/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

function joinActionParts(values) {
  const parts = values
    .map((value) => value.replace(/[.;:]\s*$/, "").trim())
    .filter(Boolean);
  const joined = parts.join("; ");
  return /[.!?]$/.test(joined) ? joined : `${joined}.`;
}

function conciseAction(value) {
  const plain = plainActionText(value);
  if (plain.length <= ACTION_TEXT_LIMIT) return plain;
  const prefix = plain.slice(0, ACTION_TEXT_LIMIT - 1);
  const breakAt = prefix.lastIndexOf(" ");
  return `${prefix.slice(0, breakAt > 180 ? breakAt : prefix.length).trimEnd()}…`;
}

export function operatorActionText(ticket, blockedIds = new Set()) {
  const explicit = explicitOperatorActions(ticket);
  if (explicit.length) return conciseAction(joinActionParts(explicit));

  const acceptance = markdownBlocks(sectionText(ticket.raw, ["Acceptance"])).map(
    plainActionText,
  );
  const acceptanceActions = acceptance.filter((value) => /^operator\b/i.test(value));
  if (acceptanceActions.length) {
    return conciseAction(
      joinActionParts(acceptanceActions.map((value) => value.split(";")[0])),
    );
  }

  const blockerBlocks = markdownBlocks(
    sectionText(ticket.raw, [
      "Blocked on",
      "Blocker",
      "Blockers",
      "Operator action",
      "Operator actions",
    ]),
  ).map(plainActionText);
  const operatorBlockers = blockerBlocks.filter((value) => /\boperator\b/i.test(value));
  if (operatorBlockers.length) {
    return conciseAction(joinActionParts(operatorBlockers));
  }
  if (blockerBlocks.length) return conciseAction(blockerBlocks[0]);

  const bodyBlocker = markdownBlocks(withoutFrontmatter(ticket.raw))
    .map(plainActionText)
    .find((value) =>
      /\b(?:blocked (?:until|unless|on|from)|awaiting|operator must|operator approval)\b/i.test(
        value,
      ),
  );
  if (bodyBlocker) return conciseAction(bodyBlocker);

  const related = ticket.frontmatter["tickets-it-relates-to"];
  const relatedBlocked = (Array.isArray(related) ? related : related ? [related] : []).filter(
    (id) => blockedIds.has(id),
  );
  if (relatedBlocked.length) {
    return `Complete the blocking prerequisites in ${relatedBlocked.join(
      ", ",
    )} before resuming ${ticket.frontmatter.id}.`;
  }

  return `Resolve the blocking dependencies documented in ${ticket.frontmatter.id} before work resumes.`;
}

export function operatorActionTickets(tickets) {
  return tickets
    .filter(
      (ticket) =>
        ticket.status === "blocked" || explicitOperatorActions(ticket).length > 0,
    )
    .sort((left, right) => {
      const priority =
        PRIORITIES.indexOf(left.frontmatter.priority) -
        PRIORITIES.indexOf(right.frontmatter.priority);
      if (priority !== 0) return priority;
      return left.frontmatter.id.localeCompare(right.frontmatter.id, "en", {
        numeric: true,
      });
    });
}

export function renderOperatorActions(tickets) {
  const members = operatorActionTickets(tickets);
  const blockedIds = new Set(
    tickets
      .filter((ticket) => ticket.status === "blocked")
      .map((ticket) => ticket.frontmatter.id),
  );
  const lines = [
    "# Operator actions",
    "",
    "Generated from current ticket specs. Ticket frontmatter and status folders remain the work authority; edit the owning ticket, then run `node scripts/maintenance/ticket-generate.mjs`. Do not edit this page by hand.",
    "",
    "The action column uses explicit operator-action metadata when present, then the clearest operator or external prerequisite recorded in the ticket. Open the ticket for complete acceptance and dependency details.",
    "",
  ];

  if (members.length === 0) {
    lines.push("There are no current operator actions.", "");
    return lines.join("\n");
  }

  lines.push(
    "| Ticket | Priority | Area | Action required |",
    "|---|---|---|---|",
  );
  for (const ticket of members) {
    const values = ticket.frontmatter;
    const title = String(values.title).replace(/\|/g, "\\|");
    const area = String(values.area).replace(/\|/g, "\\|");
    const action = operatorActionText(ticket, blockedIds).replace(/\|/g, "\\|");
    const link = `../tickets/${ticket.status}/${ticket.directoryName}/${ticket.directoryName}.md`;
    lines.push(
      `| [${values.id}](${link}) — ${title} | ${values.priority} | ${area} | ${action} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

export function renderBoard(tickets) {
  const lines = [
    "# Ticket board",
    "",
    "Generated from ticket frontmatter. Edit a ticket spec, then run `node scripts/maintenance/ticket-generate.mjs`; do not edit the tables by hand.",
    "",
  ];
  for (const status of STATUSES) {
    const members = tickets.filter((ticket) => ticket.status === status);
    lines.push(`## ${STATUS_TITLES.get(status)} (${members.length})`, "");
    lines.push("| ID | Title | Classification |", "|---|---|---|");
    for (const ticket of members) {
      const id = ticket.frontmatter.id;
      const title = String(ticket.frontmatter.title).replace(/\|/g, "\\|");
      lines.push(
        `| [${id}](${ticketLink(ticket)}) | ${title} | ${ticketState(ticket)} |`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function planProgress(plan, members) {
  const counts = new Map(
    LIFECYCLE_STATUSES.map((status) => [
      status,
      members.filter((ticket) => ticket.status === status).length,
    ]),
  );
  const completed = counts.get("done");
  const total = members.length;
  const percent = total === 0 ? 0 : Math.floor((completed * 100) / total);
  return { counts, completed, total, percent };
}

export function generatedPlanProgress(plan, members) {
  const progress = planProgress(plan, members);
  const lines = [
    "<!-- GENERATED:PROGRESS -->",
    "## Computed progress",
    "",
    `**${progress.completed}/${progress.total} done (${progress.percent}%).**`,
    "",
    "| Status | Count |",
    "|---|---:|",
  ];
  for (const status of STATUSES) {
    lines.push(`| ${STATUS_TITLES.get(status)} | ${progress.counts.get(status)} |`);
  }
  lines.push("", "| Ticket | Status | Title |", "|---|---|---|");
  for (const ticket of members) {
    lines.push(
      `| [${ticket.frontmatter.id}](${ticketLink(ticket, "..")}) | ${ticket.status} | ${String(ticket.frontmatter.title).replace(/\|/g, "\\|")} |`,
    );
  }
  lines.push("<!-- /GENERATED:PROGRESS -->");
  return lines.join("\n");
}

export function renderPlan(plan, members) {
  let next = replaceFrontmatterField(
    plan.raw,
    "tickets",
    `[${members.map((ticket) => ticket.frontmatter.id).join(", ")}]`,
  );
  const generated = generatedPlanProgress(plan, members);
  const expression =
    /<!-- GENERATED:PROGRESS -->[\s\S]*?<!-- \/GENERATED:PROGRESS -->/;
  if (expression.test(next)) next = next.replace(expression, generated);
  else next = `${next.trimEnd()}\n\n${generated}\n`;
  return next.endsWith("\n") ? next : `${next}\n`;
}

export function renderIndex(tickets, plans) {
  const byPlan = ticketsByPlan(tickets);
  const lines = [
    "# Tickets",
    "",
    "Ticket specs and their frontmatter are the repository's work authority. Status folders show lifecycle state; the board, this index and plan progress are generated views.",
    "",
    "## Working rules",
    "",
    "- A ticket lives at `docs/tickets/<status>/TKT-NNN-slug/` and always contains its matching spec.",
    "- `changes.md` is required in `now`, `verify` and `done`.",
    "- `verification.md` is required in `verify` and `done`. A ticket reaches `done` only with evidence allowed by its acceptance criteria.",
    "- Raw binary evidence lives in the content-addressed fixture store. A ticket-local `evidence-manifest.json` records each logical use; text notes may remain beside the ticket.",
    "- `research-link` names the source that grounds the ticket. A self-contained ticket may link to its own spec.",
    "- Use `node scripts/maintenance/ticket-move.mjs TKT-NNN <status>` for lifecycle transitions. It regenerates all derived views and rewrites repository Markdown links.",
    "",
    "## Lifecycle",
    "",
    "`backlog → now | next`, `next → now`, `now → verify | done | blocked`, `verify → done | blocked`, `blocked → now`, and `done → now` for a dated regression follow-up.",
    "",
    "## Plans",
    "",
    "| Plan | Status | Progress |",
    "|---|---|---:|",
  ];
  for (const plan of plans) {
    const id = plan.frontmatter.id;
    const members = byPlan.get(id) ?? [];
    const progress = planProgress(plan, members);
    const title = String(plan.frontmatter.title).replace(/\|/g, "\\|");
    lines.push(
      `| [${id}](./plans/${plan.fileName}) — ${title} | ${plan.frontmatter.status} | ${progress.completed}/${progress.total} (${progress.percent}%) |`,
    );
  }
  lines.push("", "[Open the generated board](./BOARD.md).", "");

  for (const status of STATUSES) {
    const members = tickets.filter((ticket) => ticket.status === status);
    lines.push(`## ${STATUS_TITLES.get(status)} (${members.length})`, "");
    lines.push("| ID | Title | Priority | Area | Plan |", "|---|---|---|---|---|");
    for (const ticket of members) {
      const values = ticket.frontmatter;
      lines.push(
        `| [${values.id}](${ticketLink(ticket)}) | ${String(values.title).replace(/\|/g, "\\|")} | ${values.priority} | ${values.area} | ${values.plan || "—"} |`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function listFilesRecursively(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFilesRecursively(absolute));
    else if (entry.isFile() || statSync(absolute).isFile()) files.push(absolute);
  }
  return files;
}
