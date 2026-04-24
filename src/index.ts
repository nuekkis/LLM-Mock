// ─── Core ─────────────────────────────────────────────────────────────────────
export { LLMMock } from "./mock.js";

// ─── Types ────────────────────────────────────────────────────────────────────
export type {
  Provider,
  MessageRole,
  TextContent,
  ImageContent,
  ToolCallContent,
  ToolResultContent,
  MessageContent,
  Message,
  ToolDefinition,
  MockRequest,
  Usage,
  FinishReason,
  MockResponse,
  StreamChunk,
  MockHandler,
  StreamingMockHandler,
  HandlerPredicate,
  RegisteredHandler,
  LLMMockConfig,
  CallRecord,
  LLMMockErrorCode,
  LLMMockErrorOptions,
} from "./types/index.js";

// ─── Errors ───────────────────────────────────────────────────────────────────
export { LLMMockError } from "./utils/errors.js";

// ─── Response builders ────────────────────────────────────────────────────────
export { ResponseBuilder, reply, replyWithTool } from "./utils/response-builder.js";

// ─── Predicates / matchers ────────────────────────────────────────────────────
export {
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
} from "./matchers/predicates.js";

// ─── Streaming ────────────────────────────────────────────────────────────────
export { createStream, createTextStream, collectStream } from "./streaming/index.js";
export type { StreamOptions } from "./streaming/index.js";

// ─── SDK interceptors ─────────────────────────────────────────────────────────
export { interceptOpenAI, interceptAnthropic } from "./interceptors/index.js";
export type { OpenAILike, AnthropicLike } from "./interceptors/index.js";

// ─── Adapters (raw shaped responses) ─────────────────────────────────────────
export { toOpenAIResponse, toOpenAIStreamChunk } from "./adapters/openai.js";
export { toAnthropicResponse, toAnthropicStreamEvent } from "./adapters/anthropic.js";

// ─── Utilities ────────────────────────────────────────────────────────────────
export { generateId, resetIdCounter, estimateTokens } from "./utils/helpers.js";
