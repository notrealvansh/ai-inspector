import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Braces,
  Check,
  Copy,
  FileJson,
  FlaskConical,
  Gauge,
  Menu,
  Network,
  Radio,
  ShieldCheck,
  Terminal,
  Waypoints,
  X,
} from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";

import { Brand } from "@/components/Brand";
import { TracePreview } from "@/components/landing/TracePreview";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const INSTALL = "npm i @yourname/ai-inspector";

const samples = {
  node: {
    label: "Node",
    file: "server.ts",
    code: `import { createNodeInspector } from "@yourname/ai-inspector/node";

const inspector = createNodeInspector({
  serviceName: "support-api",
});

await inspector.trace("support-request", async (trace) => {
  const generation = trace.generation({
    name: "answer",
    model: "gpt-4o-mini",
  });

  const result = await generateAnswer(message);

  generation.end({
    output: result.text,
    usage: result.usage,
  });

  return result.text;
});`,
  },
  "ai-sdk": {
    label: "AI SDK",
    file: "chat.ts",
    code: `import { generateText } from "ai";
import { instrumentAiSdk } from "@yourname/ai-inspector/ai-sdk";

const ai = instrumentAiSdk(inspector, { generateText });

const result = await ai.generateText({
  model: openai("gpt-4o-mini"),
  prompt: "Summarize this ticket",
});

// spans close with model, usage,
// tool calls, latency, and cost.`,
  },
  otel: {
    label: "OTLP",
    file: "collector.ts",
    code: `import { otlpHttpExporter } from "@yourname/ai-inspector/otel";

const inspector = createNodeInspector({
  file: false,
  exporters: [
    otlpHttpExporter({
      endpoint: "http://localhost:4318",
      serviceName: "support-api",
    }),
  ],
});

// W3C trace ids, gen_ai.* attributes,
// no OpenTelemetry SDK required.`,
  },
} as const;

type SampleKey = keyof typeof samples;

function copyText(text: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast("Copied to clipboard"))
    .catch(() => toast.error("Could not access the clipboard"));
}

function SectionLabel({
  index,
  children,
}: {
  index: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
      <span className="text-primary">[{index}]</span>
      <span className="h-px w-8 bg-border" />
      <span>{children}</span>
    </div>
  );
}

function InstallCommand() {
  return (
    <button
      type="button"
      onClick={() => copyText(INSTALL)}
      className="group flex w-full max-w-[420px] items-center justify-between gap-4 rounded-md border border-border bg-card/60 px-3.5 py-2.5 text-left transition-colors hover:border-primary/30"
    >
      <span className="flex min-w-0 items-center gap-2.5 font-mono text-xs text-foreground/85">
        <span className="text-primary">$</span>
        <span className="truncate">{INSTALL}</span>
      </span>
      <Copy className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
    </button>
  );
}

function CodeBlock({
  code,
  label,
  file,
  className,
}: {
  code: string;
  label: string;
  file: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-[oklch(0.165_0.012_250)]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-primary/70" />
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-muted-foreground/70">{file}</span>
          <button
            type="button"
            aria-label="Copy code"
            onClick={() => copyText(code)}
            className="text-muted-foreground transition-colors hover:text-primary"
          >
            <Copy className="size-3.5" />
          </button>
        </div>
      </div>
      <pre className="max-h-[360px] overflow-auto p-4 font-mono text-[11.5px] leading-[1.75] text-foreground/80 md:text-xs">
        {code.split("\n").map((line, index) => {
          const comment = line.indexOf("//");
          return (
            <div key={`${line}-${index}`} className="whitespace-pre">
              {comment >= 0 ? (
                <>
                  <span>{line.slice(0, comment)}</span>
                  <span className="text-muted-foreground/60">{line.slice(comment)}</span>
                </>
              ) : (
                line || " "
              )}
            </div>
          );
        })}
      </pre>
    </div>
  );
}

