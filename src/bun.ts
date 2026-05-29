import type {
  HttpClientOptions,
  HyperTransport,
  TransportRequest,
  TransportResponse,
  TransportResponsePayload,
} from "@hyperttp/types";
import type { BodyInit } from "bun";

export function fastGetHostname(url: string): string {
  if (!url) return "localhost";
  if (url.charCodeAt(0) === 47) return "localhost";

  let start = url.indexOf("//");
  if (start === -1) {
    start = 0;
  } else {
    start += 2;
  }

  let end = url.indexOf("/", start);
  if (end === -1) end = url.indexOf("?", start);
  if (end === -1) end = url.length;

  const portIdx = url.indexOf(":", start);
  if (portIdx !== -1 && portIdx < end) {
    end = portIdx;
  }

  return url.slice(start, end) || "localhost";
}

export async function fastStreamDump(this: ReadableStream<Uint8Array>) {
  if (this.locked) return;
  try {
    await new Response(this).arrayBuffer();
  } catch {
    //
  }
}

export function getAbortError(signal?: AbortSignal): unknown {
  return (
    signal?.reason ??
    new DOMException("The operation was aborted.", "AbortError")
  );
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal) return;

  if (typeof signal.throwIfAborted === "function") {
    signal.throwIfAborted();
    return;
  }

  if (signal.aborted) {
    throw getAbortError(signal);
  }
}

export function normalizeCookieHeader(
  value: string | string[] | undefined,
): string {
  if (value === undefined) return "";
  return Array.isArray(value) ? value.join("; ") : String(value).trim();
}

export function normalizeHeaderValue(
  name: string,
  value: string | string[],
): string {
  if (Array.isArray(value)) {
    const lower = name.toLowerCase();

    if (lower === "cookie") {
      return value.join("; ");
    }

    return value.join(", ");
  }

  return value;
}

class BunTransportResponse implements TransportResponse {
  private _nativeResponse: Response;
  private _cachedText: string | null = null;
  private _cachedJson: unknown = null;
  private _cachedHeaders: Record<string, string | string[]> | null = null;

  constructor(nativeResponse: Response) {
    this._nativeResponse = nativeResponse;
  }

  get status(): number {
    return this._nativeResponse.status;
  }

  get url(): string {
    return this._nativeResponse.url;
  }

  get body() {
    const body = this._nativeResponse.body as TransportResponsePayload;
    if (body && body.dump === undefined) {
      body.dump = fastStreamDump;
    }
    return body;
  }

  async dump(): Promise<void> {
    const body = this._nativeResponse.body;
    if (body) {
      await fastStreamDump.call(body);
    }
  }

  async text(): Promise<string> {
    if (this._cachedText !== null) return this._cachedText;
    this._cachedText = await this._nativeResponse.text();
    return this._cachedText;
  }

  async json<T = unknown>(): Promise<T> {
    return (
      this._cachedJson ?? (this._cachedJson = await this._nativeResponse.json())
    );
  }

  get headers(): Record<string, string | string[]> {
    if (this._cachedHeaders === null) {
      const rawHeaders = this._nativeResponse.headers;
      this._cachedHeaders =
        rawHeaders.toJSON?.() || Object.fromEntries(rawHeaders.entries());
    }
    return this._cachedHeaders!;
  }
}

export class BunTransport implements HyperTransport {
  public config: HttpClientOptions;

  private cookieJar = new Map<string, Map<string, string>>();
  private cookieCache = new Map<string, string>();

  private activeRequests = 0;
  private concurrencyQueue: (() => void)[] = [];
  private hasCookies = false;

  private _maxConcurrent = 0;
  private _timeout = 0;
  private _userAgent: string | undefined = undefined;
  private _keepalive = false;
  private _tlsConfig!: { rejectUnauthorized: boolean };

  constructor(config: HttpClientOptions) {
    this.config = config;
    this.invalidateConfig();
  }

  private invalidateConfig() {
    const net = this.config.network;
    this._maxConcurrent = net?.maxConcurrent ?? 0;
    this._timeout = net?.timeout ?? 0;
    this._userAgent = net?.userAgent;
    this._keepalive = !!net?.keepAliveTimeout;
    this._tlsConfig = { rejectUnauthorized: net?.rejectUnauthorized ?? true };
  }

