/**
 * llm-mock — Basic Usage Examples
 *
 * These examples are written as runnable TypeScript snippets.
 * They are not part of the test suite; they serve as living documentation.
 */

import {
  LLMMock,
  anyCall,
  whenUserSays,
  withTool,
  forModel,
  allOf,
  reply,
  replyWithTool,
  ResponseBuilder,
  collectStream,
} from "../src/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Simplest possible mock
// ─────────────────────────────────────────────────────────────────────────────

async function example1_basic() {
  const mock = new LLMMock();
  mock.on(anyCall(), reply("Hello from the mock!"));

  const response = await mock.intercept({
    messages: [{ role: "user", content: "Hi" }],
    model: "gpt-4o",
  });

  console.log(response.content); // "Hello from the mock!"
  console.log(response.usage);   // { prompt_tokens: 1, completion_tokens: 5, total_tokens: 6 }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Conditional routing by message content
// ─────────────────────────────────────────────────────────────────────────────

async function example2_routing() {
  const mock = new LLMMock();

  mock
    .on(whenUserSays("joke"), reply("Why did the AI cross the road? To optimize the other side."))
    .on(whenUserSays(/code|function|implement/i), reply("```ts\nconst add = (a: number, b: number) => a + b;\n```"))
    .on(anyCall(), reply("I can tell jokes or write code. What would you like?"));

  const jokeReply = await mock.intercept({
    messages: [{ role: "user", content: "Tell me a joke" }],
  });

  console.log(jokeReply.content);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Tool call simulation
// ─────────────────────────────────────────────────────────────────────────────

async function example3_toolCalls() {
  const mock = new LLMMock();

  const weatherTool = {
    name: "get_weather",
    description: "Get current weather for a city",
    parameters: {
      type: "object" as const,
      properties: {
        city: { type: "string", description: "City name" },
        unit: { type: "string", enum: ["celsius", "fahrenheit"] },
      },
      required: ["city"],
    },
  };

  // When the request includes the weather tool, pretend the model decided to call it
  mock.on(
    withTool("get_weather"),
    replyWithTool(weatherTool, { city: "Istanbul", unit: "celsius" })
  );

  const response = await mock.intercept({
    messages: [{ role: "user", content: "What's the weather in Istanbul?" }],
    tools: [weatherTool],
  });

  console.log(response.finish_reason);      // "tool_calls"
  console.log(response.tool_calls?.[0]);    // { id: "...", name: "get_weather", arguments: { city: "Istanbul", unit: "celsius" } }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Streaming
// ─────────────────────────────────────────────────────────────────────────────

async function example4_streaming() {
  const mock = new LLMMock();
  mock.on(anyCall(), reply("The quick brown fox jumps over the lazy dog."));

  // Consume as raw chunks
  for await (const chunk of mock.interceptStream({ messages: [{ role: "user", content: "Stream this" }] })) {
    process.stdout.write(chunk.delta);
  }
  console.log(); // newline

  // Or collect everything at once
  const { content, finish_reason } = await collectStream(
    mock.interceptStream({ messages: [{ role: "user", content: "Collect this" }] })
  );
  console.log(content, finish_reason);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. OpenAI-shaped responses
// ─────────────────────────────────────────────────────────────────────────────

async function example5_openaiShape() {
  const mock = new LLMMock();
  mock.on(anyCall(), reply("Bonjour!"));

  const openaiResponse = await mock.interceptAsOpenAI({
    messages: [{ role: "user", content: "Say hello in French" }],
    model: "gpt-4o",
  });

  // Fully typed as an OpenAI ChatCompletion
  console.log(openaiResponse.choices[0]?.message.content); // "Bonjour!"
  console.log(openaiResponse.object);                       // "chat.completion"
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Anthropic-shaped responses
// ─────────────────────────────────────────────────────────────────────────────

async function example6_anthropicShape() {
  const mock = new LLMMock();
  mock.on(anyCall(), reply("Bonjour!"));

  const anthropicResponse = await mock.interceptAsAnthropic({
    messages: [{ role: "user", content: "Say hello in French" }],
    model: "claude-3-5-sonnet-20241022",
  });

  console.log(anthropicResponse.content[0]); // { type: "text", text: "Bonjour!" }
  console.log(anthropicResponse.stop_reason); // "end_turn"
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Dynamic responses
// ─────────────────────────────────────────────────────────────────────────────

async function example7_dynamic() {
  const mock = new LLMMock();

  // Handler receives the full request — use it to build a contextual response
  mock.on(anyCall(), (request) => {
    const lastMsg = request.messages.at(-1);
    const userText = typeof lastMsg?.content === "string" ? lastMsg.content : "";
    const wordCount = userText.split(" ").length;

    return ResponseBuilder.text(
      `You sent a message with ${wordCount} word(s): "${userText}"`
    ).build(request);
  });

  const res = await mock.intercept({
    messages: [{ role: "user", content: "Hello world this is a test" }],
  });

  console.log(res.content); // "You sent a message with 6 word(s): "Hello world this is a test""
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Latency simulation
// ─────────────────────────────────────────────────────────────────────────────

async function example8_latency() {
  const mock = new LLMMock({
    latency: { min: 100, max: 300 }, // random between 100–300ms
  });

  mock.on(anyCall(), reply("Simulated slow response"));

  const start = Date.now();
  await mock.intercept({ messages: [{ role: "user", content: "slow" }] });
  console.log(`Took ~${Date.now() - start}ms`); // somewhere between 100-300ms
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Test assertion patterns (Jest / Vitest)
// ─────────────────────────────────────────────────────────────────────────────

async function example9_assertions() {
  const mock = new LLMMock();
  mock
    .on(whenUserSays("pricing"), reply("Our pricing starts at $9/mo."), { label: "pricing" })
    .on(anyCall(), reply("How can I help?"), { label: "default" });

  await mock.intercept({ messages: [{ role: "user", content: "Tell me about pricing" }] });
  await mock.intercept({ messages: [{ role: "user", content: "Something else" }] });

  // Programmatic assertions (no test framework needed)
  console.assert(mock.callCount === 2, "Should have 2 calls");
  console.assert(mock.callsTo("pricing").length === 1, "pricing handler called once");
  console.assert(mock.allHandlersCalled(), "All handlers were used");
  console.assert(mock.unusedHandlers().length === 0, "No unused handlers");
}

// Run all examples
(async () => {
  await example1_basic();
  await example2_routing();
  await example3_toolCalls();
  await example4_streaming();
  await example5_openaiShape();
  await example6_anthropicShape();
  await example7_dynamic();
  await example8_latency();
  await example9_assertions();
  console.log("All examples completed.");
})();