const features = [
  {
    icon: FileJson,
    title: "A file, not a SaaS trial",
    body: "The Node preset writes newline-delimited JSON to .ai-inspector/traces.ndjson. Read it with the CLI or open it yourself.",
  },
  {
    icon: Gauge,
    title: "Numbers with provenance",
    body: "Token counts come from the provider response. Costs appear only when a model has a rate and both token counts were reported.",
  },
  {
    icon: Waypoints,
    title: "Tools, agents, pipelines",
    body: "One trace can hold generations, embeddings, retrieval, reranking, tool calls, and evaluations. Parents and durations stay intact.",
  },
  {
    icon: Radio,
    title: "Streaming is first class",
    body: "Measure time to first token and capture final usage when a wrapped stream finishes. Incomplete streams are marked, not guessed.",
  },
  {
    icon: FlaskConical,
    title: "Checks stay in the loop",
    body: "Run deterministic scorers next to the request that produced the answer. No judge model, no separate eval account.",
  },
  {
    icon: Network,
    title: "OpenTelemetry, not a new standard",
    body: "W3C trace ids, gen_ai.* attributes, and an OTLP/HTTP exporter. Send the same trace to your collector when you need one.",
  },
];

const adapters = [
  "Vercel AI SDK",
  "OpenAI-compatible clients",
  "OTLP / OpenTelemetry",
  "Node.js",
  "Bun",
  "Browsers and edge runtimes",
];

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sample, setSample] = useState<SampleKey>("node");
  const ctaHref = isAuthenticated ? "/dashboard" : "/auth?returnTo=/dashboard";

  const navLinks = [
    ["Features", "#features"],
    ["Integrations", "#integrations"],
    ["CLI", "#cli"],
    ["Quickstart", "#quickstart"],
  ] as const;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-6">
          <Brand showVersion />

          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            {navLinks.map(([label, href]) => (
              <a key={href} href={href} className="transition-colors hover:text-foreground">
                {label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            {!isAuthenticated ? (
              <Button asChild variant="ghost" size="sm">
                <Link to="/auth">Sign in</Link>
              </Button>
            ) : null}
            <Button asChild size="sm" className="gap-1.5">
              <Link to={ctaHref}>
                {isAuthenticated ? "Open workbench" : "Start tracing"}
                <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>

        <AnimatePresence>
          {menuOpen ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t border-border/70 bg-background md:hidden"
            >
              <nav className="mx-auto flex max-w-6xl flex-col px-4 py-3">
                {navLinks.map(([label, href]) => (
                  <a
                    key={href}
                    href={href}
                    onClick={() => setMenuOpen(false)}
                    className="border-b border-border/50 py-3 text-sm text-muted-foreground last:border-0"
                  >
                    {label}
                  </a>
                ))}
                <div className="flex gap-2 pt-3">
                  {!isAuthenticated ? (
                    <Button asChild variant="outline" className="flex-1">
                      <Link to="/auth">Sign in</Link>
                    </Button>
                  ) : null}
                  <Button asChild className="flex-1">
                    <Link to={ctaHref}>
                      {isAuthenticated ? "Workbench" : "Start tracing"}
                    </Link>
                  </Button>
                </div>
              </nav>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-border/60">
          <div className="pointer-events-none absolute inset-0 bg-grid mask-fade-b opacity-70" />
          <div className="relative mx-auto grid max-w-6xl gap-14 px-4 pb-20 pt-14 md:px-6 md:pb-28 md:pt-24 lg:grid-cols-[1.04fr_0.96fr] lg:items-center">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.07] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.13em] text-primary">
                <span className="size-1.5 rounded-full bg-primary" />
                v0.1.0 · local-first
              </div>

              <h1 className="mt-6 max-w-2xl text-[42px] font-bold leading-[1.02] tracking-[-0.04em] sm:text-5xl md:text-[64px]">
                Every model call,
                <br />
                <span className="text-primary">on the record.</span>
              </h1>

              <p className="mt-6 max-w-xl text-[15px] leading-7 text-muted-foreground md:text-base">
                Prompts, tokens, latency, tool calls, costs, and eval scores for
                TypeScript AI apps. Traces land in a local file. No account and
                no hosted dashboard required.
              </p>

              <div className="mt-8 flex flex-col gap-2.5 sm:flex-row">
                <Button asChild size="lg" className="gap-2">
                  <Link to={ctaHref}>
                    {isAuthenticated ? "Open the workbench" : "Start tracing"}
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href="#quickstart">Read the quickstart</a>
                </Button>
              </div>

              <div className="mt-8">
                <InstallCommand />
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Check className="size-3 text-primary" />
                  zero runtime deps
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="size-3 text-primary" />
                  ESM + CJS
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="size-3 text-primary" />
                  OTel-ready
                </span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.12 }}
              className="relative mx-auto w-full max-w-[580px] lg:mx-0"
            >
              <TracePreview />
            </motion.div>
          </div>
        </section>

        <div className="border-b border-border/60">
          <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-border/60 px-4 md:grid-cols-4 md:px-6">
            {[
              ["Zero", "runtime dependencies"],
              ["47", "tests in the package"],
              ["OTLP", "without the OTel SDK"],
              ["MIT", "license, no lock-in"],
            ].map(([value, label]) => (
              <div key={label} className="px-4 py-5 first:pl-0 md:px-7 md:py-6">
                <p className="font-mono text-sm font-medium text-foreground">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <section id="features" className="border-b border-border/60 py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
              <div>
                <SectionLabel index="01">Capture</SectionLabel>
                <h2 className="max-w-md text-3xl font-bold tracking-[-0.03em] md:text-4xl">
                  A trace should tell you what happened, not what an SDK guessed.
                </h2>
                <p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">
                  The inspector records what the provider returned and what your
                  code did around it. Nothing is inferred to fill a gap. If a
                  value is missing, it stays missing.
                </p>
                <div className="mt-7 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  <ShieldCheck className="size-3.5 text-primary" />
                  preview capture, secret redaction, sampling
                </div>
              </div>

              <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
                {features.map((feature, index) => (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.35, delay: index * 0.05 }}
                    className="group bg-card p-5 transition-colors hover:bg-card/70"
                  >
                    <feature.icon className="size-4 text-primary" />
                    <h3 className="mt-4 text-sm font-medium tracking-tight">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                      {feature.body}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="integrations" className="border-b border-border/60 py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
              <div>
                <SectionLabel index="02">Integrations</SectionLabel>
                <h2 className="max-w-lg text-3xl font-bold tracking-[-0.03em] md:text-4xl">
                  Drop it into the loop you already have.
                </h2>
                <p className="mt-5 max-w-lg text-sm leading-7 text-muted-foreground">
                  Adapters are explicit functions, not hidden monkey patches.
                  Wrap the SDK call, keep your types, and decide where the trace
                  goes. Global fetch is never touched.
                </p>

                <div className="mt-7 flex flex-wrap gap-2">
                  {adapters.map((adapter) => (
                    <span
                      key={adapter}
                      className="rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground"
                    >
                      {adapter}
                    </span>
                  ))}
                </div>

                <div className="mt-8 flex items-center gap-3 rounded-md border border-border bg-card/60 px-3.5 py-3 text-xs text-muted-foreground">
                  <Braces className="size-4 shrink-0 text-primary" />
                  <span>
                    Core has no dependencies. Node, OTLP, AI SDK, and OpenAI
                    adapters are separate entry points.
                  </span>
                </div>
              </div>

              <div>
                <div className="mb-3 flex gap-1.5">
                  {(Object.keys(samples) as SampleKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSample(key)}
                      className={cn(
                        "rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors",
                        sample === key
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {samples[key].label}
                    </button>
                  ))}
                </div>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={sample}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                  >
                    <CodeBlock
                      code={samples[sample].code}
                      label={samples[sample].label}
                      file={samples[sample].file}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </section>

        <section id="cli" className="border-b border-border/60 py-20 md:py-28">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 md:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="order-2 lg:order-1">
              <div className="overflow-hidden rounded-lg border border-border bg-[oklch(0.16_0.012_250)]">
                <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                  <span className="size-2 rounded-full bg-border" />
                  <span className="size-2 rounded-full bg-border" />
                  <span className="size-2 rounded-full bg-border" />
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                    ~/apps/support-api
                  </span>
                </div>
                <div className="overflow-x-auto p-4 font-mono text-[10.5px] leading-[1.9] text-foreground/75 md:text-[11px]">
                  <p>
                    <span className="text-primary">$</span> npx @yourname/ai-inspector list
                  </p>
                  <p className="mt-2 text-muted-foreground">
                    ID&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; STARTED&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; NAME&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; DURATION&nbsp; TOKENS&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; COST&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; STATUS
                  </p>
                  <p className="whitespace-nowrap">
                    4f2a1c0b&nbsp; Nov 11 09:14&nbsp; support-agent&nbsp;&nbsp; 1.14s&nbsp;&nbsp;&nbsp;&nbsp; 3.1k / 366&nbsp;&nbsp; $0.00047&nbsp; ok
                  </p>
                  <p className="whitespace-nowrap">
                    91c0d3aa&nbsp; Nov 11 09:10&nbsp; rag-research&nbsp;&nbsp;&nbsp; 1.02s&nbsp;&nbsp;&nbsp;&nbsp; 4.2k / 486&nbsp;&nbsp; $0.02032&nbsp; ok
                  </p>
                  <p className="whitespace-nowrap">
                    c10b8e4f&nbsp; Nov 11 09:02&nbsp; checkout-agent&nbsp; 0.61s&nbsp;&nbsp;&nbsp;&nbsp; 280 / 40&nbsp;&nbsp;&nbsp;&nbsp; $0.00070&nbsp; error
                  </p>
                  <p className="mt-3">
                    <span className="text-primary">$</span> npx @yourname/ai-inspector show last
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    [trace] checkout-agent&nbsp; 610ms&nbsp; error&nbsp; in 280 · out 40
                  </p>
                  <p className="text-muted-foreground">
                    &nbsp;&nbsp; ├─ charge_card&nbsp; [tool]&nbsp; 260ms&nbsp; error
                  </p>
                  <p className="text-destructive">
                    &nbsp;&nbsp; │&nbsp;&nbsp; Payment provider returned 429
                  </p>
                  <p className="text-muted-foreground">
                    &nbsp;&nbsp; └─ checkout.plan&nbsp; [generation]&nbsp; gpt-4o
                  </p>
                  <p className="mt-3 flex items-center gap-2">
                    <span className="inline-block h-3 w-1.5 animate-pulse bg-primary" />
                    <span className="text-muted-foreground">waiting for input</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="order-1 lg:order-2">
              <SectionLabel index="03">Local file</SectionLabel>
              <h2 className="max-w-md text-3xl font-bold tracking-[-0.03em] md:text-4xl">
                A trace viewer you can read without a browser tab.
              </h2>
              <p className="mt-5 max-w-md text-sm leading-7 text-muted-foreground">
                Traces are ordinary JSON lines. Grep them, ship them to a
                collector, or delete them when you are done. The CLI is included
                in the package.
              </p>
              <div className="mt-7 space-y-3">
                {[
                  ["One file", "Everything lands in .ai-inspector/traces.ndjson."],
                  ["No daemon", "Nothing runs in the background or phones home."],
                  ["Your call", "Add OTLP only when a collector makes sense."],
                ].map(([title, body]) => (
                  <div key={title} className="flex gap-3">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <p className="text-[13px] leading-6 text-muted-foreground">
                      <span className="text-foreground">{title}.</span> {body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="quickstart" className="border-b border-border/60 py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="max-w-2xl">
              <SectionLabel index="04">Quickstart</SectionLabel>
              <h2 className="text-3xl font-bold tracking-[-0.03em] md:text-4xl">
                Three steps to your first trace.
              </h2>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">
                Start local. Add a remote exporter later without changing the
                instrumentation calls.
              </p>
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-primary">01</span>
                  <Terminal className="size-4 text-muted-foreground" />
                </div>
                <h3 className="mt-5 text-sm font-medium">Install</h3>
                <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">
                  Add the package. There are no transitive runtime dependencies.
                </p>
                <button
                  type="button"
                  onClick={() => copyText(INSTALL)}
                  className="mt-4 flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 font-mono text-[10.5px] text-foreground/80 hover:border-primary/30"
                >
                  <span className="truncate">{INSTALL}</span>
                  <Copy className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              </div>

              <div className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-primary">02</span>
                  <Waypoints className="size-4 text-muted-foreground" />
                </div>
                <h3 className="mt-5 text-sm font-medium">Instrument one call</h3>
                <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">
                  Wrap a generation with the Node preset. Usage and cost fill in
                  when the provider reports them.
                </p>
                <pre className="mt-4 overflow-hidden rounded-md border border-border bg-background p-3 font-mono text-[10.5px] leading-6 text-foreground/80">
{`const span = trace.generation({
  name: "answer",
  model: "gpt-4o-mini",
});`}
                </pre>
              </div>

              <div className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-primary">03</span>
                  <FileJson className="size-4 text-muted-foreground" />
                </div>
                <h3 className="mt-5 text-sm font-medium">Read the trace</h3>
                <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">
                  Use the CLI, inspect the JSONL file, or open the workbench for
                  a waterfall view.
                </p>
                <button
                  type="button"
                  onClick={() => copyText("npx @yourname/ai-inspector show last")}
                  className="mt-4 flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 font-mono text-[10.5px] text-foreground/80 hover:border-primary/30"
                >
                  <span className="truncate">npx @yourname/ai-inspector show last</span>
                  <Copy className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Check className="size-3 text-primary" /> node 18.17+
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="size-3 text-primary" /> typescript first
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="size-3 text-primary" /> no account
              </span>
            </div>
          </div>
        </section>

        <section className="py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4 md:px-6">
            <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-[oklch(0.18_0.018_250)] px-6 py-12 md:px-12 md:py-16">
              <div className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
              <div className="relative grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
                    Start local
                  </p>
                  <h2 className="mt-3 max-w-xl text-3xl font-bold tracking-[-0.03em] md:text-4xl">
                    Start with a file. Add a collector when you need one.
                  </h2>
                  <p className="mt-4 max-w-lg text-sm leading-7 text-muted-foreground">
                    Instrument one call, look at the trace, keep what is useful.
                    The workbench has sample runs you can inspect without
                    connecting a provider.
                  </p>
                </div>
                <div className="flex flex-col gap-2.5 sm:flex-row lg:justify-end">
                  <Button asChild size="lg" className="gap-2">
                    <Link to={ctaHref}>
                      {isAuthenticated ? "Open workbench" : "Try the workbench"}
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <a href="#quickstart">Read the docs</a>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 md:px-6">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-start">
            <div>
              <Brand />
              <p className="mt-3 max-w-xs text-xs leading-6 text-muted-foreground">
                Local-first traces for TypeScript AI apps. Built as a package,
                not a platform.
              </p>
            </div>
            <div className="flex gap-12 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <div className="space-y-2">
                <p className="text-foreground">Product</p>
                <a className="block hover:text-primary" href="#features">Features</a>
                <a className="block hover:text-primary" href="#integrations">Integrations</a>
                <a className="block hover:text-primary" href="#cli">CLI</a>
              </div>
              <div className="space-y-2">
                <p className="text-foreground">Package</p>
                <a className="block hover:text-primary" href="#quickstart">Quickstart</a>
                <Link className="block hover:text-primary" to={ctaHref}>Workbench</Link>
                <span className="block">MIT license</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-between gap-2 border-t border-border/60 pt-5 font-mono text-[10px] text-muted-foreground/80 sm:flex-row">
            <span>© 2026 AI Inspector contributors</span>
            <span>@yourname/ai-inspector · v0.1.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
