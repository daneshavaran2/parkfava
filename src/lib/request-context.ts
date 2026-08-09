// Request-scoped context propagated via AsyncLocalStorage on the server.
//
// Client-safe by construction: this module never names `node:async_hooks` at
// all. The server entry (src/server.ts) imports it and installs the store on
// startup, so nothing here pulls a Node built-in into the browser bundle.
//
// The previous approach loaded it through a runtime `require` deliberately
// hidden from Vite's static analysis — but the server runs as ESM, where
// `require` does not exist, so the lookup always returned null and every
// caller silently fell back to "no context": getRequestId() returned
// undefined for the whole life of the feature, leaving log envelopes without
// the id they exist to correlate on.

export type RequestContext = { requestId: string };

type ContextStore = {
  run<R>(store: RequestContext, fn: () => R): R;
  getStore(): RequestContext | undefined;
};

let storage: ContextStore | null = null;

/**
 * Installs the AsyncLocalStorage instance backing request context. Called
 * once from the server entry; first call wins, so a re-import can't swap the
 * store out from under in-flight requests.
 */
export function installRequestContextStorage(store: ContextStore): void {
  if (!storage) storage = store;
}

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage ? storage.run(ctx, fn) : fn();
}

export function getRequestId(): string | undefined {
  return storage?.getStore()?.requestId;
}
