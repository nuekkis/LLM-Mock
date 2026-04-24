/**
 * Core type definitions for llm-mock.
 * These types are intentionally provider-agnostic and map onto the
 * lowest-common-denominator of what every LLM API exposes.
 */

// ─── Provider identifiers ────────────────────────────────────────────────────

export type Provider = "openai" | "anthropic" | "generic";

// ─── Message types ───────────────────────────────────────────────────────────

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image_url";
  image_url: { url: string; detail?: "low" | "high" | "auto" };
}

export interface ToolCallContent {
  type: "tool_call";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResultContent {
  type: "tool_result";
  tool_call_id: string;
  content: string;
}

export type MessageContent =
  | string
  | TextContent
  | ImageContent
  | ToolCallContent
  | ToolResultContent
  | Array<TextContent | ImageContent | ToolCallContent | ToolResultContent>;

export interface Message {
  role: MessageRole;
  content: MessageContent;
  name?: string;
}

// ─── Tool definitions ────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description?: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// ─── Request / Response shapes ───────────────────────────────────────────────

export interface MockRequest {
  messages: Message[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  tools?: ToolDefinition[];
  tool_choice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
  stream?: boolean;
  system?: string; // Anthropic-style top-level system prompt
  [key: string]: unknown; // allow extra provider-specific fields
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface FinishReason {
  reason: "stop" | "length" | "tool_calls" | "content_filter" | "error";
}

export interface MockResponse {
  id: string;
  model: string;
  content: string;
  tool_calls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  finish_reason: FinishReason["reason"];
  usage: Usage;
  /** Raw provider-shaped object, only set when using an adapter */
  raw?: unknown;
}

// ─── Streaming ───────────────────────────────────────────────────────────────

export interface StreamChunk {
  id: string;
  delta: string;
  finish_reason: FinishReason["reason"] | null;
  usage?: Usage;
}

// ─── Handler types ───────────────────────────────────────────────────────────

/**
 * A handler receives the normalised request and returns a MockResponse (or throws).
 * Handlers are matched in order; the first match wins.
 */
export type MockHandler = (request: MockRequest) => MockResponse | Promise<MockResponse>;

/**
 * A streaming handler returns an async generator of chunks.
 */
export type StreamingMockHandler = (
  request: MockRequest
) => AsyncGenerator<StreamChunk> | AsyncIterable<StreamChunk>;

/**
 * Predicate that decides whether a handler should handle a given request.
 */
export type HandlerPredicate = (request: MockRequest) => boolean;

export interface RegisteredHandler {
  predicate: HandlerPredicate;
  handler: MockHandler | StreamingMockHandler;
  streaming: boolean;
  /** How many times this handler can fire. Undefined = unlimited. */
  times?: number;
  _callCount: number;
  label?: string;
}

// ─── Configuration ───────────────────────────────────────────────────────────

export interface LLMMockConfig {
  /**
   * Default response when no handler matches.
   * Set to `"throw"` to surface unhandled requests as errors (recommended for tests).
   * @default "throw"
   */
  fallback?: "throw" | MockHandler;

  /**
   * Whether to record every intercepted call for later assertion.
   * @default true
   */
  recordCalls?: boolean;

  /**
   * Artificial latency in ms to simulate network round-trips.
   * @default 0
   */
  latency?: number | { min: number; max: number };

  /**
   * Provider hint. Affects which adapter formats the raw response object.
   * @default "generic"
   */
  provider?: Provider;
}

// ─── Call record ─────────────────────────────────────────────────────────────

export interface CallRecord {
  timestamp: Date;
  request: MockRequest;
  response: MockResponse;
  /** Which handler label was matched, if any. */
  matchedHandler?: string;
  /** Elapsed ms from request to response. */
  elapsedMs: number;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export type LLMMockErrorCode =
  | "UNHANDLED_REQUEST"
  | "HANDLER_EXHAUSTED"
  | "INVALID_RESPONSE"
  | "STREAM_INTERRUPTED"
  | "VALIDATION_ERROR";

export interface LLMMockErrorOptions {
  code: LLMMockErrorCode;
  request?: MockRequest;
  cause?: unknown;
}
