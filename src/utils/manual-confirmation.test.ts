import { select } from "@clack/prompts";
import { Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { requestManualConfirmation } from "./manual-confirmation.js";

vi.mock("@clack/prompts", () => ({
  isCancel: vi.fn(() => false),
  select: vi.fn(),
}));

const selectMock = vi.mocked(select);

describe("requestManualConfirmation", () => {
  it("uses a single confirmed option and disables clack guide lines", async () => {
    selectMock.mockResolvedValueOnce("confirmed");
    const output = createTestOutput();

    await requestManualConfirmation("Confirm this file.", { output });

    expect(selectMock).toHaveBeenCalledWith({
      message: "Confirm this file.",
      options: [{ value: "confirmed", label: "Confirmed" }],
      initialValue: "confirmed",
      output,
      withGuide: false,
    });
  });

  it("erases submitted clack confirmation history from TTY output", async () => {
    selectMock.mockResolvedValueOnce("confirmed");
    const output = createTestOutput({ columns: 20 });

    await requestManualConfirmation("Confirm this long file path.", { output });

    expect(output.chunks.at(-1)).toBe("\x1B[3A\x1B[0J");
  });
});

function createTestOutput(options: { columns?: number } = {}) {
  const chunks: string[] = [];
  const output = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  }) as Writable & { chunks: string[]; columns: number; isTTY: boolean };

  output.chunks = chunks;
  output.columns = options.columns ?? 80;
  output.isTTY = true;

  return output;
}
