import { confirm } from "@clack/prompts";
import { describe, expect, it, vi } from "vitest";
import { requestManualConfirmation } from "./manual-confirmation.js";

vi.mock("@clack/prompts", () => ({
  confirm: vi.fn(),
  isCancel: vi.fn(() => false),
}));

const confirmMock = vi.mocked(confirm);

describe("requestManualConfirmation", () => {
  it("disables clack guide lines", async () => {
    confirmMock.mockResolvedValueOnce(true);

    await requestManualConfirmation("Confirm this file.");

    expect(confirmMock).toHaveBeenCalledWith({
      message: "Confirm this file.",
      active: "Confirmed",
      inactive: "Not yet",
      initialValue: false,
      withGuide: false,
    });
  });
});
