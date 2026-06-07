import type {
  HttpClientOptions,
  HyperTransport,
  TransportRequest,
  TransportResponse,
  TransportResponsePayload,
} from "@hyperttp/types";

type BunRequestInit = RequestInit & {
  tls?: {
    rejectUnauthorized: boolean;
  };
};

type BunHeaders = Headers & {
  getSetCookie?: () => string[];
};

const hostnameCache = new Map<string, string>();

async function streamDump(this: ReadableStream): Promise<void> {
  return this.cancel().catch(() => {});
}

function attachDump(
  stream: ReadableStream<Uint8Array>,
): TransportResponsePayload {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (stream as any).dump = streamDump;
  return stream as unknown as TransportResponsePayload;
}

export function fastGetHostname(url: string): string {
  if (!url) return "localhost";

  const cached = hostnameCache.get(url);
  if (cached) return cached;

  let start = 0;

  if (url.charCodeAt(0) === 47) {
    if (url.charCodeAt(1) === 47) {
      start = 2;
    } else {
      hostnameCache.set(url, "localhost");
      return "localhost";
    }
  } else {
    const schemeIdx = url.indexOf("://");
    if (schemeIdx !== -1) {
      start = schemeIdx + 3;
    }
  }

  let end = url.length;

  for (let i = start; i < url.length; i++) {
    const code = url.charCodeAt(i);
    if (code === 47 || code === 63 || code === 35) {
      end = i;
      break;
    }
  }

  const atIdx = url.indexOf("@", start);
  if (atIdx !== -1 && atIdx < end) {
    start = atIdx + 1;
  }

  const colonIdx = url.indexOf(":", start);
  if (colonIdx !== -1 && colonIdx < end) {
    end = colonIdx;
  }

  const host = url.slice(start, end) || "localhost";

  if (hostnameCache.size > 512) {
    hostnameCache.clear();
  }

  hostnameCache.set(url, host);
  return host;
}

export function getAbortError(signal?: AbortSignal): unknown {
  return (
    signal?.reason ??
    new DOMException("The operation was aborted.", "AbortError")
  );
}

export class BunTransport implements HyperTransport {
  public config: HttpClientOptions;

  private readonly cookieJar = new Map<string, Map<string, string>>();
  private readonly cookieCache = new Map<string, string>();

  private activeRequests = 0;
  private readonly concurrencyQueue: Array<() => void> = [];
  private queueHead = 0;

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

  private invalidateConfig(): void {
    const net = this.config.network;
    this._maxConcurrent = net?.maxConcurrent ?? 0;
    this._timeout = net?.timeout ?? 0;
    this._userAgent = net?.userAgent;
    this._keepalive = !!net?.keepAliveTimeout;
    this._tlsConfig = { rejectUnauthorized: net?.rejectUnauthorized ?? true };
  }

  public async execute(req: TransportRequest): Promise<TransportResponse> {
    const maxConcurrent = this._maxConcurrent;
    const timeoutMs = this._timeout;
    let signal = req.signal;

    if (timeoutMs > 0) {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      signal = req.signal
        ? AbortSignal.any([req.signal, timeoutSignal])
        : timeoutSignal;
    }

    if (signal?.aborted) throw getAbortError(signal);

    if (maxConcurrent > 0 && this.activeRequests >= maxConcurrent) {
      await this.waitForSlot(signal);
    }

    if (signal?.aborted) throw getAbortError(signal);

    this.activeRequests++;

    try {
      const init: BunRequestInit = {
        method: req.method,
        headers: this.prepareHeaders(req),
        body: req.body as BodyInit | null,
        signal,
        keepalive: this._keepalive,
        redirect: "manual",
        tls: this._tlsConfig,
      };

      const nativeRes = await fetch(req.url, init);

      if (nativeRes.headers.has("set-cookie")) {
        this.maybeStoreCookies(req.url, nativeRes.headers);
      }

      const body = nativeRes.body ? attachDump(nativeRes.body) : null;

      // ОПТИМИЗАЦИЯ: Высокопроизводительный нативный экспорт без Proxy.
      // Коллбэк внутри `.forEach()` в Bun вызывается напрямую из C++ обертки.
      // На выходе получаем чистый, полностью мутабельный объект со склеенными заголовками.
      const headers: Record<string, string> = {};
      nativeRes.headers.forEach((value, key) => {
        headers[key] = value;
      });

      return {
        status: nativeRes.status,
        headers,
        url: nativeRes.url,
        body,
      };
    } finally {
      this.activeRequests--;

      if (maxConcurrent > 0) {
        this.releaseSlot();
      }
    }
  }

