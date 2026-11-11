import type { FunctionReturnType } from "convex/server";

import { api } from "@/convex/_generated/api";

export type TraceSummary = FunctionReturnType<typeof api.traces.list>[number];
