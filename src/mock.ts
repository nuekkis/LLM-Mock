import type {
  CallRecord,
  HandlerPredicate,
  LLMMockConfig,
  MockHandler,
  MockRequest,
  MockResponse,
  RegisteredHandler,
  StreamChunk,
  StreamingMockHandler,
} from "./types/index.js";
import { LLMMockError } from "./utils/errors.js";
import { resolveLatency, sleep } from "./utils/helpers.js";
import { createStream } from "./streaming/index.js";
import { toOpenAIResponse, toOpenAIStreamChunk } from "./adapters/openai.js";
import { toAnthropicResponse, toAnthropicStreamEvent } from "./adapters/anthropic.js";
import { anyCall } from "./matchers/predicates.js";

export class LLMMock {
  private _handlers: RegisteredHandler[] = [];
  private _calls: CallRecord[] = [];
  private _config: Required<LLMMockConfig>;

  constructor(config: LLMMockConfig = {}) {
    this._config = {
      fallback: "throw",
      recordCalls: true,
      latency: 0,
      provider: "generic",
      ...config,
    };
  }

  // ─── Handler registration ──────────────────────────────────────────────────

  /**
   * Registers a handler that fires when `predicate` matches.
   * Handlers are evaluated in registration order; first match wins.
   *
   * @example
   * ```ts
   * mock.on(whenUserSays("hello"), reply("Hi there!"));
   * ```
   */
  on(
    predicate: HandlerPredicate,
    handler: MockHandler,
    options: { times?: number; label?: string } = {}
  ): this {
    this._handlers.push({
      predicate,
      handler,
      streaming: false,
      times: options.times,
      _callCount: 0,
      label: options.label,
    });
    return this;
  }

  /**
   * Registers a streaming handler that fires when `predicate` matches.
   * The handler must return an `AsyncGenerator<StreamChunk>`.
   */
  onStream(
    predicate: HandlerPredicate,
    handler: StreamingMockHandler,
    options: { times?: number; label?: string } = {}
  ): this {
    this._handlers.push({
      predicate,
      handler,
      streaming: true,
      times: options.times,
      _callCount: 0,
      label: options.label,
    });
    return this;
  }

  /**
   * Registers a catch-all handler. Equivalent to `mock.on(anyCall(), handler)`.
   */
  onAnyCall(handler: MockHandler, options: { times?: number; label?: string } = {}): this {
    return this.on(anyCall(), handler, options);
  }

  /**
   * Registers a handler that fires only once, then is removed.
   */
  once(predicate: HandlerPredicate, handler: MockHandler, label?: string): this {
    return this.on(predicate, handler, { times: 1, label });
  }

  // ─── Core intercept ────────────────────────────────────────────────────────

  /**
   * Primary intercept method. Call this instead of the real LLM API.
   * Returns a fully-shaped MockResponse (non-streaming).
   */
  async intercept(request: MockRequest): Promise<MockResponse> {
    const latencyMs = resolveLatency(this._config.latency);
    if (latencyMs > 0) await sleep(latencyMs);

    const match = this._findHandler(request, false);

    if (!match) {
      if (this._config.fallback === "throw") {
        throw LLMMockError.unhandledRequest(request);
      }
      return this._config.fallback(request);
    }

    this._checkExhausted(match, request);

    const start = Date.now();
    const response = await (match.handler as MockHandler)(request);
    const elapsedMs = Date.now() - start;

    match._callCount++;

    if (this._config.recordCalls) {
      this._calls.push({
        timestamp: new Date(),
        request,
        response,
        matchedHandler: match.label,
        elapsedMs,
      });
    }

    return response;
  }

