import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(scriptDirectory, "..");
const runnerEntry = join(fixtureRoot, "..", "..", "dist", "index.mjs");
const sandboxRoot = mkdtempSync(join(tmpdir(), "vitest-v3-mixed-"));

cpSync(fixtureRoot, sandboxRoot, {
  recursive: true,
  filter: (source) => !source.includes(`${fixtureRoot}/node_modules`),
});

console.log(`Running Vitest 3 to 4 migration fixture in ${sandboxRoot}`);

const child = spawn(process.execPath, [runnerEntry], {
  cwd: sandboxRoot,
  env: {
    ...process.env,
    PATH: `${join(sandboxRoot, "fake-bin")}:${process.env.PATH ?? ""}`,
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exitCode = code ?? 1;
});

child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
