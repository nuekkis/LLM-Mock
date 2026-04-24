# LLM-Mock

**A zero-cost, fully-typed mock layer for LLM APIs.**  
Intercept OpenAI and Anthropic calls in your tests without hitting the real API — streaming, tool calls, and custom matchers included.

[![CI](https://github.com/yourusername/llm-mock/actions/workflows/ci.yml/badge.svg)](https://github.com/yourusername/llm-mock/actions)
[![npm version](https://badge.fury.io/js/llm-mock.svg)](https://www.npmjs.com/package/llm-mock)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Why llm-mock?

Testing LLM-powered applications is painful:

- **Real API calls are slow and expensive** — a test suite shouldn't bill you.
- **Responses are non-deterministic** — flaky tests, flaky CI.
- **Streaming is hard to test** — no standard tooling exists.
- **Tool calls are even harder** — verifying your agent's decision logic requires faking the model.

`llm-mock` solves all of this with a single, expressive API.

---

## Features

- **Provider-agnostic core** — works without any SDK installed
- **OpenAI & Anthropic adapters** — responses shaped exactly like the real SDKs
- **SDK interceptors** — patch an existing `openai` or `@anthropic-ai/sdk` client instance
- **Streaming support** — first-class `AsyncGenerator`-based streaming with chunk simulation
- **Tool call mocking** — simulate the model calling your functions
- **Composable predicates** — route requests by model, message content, tools, and more
- **Fluent response builder** — construct any response shape with a clean API
- **Call recording & assertion** — inspect every intercepted request
- **Custom Jest/Vitest matchers** — `expect(mock).toHaveReceivedMessage(...)`
- **Latency simulation** — test timeout and loading-state handling
- **Zero production dependencies**
- **TypeScript-first** — fully typed, ships with `.d.ts`

---

## Installation

```bash
npm install --save-dev llm-mock
```

Node.js ≥ 18 required. No production dependencies.

---

## Quick Start

```ts
import { LLMMock, anyCall, whenUserSays, reply } from "llm-mock";

const mock = new LLMMock();

mock
  .on(whenUserSays("hello"), reply("Hi there!"))
  .on(anyCall(), reply("I'm not sure about that."));

const response = await mock.intercept({
  messages: [{ role: "user", content: "hello" }],
  model: "gpt-4o",
});

console.log(response.content); // "Hi there!"
console.log(mock.callCount);   // 1
```

---

## Core Concepts

### `LLMMock`

The main class. Create one per test file (or share across tests with `reset()`).

```ts
const mock = new LLMMock({
  fallback: "throw",       // throw on unhandled requests (default)
  recordCalls: true,       // keep a history of all calls (default)
  latency: 0,              // no simulated latency (default)
  provider: "generic",     // response shaping hint
});
```

### Handlers

Handlers are registered with `.on(predicate, handler)` and evaluated in order — **first match wins**.

```ts
mock.on(predicate, handler);           // matches repeatedly
mock.once(predicate, handler, label);  // matches exactly once
mock.on(predicate, handler, { times: 3, label: "my-handler" });
```

A **handler** is any function `(request: MockRequest) => MockResponse`:

```ts
mock.on(anyCall(), (request) => {
  return {
    id: "my-id",
    model: request.model ?? "mock",
    content: "Dynamic response",
    finish_reason: "stop",
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
});
```

Or use the fluent `ResponseBuilder`:

```ts
import { ResponseBuilder } from "llm-mock";

mock.on(anyCall(), (req) =>
  ResponseBuilder.text("Hello!").withModel("gpt-4o").build(req)
);
```

---

## Predicates

Predicates decide which handler fires for a given request.

### Built-in predicates

| Predicate | Description |
|---|---|
| `anyCall()` | Matches every request |
| `forModel("gpt-4o")` | Matches a specific model (string or RegExp) |
| `whenUserSays("hello")` | Last user message contains text (case-insensitive, string or RegExp) |
| `whenUserSaysExactly("hi")` | Exact match on last user message |
| `whenSystemContains("assistant")` | System prompt contains text |
| `withTools()` | Request includes any tool definitions |
| `withTool("get_weather")` | Request includes a specific tool |
| `isStreaming()` | `stream: true` |
| `isNotStreaming()` | `stream` is false or absent |
| `withMessageCount(3)` | Exactly N messages |
| `withMessageCount({ min: 2, max: 5 })` | Message count in range |
| `hasRole("system")` | At least one message with this role |

### Logical combinators

```ts
import { allOf, anyOf, not, when } from "llm-mock";

mock.on(allOf(forModel("gpt-4o"), isStreaming()), handler);
mock.on(anyOf(whenUserSays("help"), whenUserSays("assist")), handler);
mock.on(not(withTools()), handler);

// Escape hatch — any arbitrary function
mock.on(when((req) => req.temperature > 0.8), handler);
```

---

## Streaming

### Auto-stream from a regular handler

Any handler registered with `.on()` is automatically streamed when you call `interceptStream()`:

```ts
mock.on(anyCall(), reply("The quick brown fox jumps over the lazy dog."));

for await (const chunk of mock.interceptStream(request)) {
  process.stdout.write(chunk.delta);
}
```

### Custom streaming handler

For full control, use `.onStream()`:

```ts
import { createTextStream } from "llm-mock";

mock.onStream(anyCall(), async function* (request) {
  yield { id: "id1", delta: "Step 1: ", finish_reason: null };
  await new Promise(r => setTimeout(r, 100));
  yield { id: "id1", delta: "thinking...", finish_reason: null };
  yield { id: "id1", delta: " done.", finish_reason: "stop" };
});
```

### Collect a stream

```ts
import { collectStream } from "llm-mock";

const { content, finish_reason, usage } = await collectStream(
  mock.interceptStream(request)
);
```

---

## Tool Calls

```ts
import { withTool, replyWithTool, ResponseBuilder } from "llm-mock";

const weatherTool = {
  name: "get_weather",
  description: "Get weather for a city",
  parameters: {
    type: "object",
    properties: { city: { type: "string" } },
    required: ["city"],
  },
};

// Simple shorthand
mock.on(withTool("get_weather"), replyWithTool(weatherTool, { city: "Istanbul" }));

// Full builder
mock.on(withTool("get_weather"), (req) =>
  ResponseBuilder.toolCall([
    { name: "get_weather", arguments: { city: "Istanbul", unit: "celsius" } },
  ]).build(req)
);

const res = await mock.intercept({ messages: [...], tools: [weatherTool] });
console.log(res.finish_reason);   // "tool_calls"
console.log(res.tool_calls[0]);   // { id: "...", name: "get_weather", arguments: { city: "Istanbul" } }
```

---

## Provider Adapters

Get responses shaped exactly like the real SDK would return them.

### OpenAI

```ts
const res = await mock.interceptAsOpenAI(request);
// res.choices[0].message.content
// res.choices[0].finish_reason
// res.usage.total_tokens

for await (const chunk of mock.interceptAsOpenAIStream(request)) {
  // chunk.choices[0].delta.content
  // chunk.object === "chat.completion.chunk"
}
```

### Anthropic

```ts
const res = await mock.interceptAsAnthropic(request);
// res.content[0].text
// res.stop_reason === "end_turn"
// res.usage.input_tokens

for await (const event of mock.interceptAsAnthropicStream(request)) {
  // event.type === "content_block_delta"
}
```

---

## SDK Interceptors

Patch an existing SDK client instance so your application code doesn't need to change at all.

### OpenAI

```ts
import OpenAI from "openai";
import { LLMMock, interceptOpenAI, anyCall, reply } from "llm-mock";

const openai = new OpenAI({ apiKey: "test" });
const mock = new LLMMock();

// In your test setup:
let restore: () => void;

beforeEach(() => {
  mock.reset();
  mock.on(anyCall(), reply("mocked!"));
  restore = interceptOpenAI(openai, mock);
});

afterEach(() => restore());

// Your production code uses openai normally — no changes needed:
it("calls the API", async () => {
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: "hello" }],
  });
  expect(res.choices[0].message.content).toBe("mocked!");
});
```

### Anthropic

```ts
import Anthropic from "@anthropic-ai/sdk";
import { interceptAnthropic } from "llm-mock";

const anthropic = new Anthropic({ apiKey: "test" });
const restore = interceptAnthropic(anthropic, mock);
afterEach(restore);
```

---

## Assertions & Call Inspection

```ts
mock.callCount           // number of times mock was called
mock.calls               // ReadonlyArray<CallRecord>
mock.lastCall            // CallRecord | undefined
mock.callsTo("label")    // calls matched by a specific handler label

mock.allHandlersCalled() // true if every handler fired at least once
mock.unusedHandlers()    // handlers registered but never triggered
```

### Jest / Vitest custom matchers

Register once in your setup file:

```ts
// vitest.setup.ts or jest.setup.ts
import { setupLLMMockMatchers } from "llm-mock/vitest"; // or "llm-mock/jest"
setupLLMMockMatchers();
```

Then use in tests:

```ts
expect(mock).toHaveBeenCalledTimes(3);
expect(mock).toHaveBeenCalledWith({ model: "gpt-4o" });
expect(mock).toHaveLastCalledWith({ messages: [{ role: "user", content: "bye" }] });
expect(mock).toHaveReceivedMessage("hello");
expect(mock).toHaveReceivedMessage(/pricing/i);
expect(mock).toHaveAllHandlersCalled();
```

---

## Latency Simulation

```ts
// Fixed 200ms latency
const mock = new LLMMock({ latency: 200 });

// Random between 100–400ms (simulates real network jitter)
const mock = new LLMMock({ latency: { min: 100, max: 400 } });
```

---

## Error Handling

`LLMMockError` is thrown with a machine-readable `code`:

| Code | When |
|---|---|
| `UNHANDLED_REQUEST` | No handler matched and `fallback: "throw"` |
| `HANDLER_EXHAUSTED` | Handler's `times` limit was exceeded |
| `STREAM_INTERRUPTED` | Stream generator threw mid-stream |
| `INVALID_RESPONSE` | Response failed validation |
| `VALIDATION_ERROR` | Configuration or input validation |

```ts
import { LLMMockError } from "llm-mock";

try {
  await mock.intercept(request);
} catch (err) {
  if (err instanceof LLMMockError && err.code === "UNHANDLED_REQUEST") {
    console.log("No handler matched:", err.request);
  }
}
```

---

## API Reference

### `LLMMock`

| Method | Description |
|---|---|
| `on(predicate, handler, opts?)` | Register a handler |
| `onStream(predicate, handler, opts?)` | Register a streaming handler |
| `onAnyCall(handler, opts?)` | Register a catch-all handler |
| `once(predicate, handler, label?)` | Register a one-shot handler |
| `intercept(request)` | Intercept a request, return `MockResponse` |
| `interceptStream(request)` | Intercept and stream `StreamChunk`s |
| `interceptAsOpenAI(request)` | Return OpenAI-shaped `ChatCompletion` |
| `interceptAsOpenAIStream(request)` | Yield OpenAI `ChatCompletionChunk`s |
| `interceptAsAnthropic(request)` | Return Anthropic `Message` |
| `interceptAsAnthropicStream(request)` | Yield Anthropic stream events |
| `reset()` | Clear handlers and call records |
| `clearCalls()` | Clear call records only |
| `clearHandlers()` | Clear handlers only |
| `allHandlersCalled()` | True if all handlers fired |
| `unusedHandlers()` | Handlers that never matched |

---

## Contributing

Pull requests welcome. Please make sure `npm test` and `npm run typecheck` pass before opening a PR.

---

## License

MIT — see [LICENSE](LICENSE).
