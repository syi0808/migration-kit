import { afterEach, describe, expect, it, vi } from "vitest";

const createMigrationRunner = vi.hoisted(() => vi.fn(() => ({ run: vi.fn() })));
const nodeRuntimeCheck = vi.hoisted(() => vi.fn(() => true));
const jscodeshiftTransformer = vi.hoisted(() => vi.fn(() => vi.fn()));

vi.mock("migration-kit", () => ({
  createMigrationRunner,
  runtime: {
    node: nodeRuntimeCheck,
  },
  transformer: {
    jscodeshift: jscodeshiftTransformer,
  },
}));

afterEach(() => {
  vi.resetModules();
  createMigrationRunner.mockClear();
  nodeRuntimeCheck.mockClear();
  jscodeshiftTransformer.mockClear();
});

describe("createVitest3To4MigrationRunner", () => {
  it("configures Vitest itself for package version updates", async () => {
    await import("./index.js");

    expect(createMigrationRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        packageVersionUpdates: expect.arrayContaining([
          { dependency: "vitest", from: "3.x", to: "4.x" },
        ]),
      }),
    );
  });
});
