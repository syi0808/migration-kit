import { describe, expect, it } from "vitest";
import { apiChanges } from "./api-changes/index.js";
import { configChanges } from "./config-changes/index.js";

describe("Vitest 3 to 4 migration policies", () => {
  it("blocks removed, moved, or behavior-changing config findings that need user action", () => {
    for (const title of [
      "Update Vitest 4 coverage options",
      "Update Module Runner config",
      "Replace workspace config with projects",
      "Update browser provider config",
      "Update Vitest 4 pool options",
      "Review removed Vitest 4 config options",
    ]) {
      const change = findChange(configChanges, title);

      expect(change.policy).toBe("blocking");
      expect(change.shouldBlock).toEqual(expect.any(Function));
    }
  });

  it("does not mark pure config codemods as advisory checks", () => {
    const change = findChange(configChanges, "Update Vitest 4 reporter config");

    expect(change.policy).toBeUndefined();
    expect(change.shouldBlock).toBeUndefined();
    expect(change.transform).toEqual(expect.any(Function));
  });

  it("blocks removed API and unresolved package findings that need user action", () => {
    for (const title of [
      "Review Vitest dependency package changes",
      "Review Vitest 4 source API changes",
    ]) {
      const change = findChange(apiChanges, title);

      expect(change.policy).toBe("blocking");
      expect(change.shouldBlock).toEqual(expect.any(Function));
    }
  });
});

function findChange<T extends { title: string }>(changes: T[], title: string): T {
  const change = changes.find((candidate) => candidate.title === title);

  if (!change) {
    throw new Error(`Missing migration change: ${title}`);
  }

  return change;
}
