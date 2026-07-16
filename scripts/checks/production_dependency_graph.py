#!/usr/bin/env python3
"""Trace local Python imports reachable from production function entry points.

The Node repository gate invokes this helper because Python's own AST is the
authoritative way to distinguish imports from comments and strings. Results are
JSON so the aggregate gate can report TypeScript and Python findings uniformly.
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import re
from collections import deque
from pathlib import Path
from typing import Any


ARTIFICIAL_TOKENS = {
    "demo": "demo",
    "demos": "demo",
    "evaluation": "evaluation",
    "evaluations": "evaluation",
    "fixture": "fixture",
    "fixtures": "fixture",
    "mock": "mock",
    "mocks": "mock",
    "prototype": "prototype",
    "prototypes": "prototype",
    "sample": "sample",
    "samples": "sample",
    "seed": "seed",
    "seeds": "seed",
    "story": "story",
    "stories": "story",
    "test": "test-only",
    "tests": "test-only",
    "__tests__": "test-only",
}


def normalized_tokens(value: str) -> list[str]:
    camel_split = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", value)
    return [part for part in re.split(r"[^a-z0-9]+", camel_split.casefold()) if part]


def artificial_marker(value: str) -> str | None:
    for token in normalized_tokens(value):
        marker = ARTIFICIAL_TOKENS.get(token)
        if marker:
            return marker
    return None


def dotted_name(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        parent = dotted_name(node.value)
        return f"{parent}.{node.attr}" if parent else node.attr
    return None


class SourceAnalyzer(ast.NodeVisitor):
    def __init__(self, source_path: Path) -> None:
        self.source_path = source_path
        self.constants: dict[str, ast.AST] = {}
        self.ambiguous_constants: set[str] = set()
        self.imports: list[dict[str, Any]] = []
        self.resources: list[dict[str, Any]] = []
        self.errors: list[dict[str, Any]] = []

    def collect_constants(self, tree: ast.AST) -> None:
        for node in ast.walk(tree):
            if isinstance(node, (ast.Assign, ast.AnnAssign)):
                value = node.value
                targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                if value is None:
                    continue
                for target in targets:
                    if isinstance(target, ast.Name):
                        if target.id in self.constants or target.id in self.ambiguous_constants:
                            self.constants.pop(target.id, None)
                            self.ambiguous_constants.add(target.id)
                        else:
                            self.constants[target.id] = value

    def static_string(self, node: ast.AST | None, seen: set[str] | None = None) -> str | None:
        if node is None:
            return None
        seen = set() if seen is None else seen
        if isinstance(node, ast.Constant) and isinstance(node.value, (str, int)):
            return str(node.value)
        if isinstance(node, ast.Name):
            if node.id == "__file__":
                return str(self.source_path)
            if node.id in seen or node.id not in self.constants:
                return None
            return self.static_string(self.constants[node.id], seen | {node.id})
        if isinstance(node, ast.JoinedStr):
            parts: list[str] = []
            for value in node.values:
                if isinstance(value, ast.Constant) and isinstance(value.value, str):
                    parts.append(value.value)
                elif isinstance(value, ast.FormattedValue):
                    rendered = self.static_string(value.value, seen)
                    if rendered is None:
                        return None
                    parts.append(rendered)
                else:
                    return None
            return "".join(parts)
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Div)):
            left = self.static_string(node.left, seen)
            right = self.static_string(node.right, seen)
            if left is None or right is None:
                return None
            return left + right if isinstance(node.op, ast.Add) else str(Path(left) / right)
        if isinstance(node, ast.Subscript) and isinstance(node.value, ast.Attribute):
            if node.value.attr == "parents":
                base = self.static_string(node.value.value, seen)
                index = self.static_string(node.slice, seen)
                if base is not None and index is not None and index.isdigit():
                    path = Path(base)
                    for _ in range(int(index) + 1):
                        path = path.parent
                    return str(path)
        if isinstance(node, ast.Attribute):
            base = self.static_string(node.value, seen)
            if base is not None and node.attr == "parent":
                return str(Path(base).parent)
        if isinstance(node, ast.Call):
            name = dotted_name(node.func) or ""
            if name.endswith(".resolve") and isinstance(node.func, ast.Attribute):
                return self.static_string(node.func.value, seen)
            if name in {"Path", "PurePath", "str"} and node.args:
                return self.static_string(node.args[0], seen)
            if name in {"os.path.join", "posixpath.join", "ntpath.join"} or name.endswith(".joinpath"):
                values = [self.static_string(argument, seen) for argument in node.args]
                if values and all(value is not None for value in values):
                    return str(Path(values[0] or "").joinpath(*(value or "" for value in values[1:])))
        return None

    @staticmethod
    def string_fragments(node: ast.AST) -> str:
        return "/".join(
            str(child.value)
            for child in ast.walk(node)
            if isinstance(child, ast.Constant) and isinstance(child.value, str)
        )

    def visit_Import(self, node: ast.Import) -> None:  # noqa: N802
        for alias in node.names:
            self.imports.append({"module": alias.name, "level": 0, "line": node.lineno, "kind": "import"})

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:  # noqa: N802
        module = node.module or ""
        self.imports.append(
            {
                "module": module,
                "level": node.level,
                "line": node.lineno,
                "kind": "from-import",
                "names": [alias.name for alias in node.names if alias.name != "*"],
            }
        )

    def visit_Call(self, node: ast.Call) -> None:  # noqa: N802
        name = dotted_name(node.func) or ""
        if name in {"__import__", "importlib.import_module"}:
            expression = node.args[0] if node.args else None
            module = self.static_string(expression)
            if module is None:
                self.errors.append(
                    {
                        "kind": "unresolved-dynamic-import",
                        "line": node.lineno,
                        "dependency": ast.unparse(expression) if expression is not None else "<missing>",
                        "detail": "Dynamic module name is not statically resolvable",
                    }
                )
            else:
                self.imports.append(
                    {"module": module, "level": len(module) - len(module.lstrip(".")), "line": node.lineno, "kind": "dynamic-import"}
                )

        resource_expression: ast.AST | None = None
        if name in {"open", "io.open"} and node.args:
            resource_expression = node.args[0]
        elif name.endswith((".read_text", ".read_bytes", ".open")) and isinstance(node.func, ast.Attribute):
            resource_expression = node.func.value
        if resource_expression is not None:
            value = self.static_string(resource_expression)
            candidate = value if value is not None else self.string_fragments(resource_expression)
            marker = artificial_marker(candidate)
            if marker:
                self.resources.append(
                    {
                        "kind": "resource-load",
                        "line": node.lineno,
                        "dependency": candidate,
                        "marker": marker,
                        "detail": "Production code loads an artificial-data path",
                    }
                )
        self.generic_visit(node)


def module_parts_for_file(source: Path, function_root: Path) -> list[str]:
    relative = source.relative_to(function_root)
    parts = list(relative.parts)
    if parts[-1] == "__init__.py":
        return parts[:-1]
    return parts[:-1] + [Path(parts[-1]).stem]


def resolve_module(
    module: str,
    level: int,
    source: Path,
    function_root: Path,
) -> tuple[Path | None, list[str]]:
    current = module_parts_for_file(source, function_root)
    if source.name != "__init__.py":
        current = current[:-1]
    if level:
        remove = max(level - 1, 0)
        base = current[: len(current) - remove] if remove <= len(current) else []
        parts = base + [part for part in module.lstrip(".").split(".") if part]
    else:
        parts = [part for part in module.split(".") if part]

    base_path = function_root.joinpath(*parts)
    candidates = [base_path.with_suffix(".py"), base_path / "__init__.py"]
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve(), parts
    return None, parts


def scan_target(repository_root: Path, name: str, function_root: Path, entry: Path) -> dict[str, Any]:
    queue: deque[Path] = deque([entry.resolve()])
    visited: set[Path] = set()
    violations: list[dict[str, Any]] = []
    edges = 0

    def add_violation(source: Path, finding: dict[str, Any]) -> None:
        violations.append(
            {
                "owner": name,
                "language": "python",
                "source": source.relative_to(repository_root).as_posix(),
                **finding,
            }
        )

    while queue:
        source = queue.popleft()
        if source in visited:
            continue
        visited.add(source)
        if not source.is_file():
            add_violation(
                source,
                {"kind": "missing-entry", "line": 1, "dependency": str(source), "detail": "Production entry does not exist"},
            )
            continue
        marker = artificial_marker(source.relative_to(repository_root).as_posix())
        if marker:
            add_violation(
                source,
                {"kind": "artificial-path", "line": 1, "dependency": str(source), "marker": marker, "detail": "Reachable module has an artificial-data path"},
            )

        try:
            text = source.read_text(encoding="utf-8")
            tree = ast.parse(text, filename=str(source))
        except (OSError, SyntaxError, UnicodeError) as error:
            add_violation(
                source,
                {"kind": "parse-error", "line": getattr(error, "lineno", 1) or 1, "dependency": str(source), "detail": str(error)},
            )
            continue

        analyzer = SourceAnalyzer(source)
        analyzer.collect_constants(tree)
        analyzer.visit(tree)
        for finding in [*analyzer.errors, *analyzer.resources]:
            add_violation(source, finding)

        for dependency in analyzer.imports:
            edges += 1
            module = dependency["module"]
            marker = artificial_marker(module)
            if marker:
                add_violation(
                    source,
                    {
                        **dependency,
                        "dependency": module,
                        "marker": marker,
                        "detail": "Production import names an artificial-data module",
                    },
                )
            resolved, parts = resolve_module(module, dependency["level"], source, function_root)
            if resolved is not None:
                queue.append(resolved)
                if resolved.name == "__init__.py":
                    for imported_name in dependency.get("names", []):
                        submodule = resolved.parent / f"{imported_name}.py"
                        subpackage = resolved.parent / imported_name / "__init__.py"
                        if submodule.is_file():
                            queue.append(submodule.resolve())
                        elif subpackage.is_file():
                            queue.append(subpackage.resolve())
            elif dependency["level"]:
                add_violation(
                    source,
                    {
                        **dependency,
                        "dependency": module or "." * dependency["level"],
                        "detail": f"Relative production import could not be resolved ({'.'.join(parts)})",
                    },
                )

    return {
        "name": name,
        "visited": len(visited),
        "edges": edges,
        "violations": violations,
    }


def parse_target(raw: str, repository_root: Path) -> tuple[str, Path, Path]:
    try:
        name, root_value, entry_value = raw.split("|", 2)
    except ValueError as error:
        raise argparse.ArgumentTypeError("--target must be name|function-root|entry") from error
    return name, (repository_root / root_value).resolve(), (repository_root / entry_value).resolve()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repository-root", required=True)
    parser.add_argument("--target", action="append", default=[])
    args = parser.parse_args()

    repository_root = Path(args.repository_root).resolve()
    targets = [parse_target(raw, repository_root) for raw in args.target]
    results = [scan_target(repository_root, name, function_root, entry) for name, function_root, entry in targets]
    json.dump({"targets": results}, fp=os.sys.stdout, sort_keys=True)
    os.sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
