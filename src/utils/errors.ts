import type { LLMMockErrorCode, LLMMockErrorOptions, MockRequest } from "../types/index.js";

/**
 * Structured error thrown by llm-mock.
 * Always carries a machine-readable `code` so callers can branch on error type.
 */
export class LLMMockError extends Error {
  readonly code: LLMMockErrorCode;
  readonly request?: MockRequest;
  override readonly cause?: unknown;

  constructor(message: string, options: LLMMockErrorOptions) {
    super(message, { cause: options.cause });
    this.name = "LLMMockError";
    this.code = options.code;
    this.request = options.request;
    this.cause = options.cause;

    // Maintain proper prototype chain in transpiled environments
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static unhandledRequest(request: MockRequest): LLMMockError {
    const lastMessage = request.messages.at(-1);
    const preview =
      typeof lastMessage?.content === "string"
        ? lastMessage.content.slice(0, 80)
        : JSON.stringify(lastMessage?.content).slice(0, 80);

    return new LLMMockError(
      `[llm-mock] No handler matched the request.\n` +
        `  Model: ${request.model ?? "(none)"}\n` +
        `  Last message (${lastMessage?.role ?? "?"}): "${preview}…"\n` +
        `  Register a handler with mock.on(...) or mock.onAnyCall(...).`,
      { code: "UNHANDLED_REQUEST", request }
    );
  }

  static handlerExhausted(label: string | undefined, request: MockRequest): LLMMockError {
    return new LLMMockError(
      `[llm-mock] Handler${label ? ` "${label}"` : ""} has been exhausted (called its maximum number of times).`,
      { code: "HANDLER_EXHAUSTED", request }
    );
  }

  static invalidResponse(message: string, cause?: unknown): LLMMockError {
    return new LLMMockError(`[llm-mock] Invalid response shape: ${message}`, {
      code: "INVALID_RESPONSE",
      cause,
    });
  }

  static streamInterrupted(cause?: unknown): LLMMockError {
    return new LLMMockError(`[llm-mock] Stream was interrupted before completion.`, {
      code: "STREAM_INTERRUPTED",
      cause,
    });
  }

  static validationError(message: string): LLMMockError {
    return new LLMMockError(`[llm-mock] Validation error: ${message}`, {
      code: "VALIDATION_ERROR",
    });
  }
}
