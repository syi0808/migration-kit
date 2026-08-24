import { page, userEvent } from "@vitest/browser/context";
import { click } from "@vitest/browser/utils";
import { startVitest } from "vitest/execute";
import { describe, expect, test, vi } from "vitest";
import type { SpyInstance, WorkspaceSpec } from "vitest";
import { add, ignoredBranch } from "./math";
import { sharedValue } from "./shared";

const mockName = sharedValue.toUpperCase();

vi.mock("./feature", () => ({
  featureName: mockName,
}));

const legacyReporter = {
  onCollected() {},
  onTaskUpdate() {},
};

describe("mixed Vitest 3 API usage", () => {
  test(
    "uses the old test option argument order",
    () => {
      expect(add(1, 2)).toBe(3);
    },
    { timeout: 1_000, retry: 1 },
  );

  test(
    "uses browser context imports",
    async () => {
      await userEvent.click(page.getByText("Save"));
      await click(page.getByRole("button"));
    },
    { timeout: 2_000 },
  );

  test(
    "keeps coverage ignore comments visible to coverage tooling",
    () => {
      /* v8 ignore next */
      const value = ignoredBranch("covered");

      expect(value).toBe("covered");
    },
    { retry: 1 },
  );
});

vi.restoreAllMocks();

process.env.VITEST_MAX_THREADS = "2";
const executor = globalThis.__vitest_executor;
const runner = startVitest;

type LegacySpy = SpyInstance;
type LegacyWorkspaceSpec = WorkspaceSpec;

void legacyReporter;
void executor;
void runner;
void 0 as unknown as LegacySpy;
void 0 as unknown as LegacyWorkspaceSpec;