  /**
   * Streaming intercept. Returns an `AsyncGenerator<StreamChunk>`.
   * If the matched handler is a regular (non-streaming) handler, its response
   * is automatically converted into a stream.
   */
  async *interceptStream(request: MockRequest): AsyncGenerator<StreamChunk> {
    const latencyMs = resolveLatency(this._config.latency);
    if (latencyMs > 0) await sleep(latencyMs);

    const streamRequest: MockRequest = { ...request, stream: true };
    const match = this._findHandler(streamRequest, true) ?? this._findHandler(streamRequest, false);

    if (!match) {
      if (this._config.fallback === "throw") {
        throw LLMMockError.unhandledRequest(streamRequest);
      }
      const fallbackResponse = await this._config.fallback(streamRequest);
      yield* createStream(fallbackResponse);
      return;
    }

    this._checkExhausted(match, streamRequest);
    match._callCount++;

    if (match.streaming) {
      yield* (match.handler as StreamingMockHandler)(streamRequest);
    } else {
      const response = await (match.handler as MockHandler)(streamRequest);

      if (this._config.recordCalls) {
        this._calls.push({
          timestamp: new Date(),
          request: streamRequest,
          response,
          matchedHandler: match.label,
          elapsedMs: 0,
        });
      }

      yield* createStream(response);
    }
  }

  // ─── Provider-shaped responses ─────────────────────────────────────────────

  /**
   * Returns the response shaped as an OpenAI `ChatCompletion` object.
   */
  async interceptAsOpenAI(request: MockRequest) {
    const response = await this.intercept(request);
    return toOpenAIResponse(response, request);
  }

  /**
   * Returns the stream as OpenAI `ChatCompletionChunk` objects.
   */
  async *interceptAsOpenAIStream(request: MockRequest) {
    const model = request.model ?? "mock-model";
    for await (const chunk of this.interceptStream(request)) {
      yield toOpenAIStreamChunk(chunk, model);
    }
  }

  /**
   * Returns the response shaped as an Anthropic `Message` object.
   */
  async interceptAsAnthropic(request: MockRequest) {
    const response = await this.intercept(request);
    return toAnthropicResponse(response, request);
  }

  /**
   * Returns the stream as Anthropic stream event objects.
   */
  async *interceptAsAnthropicStream(request: MockRequest) {
    let index = 0;
    for await (const chunk of this.interceptStream(request)) {
      yield toAnthropicStreamEvent(chunk, index++);
    }
  }

  // ─── Call inspection ───────────────────────────────────────────────────────

  /** All recorded calls, in order. */
  get calls(): ReadonlyArray<CallRecord> {
    return this._calls;
  }

  /** The most recent call record, or undefined if nothing has been called. */
  get lastCall(): CallRecord | undefined {
    return this._calls.at(-1);
  }

  /** Number of times the mock has been called. */
  get callCount(): number {
    return this._calls.length;
  }

  /** Returns calls filtered by matched handler label. */
  callsTo(label: string): CallRecord[] {
    return this._calls.filter((c) => c.matchedHandler === label);
  }

  // ─── State management ──────────────────────────────────────────────────────

  /**
   * Clears all registered handlers and call records.
   * Call this in `beforeEach` / `afterEach` to keep tests isolated.
   */
  reset(): this {
    this._handlers = [];
    this._calls = [];
    return this;
  }

  /**
   * Clears only call records, preserving registered handlers.
   */
  clearCalls(): this {
    this._calls = [];
    return this;
  }

  /**
   * Clears only registered handlers, preserving call records.
   */
  clearHandlers(): this {
    this._handlers = [];
    return this;
  }

  /**
   * Returns true if every registered handler has been called at least once.
   * Useful for asserting that all expected calls were made.
   */
  allHandlersCalled(): boolean {
    return this._handlers.every((h) => h._callCount > 0);
  }

  /**
   * Returns handlers that were never called. Helpful for surfacing
   * "registered but never triggered" bugs.
   */
  unusedHandlers(): RegisteredHandler[] {
    return this._handlers.filter((h) => h._callCount === 0);
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private _findHandler(
    request: MockRequest,
    streaming: boolean
  ): RegisteredHandler | undefined {
    return this._handlers.find((h) => {
      if (h.streaming !== streaming) return false;
      if (h.times !== undefined && h._callCount >= h.times) return false;
      return h.predicate(request);
    });
  }

  private _checkExhausted(handler: RegisteredHandler, request: MockRequest): void {
    if (handler.times !== undefined && handler._callCount >= handler.times) {
      throw LLMMockError.handlerExhausted(handler.label, request);
    }
  }
}
