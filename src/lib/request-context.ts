// Request-scoped context propagated via AsyncLocalStorage on the server.
// Client-safe: `node:async_hooks` is loaded via a runtime `require` that Vite
// does not statically analyze, so the browser bundle never touches it.

type AsyncLocalStorageCtor = new <T>() => {
  run<R>(store: T, fn: () => R): R;
  getStore(): T | undefined;
};

export type RequestContext = { requestId: string };

let storage:
  | { run<R>(store: RequestContext, fn: () => R): R; getStore(): RequestContext | undefined }
  | null = null;
let attempted = false;

function getStorage() {
  if (typeof window !== "undefined") return null;
  if (storage || attempted) return storage;
  attempted = true;
  try {
    const req = (0, eval)("typeof require === 'function' ? require : null") as
      | ((m: string) => { AsyncLocalStorage: AsyncLocalStorageCtor })
      | null;
    if (req) {
      const mod = req(["node", "async_hooks"].join(":"));
      storage = new mod.AsyncLocalStorage<RequestContext>();
    }
  } catch {
    storage = null;
  }
  return storage;
}

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  const s = getStorage();
  return s ? s.run(ctx, fn) : fn();
}

export function getRequestId(): string | undefined {
  return getStorage()?.getStore()?.requestId;
}
