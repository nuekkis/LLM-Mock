import type { MockRequest, Usage } from "../types/index.js";

// ─── ID helpers ──────────────────────────────────────────────────────────────

let _seq = 0;

/**
 * Generates a deterministic-looking ID similar to OpenAI's `chatcmpl-xxx`.
 * Uses a monotonic counter to keep tests reproducible when `Math.random` is seeded.
 */
export function generateId(prefix = "mock"): string {
  const seq = (++_seq).toString(36).padStart(4, "0");
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${seq}${rand}`;
}

export function generateToolCallId(): string {
  return generateId("call");
}

/** Reset the counter — useful in test `beforeEach` for deterministic IDs. */
export function resetIdCounter(): void {
  _seq = 0;
}

// ─── Token estimation ────────────────────────────────────────────────────────

/**
 * Rough token estimator (≈4 chars per token).
 * Intentionally imprecise — real tokenizers are model-specific.
 * Good enough for generating plausible `usage` objects in mocks.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function buildUsage(request: MockRequest, responseContent: string): Usage {
  const inputText = request.messages
    .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
    .join(" ");

  const prompt_tokens = estimateTokens(inputText);
  const completion_tokens = estimateTokens(responseContent);

  return {
    prompt_tokens,
    completion_tokens,
    total_tokens: prompt_tokens + completion_tokens,
  };
}

// ─── Latency ─────────────────────────────────────────────────────────────────

export function resolveLatency(latency: number | { min: number; max: number } | undefined): number {
  if (latency === undefined || latency === 0) return 0;
  if (typeof latency === "number") return latency;
  const { min, max } = latency;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Text extraction ─────────────────────────────────────────────────────────

export function extractLastUserMessage(request: MockRequest): string {
  const userMessages = request.messages.filter((m) => m.role === "user");
  const last = userMessages.at(-1);
  if (!last) return "";
  return typeof last.content === "string" ? last.content : JSON.stringify(last.content);
}

export function extractSystemPrompt(request: MockRequest): string | undefined {
  if (request.system) return request.system;
  const sys = request.messages.find((m) => m.role === "system");
  if (!sys) return undefined;
  return typeof sys.content === "string" ? sys.content : JSON.stringify(sys.content);
}

// ─── Streaming helpers ───────────────────────────────────────────────────────

/**
 * Splits a string into N roughly-equal chunks for streaming simulation.
 */
export function splitIntoChunks(text: string, chunkSize = 8): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    // Prefer splitting on word boundaries
    let end = i + chunkSize;
    if (end < text.length) {
      const spaceIdx = text.indexOf(" ", end);
      if (spaceIdx !== -1 && spaceIdx - end < chunkSize) {
        end = spaceIdx + 1;
      }
    }
    chunks.push(text.slice(i, end));
    i = end;
  }
  return chunks;
}
