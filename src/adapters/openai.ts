import type { MockRequest, MockResponse, StreamChunk } from "../../types/index.js";

/**
 * Shapes a `MockResponse` into the format returned by the OpenAI Node SDK.
 * The returned object is structurally identical to what `openai.chat.completions.create()` returns.
 */
export function toOpenAIResponse(
  response: MockResponse,
  _request: MockRequest
): OpenAIChatCompletion {
  const toolCalls = response.tool_calls?.map((tc) => ({
    id: tc.id,
    type: "function" as const,
    function: {
      name: tc.name,
      arguments: JSON.stringify(tc.arguments),
    },
  }));

  return {
    id: response.id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: response.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: response.content || null,
          tool_calls: toolCalls,
          refusal: null,
        },
        logprobs: null,
        finish_reason: mapFinishReason(response.finish_reason),
      },
    ],
    usage: {
      prompt_tokens: response.usage.prompt_tokens,
      completion_tokens: response.usage.completion_tokens,
      total_tokens: response.usage.total_tokens,
      prompt_tokens_details: { cached_tokens: 0, audio_tokens: 0 },
      completion_tokens_details: {
        reasoning_tokens: 0,
        audio_tokens: 0,
        accepted_prediction_tokens: 0,
        rejected_prediction_tokens: 0,
      },
    },
    system_fingerprint: "mock_fp_0000",
  };
}

/**
 * Shapes a `StreamChunk` into the format emitted by the OpenAI streaming API.
 */
export function toOpenAIStreamChunk(chunk: StreamChunk, model: string): OpenAIChatCompletionChunk {
  return {
    id: chunk.id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    system_fingerprint: "mock_fp_0000",
    choices: [
      {
        index: 0,
        delta: {
          role: chunk.finish_reason === null || chunk.delta ? "assistant" : undefined,
          content: chunk.delta || null,
          tool_calls: undefined,
          refusal: null,
        },
        logprobs: null,
        finish_reason: chunk.finish_reason
          ? mapFinishReason(chunk.finish_reason)
          : null,
      },
    ],
    usage: chunk.usage
      ? {
          prompt_tokens: chunk.usage.prompt_tokens,
          completion_tokens: chunk.usage.completion_tokens,
          total_tokens: chunk.usage.total_tokens,
        }
      : null,
  };
}

function mapFinishReason(
  reason: MockResponse["finish_reason"]
): "stop" | "length" | "tool_calls" | "content_filter" | null {
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "tool_calls":
      return "tool_calls";
    case "content_filter":
      return "content_filter";
    case "error":
      return null;
  }
}

// ─── Minimal type stubs (avoids hard dep on openai package) ─────────────────

export interface OpenAIChatCompletion {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
      refusal: null;
    };
    logprobs: null;
    finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details: unknown;
    completion_tokens_details: unknown;
  };
  system_fingerprint: string;
}

export interface OpenAIChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  system_fingerprint: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string | null;
      tool_calls?: unknown;
      refusal: null;
    };
    logprobs: null;
    finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
  }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
}
