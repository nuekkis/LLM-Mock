import { describe, it, expect, beforeEach } from "vitest";
import { LLMMock } from "../../src/mock.js";
import { LLMMockError } from "../../src/utils/errors.js";
import {
  anyCall,
  whenUserSays,
  forModel,
} from "../../src/matchers/predicates.js";
import { reply } from "../../src/utils/response-builder.js";
import { collectStream } from "../../src/streaming/index.js";
import { resetIdCounter } from "../../src/utils/helpers.js";
import type { MockRequest } from "../../src/types/index.js";

const baseRequest = (): MockRequest => ({
  messages: [{ role: "user", content: "Hello" }],
  model: "gpt-4o",
});

describe("LLMMock", () => {
  let mock: LLMMock;

  beforeEach(() => {
    mock = new LLMMock();
    resetIdCounter();
  });

  // ─── Handler registration & dispatch ──────────────────────────────────────

  describe("on() / intercept()", () => {
    it("dispatches to a matching handler", async () => {
      mock.on(anyCall(), reply("Hello back!"));
      const res = await mock.intercept(baseRequest());
      expect(res.content).toBe("Hello back!");
    });

    it("first registered handler wins", async () => {
      mock
        .on(anyCall(), reply("First"))
        .on(anyCall(), reply("Second"));
      const res = await mock.intercept(baseRequest());
      expect(res.content).toBe("First");
    });

    it("skips non-matching handlers", async () => {
      mock
        .on(forModel("claude-3"), reply("Anthropic"))
        .on(forModel("gpt-4o"), reply("OpenAI"));
      const res = await mock.intercept(baseRequest());
      expect(res.content).toBe("OpenAI");
    });

    it("throws LLMMockError when no handler matches (default fallback)", async () => {
      await expect(mock.intercept(baseRequest())).rejects.toThrow(LLMMockError);
      await expect(mock.intercept(baseRequest())).rejects.toMatchObject({
        code: "UNHANDLED_REQUEST",
      });
    });

    it("uses custom fallback handler when provided", async () => {
      const m = new LLMMock({ fallback: reply("fallback response") });
      const res = await m.intercept(baseRequest());
      expect(res.content).toBe("fallback response");
    });
  });

  // ─── once() ───────────────────────────────────────────────────────────────

  describe("once()", () => {
    it("fires handler exactly once, then throws on subsequent calls", async () => {
      mock.once(anyCall(), reply("Once only"), "once-handler");
      const res = await mock.intercept(baseRequest());
      expect(res.content).toBe("Once only");
      await expect(mock.intercept(baseRequest())).rejects.toThrow(LLMMockError);
    });
  });

  // ─── times option ──────────────────────────────────────────────────────────

  describe("times option", () => {
    it("fires handler N times then becomes exhausted", async () => {
      mock.on(anyCall(), reply("limited"), { times: 2, label: "limited" });

      const r1 = await mock.intercept(baseRequest());
      const r2 = await mock.intercept(baseRequest());
      expect(r1.content).toBe("limited");
      expect(r2.content).toBe("limited");

      await expect(mock.intercept(baseRequest())).rejects.toMatchObject({
        code: "UNHANDLED_REQUEST",
      });
    });
  });

  // ─── Call recording ────────────────────────────────────────────────────────

  describe("call recording", () => {
    it("records calls by default", async () => {
      mock.on(anyCall(), reply("ok"));
      await mock.intercept(baseRequest());
      expect(mock.callCount).toBe(1);
      expect(mock.calls[0]?.request).toMatchObject(baseRequest());
    });

    it("records matched handler label", async () => {
      mock.on(anyCall(), reply("ok"), { label: "my-handler" });
      await mock.intercept(baseRequest());
      expect(mock.lastCall?.matchedHandler).toBe("my-handler");
    });

    it("does not record when recordCalls is false", async () => {
      const m = new LLMMock({ recordCalls: false });
      m.on(anyCall(), reply("ok"));
      await m.intercept(baseRequest());
      expect(m.callCount).toBe(0);
    });
  });

  // ─── reset / clearCalls / clearHandlers ───────────────────────────────────

  describe("state management", () => {
    it("reset() removes handlers and calls", async () => {
      mock.on(anyCall(), reply("ok"));
      await mock.intercept(baseRequest());
      mock.reset();
      expect(mock.callCount).toBe(0);
      await expect(mock.intercept(baseRequest())).rejects.toThrow(LLMMockError);
    });

    it("clearCalls() preserves handlers", async () => {
      mock.on(anyCall(), reply("ok"));
      await mock.intercept(baseRequest());
      mock.clearCalls();
      expect(mock.callCount).toBe(0);
      // handler should still work
      await expect(mock.intercept(baseRequest())).resolves.toBeDefined();
    });

    it("clearHandlers() preserves call records", async () => {
      mock.on(anyCall(), reply("ok"));
      await mock.intercept(baseRequest());
      mock.clearHandlers();
      expect(mock.callCount).toBe(1);
      await expect(mock.intercept(baseRequest())).rejects.toThrow(LLMMockError);
    });
  });

  // ─── unusedHandlers / allHandlersCalled ───────────────────────────────────

  describe("handler introspection", () => {
    it("reports unused handlers", async () => {
      mock
        .on(forModel("gpt-4o"), reply("hit"), { label: "hit" })
        .on(forModel("claude-3"), reply("miss"), { label: "miss" });

      await mock.intercept(baseRequest());
      expect(mock.unusedHandlers().map((h) => h.label)).toEqual(["miss"]);
    });

    it("allHandlersCalled returns true when all handlers fired", async () => {
      mock
        .on(forModel("gpt-4o"), reply("A"), { label: "A" })
        .on(whenUserSays("goodbye"), reply("B"), { label: "B" });

      await mock.intercept(baseRequest());
      await mock.intercept({ ...baseRequest(), messages: [{ role: "user", content: "goodbye" }] });
      expect(mock.allHandlersCalled()).toBe(true);
    });
  });

  // ─── Streaming ────────────────────────────────────────────────────────────

  describe("interceptStream()", () => {
    it("streams a text response in chunks", async () => {
      mock.on(anyCall(), reply("Hello streaming world!"));
      const { content } = await collectStream(mock.interceptStream(baseRequest()));
      expect(content).toBe("Hello streaming world!");
    });

    it("returns finish_reason stop", async () => {
      mock.on(anyCall(), reply("Done."));
      const { finish_reason } = await collectStream(mock.interceptStream(baseRequest()));
      expect(finish_reason).toBe("stop");
    });

    it("works with a custom streaming handler", async () => {
      mock.onStream(anyCall(), async function* () {
        yield { id: "id1", delta: "Hello", finish_reason: null };
        yield { id: "id1", delta: " world", finish_reason: "stop" as const };
      });

      const { content } = await collectStream(mock.interceptStream(baseRequest()));
      expect(content).toBe("Hello world");
    });
  });

  // ─── Latency ──────────────────────────────────────────────────────────────

  describe("latency simulation", () => {
    it("applies fixed latency", async () => {
      const m = new LLMMock({ latency: 20 });
      m.on(anyCall(), reply("ok"));
      const start = Date.now();
      await m.intercept(baseRequest());
      expect(Date.now() - start).toBeGreaterThanOrEqual(15); // give 5ms tolerance
    });
  });

  // ─── Response shape ────────────────────────────────────────────────────────

  describe("response metadata", () => {
    it("includes model in response", async () => {
      mock.on(anyCall(), reply("ok"));
      const res = await mock.intercept(baseRequest());
      expect(res.model).toBe("gpt-4o");
    });

    it("includes usage estimates", async () => {
      mock.on(anyCall(), reply("ok"));
      const res = await mock.intercept(baseRequest());
      expect(res.usage.total_tokens).toBeGreaterThan(0);
      expect(res.usage.prompt_tokens).toBeGreaterThan(0);
      expect(res.usage.completion_tokens).toBeGreaterThan(0);
    });

    it("includes a unique id per response", async () => {
      mock.on(anyCall(), reply("ok"));
      const [r1, r2] = await Promise.all([
        mock.intercept(baseRequest()),
        mock.intercept(baseRequest()),
      ]);
      expect(r1.id).not.toBe(r2.id);
    });
  });
});
