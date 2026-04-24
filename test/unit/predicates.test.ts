import { describe, it, expect } from "vitest";
import {
  anyCall,
  forModel,
  whenUserSays,
  whenUserSaysExactly,
  whenSystemContains,
  withTools,
  withTool,
  isStreaming,
  isNotStreaming,
  withMessageCount,
  hasRole,
  allOf,
  anyOf,
  not,
  when,
} from "../../src/matchers/predicates.js";
import type { MockRequest } from "../../src/types/index.js";

const makeRequest = (overrides: Partial<MockRequest> = {}): MockRequest => ({
  messages: [{ role: "user", content: "Hello" }],
  ...overrides,
});

describe("predicates", () => {
  describe("anyCall()", () => {
    it("always returns true", () => {
      expect(anyCall()(makeRequest())).toBe(true);
      expect(anyCall()(makeRequest({ messages: [] }))).toBe(true);
    });
  });

  describe("forModel()", () => {
    it("matches exact model string", () => {
      const req = makeRequest({ model: "gpt-4o" });
      expect(forModel("gpt-4o")(req)).toBe(true);
      expect(forModel("gpt-3.5-turbo")(req)).toBe(false);
    });

    it("matches model by regex", () => {
      const req = makeRequest({ model: "gpt-4o-mini" });
      expect(forModel(/gpt-4/)(req)).toBe(true);
      expect(forModel(/claude/)(req)).toBe(false);
    });

    it("returns false when model is undefined", () => {
      expect(forModel("gpt-4o")(makeRequest())).toBe(false);
    });
  });

  describe("whenUserSays()", () => {
    it("matches case-insensitively by default", () => {
      const req = makeRequest({ messages: [{ role: "user", content: "Hello World" }] });
      expect(whenUserSays("hello")(req)).toBe(true);
      expect(whenUserSays("HELLO")(req)).toBe(true);
    });

    it("respects caseSensitive option", () => {
      const req = makeRequest({ messages: [{ role: "user", content: "Hello World" }] });
      expect(whenUserSays("Hello", { caseSensitive: true })(req)).toBe(true);
      expect(whenUserSays("hello", { caseSensitive: true })(req)).toBe(false);
    });

    it("matches against last user message only", () => {
      const req = makeRequest({
        messages: [
          { role: "user", content: "First message" },
          { role: "assistant", content: "Response" },
          { role: "user", content: "Second message" },
        ],
      });
      expect(whenUserSays("Second")(req)).toBe(true);
      expect(whenUserSays("First")(req)).toBe(false);
    });

    it("supports regex", () => {
      const req = makeRequest({ messages: [{ role: "user", content: "What is 2+2?" }] });
      expect(whenUserSays(/\d\+\d/)(req)).toBe(true);
      expect(whenUserSays(/[a-z]{10}/)(req)).toBe(false);
    });
  });

  describe("whenUserSaysExactly()", () => {
    it("requires exact match", () => {
      const req = makeRequest({ messages: [{ role: "user", content: "Hello" }] });
      expect(whenUserSaysExactly("Hello")(req)).toBe(true);
      expect(whenUserSaysExactly("Hello World")(req)).toBe(false);
      expect(whenUserSaysExactly("hello")(req)).toBe(false);
    });
  });

  describe("whenSystemContains()", () => {
    it("matches top-level system field", () => {
      const req = makeRequest({ system: "You are a helpful assistant." });
      expect(whenSystemContains("helpful")(req)).toBe(true);
      expect(whenSystemContains("dangerous")(req)).toBe(false);
    });

    it("matches system role message", () => {
      const req = makeRequest({
        messages: [
          { role: "system", content: "You are a coding assistant." },
          { role: "user", content: "Help me" },
        ],
      });
      expect(whenSystemContains("coding")(req)).toBe(true);
    });

    it("returns false when no system prompt exists", () => {
      expect(whenSystemContains("anything")(makeRequest())).toBe(false);
    });
  });

  describe("withTools() / withTool()", () => {
    const tools = [{ name: "get_weather", description: "Get weather", parameters: { type: "object" as const, properties: {} } }];

    it("withTools matches when tools are present", () => {
      expect(withTools()(makeRequest({ tools }))).toBe(true);
      expect(withTools()(makeRequest())).toBe(false);
    });

    it("withTool matches a specific tool name", () => {
      expect(withTool("get_weather")(makeRequest({ tools }))).toBe(true);
      expect(withTool("send_email")(makeRequest({ tools }))).toBe(false);
    });
  });

  describe("isStreaming() / isNotStreaming()", () => {
    it("isStreaming matches stream: true", () => {
      expect(isStreaming()(makeRequest({ stream: true }))).toBe(true);
      expect(isStreaming()(makeRequest({ stream: false }))).toBe(false);
      expect(isStreaming()(makeRequest())).toBe(false);
    });

    it("isNotStreaming matches stream: false or undefined", () => {
      expect(isNotStreaming()(makeRequest())).toBe(true);
      expect(isNotStreaming()(makeRequest({ stream: false }))).toBe(true);
      expect(isNotStreaming()(makeRequest({ stream: true }))).toBe(false);
    });
  });

  describe("withMessageCount()", () => {
    it("matches exact count", () => {
      const req = makeRequest({ messages: [{ role: "user", content: "Hi" }, { role: "assistant", content: "Hello" }] });
      expect(withMessageCount(2)(req)).toBe(true);
      expect(withMessageCount(1)(req)).toBe(false);
    });

    it("matches range", () => {
      const req = makeRequest({ messages: [{ role: "user", content: "Hi" }, { role: "assistant", content: "Hello" }, { role: "user", content: "Bye" }] });
      expect(withMessageCount({ min: 2, max: 4 })(req)).toBe(true);
      expect(withMessageCount({ min: 4 })(req)).toBe(false);
    });
  });

  describe("logical combinators", () => {
    const reqGpt4 = makeRequest({ model: "gpt-4o", stream: true });

    it("allOf requires all predicates to pass", () => {
      expect(allOf(forModel("gpt-4o"), isStreaming())(reqGpt4)).toBe(true);
      expect(allOf(forModel("gpt-4o"), isNotStreaming())(reqGpt4)).toBe(false);
    });

    it("anyOf requires at least one predicate to pass", () => {
      expect(anyOf(forModel("claude-3"), isStreaming())(reqGpt4)).toBe(true);
      expect(anyOf(forModel("claude-3"), isNotStreaming())(reqGpt4)).toBe(false);
    });

    it("not inverts the predicate", () => {
      expect(not(isStreaming())(reqGpt4)).toBe(false);
      expect(not(forModel("claude-3"))(reqGpt4)).toBe(true);
    });

    it("when passes through arbitrary functions", () => {
      const pred = when((req) => (req.temperature ?? 0) > 0.5);
      expect(pred(makeRequest({ temperature: 0.9 }))).toBe(true);
      expect(pred(makeRequest({ temperature: 0.1 }))).toBe(false);
    });
  });
});
