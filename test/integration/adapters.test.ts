import { describe, it, expect, beforeEach } from "vitest";
import { LLMMock } from "../../src/mock.js";
import { anyCall, whenUserSays } from "../../src/matchers/predicates.js";
import { reply, ResponseBuilder } from "../../src/utils/response-builder.js";
import { interceptOpenAI, interceptAnthropic } from "../../src/interceptors/index.js";
import type { MockRequest } from "../../src/types/index.js";
import type { OpenAILike } from "../../src/interceptors/index.js";

const baseRequest = (): MockRequest => ({
  messages: [{ role: "user", content: "What is the capital of France?" }],
  model: "gpt-4o",
});

// ─── OpenAI adapter ───────────────────────────────────────────────────────────

describe("OpenAI adapter", () => {
  let mock: LLMMock;

  beforeEach(() => {
    mock = new LLMMock();
  });

  it("shapes response as OpenAI ChatCompletion", async () => {
    mock.on(anyCall(), reply("Paris."));
    const res = await mock.interceptAsOpenAI(baseRequest());

    expect(res.object).toBe("chat.completion");
    expect(res.choices[0]?.message.role).toBe("assistant");
    expect(res.choices[0]?.message.content).toBe("Paris.");
    expect(res.choices[0]?.finish_reason).toBe("stop");
    expect(res.usage.total_tokens).toBeGreaterThan(0);
    expect(res.system_fingerprint).toBeDefined();
  });

  it("shapes tool call response as OpenAI tool_calls", async () => {
    mock.on(
      anyCall(),
      (req) =>
        ResponseBuilder.toolCall([{ name: "get_weather", arguments: { city: "Paris" } }]).build(req)
    );
    const res = await mock.interceptAsOpenAI(baseRequest());

    expect(res.choices[0]?.finish_reason).toBe("tool_calls");
    expect(res.choices[0]?.message.tool_calls?.[0]?.function.name).toBe("get_weather");
    // Arguments must be a JSON string per OpenAI spec
    expect(typeof res.choices[0]?.message.tool_calls?.[0]?.function.arguments).toBe("string");
    const args = JSON.parse(res.choices[0]!.message.tool_calls![0]!.function.arguments);
    expect(args).toEqual({ city: "Paris" });
  });

  it("streams as OpenAI ChatCompletionChunk objects", async () => {
    mock.on(anyCall(), reply("Hello streaming!"));
    const chunks = [];
    for await (const chunk of mock.interceptAsOpenAIStream(baseRequest())) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]?.object).toBe("chat.completion.chunk");
    // Last chunk should have finish_reason
    const lastChunk = chunks.at(-1);
    expect(lastChunk?.choices[0]?.finish_reason).toBe("stop");
    // Assembled content should match
    const assembled = chunks
      .flatMap((c) => c.choices)
      .map((ch) => ch.delta.content ?? "")
      .join("");
    expect(assembled).toBe("Hello streaming!");
  });
});

// ─── OpenAI SDK interceptor ───────────────────────────────────────────────────

describe("interceptOpenAI()", () => {
  let mock: LLMMock;

  beforeEach(() => {
    mock = new LLMMock();
  });

  it("patches and restores openai client", async () => {
    const fakeClient: OpenAILike = {
      chat: {
        completions: {
          create: async () => { throw new Error("Should not reach real API"); },
        },
      },
    };

    mock.on(anyCall(), reply("Intercepted!"));
    const restore = interceptOpenAI(fakeClient, mock);

    const res = await fakeClient.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hi" }],
    }) as { choices: Array<{ message: { content: string } }> };

    expect(res.choices[0]?.message.content).toBe("Intercepted!");

    restore();

    // After restore, the original (error-throwing) function is back
    await expect(
      fakeClient.chat.completions.create({ model: "gpt-4o", messages: [] })
    ).rejects.toThrow("Should not reach real API");
  });
});

// ─── Anthropic adapter ────────────────────────────────────────────────────────

describe("Anthropic adapter", () => {
  let mock: LLMMock;

  beforeEach(() => {
    mock = new LLMMock();
  });

  it("shapes response as Anthropic Message", async () => {
    mock.on(anyCall(), reply("Paris."));
    const res = await mock.interceptAsAnthropic(baseRequest());

    expect(res.type).toBe("message");
    expect(res.role).toBe("assistant");
    expect(res.content[0]).toEqual({ type: "text", text: "Paris." });
    expect(res.stop_reason).toBe("end_turn");
    expect(res.usage.input_tokens).toBeGreaterThan(0);
    expect(res.usage.output_tokens).toBeGreaterThan(0);
  });

  it("shapes tool call as Anthropic tool_use block", async () => {
    mock.on(
      anyCall(),
      (req) =>
        ResponseBuilder.toolCall([{ name: "search", arguments: { query: "Paris" } }]).build(req)
    );
    const res = await mock.interceptAsAnthropic(baseRequest());

    expect(res.stop_reason).toBe("tool_use");
    const toolBlock = res.content.find((b) => b.type === "tool_use");
    expect(toolBlock).toBeDefined();
    if (toolBlock?.type === "tool_use") {
      expect(toolBlock.name).toBe("search");
      expect(toolBlock.input).toEqual({ query: "Paris" });
    }
  });

  it("streams as Anthropic content_block_delta events", async () => {
    mock.on(anyCall(), reply("Bonjour!"));
    const events = [];
    for await (const event of mock.interceptAsAnthropicStream(baseRequest())) {
      events.push(event);
    }

    const deltas = events.filter((e) => e.type === "content_block_delta");
    expect(deltas.length).toBeGreaterThan(0);

    const assembled = deltas
      .filter((e): e is { type: "content_block_delta"; index: number; delta: { type: "text_delta"; text: string } } =>
        e.type === "content_block_delta"
      )
      .map((e) => e.delta.text)
      .join("");

    expect(assembled).toBe("Bonjour!");

    const finalEvent = events.at(-1);
    expect(finalEvent?.type).toBe("message_delta");
  });
});

// ─── End-to-end scenario: multi-turn conversation ─────────────────────────────

describe("multi-turn scenario", () => {
  it("routes different turns to different handlers", async () => {
    const mock = new LLMMock();

    mock
      .on(whenUserSays("hello"), reply("Hi! How can I help?"), { label: "greeting" })
      .on(whenUserSays("weather"), (req) =>
        ResponseBuilder.toolCall([{ name: "get_weather", arguments: { city: "Istanbul" } }]).build(req),
        { label: "weather" }
      )
      .on(anyCall(), reply("I'm not sure about that."), { label: "fallback" });

    const greeting = await mock.intercept({
      messages: [{ role: "user", content: "hello" }],
    });
    expect(greeting.content).toBe("Hi! How can I help?");

    const weatherReq = await mock.intercept({
      messages: [{ role: "user", content: "What's the weather like?" }],
    });
    expect(weatherReq.finish_reason).toBe("tool_calls");
    expect(weatherReq.tool_calls?.[0]?.name).toBe("get_weather");

    const unknown = await mock.intercept({
      messages: [{ role: "user", content: "random question" }],
    });
    expect(unknown.content).toBe("I'm not sure about that.");

    expect(mock.callsTo("greeting")).toHaveLength(1);
    expect(mock.callsTo("weather")).toHaveLength(1);
    expect(mock.callsTo("fallback")).toHaveLength(1);
    expect(mock.callCount).toBe(3);
  });
});
