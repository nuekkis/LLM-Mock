import type { HandlerPredicate, MockRequest } from "../types/index.js";
import { extractLastUserMessage, extractSystemPrompt } from "../utils/helpers.js";

// ─── Primitive predicates ────────────────────────────────────────────────────

/** Matches every request. Use as a catch-all. */
export function anyCall(): HandlerPredicate {
  return () => true;
}

/** Matches requests targeting a specific model. */
export function forModel(model: string | RegExp): HandlerPredicate {
  return (req) => {
    if (!req.model) return false;
    return model instanceof RegExp ? model.test(req.model) : req.model === model;
  };
}

/** Matches when the last user message contains `text` (case-insensitive by default). */
export function whenUserSays(
  text: string | RegExp,
  options: { caseSensitive?: boolean } = {}
): HandlerPredicate {
  return (req) => {
    const content = extractLastUserMessage(req);
    if (text instanceof RegExp) return text.test(content);
    const needle = options.caseSensitive ? text : text.toLowerCase();
    const haystack = options.caseSensitive ? content : content.toLowerCase();
    return haystack.includes(needle);
  };
}

/** Matches when the last user message exactly equals `text`. */
export function whenUserSaysExactly(text: string): HandlerPredicate {
  return (req) => extractLastUserMessage(req) === text;
}

/** Matches when the system prompt contains `text`. */
export function whenSystemContains(text: string | RegExp): HandlerPredicate {
  return (req) => {
    const system = extractSystemPrompt(req);
    if (!system) return false;
    if (text instanceof RegExp) return text.test(system);
    return system.toLowerCase().includes(text.toLowerCase());
  };
}

/** Matches requests that include any tool definitions. */
export function withTools(): HandlerPredicate {
  return (req) => Array.isArray(req.tools) && req.tools.length > 0;
}

/** Matches requests that include a specific tool by name. */
export function withTool(name: string): HandlerPredicate {
  return (req) => req.tools?.some((t) => t.name === name) ?? false;
}

/** Matches streaming requests. */
export function isStreaming(): HandlerPredicate {
  return (req) => req.stream === true;
}

/** Matches non-streaming requests. */
export function isNotStreaming(): HandlerPredicate {
  return (req) => req.stream !== true;
}

/** Matches based on message count. */
export function withMessageCount(count: number | { min?: number; max?: number }): HandlerPredicate {
  return (req) => {
    const n = req.messages.length;
    if (typeof count === "number") return n === count;
    const { min = 0, max = Infinity } = count;
    return n >= min && n <= max;
  };
}

/** Matches if a specific role appears in the messages. */
export function hasRole(role: MockRequest["messages"][number]["role"]): HandlerPredicate {
  return (req) => req.messages.some((m) => m.role === role);
}

// ─── Logical combinators ─────────────────────────────────────────────────────

/** Combines predicates with logical AND. All must match. */
export function allOf(...predicates: HandlerPredicate[]): HandlerPredicate {
  return (req) => predicates.every((p) => p(req));
}

/** Combines predicates with logical OR. At least one must match. */
export function anyOf(...predicates: HandlerPredicate[]): HandlerPredicate {
  return (req) => predicates.some((p) => p(req));
}

/** Negates a predicate. */
export function not(predicate: HandlerPredicate): HandlerPredicate {
  return (req) => !predicate(req);
}

// ─── Custom predicate ────────────────────────────────────────────────────────

/**
 * Escape hatch: supply an arbitrary function.
 *
 * @example
 * ```ts
 * mock.on(
 *   when((req) => req.temperature !== undefined && req.temperature > 0.8),
 *   reply("I'm feeling creative today!")
 * );
 * ```
 */
export function when(fn: HandlerPredicate): HandlerPredicate {
  return fn;
}
