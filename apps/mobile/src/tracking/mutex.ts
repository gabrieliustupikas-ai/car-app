/** Serialises async work: background task invocations can overlap with UI-triggered actions. */
export function createMutex() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(fn: () => Promise<T>): Promise<T> {
    const next = tail.then(fn, fn);
    tail = next.catch(() => undefined);
    return next;
  };
}
