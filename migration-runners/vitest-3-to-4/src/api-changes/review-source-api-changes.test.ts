import { describe, expect, it } from "vitest";
import {
  collectSourceReviewFindings,
  collectSourceReviewReasons,
} from "./review-source-api-changes.js";

describe("collectSourceReviewReasons", () => {
  it("flags vi.stubGlobal constructor mocks implemented with arrows", () => {
    const reasons = collectSourceReviewReasons(`
      vi.stubGlobal('IntersectionObserver', vi.fn(() => ({
        observe: vi.fn(),
        disconnect: vi.fn(),
      })));
    `);

    expect(reasons).toContain(
      "Vitest 4 constructs mocks called with new; replace arrow/mockReturnValue global constructor stubs (IntersectionObserver) with function or class implementations.",
    );
  });

  it("flags Object.defineProperty constructor mocks implemented with arrow mockImplementation", () => {
    const reasons = collectSourceReviewReasons(`
      Object.defineProperty(global, 'ResizeObserver', {
        writable: true,
        value: vi.fn().mockImplementation(() => ({
          observe: vi.fn(),
          unobserve: vi.fn(),
          disconnect: vi.fn(),
        })),
      });
    `);

    expect(reasons).toContain(
      "Vitest 4 constructs mocks called with new; replace arrow/mockReturnValue global constructor stubs (ResizeObserver) with function or class implementations.",
    );
  });

  it("flags constructor globals assigned from mockReturnValue variables", () => {
    const reasons = collectSourceReviewReasons(`
      const mockIntersectionObserver = vi.fn().mockReturnValue({
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      });

      beforeEach(() => {
        window.IntersectionObserver = mockIntersectionObserver;
      });
    `);

    expect(reasons).toContain(
      "Vitest 4 constructs mocks called with new; replace arrow/mockReturnValue global constructor stubs (IntersectionObserver) with function or class implementations.",
    );
  });

  it("flags constructor globals assigned from vi.fn variables with later arrow implementations", () => {
    const reasons = collectSourceReviewReasons(`
      const mockIntersectionObserver = vi.fn();

      beforeEach(() => {
        window.IntersectionObserver = mockIntersectionObserver;
      });

      mockIntersectionObserver.mockImplementation((callback) => ({
        callback,
        observe: vi.fn(),
        disconnect: vi.fn(),
      }));
    `);

    expect(reasons).toContain(
      "Vitest 4 constructs mocks called with new; replace arrow/mockReturnValue global constructor stubs (IntersectionObserver) with function or class implementations.",
    );
  });

  it("does not flag non-constructor global stubs or constructable class implementations", () => {
    const reasons = collectSourceReviewReasons(`
      vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response())));
      vi.stubGlobal('IntersectionObserver', class MockIntersectionObserver {
        observe() {}
        disconnect() {}
      });
    `);

    expect(reasons).toEqual([]);
  });

  it("marks restoreAllMocks behavior checks as manual confirmations", () => {
    const findings = collectSourceReviewFindings("afterEach(() => vi.restoreAllMocks());");

    expect(findings).toEqual([
      {
        kind: "manual-confirmation",
        reason:
          "vi.restoreAllMocks no longer resets spy state or automocks; verify mock cleanup expectations.",
      },
    ]);
  });
});
