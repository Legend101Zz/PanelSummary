/**
 * Records every outbound HTTP host the worker process calls. The acceptance
 * check reads this to prove that only the MiniMax API was contacted (and so
 * that no image-generation endpoint was ever called).
 */
const counts = new Map<string, number>();
let installed = false;

export function installEgressRecorder(): void {
  if (installed) return;
  installed = true;
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const parsed = new URL(url);
      const key = `${parsed.host}${parsed.pathname}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    } catch {
      counts.set("<unparsed>", (counts.get("<unparsed>") ?? 0) + 1);
    }
    return original(input, init);
  }) as typeof fetch;
}

export function egressSnapshot(): Record<string, number> {
  return Object.fromEntries([...counts.entries()].sort());
}
