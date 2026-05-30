import { describe, expect, it } from "vitest";
import { createLogStyle, shouldUseColor, stripAnsi } from "./log-style.js";

describe("logStyle", () => {
  it("keeps unicode symbols when color is disabled", () => {
    const logStyle = createLogStyle({
      argv: [],
      env: { NO_COLOR: "1" },
      stream: { isTTY: true },
    });

    expect(logStyle.section("Environment")).toBe("◆ Environment");
    expect(logStyle.success("Done")).toBe("  ✓ Done");
    expect(logStyle.error("Failed", 0)).toBe("✗ Failed");
    expect(logStyle.skipped("No files matched", 2)).toBe("    - No files matched");
  });

  it("can force ANSI color for non-TTY output", () => {
    const logStyle = createLogStyle({
      argv: [],
      env: { FORCE_COLOR: "1" },
      stream: { isTTY: false },
    });
    const message = logStyle.success("Done");

    expect(message).toContain("\u001B[32m");
    expect(stripAnsi(message)).toBe("  ✓ Done");
  });

  it("lets explicit disable controls win over terminal detection", () => {
    const logStyle = createLogStyle({
      argv: ["--color"],
      env: { FORCE_COLOR: "1", NO_COLOR: "1" },
      stream: { isTTY: true },
    });

    expect(logStyle.warning("Needs review")).toBe("  ! Needs review");
  });
});

describe("shouldUseColor", () => {
  it("uses TTY output by default", () => {
    expect(shouldUseColor({ argv: [], env: {}, stream: { isTTY: true } })).toBe(true);
    expect(shouldUseColor({ argv: [], env: {}, stream: { isTTY: false } })).toBe(false);
  });

  it("supports color flags and disabled terminal settings", () => {
    expect(shouldUseColor({ argv: ["--color"], env: {}, stream: { isTTY: false } })).toBe(true);
    expect(shouldUseColor({ argv: [], env: { FORCE_COLOR: "0" }, stream: { isTTY: true } })).toBe(
      false,
    );
    expect(shouldUseColor({ argv: [], env: { TERM: "dumb" }, stream: { isTTY: true } })).toBe(
      false,
    );
  });
});
