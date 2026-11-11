import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";

const MAX_TRACES_PER_USER = 40;
const MAX_DATA_LENGTH = 800_000;

interface StoredTrace {
  name?: unknown;
  status?: unknown;
  startedAt?: unknown;
  durationMs?: unknown;
  spans?: unknown;
  usage?: { inputTokens?: unknown; outputTokens?: unknown };
  cost?: { totalUsd?: unknown };
}

function summarize(trace: {
  _id: Id<"traces">;
  name: string;
  scenario: string;
  status: "ok" | "error" | "running";
  startedAt: number;
  durationMs: number;
  spanCount: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}) {
  return {
    id: trace._id,
    name: trace.name,
    scenario: trace.scenario,
    status: trace.status,
    startedAt: trace.startedAt,
    durationMs: trace.durationMs,
    spanCount: trace.spanCount,
    inputTokens: trace.inputTokens,
    outputTokens: trace.outputTokens,
    costUsd: trace.costUsd,
  };
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

export const list = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const limit = Math.min(100, Math.max(1, Math.floor(args.limit ?? 50)));
    const traces = await ctx.db
      .query("traces")
      .withIndex("by_user_started", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);
    return traces.map(summarize);
  },
});

export const get = query({
  args: { id: v.id("traces") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const trace = await ctx.db.get(args.id);
    if (!trace || trace.userId !== userId) return null;
    return { ...summarize(trace), data: trace.data };
  },
});

export const save = mutation({
  args: {
    scenario: v.string(),
    data: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Sign in to save traces.");
    }
    if (args.data.length > MAX_DATA_LENGTH) {
      throw new Error("This trace is too large to save.");
    }

    let parsed: StoredTrace;
    try {
      const value: unknown = JSON.parse(args.data);
      if (!value || typeof value !== "object") throw new Error("invalid");
      parsed = value as StoredTrace;
    } catch {
      throw new Error("Trace data is not valid JSON.");
    }
    if (typeof parsed.name !== "string" || !Array.isArray(parsed.spans)) {
      throw new Error("Trace data is missing required fields.");
    }
    if (typeof parsed.startedAt !== "number" || !Number.isFinite(parsed.startedAt)) {
      throw new Error("Trace data is missing a start time.");
    }

    const status = parsed.status === "error" ? "error" : "ok";
    const id = await ctx.db.insert("traces", {
      userId,
      name: parsed.name.slice(0, 200),
      scenario: args.scenario.slice(0, 100),
      status,
      startedAt: parsed.startedAt,
      durationMs: finiteNumber(parsed.durationMs),
      spanCount: parsed.spans.length,
      inputTokens: finiteNumber(parsed.usage?.inputTokens),
      outputTokens: finiteNumber(parsed.usage?.outputTokens),
      costUsd: finiteNumber(parsed.cost?.totalUsd),
      data: args.data,
    });

    const existing = await ctx.db
      .query("traces")
      .withIndex("by_user_started", (q) => q.eq("userId", userId))
      .order("asc")
      .take(MAX_TRACES_PER_USER + 1);
    for (const extra of existing.slice(0, Math.max(0, existing.length - MAX_TRACES_PER_USER))) {
      await ctx.db.delete(extra._id);
    }

    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("traces") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to remove traces.");
    const trace = await ctx.db.get(args.id);
    if (!trace) return;
    if (trace.userId !== userId) throw new Error("Trace not found.");
    await ctx.db.delete(args.id);
  },
});

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Sign in to clear traces.");
    const traces = await ctx.db
      .query("traces")
      .withIndex("by_user_started", (q) => q.eq("userId", userId))
      .take(MAX_TRACES_PER_USER + 1);
    for (const trace of traces) {
      await ctx.db.delete(trace._id);
    }
  },
});
