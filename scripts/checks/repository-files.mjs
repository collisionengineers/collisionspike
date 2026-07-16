import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function normalizeRepositoryPath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function resolveRepositoryPath(repositoryPath) {
  const normalized = normalizeRepositoryPath(repositoryPath);
  const absolute = path.resolve(repositoryRoot, ...normalized.split("/"));
  const relative = path.relative(repositoryRoot, absolute);

  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Path escapes repository root: ${repositoryPath}`);
  }

  return absolute;
}

export function listRepositoryFiles({ includeUntracked = false } = {}) {
  const args = ["-C", repositoryRoot, "ls-files", "-z", "--cached"];
  if (includeUntracked) {
    args.push("--others", "--exclude-standard");
  }

  const output = execFileSync("git", args, {
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });

  return [...new Set(
    output
      .toString("utf8")
      .split("\0")
      .filter(Boolean)
      .map(normalizeRepositoryPath),
  )].sort(comparePaths);
}

export function repositoryDirectoriesForFiles(files) {
  const directories = new Set(["."]);

  for (const file of files) {
    let directory = path.posix.dirname(file);
    while (directory !== ".") {
      directories.add(directory);
      directory = path.posix.dirname(directory);
    }
  }

  return [...directories].sort(comparePaths);
}
