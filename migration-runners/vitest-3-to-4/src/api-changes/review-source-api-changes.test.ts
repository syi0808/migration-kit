import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectSourceReviewFindings,
  collectSourceReviewReasons,
  sourceReviewBlocker,
} from "./review-source-api-changes.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

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
        prompt: "Confirm Vitest 4 mock cleanup behavior was manually verified before continuing.",
      },
    ]);
  });

  it("flags vi.mock factories that reference top-level mock variables", () => {
    const reasons = collectSourceReviewReasons(`
      const mockNavigate = vi.fn();

      vi.mock('react-router-dom', () => ({
        useNavigate: () => mockNavigate,
      }));
    `);

    expect(reasons).toContain(
      "vi.mock factories reference top-level bindings (mockNavigate); move shared mocks into vi.hoisted or use vi.doMock with dynamic import.",
    );
  });

  it("flags vi.mock factories that reference imported bindings", () => {
    const reasons = collectSourceReviewReasons(`
      import { createMockRouter } from './test-utils';

      vi.mock('react-router-dom', () => ({
        router: createMockRouter(),
      }));
    `);

    expect(reasons).toContain(
      "vi.mock factories reference top-level bindings (createMockRouter); move shared mocks into vi.hoisted or use vi.doMock with dynamic import.",
    );
  });

  it("does not flag vi.mock factories that reference vi.hoisted bindings", () => {
    const reasons = collectSourceReviewReasons(`
      const { mockNavigate } = vi.hoisted(() => ({
        mockNavigate: vi.fn(),
      }));

      vi.mock('react-router-dom', () => ({
        useNavigate: () => mockNavigate,
      }));
    `);

    expect(reasons).toEqual([]);
  });

  it("does not flag vi.mock factories that only use factory-local bindings", () => {
    const reasons = collectSourceReviewReasons(`
      vi.mock('react-router-dom', () => {
        const mockNavigate = vi.fn();

        return {
          useNavigate: () => mockNavigate,
        };
      });
    `);

    expect(reasons).toEqual([]);
  });

  it("does not flag vi.doMock factories because they are not hoisted", () => {
    const reasons = collectSourceReviewReasons(`
      const mockNavigate = vi.fn();

      vi.doMock('react-router-dom', () => ({
        useNavigate: () => mockNavigate,
      }));
    `);

    expect(reasons).toEqual([]);
  });

  it("returns separate manual fix and confirmation findings for mixed blockers", () => {
    const filePath = createSourceFile(`
      import { WorkspaceSpec } from 'vitest';
      afterEach(() => vi.restoreAllMocks());
    `);

    expect(sourceReviewBlocker(filePath)).toEqual([
      {
        kind: "manual-confirmation",
        reason:
          "vi.restoreAllMocks no longer resets spy state or automocks; verify mock cleanup expectations.",
        prompt: "Confirm Vitest 4 mock cleanup behavior was manually verified before continuing.",
      },
      {
        kind: "manual-fix",
        reason: "Deprecated Vitest types were removed; replace them with current public types.",
      },
    ]);
  });
});

function createSourceFile(source: string): string {
  const directory = mkdtempSync(join(tmpdir(), "vitest-3-to-4-source-review-"));
  const filePath = join(directory, "example.test.ts");

  tempDirectories.push(directory);
  writeFileSync(filePath, source);

  return filePath;
}
