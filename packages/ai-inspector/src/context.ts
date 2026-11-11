import type { SpanHandle, TraceHandle } from "./api.js";

export interface ActiveScope {
  trace: TraceHandle;
  span?: SpanHandle;
}

export interface ContextManager {
  run<T>(scope: ActiveScope, fn: () => T): T;
  active(): ActiveScope | undefined;
}

type AsyncLocalStorageLike<T> = {
  run<R>(store: T, fn: () => R): R;
  getStore(): T | undefined;
};

type ProcessWithBuiltins = {
  getBuiltinModule?: (id: string) => unknown;
};

/**
 * Node's AsyncLocalStorage keeps concurrent traces from bleeding into each
 * other. Browsers and runtimes without it get a synchronous stack, which is
 * accurate for synchronous nesting only.
 */
export function detectNodeContext(): ContextManager | undefined {
  const runtime = globalThis as { process?: ProcessWithBuiltins };
  try {
    const getBuiltinModule = runtime.process?.getBuiltinModule;
    if (typeof getBuiltinModule !== "function") return undefined;
    const module = getBuiltinModule.call(runtime.process, "node:async_hooks") as {
      AsyncLocalStorage?: new <T>() => AsyncLocalStorageLike<T>;
    };
    const Storage = module.AsyncLocalStorage;
    if (!Storage) return undefined;
    const storage = new Storage<ActiveScope>();
    return {
      run(scope, fn) {
        return storage.run(scope, fn);
      },
      active() {
        return storage.getStore();
      },
    };
  } catch {
    return undefined;
  }
}

export function createSyncContext(): ContextManager {
  const stack: ActiveScope[] = [];
  return {
    run(scope, fn) {
      stack.push(scope);
      try {
        return fn();
      } finally {
        stack.pop();
      }
    },
    active() {
      return stack[stack.length - 1];
    },
  };
}
