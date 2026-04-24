import type { LLMMock } from "../mock.js";
import type { MockRequest } from "../types/index.js";

// ─── OpenAI interceptor ───────────────────────────────────────────────────────

export interface OpenAILike {
  chat: {
    completions: {
      create: (params: Record<string, unknown>) => unknown;
    };
  };
}

/**
 * Patches an OpenAI SDK client instance so all `chat.completions.create()` calls
 * are intercepted by `mock` instead of hitting the real API.
 *
 * Returns a restore function — call it in `afterEach` to un-patch the client.
 *
 * @example
 * ```ts
 * import OpenAI from "openai";
 * const openai = new OpenAI({ apiKey: "test" });
 * const restore = interceptOpenAI(openai, mock);
 * afterEach(restore);
 * ```
 */
export function interceptOpenAI(client: OpenAILike, mock: LLMMock): () => void {
  const original = client.chat.completions.create.bind(client.chat.completions);

  client.chat.completions.create = async (params: Record<string, unknown>) => {
    const request = normaliseOpenAIParams(params);

    if (params["stream"] === true) {
      return createOpenAIStreamResponse(mock, request);
    }

    return mock.interceptAsOpenAI(request);
  };

  return () => {
    client.chat.completions.create = original;
  };
}

function normaliseOpenAIParams(params: Record<string, unknown>): MockRequest {
  return {
    messages: (params["messages"] as MockRequest["messages"]) ?? [],
    model: params["model"] as string | undefined,
    temperature: params["temperature"] as number | undefined,
    max_tokens: (params["max_tokens"] ?? params["max_completion_tokens"]) as number | undefined,
    tools: params["tools"] as MockRequest["tools"],
    tool_choice: params["tool_choice"] as MockRequest["tool_choice"],
    stream: params["stream"] as boolean | undefined,
    ...params,
  };
}

async function createOpenAIStreamResponse(mock: LLMMock, request: MockRequest) {
  const chunks: unknown[] = [];
  for await (const chunk of mock.interceptAsOpenAIStream(request)) {
    chunks.push(chunk);
  }

  // Returns an async iterable that mimics the OpenAI streaming response
  let i = 0;
  return {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          if (i < chunks.length) {
            return { value: chunks[i++], done: false };
          }
          return { value: undefined, done: true };
        },
      };
    },
    controller: { abort: () => void 0 },
  };
}

// ─── Anthropic interceptor ────────────────────────────────────────────────────

export interface AnthropicLike {
  messages: {
    create: (params: Record<string, unknown>) => unknown;
    stream?: (params: Record<string, unknown>) => unknown;
  };
}

/**
 * Patches an Anthropic SDK client instance so all `messages.create()` calls
 * are intercepted by `mock`.
 *
 * Returns a restore function.
 *
 * @example
 * ```ts
 * import Anthropic from "@anthropic-ai/sdk";
 * const anthropic = new Anthropic({ apiKey: "test" });
 * const restore = interceptAnthropic(anthropic, mock);
 * afterEach(restore);
 * ```
 */
export function interceptAnthropic(client: AnthropicLike, mock: LLMMock): () => void {
  const original = client.messages.create.bind(client.messages);

  client.messages.create = async (params: Record<string, unknown>) => {
    const request = normaliseAnthropicParams(params);

    if (params["stream"] === true) {
      return createAnthropicStreamResponse(mock, request);
    }

    return mock.interceptAsAnthropic(request);
  };

  return () => {
    client.messages.create = original;
  };
}

function normaliseAnthropicParams(params: Record<string, unknown>): MockRequest {
  return {
    messages: (params["messages"] as MockRequest["messages"]) ?? [],
    model: params["model"] as string | undefined,
    max_tokens: params["max_tokens"] as number | undefined,
    tools: params["tools"] as MockRequest["tools"],
    system: params["system"] as string | undefined,
    stream: params["stream"] as boolean | undefined,
    ...params,
  };
}

async function createAnthropicStreamResponse(mock: LLMMock, request: MockRequest) {
  const events: unknown[] = [];
  for await (const event of mock.interceptAsAnthropicStream(request)) {
    events.push(event);
  }

  let i = 0;
  return {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          if (i < events.length) {
            return { value: events[i++], done: false };
          }
          return { value: undefined, done: true };
        },
      };
    },
  };
}
