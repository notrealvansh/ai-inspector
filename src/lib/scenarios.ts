import {
  createInspector,
  memoryExporter,
  runScorers,
  scorers,
  type SpanHandle,
  type StartTraceOptions,
  type TraceData,
  type TraceHandle,
} from "@/lib/inspector";

export interface Scenario {
  id: string;
  title: string;
  tagline: string;
  description: string;
  models: string[];
  tags: string[];
  estimatedMs: number;
  run: () => Promise<TraceData>;
}

type TraceParent = TraceHandle | SpanHandle;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function captureTrace(
  name: string,
  options: Omit<StartTraceOptions, "name">,
  fn: (trace: TraceHandle) => Promise<unknown>,
): Promise<TraceData> {
  const memory = memoryExporter();
  const inspector = createInspector({
    exporters: [memory],
    serviceName: "ai-inspector-workbench",
    capture: { mode: "preview", maxStringLength: 700 },
  });

  try {
    await inspector.trace(name, fn, options);
  } catch {
    // The failed trace is still exported; the caller inspects it in the UI.
  }

  const trace = memory.getTraces()[0];
  if (!trace) throw new Error("The sample trace was not recorded.");
  return trace;
}

async function recordScores(
  parent: TraceParent,
  options: {
    name: string;
    input: unknown;
    output: unknown;
    expected?: string;
    scorerList: Parameters<typeof runScorers>[0]["scorers"];
    threshold?: number;
  },
): Promise<void> {
  const span = parent.startSpan({
    name: options.name,
    kind: "evaluation",
    operation: "evaluate",
    attributes: { "evaluation.threshold": options.threshold ?? 0.5 },
  });
  const results = await runScorers({
    input: options.input,
    output: options.output,
    ...(options.expected !== undefined ? { expected: options.expected } : {}),
    scorers: options.scorerList,
    ...(options.threshold !== undefined ? { threshold: options.threshold } : {}),
  });
  for (const result of results) span.addEvaluation(result);
  span.end({ output: { scores: results } });
}

const supportAgent: Scenario = {
  id: "support-agent",
  title: "Support agent",
  tagline: "Tools, retrieval, and a scored reply",
  description:
    "Classifies a ticket, searches the help center, looks up an order, drafts a reply, and scores the result.",
  models: ["gpt-4o-mini"],
  tags: ["tool calls", "evals"],
  estimatedMs: 1_100,
  async run() {
    return captureTrace(
      "support-agent",
      {
        tags: ["agent", "tools"],
        metadata: { mode: "sample", channel: "chat", ticket: "T-2041" },
      },
      async (trace) => {
        const message = "Where is order A-17? It was supposed to arrive today.";
        const agent = trace.startSpan({
          name: "support-agent.run",
          kind: "agent",
          operation: "invoke_agent",
          input: { message, channel: "chat" },
        });

        const retrieval = agent.startSpan({
          name: "help-center.search",
          kind: "retrieval",
          input: { query: "order delivery status" },
        });
        await wait(170);
        retrieval.end({
          output: {
            documents: 3,
            topScore: 0.94,
            source: "help-center",
          },
        });

        const classify = agent.generation({
          name: "classify-intent",
          model: "gpt-4o-mini",
          provider: "openai",
          operation: "chat",
          input: { message },
        });
        await wait(210);
        classify.end({
          output: { intent: "order_status", confidence: 0.92 },
          usage: { inputTokens: 312, outputTokens: 38 },
        });

        const tool = agent.startSpan({
          name: "lookup_order",
          kind: "tool",
          operation: "lookup_order",
          input: { orderId: "A-17" },
        });
        await wait(190);
        const toolOutput = { status: "in_transit", eta: "2 business days" };
        tool.addToolCall({
          name: "lookup_order",
          id: "call_01",
          input: { orderId: "A-17" },
          output: toolOutput,
          durationMs: 190,
        });
        tool.end({ output: toolOutput });

        const reply =
          "Order A-17 is in transit and should arrive within 2 business days. You can follow it from the orders page.";
        const generation = agent.generation({
          name: "draft-reply",
          model: "gpt-4o-mini",
          provider: "openai",
          operation: "chat",
          input: {
            context: "Help center: delivery takes 3-5 business days.",
            toolResult: toolOutput,
          },
        });
        await wait(360);
        generation.end({
          output: reply,
          usage: { inputTokens: 1_284, outputTokens: 146 },
        });

        await recordScores(agent, {
          name: "reply-quality",
          input: message,
          output: reply,
          expected: "2 business days",
          scorerList: [
            scorers.includes("2 business days"),
            scorers.maxLength(320),
            scorers.custom("states_next_step", ({ output }) => ({
              score: String(output).includes("orders page") ? 1 : 0.5,
              reason: "Checks that the reply tells the customer where to look next.",
            })),
          ],
          threshold: 0.5,
        });

        agent.end({
          output: { reply, tool: "lookup_order", intent: "order_status" },
        });
        return reply;
      },
    );
  },
};

