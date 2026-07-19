import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, '..', '..');

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

const ROLE_RENDERERS = { 'role-markdown': markdown, 'role-toml': toml };

function frontmatterOf(contents, skillName) {
  contents = contents.replaceAll('\r\n', '\n');
  if (!contents.startsWith('---\n')) {
    throw new Error(`Canonical skill lacks frontmatter: ${skillName}`);
  }
  const end = contents.indexOf('\n---\n', 4);
  if (end < 0) throw new Error(`Canonical skill frontmatter is unterminated: ${skillName}`);
  return contents.slice(0, end + 5);
}

function loadManifest(root) {
  const manifestPath = path.join(root, '.agents', 'adapter-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.manifestVersion !== 1 || !Array.isArray(manifest.sources)) {
    throw new Error('Unsupported adapter manifest schema');
  }
  const roles = manifest.sources.find((entry) => entry.kind === 'roles');
  const skills = manifest.sources.find((entry) => entry.kind === 'skills');
  if (!roles || !skills) {
    throw new Error('Adapter manifest must declare one roles source and one skills source');
  }
  return { manifest, roles, skills };
}

function verifySkillLock(root) {
  const lockPath = path.join(root, 'skills-lock.json');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  if (lock.version !== 1 || !lock.skills || Array.isArray(lock.skills)) {
    throw new Error('Unsupported vendored skill lock schema');
  }

  for (const [skillName, record] of Object.entries(lock.skills)) {
    if (record.sourceType !== 'github' || !record.source || !record.skillPath
      || !/^[a-f0-9]{64}$/.test(record.computedHash)
      || !/^[a-f0-9]{64}$/.test(record.vendoredSha256)) {
      throw new Error(`Invalid vendored skill lock entry: ${skillName}`);
    }
    const skillPath = path.join(root, '.agents', 'skills', skillName, 'SKILL.md');
    if (!fs.existsSync(skillPath)) throw new Error(`Locked vendored skill is missing: ${skillName}`);
    const actual = crypto.createHash('sha256').update(fs.readFileSync(skillPath)).digest('hex');
    if (actual !== record.vendoredSha256) {
      throw new Error(
        `Vendored skill bytes differ from skills-lock.json: ${skillName} ` +
        `(expected ${record.vendoredSha256}, received ${actual})`,
      );
    }
  }
}

function generateRoles({ root, checkOnly, rolesSource, mismatches }) {
  const sourcePath = path.join(root, ...rolesSource.canonical.split('/'));
  const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  if (source.schemaVersion !== 1 || !Array.isArray(source.roles)) {
    throw new Error('Unsupported canonical agent-role schema');
  }

  for (const target of rolesSource.adapters) {
    const render = ROLE_RENDERERS[target.transformation];
    if (!render) throw new Error(`Unknown role transformation: ${target.transformation}`);
    const directory = path.join(root, ...target.directory.split('/'));
    const expected = new Map(
      source.roles.map((role) => [`${role.name}${target.extension}`, render(role)]),
    );
    const existing = fs.existsSync(directory)
      ? fs.readdirSync(directory).filter((name) => name.endsWith(target.extension))
      : [];

    for (const filename of existing) {
      if (expected.has(filename)) continue;
      if (checkOnly) {
        mismatches.push(`Extra generated adapter (no canonical source): ${target.directory}/${filename}`);
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
        mismatches.push(
          actual === null
            ? `Missing generated adapter: ${target.directory}/${filename} (canonical source: ${rolesSource.canonical})`
            : `Stale or hand-edited generated adapter: ${target.directory}/${filename} (canonical source: ${rolesSource.canonical})`,
        );
      } else {
        fs.writeFileSync(destination, contents, 'utf8');
      }
    }
  }

  return source.roles.length;
}

function generateSkills({ root, checkOnly, skillsSource, mismatches }) {
  const canonicalSkillsRoot = path.join(root, ...skillsSource.canonical.split('/'));
  const sourceFile = skillsSource.sourceFile ?? 'SKILL.md';
  const skills = fs.readdirSync(canonicalSkillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(canonicalSkillsRoot, name, sourceFile)))
    .sort();

  for (const target of skillsSource.adapters) {
    if (target.transformation !== 'skill-pointer') {
      throw new Error(`Unknown skill transformation: ${target.transformation}`);
    }
    const adapterRoot = path.join(root, ...target.directory.split('/'));
    const expected = new Map();
    for (const skillName of skills) {
      const canonical = fs.readFileSync(path.join(canonicalSkillsRoot, skillName, sourceFile), 'utf8')
        .replaceAll('\r\n', '\n');
      const relativeCanonical = `../../../${skillsSource.canonical}/${skillName}/${sourceFile}`;
      expected.set(
        `${skillName}/${sourceFile}`,
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
          mismatches.push(`Extra generated skill adapter (no canonical source): ${target.directory}/${actual}`);
        }
      }
      for (const [relative, contents] of expected) {
        const destination = path.join(adapterRoot, relative);
        const actual = fs.existsSync(destination) ? fs.readFileSync(destination, 'utf8') : null;
        if (actual === contents) continue;
        const canonicalSource = `${skillsSource.canonical}/${relative}`;
        mismatches.push(
          actual === null
            ? `Missing generated skill adapter: ${target.directory}/${relative} (canonical source: ${canonicalSource})`
            : `Stale or hand-edited generated skill adapter: ${target.directory}/${relative} (canonical source: ${canonicalSource})`,
        );
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

  return skills.length;
}

export function generateAdapters({ root = defaultRoot, checkOnly = false } = {}) {
  const { roles: rolesSource, skills: skillsSource } = loadManifest(root);
  verifySkillLock(root);

  const mismatches = [];
  const roleCount = generateRoles({ root, checkOnly, rolesSource, mismatches });
  const skillCount = generateSkills({ root, checkOnly, skillsSource, mismatches });
  return { mismatches, roleCount, skillCount };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === path.resolve(url.fileURLToPath(import.meta.url))) {
  const checkOnly = process.argv.includes('--check');
  const { mismatches, roleCount, skillCount } = generateAdapters({ checkOnly });
  if (checkOnly && mismatches.length > 0) {
    for (const message of mismatches) process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      checkOnly
        ? `Adapter parity passed for ${roleCount} roles and ${skillCount} skills.\n`
        : `Generated adapters for ${roleCount} roles and ${skillCount} skills.\n`,
    );
  }
}