  public async execute(req: TransportRequest): Promise<TransportResponse> {
    const maxConcurrent = this._maxConcurrent;

    let signal = req.signal;
    const timeoutMs = this._timeout;

    if (timeoutMs > 0) {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      signal = req.signal
        ? AbortSignal.any([req.signal, timeoutSignal])
        : timeoutSignal;
    }

    throwIfAborted(signal);

    if (maxConcurrent > 0 && this.activeRequests >= maxConcurrent) {
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          signal?.removeEventListener("abort", onAbort);
          reject(getAbortError(signal));
        };

        signal?.addEventListener("abort", onAbort, { once: true });
        this.concurrencyQueue.push(() => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        });
      });
    }

    throwIfAborted(signal);
    this.activeRequests++;

    try {
      const response = await fetch(req.url, {
        method: req.method,
        headers: this.prepareHeaders(req),
        body: req.body as BodyInit | null,
        signal,
        keepalive: this._keepalive,
        redirect: "manual",
        tls: this._tlsConfig,
      });

      if (response.headers.has("set-cookie")) {
        const setCookies = response.headers.getSetCookie();
        if (setCookies?.length) {
          this.updateCookies(fastGetHostname(req.url), setCookies);
        }
      }

      return new BunTransportResponse(response);
    } finally {
      this.activeRequests--;
      if (maxConcurrent > 0) {
        const nextResolver = this.concurrencyQueue.shift();
        if (nextResolver) nextResolver();
      }
    }
  }

  private prepareHeaders(req: TransportRequest): Record<string, string> {
    const original = req.headers as Record<string, string | string[]>;
    const headers: Record<string, string> = {};

    for (const key in original) {
      if (Object.prototype.hasOwnProperty.call(original, key)) {
        headers[key] = normalizeHeaderValue(key, original[key]!);
      }
    }

    const ua = this._userAgent;
    if (ua && !headers["User-Agent"] && !headers["user-agent"]) {
      headers["User-Agent"] = ua;
    }

    const userCookie = normalizeCookieHeader(headers["Cookie"]);
    const hasUserCookie = userCookie.length > 0;

    if (!this.hasCookies) {
      if (hasUserCookie) {
        headers["Cookie"] = userCookie;
      }
      return headers;
    }

    const domain = fastGetHostname(req.url);
    const savedCookies = this.getCookiesForDomain(domain);
    const hasSavedCookies = savedCookies.length > 0;

    if (hasUserCookie && hasSavedCookies) {
      headers["Cookie"] = `${userCookie}; ${savedCookies}`;
    } else if (hasUserCookie) {
      headers["Cookie"] = userCookie;
    } else if (hasSavedCookies) {
      headers["Cookie"] = savedCookies;
    }

    return headers;
  }

  private getCookiesForDomain(requestDomain: string): string {
    if (this.cookieCache.has(requestDomain)) {
      return this.cookieCache.get(requestDomain)!;
    }

    const matchedCookies: string[] = [];
    for (const [storedDomain, cookiesMap] of this.cookieJar) {
      if (
        requestDomain === storedDomain ||
        requestDomain.endsWith("." + storedDomain)
      ) {
        for (const [key, val] of cookiesMap) {
          matchedCookies.push(`${key}=${val}`);
        }
      }
    }

    const result = matchedCookies.length > 0 ? matchedCookies.join("; ") : "";
    this.cookieCache.set(requestDomain, result);
    return result;
  }

  private updateCookies(requestDomain: string, setCookies: string[]): void {
    this.hasCookies = true;
    for (let i = 0; i < setCookies.length; i++) {
      const cookieStr = setCookies[i];
      if (!cookieStr) continue;

      const parts = cookieStr.split(";");

      const rawPair = parts[0];
      if (!rawPair) continue;

      const equalIdx = rawPair.indexOf("=");
      if (equalIdx === -1) continue;

      const key = rawPair.slice(0, equalIdx).trim();
      const val = rawPair.slice(equalIdx + 1).trim();
      if (!key) continue;

      let targetDomain = requestDomain;
      for (let j = 1; j < parts.length; j++) {
        const attr = parts[j];
        if (!attr) continue;

        const trimmedAttr = attr.trim();
        if (trimmedAttr.toLowerCase().startsWith("domain=")) {
          let domVal = trimmedAttr.slice(7).trim();
          if (domVal.startsWith(".")) {
            domVal = domVal.slice(1);
          }
          if (domVal) targetDomain = domVal;
          break;
        }
      }

      let domainMap = this.cookieJar.get(targetDomain);
      if (!domainMap) {
        domainMap = new Map<string, string>();
        this.cookieJar.set(targetDomain, domainMap);
      }

      domainMap.set(key, val);

      if (this.cookieCache.size > 0) {
        for (const cachedDomain of this.cookieCache.keys()) {
          if (
            cachedDomain === targetDomain ||
            cachedDomain.endsWith("." + targetDomain)
          ) {
            this.cookieCache.delete(cachedDomain);
          }
        }
      }
    }
  }

  public async close(): Promise<void> {
    this.concurrencyQueue = [];
    this.cookieJar.clear();
    this.cookieCache.clear();
  }

  public async destroy(): Promise<void> {
    await this.close();
  }
}
