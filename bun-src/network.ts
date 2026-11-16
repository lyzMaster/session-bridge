import { BridgeError, LIMIT, need, VERSION } from "./common.ts";

export type HTTPResult = { status: number; headers: Headers; data: Buffer };
export type HTTPPolicy = { attempts?: number; idleMs?: number; headerMs?: number; totalMs?: number; sleep?: (ms: number) => Promise<void>;
  onProgress?: (event: { received_bytes: number; elapsed_ms: number }) => void };
export type HTTP = (url: string, options?: RequestInit, limit?: number, policy?: HTTPPolicy) => Promise<HTTPResult>;
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const transient = new Set([408, 425, 429, 500, 502, 503, 504]);

export const httpOnce: HTTP = async (url, options = {}, limit = LIMIT.meta, policy = {}) => {
  const controller = new AbortController(); let reason = "", idle: ReturnType<typeof setTimeout> | undefined, lastProgress = Date.now(); const started = Date.now();
  const idleMs = policy.idleMs ?? 45000;
  // An active transfer is not idle. Keep an independent, size-aware upper bound as well.
  const totalMs = policy.totalMs ?? Math.min(30 * 60_000, Math.max(120_000, Math.ceil(limit / 4096) * 1000 + 60_000));
  const abort = (code: string) => { reason = code; controller.abort(); };
  const total = setTimeout(() => abort("TRANSFER_TIMEOUT"), totalMs);
  const headers = setTimeout(() => abort("HEADER_TIMEOUT"), policy.headerMs ?? (options.method && options.method !== "GET" ? totalMs : 30000));
  const external = () => abort("CANCELLED"); options.signal?.addEventListener("abort", external, { once: true });
  if (options.signal?.aborted) external();
  let response: Response | undefined;
  try {
    response = await fetch(url, { ...options, redirect: "manual", signal: controller.signal,
      headers: { "User-Agent": "session-bridge/" + VERSION, "Accept-Encoding": "identity", ...Object.fromEntries(new Headers(options.headers)) } });
    clearTimeout(headers);
    const encoding = response.headers.get("content-encoding");
    need(!new Headers(options.headers).has("range") || !encoding || encoding === "identity", "RANGE_UNSUPPORTED", "The relay transformed a byte-range response; use its verified full-object path.");
    const length = Number(response.headers.get("content-length"));
    need(!Number.isFinite(length) || length <= limit, "LIMIT", "HTTP response exceeds byte limit.");
    const parts: Uint8Array[] = []; let size = 0;
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        idle = setTimeout(() => abort("IDLE_TIMEOUT"), idleMs);
        const part = await reader.read(); clearTimeout(idle);
        if (part.done) break;
        size += part.value.length; need(size <= limit, "LIMIT", "HTTP response exceeds byte limit."); parts.push(part.value);
        if (Date.now() - lastProgress >= 1000) { policy.onProgress?.({ received_bytes: size, elapsed_ms: Date.now() - started }); lastProgress = Date.now(); }
      }
    }
    return { status: response.status, headers: response.headers, data: Buffer.concat(parts, size) };
  } catch (error: any) {
    controller.abort();
    if (error instanceof BridgeError) throw error;
    if (reason) throw new BridgeError(reason, reason === "CANCELLED" ? "Transfer cancelled; completed parts are retained." : "Transfer stopped after its idle, header or size-aware deadline; completed parts are retained.");
    if (/CERT|TLS|SSL/.test(String(error?.code || ""))) throw new BridgeError("TLS", "Relay TLS verification failed.");
    throw new BridgeError("NETWORK", "Relay connection or response was interrupted.");
  } finally {
    clearTimeout(total); clearTimeout(headers); clearTimeout(idle); options.signal?.removeEventListener("abort", external);
  }
};

export function withRetries(request: HTTP, defaults: HTTPPolicy = {}): HTTP {
  return async (url, options = {}, limit = LIMIT.meta, override = {}) => {
    const policy = { ...defaults, ...override }, attempts = policy.attempts ?? 4;
    need(Number.isSafeInteger(attempts) && attempts >= 1 && attempts <= 6, "ARGUMENT", "Retry attempts must be between 1 and 6.");
    for (let attempt = 0; attempt < attempts; attempt++) {
      let delay = Math.min(8000, 400 * 2 ** attempt);
      try {
        const response = await request(url, options, limit, policy);
        if (!transient.has(response.status) || attempt + 1 === attempts) return response;
        const retry = response.headers.get("retry-after");
        if (retry) {
          const wait = /^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
          if (wait > 30_000) throw new BridgeError("RETRY_LATER", "The relay requested a longer backoff; retry later with the same output/cache directory.");
          if (Number.isFinite(wait)) delay = Math.max(delay, wait);
        }
      } catch (error) {
        if (!(error instanceof BridgeError) || !["NETWORK", "IDLE_TIMEOUT", "HEADER_TIMEOUT", "TRANSFER_TIMEOUT"].includes(error.code) || attempt + 1 === attempts) throw error;
      }
      await (policy.sleep || pause)(delay);
    }
    throw new BridgeError("NETWORK", "Retry budget exhausted.");
  };
}
export const http = withRetries(httpOnce);
