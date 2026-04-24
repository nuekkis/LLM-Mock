import { describe, it, expect } from "vitest";
import { ResponseBuilder, reply, replyWithTool } from "../../src/utils/response-builder.js";
import type { MockRequest } from "../../src/types/index.js";

const req = (): MockRequest => ({
  messages: [{ role: "user", content: "Hi" }],
  model: "gpt-4o",
});

describe("ResponseBuilder", () => {
  describe("text()", () => {
    it("sets content and finish_reason stop", () => {
      const res = ResponseBuilder.text("Hello!").build(req());
      expect(res.content).toBe("Hello!");
      expect(res.finish_reason).toBe("stop");
      expect(res.tool_calls).toBeUndefined();
    });

    it("uses the request model", () => {
      const res = ResponseBuilder.text("ok").build(req());
      expect(res.model).toBe("gpt-4o");
    });

    it("overrides model via withModel()", () => {
      const res = ResponseBuilder.text("ok").withModel("claude-3").build(req());
      expect(res.model).toBe("claude-3");
    });
  });

  describe("toolCall()", () => {
    it("sets tool_calls and finish_reason tool_calls", () => {
      const res = ResponseBuilder.toolCall([
        { name: "get_weather", arguments: { city: "Istanbul" } },
      ]).build(req());

      expect(res.finish_reason).toBe("tool_calls");
      expect(res.tool_calls).toHaveLength(1);
      expect(res.tool_calls?.[0]?.name).toBe("get_weather");
      expect(res.tool_calls?.[0]?.arguments).toEqual({ city: "Istanbul" });
      expect(res.tool_calls?.[0]?.id).toBeTruthy();
    });
  });

  describe("echo()", () => {
    it("returns the last user message as content", () => {
      const request: MockRequest = {
        messages: [
          { role: "user", content: "First" },
          { role: "assistant", content: "Response" },
          { role: "user", content: "Echo this" },
        ],
      };
      const res = ResponseBuilder.echo()(request);
      expect(res.content).toBe("Echo this");
    });
  });

  describe("truncated()", () => {
    it("sets finish_reason length", () => {
      const res = ResponseBuilder.truncated("partial response...").build(req());
      expect(res.finish_reason).toBe("length");
      expect(res.content).toBe("partial response...");
    });
  });

  describe("contentFiltered()", () => {
    it("sets finish_reason content_filter", () => {
      const res = ResponseBuilder.contentFiltered().build(req());
      expect(res.finish_reason).toBe("content_filter");
    });
  });

  describe("reply() shorthand", () => {
    it("creates a handler that returns text response", () => {
      const handler = reply("Sure thing!");
      const res = handler(req());
      expect(res.content).toBe("Sure thing!");
    });
  });

  describe("replyWithTool() shorthand", () => {
    it("creates a handler that returns a tool call response", () => {
      const tool = {
        name: "search",
        parameters: { type: "object" as const, properties: { query: { type: "string" } } },
      };
      const handler = replyWithTool(tool, { query: "test" });
      const res = handler(req());
      expect(res.tool_calls?.[0]?.name).toBe("search");
      expect(res.tool_calls?.[0]?.arguments).toEqual({ query: "test" });
    });
  });
});
