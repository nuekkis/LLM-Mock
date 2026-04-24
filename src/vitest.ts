import { llmMockMatchers } from "./jest.js";
import type { LLMMock } from "./mock.js";
import type { MockRequest } from "./types/index.js";

export { llmMockMatchers };

// ─── Vitest type augmentation ─────────────────────────────────────────────────

interface CustomMatchers<R = unknown> {
  /** Assert the mock was called exactly N times. */
  toHaveBeenCalledTimes(expected: number): R;
  /** Assert the mock was called with a request matching the partial. */
  toHaveBeenCalledWith(partialRequest: Partial<MockRequest>): R;
  /** Assert the mock's last call matches the partial request. */
  toHaveLastCalledWith(partialRequest: Partial<MockRequest>): R;
  /** Assert that at least one call contained a message matching the text/regex. */
  toHaveReceivedMessage(content: string | RegExp): R;
  /** Assert all registered handlers were triggered at least once. */
  toHaveAllHandlersCalled(): R;
}

declare module "vitest" {
  interface Assertion<T = LLMMock> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

/**
 * Registers llm-mock's custom matchers with Vitest.
 *
 * Call this once in your Vitest setup file:
 * ```ts
 * // vitest.setup.ts
 * import { setupLLMMockMatchers } from "llm-mock/vitest";
 * setupLLMMockMatchers();
 * ```
 *
 * Or inline in a test file:
 * ```ts
 * import { expect } from "vitest";
 * import { setupLLMMockMatchers } from "llm-mock/vitest";
 * setupLLMMockMatchers();
 * ```
 */
export function setupLLMMockMatchers(): void {
  const e = (globalThis as Record<string, unknown>)["expect"] as
    | { extend: (matchers: unknown) => void }
    | undefined;

  if (!e || typeof e.extend !== "function") {
    throw new Error(
      "[llm-mock] setupLLMMockMatchers() must be called in a Vitest environment where `expect` is globally available."
    );
  }

  e.extend(llmMockMatchers);
}
