import type { createLogUpdate } from "log-update";
import { describe, expect, it } from "vitest";
import type { EnvironmentRequirementCheck } from "../types.js";
import { environmentTask } from "./environment.js";

describe("environmentTask", () => {
  it("logs every environment check result", async () => {
    const messages: string[] = [];
    const logUpdate = createTestLogUpdate(messages);
    const checks = [
      createCheck(true, { label: "node >=20", successMessage: "node >=20 satisfied" }),
      createCheck(false, { label: "bun >=1.2", failureMessage: "bun >=1.2 required" }),
    ];

    await environmentTask(logUpdate, checks);

    expect(messages).toEqual(["  ✓ node >=20 satisfied", "  ✗ bun >=1.2 required"]);
  });

  it("uses result messages before check metadata", async () => {
    const messages: string[] = [];
    const logUpdate = createTestLogUpdate(messages);
    const checks = [
      createCheck({ available: false, message: "node >=20 required, current 18.19.0" }),
    ];

    await environmentTask(logUpdate, checks);

    expect(messages).toEqual(["  ✗ node >=20 required, current 18.19.0"]);
  });

  it("continues after a check throws", async () => {
    const messages: string[] = [];
    const logUpdate = createTestLogUpdate(messages);
    const throwingCheck = Object.assign(
      () => {
        throw new Error("command failed");
      },
      { label: "node >=20" },
    );

    await environmentTask(logUpdate, [throwingCheck, createCheck(true, { label: "bun" })]);

    expect(messages).toEqual(["  ✗ node >=20: command failed", "  ✓ bun"]);
  });
});

function createCheck(
  result: ReturnType<EnvironmentRequirementCheck>,
  metadata: Partial<EnvironmentRequirementCheck> = {},
): EnvironmentRequirementCheck {
  return Object.assign(() => result, metadata);
}

function createTestLogUpdate(messages: string[]): ReturnType<typeof createLogUpdate> {
  return Object.assign(() => {}, {
    clear: () => {},
    done: () => {},
    persist: (...text: string[]) => {
      messages.push(text.join(" "));
    },
  });
}