const ragResearch: Scenario = {
  id: "rag-research",
  title: "RAG research",
  tagline: "Embed, retrieve, rerank, answer",
  description:
    "Runs a four-stage retrieval pipeline with a reranker, a cited answer, and groundedness checks.",
  models: ["text-embedding-3-small", "claude-sonnet-4-5"],
  tags: ["RAG", "rerank", "evals"],
  estimatedMs: 1_000,
  async run() {
    return captureTrace(
      "rag-research",
      {
        tags: ["rag", "research"],
        metadata: { mode: "sample", corpus: "billing-policies" },
      },
      async (trace) => {
        const question = "Can a customer get a refund after 30 days?";
        const research = trace.startSpan({
          name: "research.run",
          kind: "agent",
          operation: "invoke_agent",
          input: { question },
        });

        const embedding = research.startSpan({
          name: "embed-query",
          kind: "embedding",
          operation: "embeddings",
          model: "text-embedding-3-small",
          provider: "openai",
          input: question,
        });
        await wait(80);
        embedding.end({
          output: { count: 1, dimensions: 1536 },
          usage: { inputTokens: 26, outputTokens: 0 },
        });

        const retrieval = research.startSpan({
          name: "policy-index.search",
          kind: "retrieval",
          operation: "retrieval",
          input: { query: question, topK: 8 },
        });
        await wait(140);
        retrieval.end({
          output: {
            documents: 8,
            topScore: 0.88,
            sources: ["refund-policy", "billing-faq", "terms"],
          },
        });

        const rerank = research.startSpan({
          name: "rerank-results",
          kind: "rerank",
          operation: "rerank",
          model: "rerank-3.5",
          provider: "cohere",
          input: { documents: 8, topN: 3 },
        });
        await wait(70);
        rerank.end({ output: { documents: 3, topScore: 0.97 } });

        const answer =
          "Refunds are available within 30 days of purchase [1]. After 30 days, a prorated credit may be offered at support's discretion [2]. Enterprise agreements follow their own terms [3].";
        const generation = research.generation({
          name: "cited-answer",
          model: "claude-sonnet-4-5",
          provider: "anthropic",
          operation: "chat",
          input: {
            question,
            context: "3 reranked policy excerpts",
          },
        });
        await wait(380);
        generation.end({
          output: answer,
          usage: { inputTokens: 4_180, outputTokens: 486 },
        });

        await recordScores(research, {
          name: "groundedness",
          input: question,
          output: answer,
          expected: "30 days",
          scorerList: [
            scorers.includes("30 days"),
            scorers.matches(/\[\d\]/),
            scorers.custom("has_caveat", ({ output }) => ({
              score: /discretion|enterprise/i.test(String(output)) ? 1 : 0,
              reason: "Looks for a stated exception rather than an absolute answer.",
            })),
          ],
          threshold: 0.6,
        });

        research.end({ output: { answer, citations: 3 } });
        return answer;
      },
    );
  },
};

