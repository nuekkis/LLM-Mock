import type { MockRequest, MockResponse, StreamChunk } from "../../types/index.js";

/**
 * Shapes a `MockResponse` into the format returned by the Anthropic Messages API.
 */
export function toAnthropicResponse(
  response: MockResponse,
  _request: MockRequest
): AnthropicMessage {
  const content: AnthropicContentBlock[] = [];

  if (response.content) {
    content.push({ type: "text", text: response.content });
  }

  if (response.tool_calls?.length) {
    for (const tc of response.tool_calls) {
      content.push({
        type: "tool_use",
        id: tc.id,
        name: tc.name,
        input: tc.arguments,
      });
    }
  }

  return {
    id: response.id,
    type: "message",
    role: "assistant",
    content,
    model: response.model,
    stop_reason: mapStopReason(response.finish_reason),
    stop_sequence: null,
    usage: {
      input_tokens: response.usage.prompt_tokens,
      output_tokens: response.usage.completion_tokens,
    },
  };
}

/**
 * Shapes a `StreamChunk` into the format emitted by Anthropic's streaming API.
 * Anthropic uses Server-Sent Events; we emit the parsed event objects here.
 */
export function toAnthropicStreamEvent(
  chunk: StreamChunk,
  index: number
): AnthropicStreamEvent {
  if (chunk.finish_reason !== null) {
    return {
      type: "message_delta",
      delta: {
        type: "message_delta",
        stop_reason: mapStopReason(chunk.finish_reason),
        stop_sequence: null,
      },
      usage: chunk.usage
        ? { output_tokens: chunk.usage.completion_tokens }
        : { output_tokens: 0 },
    };
  }

  return {
    type: "content_block_delta",
    index,
    delta: {
      type: "text_delta",
      text: chunk.delta,
    },
  };
}

function mapStopReason(
  reason: MockResponse["finish_reason"]
): "end_turn" | "max_tokens" | "tool_use" | "stop_sequence" {
  switch (reason) {
    case "stop":
      return "end_turn";
    case "length":
      return "max_tokens";
    case "tool_calls":
      return "tool_use";
    default:
      return "end_turn";
  }
}

// ─── Minimal type stubs ──────────────────────────────────────────────────────

export type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

export interface AnthropicMessage {
  id: string;
  type: "message";
  role: "assistant";
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: "end_turn" | "max_tokens" | "tool_use" | "stop_sequence";
  stop_sequence: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

export type AnthropicStreamEvent =
  | {
      type: "content_block_delta";
      index: number;
      delta: { type: "text_delta"; text: string };
    }
  | {
      type: "message_delta";
      delta: {
        type: "message_delta";
        stop_reason: string;
        stop_sequence: string | null;
      };
      usage: { output_tokens: number };
    };
