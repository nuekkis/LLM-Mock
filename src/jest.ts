import type { LLMMock } from "./mock.js";
import type { MockRequest } from "./types/index.js";

// ─── Matcher implementations ──────────────────────────────────────────────────

function toHaveBeenCalledTimes(mock: LLMMock, expected: number) {
  const actual = mock.callCount;
  const pass = actual === expected;
  return {
    pass,
    message: () =>
      pass
        ? `Expected mock NOT to have been called ${expected} time(s), but it was.`
        : `Expected mock to have been called ${expected} time(s), but it was called ${actual} time(s).`,
  };
}

function toHaveBeenCalledWith(mock: LLMMock, partialRequest: Partial<MockRequest>) {
  const calls = mock.calls;
  const pass = calls.some((c) => requestMatchesPartial(c.request, partialRequest));
  return {
    pass,
    message: () =>
      pass
        ? `Expected mock NOT to have been called with the given request, but it was.`
        : `Expected mock to have been called with:\n${JSON.stringify(partialRequest, null, 2)}\n\nActual calls:\n${JSON.stringify(calls.map((c) => c.request), null, 2)}`,
  };
}

function toHaveLastCalledWith(mock: LLMMock, partialRequest: Partial<MockRequest>) {
  const last = mock.lastCall;
  if (!last) {
    return {
      pass: false,
      message: () => `Expected mock to have been called, but it was never called.`,
    };
  }
  const pass = requestMatchesPartial(last.request, partialRequest);
  return {
    pass,
    message: () =>
      pass
        ? `Expected mock's last call NOT to match the given request.`
        : `Expected last call to match:\n${JSON.stringify(partialRequest, null, 2)}\n\nActual last call:\n${JSON.stringify(last.request, null, 2)}`,
  };
}

function toHaveReceivedMessage(mock: LLMMock, content: string | RegExp) {
  const pass = mock.calls.some((c) =>
    c.request.messages.some((m) => {
      const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      return content instanceof RegExp ? content.test(text) : text.includes(content);
    })
  );
  return {
    pass,
    message: () =>
      pass
        ? `Expected mock NOT to have received a message matching ${String(content)}.`
        : `Expected mock to have received a message matching ${String(content)}, but no such message was found.\n\nAll messages: ${JSON.stringify(mock.calls.flatMap((c) => c.request.messages), null, 2)}`,
  };
}

function toHaveAllHandlersCalled(mock: LLMMock) {
  const unused = mock.unusedHandlers();
  const pass = unused.length === 0;
  return {
    pass,
    message: () =>
      pass
        ? `Expected some handlers to be unused, but all were called.`
        : `Expected all handlers to be called, but ${unused.length} were never triggered:\n${unused.map((h) => `  - ${h.label ?? "(unlabelled)"}`).join("\n")}`,
  };
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function requestMatchesPartial(
  actual: MockRequest,
  expected: Partial<MockRequest>
): boolean {
  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify((actual as Record<string, unknown>)[key]) !== JSON.stringify(value)) {
      return false;
    }
  }
  return true;
}

// ─── Jest integration ─────────────────────────────────────────────────────────

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
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
  }
}

export const llmMockMatchers = {
  toHaveBeenCalledTimes,
  toHaveBeenCalledWith,
  toHaveLastCalledWith,
  toHaveReceivedMessage,
  toHaveAllHandlersCalled,
};

/**
 * Registers llm-mock's custom matchers with Jest.
 *
 * Call this once in your Jest setup file:
 * ```ts
 * // jest.setup.ts
 * import { setupLLMMockMatchers } from "llm-mock/jest";
 * setupLLMMockMatchers();
 * ```
 */
export function setupLLMMockMatchers(): void {
  // `expect` is a global in Jest environments
  const e = (globalThis as Record<string, unknown>)["expect"] as
    | { extend: (matchers: unknown) => void }
    | undefined;

  if (!e || typeof e.extend !== "function") {
    throw new Error(
      "[llm-mock] setupLLMMockMatchers() must be called in a Jest environment where `expect` is available globally."
    );
  }

  e.extend(llmMockMatchers);
}