const streamingChat: Scenario = {
  id: "streaming-chat",
  title: "Streaming chat",
  tagline: "Time to first token, then usage",
  description:
    "Shows a streamed generation with first-token timing, final usage, and a per-token cost estimate.",
  models: ["gpt-4.1-mini"],
  tags: ["streaming", "ttft"],
  estimatedMs: 700,
  async run() {
    return captureTrace(
      "streaming-chat",
      {
        tags: ["streaming"],
        metadata: { mode: "sample", transport: "sse" },
      },
      async (trace) => {
        const generation = trace.generation({
          name: "stream.reply",
          model: "gpt-4.1-mini",
          provider: "openai",
          operation: "streamText",
          input: {
            messages: [
              { role: "system", content: "Be concise." },
              { role: "user", content: "Explain trace sampling in one paragraph." },
            ],
          },
        });

        await wait(180);
        generation.markFirstToken();
        generation.addEvent("stream.first_token");
        await wait(470);

        const text =
          "Trace sampling keeps a representative slice of traffic instead of recording every request. Use a low rate in production, keep every error, and raise it temporarily when you are debugging a regression.";
        generation.end({
          output: text,
          usage: { inputTokens: 1_120, outputTokens: 268 },
          attributes: { "stream.transport": "sse" },
        });
        generation.addEvent("stream.completed");
        return text;
      },
    );
  },
};

const failingCheckout: Scenario = {
  id: "checkout-failure",
  title: "Checkout failure",
  tagline: "A failed tool and a retried request",
  description:
    "Captures a declined card tool call, a provider rate limit, and error propagation across an agent run.",
  models: ["gpt-4o"],
  tags: ["error", "tool calls"],
  estimatedMs: 850,
  async run() {
    return captureTrace(
      "checkout-agent",
      {
        tags: ["agent", "error"],
        metadata: { mode: "sample", cart: "C-889", attempt: 2 },
      },
      async (trace) => {
        const agent = trace.startSpan({
          name: "checkout.run",
          kind: "agent",
          operation: "invoke_agent",
          input: { sku: "PRO-PLAN", quantity: 1 },
        });

        const inventory = agent.startSpan({
          name: "check_inventory",
          kind: "tool",
          operation: "check_inventory",
          input: { sku: "PRO-PLAN" },
        });
        await wait(120);
        inventory.end({ output: { available: true, warehouse: "eu-west" } });

        const generation = agent.generation({
          name: "checkout.plan",
          model: "gpt-4o",
          provider: "openai",
          operation: "chat",
          input: { sku: "PRO-PLAN", cart: "C-889" },
        });
        await wait(230);
        generation.end({
          output: { nextAction: "charge_card", amount: 49 },
          usage: { inputTokens: 280, outputTokens: 40 },
        });

        const charge = agent.startSpan({
          name: "charge_card",
          kind: "tool",
          operation: "charge_card",
          input: { cart: "C-889", amountUsd: 49 },
        });
        await wait(260);
        const failure = new Error(
          "Payment provider returned 429: rate limit exceeded",
        );
        charge.addToolCall({
          name: "charge_card",
          id: "call_charge",
          input: { cart: "C-889", amountUsd: 49 },
          error: failure,
          durationMs: 260,
        });
        charge.fail(failure);

        const error = new Error(
          "Checkout failed after retry: payment provider returned 429",
        );
        agent.fail(error, { output: { failedAt: "charge_card" } });
        throw error;
      },
    );
  },
};

export const scenarios: Scenario[] = [
  supportAgent,
  ragResearch,
  streamingChat,
  failingCheckout,
];

export function getScenario(id: string): Scenario | undefined {
  return scenarios.find((scenario) => scenario.id === id);
}
