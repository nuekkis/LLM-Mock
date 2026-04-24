import type {
  MockRequest,
  MockResponse,
  ToolDefinition,
} from "../types/index.js";
import { generateId, generateToolCallId, buildUsage } from "../utils/helpers.js";

/**
 * Fluent builder for constructing `MockResponse` objects.
 * Prefer using the static factory methods for common cases.
 *
 * @example
 * ```ts
 * const response = ResponseBuilder.text("Hello, world!").withModel("gpt-4o").build(request);
 * ```
 */
export class ResponseBuilder {
  private _content = "";
  private _model = "mock-model";
  private _finishReason: MockResponse["finish_reason"] = "stop";
  private _toolCalls: MockResponse["tool_calls"] = undefined;
  private _id?: string;

  // ─── Factory methods ────────────────────────────────────────────────────────

  /** Creates a response with plain text content. */
  static text(content: string): ResponseBuilder {
    const b = new ResponseBuilder();
    b._content = content;
    return b;
  }

  /** Creates a response that calls one or more tools. */
  static toolCall(
    calls: Array<{ name: string; arguments: Record<string, unknown> }>
  ): ResponseBuilder {
    const b = new ResponseBuilder();
    b._content = "";
    b._finishReason = "tool_calls";
    b._toolCalls = calls.map((c) => ({
      id: generateToolCallId(),
      name: c.name,
      arguments: c.arguments,
    }));
    return b;
  }

  /**
   * Creates a response that echoes the last user message back.
   * Useful for testing pass-through scenarios.
   */
  static echo(): (request: MockRequest) => MockResponse {
    return (request) => {
      const last = request.messages.at(-1);
      const content =
        typeof last?.content === "string" ? last.content : JSON.stringify(last?.content ?? "");
      return ResponseBuilder.text(content).build(request);
    };
  }

  /** Creates a response that immediately signals an error finish reason. */
  static contentFiltered(explanation = "Content was filtered."): ResponseBuilder {
    const b = new ResponseBuilder();
    b._content = explanation;
    b._finishReason = "content_filter";
    return b;
  }

  /** Creates a truncated response (length-limited finish). */
  static truncated(content: string): ResponseBuilder {
    const b = new ResponseBuilder();
    b._content = content;
    b._finishReason = "length";
    return b;
  }

  // ─── Chainable setters ───────────────────────────────────────────────────────

  withModel(model: string): this {
    this._model = model;
    return this;
  }

  withId(id: string): this {
    this._id = id;
    return this;
  }

  withFinishReason(reason: MockResponse["finish_reason"]): this {
    this._finishReason = reason;
    return this;
  }

  // ─── Terminal method ─────────────────────────────────────────────────────────

  build(request: MockRequest): MockResponse {
    const id = this._id ?? generateId("chatcmpl");
    const model = request.model ?? this._model;
    const usage = buildUsage(request, this._content);

    return {
      id,
      model,
      content: this._content,
      tool_calls: this._toolCalls,
      finish_reason: this._finishReason,
      usage,
    };
  }
}

// ─── Convenience shorthands ──────────────────────────────────────────────────

/**
 * Quick one-liner for building a static text response handler.
 * @example mock.on(anyCall(), reply("Sure, I can help with that."))
 */
export function reply(content: string): (request: MockRequest) => MockResponse {
  return (request) => ResponseBuilder.text(content).build(request);
}

/**
 * Builds a response that uses one of the provided tool definitions.
 * Randomly picks from the available tools and fills dummy arguments.
 */
export function replyWithTool(
  tool: ToolDefinition,
  args: Record<string, unknown>
): (request: MockRequest) => MockResponse {
  return (request) => ResponseBuilder.toolCall([{ name: tool.name, arguments: args }]).build(request);
}
