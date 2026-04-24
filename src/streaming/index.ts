import type { MockResponse, MockRequest, StreamChunk } from "../types/index.js";
import { generateId, buildUsage, splitIntoChunks, sleep } from "../utils/helpers.js";
import { LLMMockError } from "../utils/errors.js";

export interface StreamOptions {
  /** Characters per chunk. @default 8 */
  chunkSize?: number;
  /** Delay between chunks in ms. @default 0 */
  chunkDelay?: number;
  /** Whether to emit a final chunk with usage stats. @default true */
  emitUsage?: boolean;
}

/**
 * Converts a full `MockResponse` into an async generator of `StreamChunk`s.
 * The generator respects `chunkDelay` for latency simulation.
 */
export async function* createStream(
  response: MockResponse,
  options: StreamOptions = {}
): AsyncGenerator<StreamChunk> {
  const { chunkSize = 8, chunkDelay = 0, emitUsage = true } = options;
  const id = response.id;

  if (response.finish_reason === "tool_calls" && response.tool_calls?.length) {
    // Tool-call streaming: emit JSON argument fragments
    for (const toolCall of response.tool_calls) {
      const argsJson = JSON.stringify(toolCall.arguments);
      const chunks = splitIntoChunks(argsJson, chunkSize);

      for (const chunk of chunks) {
        if (chunkDelay > 0) await sleep(chunkDelay);
        yield { id, delta: chunk, finish_reason: null };
      }
    }

    yield {
      id,
      delta: "",
      finish_reason: "tool_calls",
      usage: emitUsage ? response.usage : undefined,
    };
    return;
  }

  const chunks = splitIntoChunks(response.content, chunkSize);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunkDelay > 0) await sleep(chunkDelay);

    const isLast = i === chunks.length - 1;

    yield {
      id,
      delta: chunk ?? "",
      finish_reason: isLast ? response.finish_reason : null,
      usage: isLast && emitUsage ? response.usage : undefined,
    };
  }
}

/**
 * Creates a stream from raw text, bypassing a full `MockResponse`.
 * Useful for simple inline streaming mocks.
 */
export async function* createTextStream(
  text: string,
  request: MockRequest,
  options: StreamOptions = {}
): AsyncGenerator<StreamChunk> {
  const id = generateId("chatcmpl");
  const { chunkSize = 8, chunkDelay = 0, emitUsage = true } = options;
  const chunks = splitIntoChunks(text, chunkSize);
  const usage = buildUsage(request, text);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunkDelay > 0) await sleep(chunkDelay);

    const isLast = i === chunks.length - 1;
    yield {
      id,
      delta: chunk ?? "",
      finish_reason: isLast ? "stop" : null,
      usage: isLast && emitUsage ? usage : undefined,
    };
  }
}

/**
 * Collects all chunks from a stream into a single assembled string.
 * Mainly used internally for tests and adapters.
 */
export async function collectStream(stream: AsyncIterable<StreamChunk>): Promise<{
  content: string;
  usage?: StreamChunk["usage"];
  finish_reason: StreamChunk["finish_reason"];
}> {
  let content = "";
  let usage: StreamChunk["usage"];
  let finish_reason: StreamChunk["finish_reason"] = null;

  try {
    for await (const chunk of stream) {
      content += chunk.delta;
      if (chunk.usage) usage = chunk.usage;
      if (chunk.finish_reason) finish_reason = chunk.finish_reason;
    }
  } catch (err) {
    throw LLMMockError.streamInterrupted(err);
  }

  return { content, usage, finish_reason };
}
