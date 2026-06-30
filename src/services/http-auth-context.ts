import { AsyncLocalStorage } from "node:async_hooks";

export interface HttpAuthContext {
  /** O!task Bearer from client — passthrough mode only */
  passthroughToken: string;
}

const storage = new AsyncLocalStorage<HttpAuthContext>();

export function runWithHttpAuthContext<T>(
  context: HttpAuthContext,
  fn: () => T | Promise<T>,
): Promise<T> {
  return Promise.resolve(storage.run(context, fn));
}

export function getPassthroughToken(): string | undefined {
  return storage.getStore()?.passthroughToken;
}
