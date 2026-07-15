import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const sourcePath = path.join(root, '.agents', 'agents', 'roles.json');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const checkOnly = process.argv.includes('--check');

if (source.schemaVersion !== 1 || !Array.isArray(source.roles)) {
  throw new Error('Unsupported canonical agent-role schema');
}

function markdown(role) {
  return `---\nname: ${role.name}\ndescription: ${role.description}\nmodel: inherit\n---\n\n` +
    `Canonical source: \`.agents/agents/roles.json\`.\n\n` +
    `Scope: ${role.scope}.\n\n${role.instructions}\n`;
}

function toml(role) {
  const instructions = `Canonical source: .agents/agents/roles.json. Scope: ${role.scope}. ${role.instructions}`;
  return `name = ${JSON.stringify(role.name)}\n` +
    `description = ${JSON.stringify(role.description)}\n` +
    `developer_instructions = ${JSON.stringify(instructions)}\n`;
}

const targets = [
  { directory: '.claude/agents', extension: '.md', render: markdown },
  { directory: '.cursor/agents', extension: '.md', render: markdown },
  { directory: '.codex/agents', extension: '.toml', render: toml },
];

let mismatches = 0;
for (const target of targets) {
  const directory = path.join(root, target.directory);
  const expected = new Map(
    source.roles.map((role) => [`${role.name}${target.extension}`, target.render(role)]),
  );
  const existing = fs.existsSync(directory)
    ? fs.readdirSync(directory).filter((name) => name.endsWith(target.extension))
    : [];

  for (const filename of existing) {
    if (expected.has(filename)) continue;
    if (checkOnly) {
      process.stderr.write(`Unexpected generated adapter: ${target.directory}/${filename}\n`);
      mismatches += 1;
    } else {
      fs.rmSync(path.join(directory, filename));
    }
  }

  if (!checkOnly) fs.mkdirSync(directory, { recursive: true });
  for (const [filename, contents] of expected) {
    const destination = path.join(directory, filename);
    const actual = fs.existsSync(destination) ? fs.readFileSync(destination, 'utf8') : null;
    if (actual === contents) continue;
    if (checkOnly) {
      process.stderr.write(`Generated adapter differs: ${target.directory}/${filename}\n`);
      mismatches += 1;
    } else {
      fs.writeFileSync(destination, contents, 'utf8');
    }
  }
}

function frontmatterOf(contents, skillName) {
  contents = contents.replaceAll('\r\n', '\n');
  if (!contents.startsWith('---\n')) {
    throw new Error(`Canonical skill lacks frontmatter: ${skillName}`);
  }
  const end = contents.indexOf('\n---\n', 4);
  if (end < 0) throw new Error(`Canonical skill frontmatter is unterminated: ${skillName}`);
  return contents.slice(0, end + 5);
}

const canonicalSkillsRoot = path.join(root, '.agents', 'skills');
const skills = fs.readdirSync(canonicalSkillsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => fs.existsSync(path.join(canonicalSkillsRoot, name, 'SKILL.md')))
  .sort();

for (const adapterRootName of ['.claude/skills', '.cursor/skills', '.codex/skills']) {
  const adapterRoot = path.join(root, adapterRootName);
  const expected = new Map();
  for (const skillName of skills) {
    const canonical = fs.readFileSync(path.join(canonicalSkillsRoot, skillName, 'SKILL.md'), 'utf8')
      .replaceAll('\r\n', '\n');
    const relativeCanonical = `../../../.agents/skills/${skillName}/SKILL.md`;
    expected.set(
      `${skillName}/SKILL.md`,
      `${frontmatterOf(canonical, skillName)}\n# Generated adapter\n\n` +
        `Read [the canonical skill](${relativeCanonical}) completely and follow it. ` +
        'Do not edit this generated file.\n',
    );
  }

  if (checkOnly) {
    const actualFiles = [];
    if (fs.existsSync(adapterRoot)) {
      for (const directory of fs.readdirSync(adapterRoot, { withFileTypes: true })) {
        if (!directory.isDirectory()) {
          actualFiles.push(directory.name);
          continue;
        }
        for (const file of fs.readdirSync(path.join(adapterRoot, directory.name), { withFileTypes: true })) {
          actualFiles.push(`${directory.name}/${file.name}`);
        }
      }
    }
    for (const actual of actualFiles) {
      if (!expected.has(actual)) {
        process.stderr.write(`Unexpected generated skill adapter: ${adapterRootName}/${actual}\n`);
        mismatches += 1;
      }
    }
    for (const [relative, contents] of expected) {
      const destination = path.join(adapterRoot, relative);
      const actual = fs.existsSync(destination) ? fs.readFileSync(destination, 'utf8') : null;
      if (actual !== contents) {
        process.stderr.write(`Generated skill adapter differs: ${adapterRootName}/${relative}\n`);
        mismatches += 1;
      }
    }
  } else {
    fs.rmSync(adapterRoot, { recursive: true, force: true });
    for (const [relative, contents] of expected) {
      const destination = path.join(adapterRoot, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, contents, 'utf8');
    }
  }
}

if (checkOnly && mismatches > 0) {
  process.exitCode = 1;
} else {
  process.stdout.write(
    checkOnly
      ? `Adapter parity passed for ${source.roles.length} roles and ${skills.length} skills.\n`
      : `Generated adapters for ${source.roles.length} roles and ${skills.length} skills.\n`,
  );
}
