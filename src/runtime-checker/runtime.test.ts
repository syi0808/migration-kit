import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runtime } from "./runtime.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("runtime checker", () => {
  it("returns true when the detected node version satisfies the required range", () => {
    const cwd = createProject();
    const command = createVersionCommand("v20.11.1");

    expect(runtime.node({ command, cwd, version: ">=20.0.0" })()).toBe(true);
  });

  it("returns false when the detected node version does not satisfy the required range", () => {
    const cwd = createProject();
    const command = createVersionCommand("v18.19.0");

    expect(runtime.node({ command, cwd, version: ">=20.0.0" })()).toBe(false);
  });

  it("returns true when a runtime exists and no version range is required", () => {
    const cwd = createProject();
    const command = createVersionCommand("v18.19.0");

    expect(runtime.node({ command, cwd })()).toBe(true);
  });

  it("returns false when the runtime command cannot be executed", () => {
    const cwd = createProject();

    expect(runtime.node({ command: "definitely-not-a-runtime-command", cwd })()).toBe(false);
  });

  it("parses bun and deno version output formats", () => {
    const cwd = createProject();
    const bunCommand = createVersionCommand("1.2.3");
    const denoCommand = createVersionCommand("deno 2.4.5 (stable, release, x86_64-apple-darwin)");

    expect(runtime.bun({ command: bunCommand, cwd, version: "^1.2.0" })()).toBe(true);
    expect(runtime.deno({ command: denoCommand, cwd, version: ">=2.0.0" })()).toBe(true);
  });

  it("checks package.json engines before running the runtime command", () => {
    const cwd = createProject({
      "package.json": JSON.stringify({ engines: { node: ">=20.0.0" } }),
    });
    const command = createVersionCommand("v18.19.0");

    expect(runtime.node({ command, cwd, version: ">=20.0.0" })()).toBe(true);
  });

  it("treats an evaluable project runtime range as authoritative", () => {
    const cwd = createProject({
      "package.json": JSON.stringify({ engines: { node: ">=18.0.0" } }),
    });
    const command = createVersionCommand("v24.5.0");

    expect(runtime.node({ command, cwd, version: ">=20.0.0" })()).toBe(false);
  });

  it("checks package.json volta before running the runtime command", () => {
    const cwd = createProject({
      "package.json": JSON.stringify({ volta: { node: "20.11.1" } }),
    });
    const command = createVersionCommand("v18.19.0");

    expect(runtime.node({ command, cwd, version: ">=20.0.0" })()).toBe(true);
  });

  it("checks .nvmrc before running the runtime command", () => {
    const cwd = createProject({ ".nvmrc": "v20.11.1\n" });
    const command = createVersionCommand("v18.19.0");

    expect(runtime.node({ command, cwd, version: ">=20.0.0" })()).toBe(true);
  });

  it("checks .tool-versions for deno before running the runtime command", () => {
    const cwd = createProject({ ".tool-versions": "nodejs 20.11.1\ndeno 2.4.5\n" });
    const command = createVersionCommand("deno 1.46.0");

    expect(runtime.deno({ command, cwd, version: ">=2.0.0" })()).toBe(true);
  });

  it("checks packageManager when it pins bun", () => {
    const cwd = createProject({
      "package.json": JSON.stringify({ packageManager: "bun@1.2.3" }),
    });
    const command = createVersionCommand("1.0.0");

    expect(runtime.bun({ command, cwd, version: ">=1.2.0" })()).toBe(true);
  });

  it("throws when the required version range is invalid", () => {
    expect(() => runtime.node({ version: "not-a-range" })).toThrow(
      "Invalid node version range: not-a-range",
    );
  });
});

function createProject(files: Record<string, string> = {}): string {
  const directory = mkdtempSync(join(tmpdir(), "migration-kit-project-"));

  tempDirectories.push(directory);

  for (const [fileName, content] of Object.entries(files)) {
    writeFileSync(join(directory, fileName), content);
  }

  return directory;
}

function createVersionCommand(output: string): string {
  const directory = mkdtempSync(join(tmpdir(), "migration-kit-runtime-"));
  const commandPath = join(directory, "runtime-version");

  tempDirectories.push(directory);
  writeFileSync(commandPath, `#!/bin/sh\ncat <<'VERSION'\n${output}\nVERSION\n`);
  chmodSync(commandPath, 0o755);

  return commandPath;
}
