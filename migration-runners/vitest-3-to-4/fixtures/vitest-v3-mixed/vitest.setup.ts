import { vi } from "vitest";

vi.stubGlobal(
  "IntersectionObserver",
  vi.fn(() => ({
    disconnect: vi.fn(),
    observe: vi.fn(),
    unobserve: vi.fn(),
  })),
);

const workerMock = vi.fn();

workerMock.mockImplementation(() => ({
  postMessage: vi.fn(),
  terminate: vi.fn(),
}));

globalThis.Worker = workerMock as unknown as typeof Worker;

Object.defineProperty(window, "ResizeObserver", {
  configurable: true,
  value: vi.fn().mockReturnValue({
    disconnect: vi.fn(),
    observe: vi.fn(),
  }),
});

vi.restoreAllMocks();