  private async waitForSlot(signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        signal?.removeEventListener("abort", onAbort);
        reject(getAbortError(signal));
      };

      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
      }

      this.concurrencyQueue.push(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    const len = this.concurrencyQueue.length;
    while (this.queueHead < len) {
      const next = this.concurrencyQueue[this.queueHead++];
      if (next) {
        next();
        break;
      }
    }

    if (this.queueHead === len) {
      this.concurrencyQueue.length = 0;
      this.queueHead = 0;
    } else if (this.queueHead > 128) {
      this.concurrencyQueue.splice(0, this.queueHead);
      this.queueHead = 0;
    }
  }

  private prepareHeaders(req: TransportRequest): Record<string, string> {
    const headers: Record<string, string> = {};
    const original = req.headers;

    if (original != null) {
      for (const key in original) {
        const value = original[key];
        if (value == null) continue;

        if (typeof value === "string") {
          headers[key] = value;
        } else {
          headers[key] =
            key.length === 6 && (key === "Cookie" || key === "cookie")
              ? value.join("; ")
              : value.join(", ");
        }
      }
    }

    const ua = this._userAgent;
    if (
      ua !== undefined &&
      headers["User-Agent"] === undefined &&
      headers["user-agent"] === undefined
    ) {
      headers["User-Agent"] = ua;
    }

    if (!this.hasCookies) {
      const userCookie = headers["Cookie"];
      if (userCookie !== undefined) {
        headers["Cookie"] = userCookie.trim();
      }
      return headers;
    }

    const domain = fastGetHostname(req.url);
    const savedCookies = this.getCookiesForDomain(domain);
    const hasSavedCookies = savedCookies.length > 0;

    const userCookie = headers["Cookie"];
    const hasUserCookie = userCookie !== undefined && userCookie.length > 0;

    if (hasUserCookie && hasSavedCookies) {
      headers["Cookie"] = `${userCookie.trim()}; ${savedCookies}`;
    } else if (hasUserCookie) {
      headers["Cookie"] = userCookie.trim();
    } else if (hasSavedCookies) {
      headers["Cookie"] = savedCookies;
    }

    return headers;
  }

  private maybeStoreCookies(requestUrl: string, headers: Headers): void {
    const setCookies = (headers as BunHeaders).getSetCookie?.();
    if (!setCookies || setCookies.length === 0) return;

    this.updateCookies(fastGetHostname(requestUrl), setCookies);
  }

  private getCookiesForDomain(requestDomain: string): string {
    const cached = this.cookieCache.get(requestDomain);
    if (cached !== undefined) return cached;

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

    for (const cookieStr of setCookies) {
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

      for (let i = 1; i < parts.length; i++) {
        const attr = parts[i];
        if (!attr) continue;

        const trimmed = attr.trim();
        if (trimmed.toLowerCase().startsWith("domain=")) {
          let domVal = trimmed.slice(7).trim();
          if (domVal.startsWith(".")) domVal = domVal.slice(1);
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
    }

    if (this.cookieCache.size > 0) {
      this.cookieCache.clear();
    }
  }

  public async close(): Promise<void> {
    this.concurrencyQueue.length = 0;
    this.queueHead = 0;
    this.cookieJar.clear();
    this.cookieCache.clear();
    this.activeRequests = 0;
    this.hasCookies = false;
  }

  public async destroy(): Promise<void> {
    await this.close();
  }
}
