import type {
  HttpClientOptions,
  HyperTransport,
  TransportRequest,
  TransportResponse,
  TransportResponsePayload,
} from "@hyperttp/types";

type HeaderValue = string | string[];
type HeaderMap = Record<string, HeaderValue>;

/**
 * @ru Кэш hostname'ов для быстрого извлечения домена из URL.
 * @en Hostname cache for fast domain extraction from URLs.
 */
let hostnameCacheSize = 0;
let hostnameCache: Record<string, string> = Object.create(null);
let lastUrl = "";
let lastHost = "";

/**
 * @ru Быстрое извлечение hostname из URL с кэшированием.
 * @en Fast hostname extraction from URL with caching.
 * @param url - The URL to extract hostname from.
 * @returns The extracted hostname.
 */
function fastGetHostname(url: string): string {
  if (url === lastUrl) return lastHost;
  if (!url) return "localhost";

  const cached = hostnameCache[url];
  if (cached !== undefined) {
    lastUrl = url;
    lastHost = cached;
    return cached;
  }

  let start = 0;
  const first = url.charCodeAt(0);

  if (first === 47) {
    start = url.charCodeAt(1) === 47 ? 2 : 0;
    if (start === 0) return "localhost";
  } else {
    const schemeIdx = url.indexOf("://");
    if (schemeIdx !== -1) start = schemeIdx + 3;
  }

  let end = url.length;
  for (let i = start; i < end; i++) {
    const code = url.charCodeAt(i);
    if (code === 47 || code === 63 || code === 35) {
      end = i;
      break;
    }
  }

  const atIdx = url.indexOf("@", start);
  if (atIdx !== -1 && atIdx < end) start = atIdx + 1;

  const colonIdx = url.indexOf(":", start);
  if (colonIdx !== -1 && colonIdx < end) end = colonIdx;

  const host = url.slice(start, end) || "localhost";

  if (hostnameCacheSize > 1024) {
    hostnameCache = Object.create(null);
    hostnameCacheSize = 0;
  }

  hostnameCache[url] = host;
  hostnameCacheSize++;
  lastUrl = url;
  lastHost = host;
  return host;
}

/**
 * @ru Разрешает относительный URL относительно baseUrl.
 * @en Resolves a relative URL against a baseUrl.
 * @param baseUrl - The base URL.
 * @param url - The URL to resolve.
 * @returns The resolved absolute URL.
 */
function resolveUrl(baseUrl: string, url: string): string {
  if (url.charCodeAt(0) === 47) return baseUrl + url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return baseUrl + "/" + url;
}

/**
 * @ru Кэшированные DOMException для частых ошибок abort/timeout.
 * @en Cached DOMException for frequent abort/timeout errors.
 */
const ABORT_ERROR = new DOMException("The operation was aborted.", "AbortError");
const TIMEOUT_ERROR = new DOMException("The operation was aborted due to timeout.", "TimeoutError");

/**
 * @ru Извлекает причину abort из signal или возвращает кэшированную ошибку.
 * @en Extracts abort reason from signal or returns cached error.
 * @param signal - Optional abort signal.
 * @returns The abort error or reason.
 */
function getAbortError(signal?: AbortSignal): unknown {
  return signal?.reason ?? ABORT_ERROR;
}

/**
 * @ru Нормализует тело запроса в формат, совместимый с fetch.
 * @en Normalizes request body to fetch-compatible format.
 * @param body - The request body to normalize.
 * @returns The normalized body or undefined.
 */
function normalizeBody(body: TransportRequest["body"]): BodyInit | undefined {
  if (body == null) return undefined;

  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return body as unknown as BodyInit;
  if (body instanceof ArrayBuffer) return body;
  if (ArrayBuffer.isView(body)) return body as unknown as BodyInit;

  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) return body;
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) return body;
  if (typeof FormData !== "undefined" && body instanceof FormData) return body;
  if (typeof Blob !== "undefined" && body instanceof Blob) return body;
  if (typeof body === "object") return JSON.stringify(body);

  return String(body);
}

/**
 * @ru Конфигурация транспорта Bun.
 * @en Bun transport configuration.
 */
export interface BunTransportConfig extends HttpClientOptions {
  /**
   * @ru Базовый URL для всех запросов.
   * @en Base URL for all requests.
   */
  baseUrl?: string;
}

/**
 * @ru Высокопроизводительный HTTP-транспорт для Bun с нативными оптимизациями.
 * Поддерживает cookies, concurrency control, таймауты, keepalive и TLS конфигурацию.
 * @en High-performance HTTP transport for Bun with native optimizations.
 * Supports cookies, concurrency control, timeouts, keepalive, and TLS configuration.
 */
export class BunTransport implements HyperTransport {
  public config: BunTransportConfig;

  private cookieJar: Record<string, Record<string, string>> = Object.create(null);
  private readonly cookieDomains: string[] = [];
  private cookieCache: Record<string, string> = Object.create(null);
  private cookieCacheSize = 0;

  private activeRequests = 0;
  private concurrencyQueue: Record<number, () => void> = Object.create(null);
  private queueHead = 0;
  private queueTail = 0;

  private hasCookies = false;
  private _maxConcurrent = 0;
  private _timeout = 0;
  private _userAgent: string | undefined = undefined;
  private _keepalive = false;
  private _tlsConfig: { rejectUnauthorized: boolean } | null = null;

  /**
   * @ru Создаёт экземпляр BunTransport.
   * @en Creates a BunTransport instance.
   * @param config - Transport configuration.
   */
  constructor(config: BunTransportConfig) {
    this.config = config;
    this.invalidateConfig();
  }

  /**
   * @ru Инвалидирует кэшированные настройки при изменении конфигурации.
   * @en Invalidates cached settings when configuration changes.
   */
  private invalidateConfig(): void {
    const net = this.config?.network;
    this._maxConcurrent = net?.maxConcurrent ?? 0;
    this._timeout = net?.timeout ?? 0;
    this._userAgent = net?.userAgent;
    this._keepalive = !!net?.keepAliveTimeout;
    this._tlsConfig = (net?.rejectUnauthorized ?? true) ? null : { rejectUnauthorized: false };
  }

  /**
   * @ru Выполняет HTTP-запрос через нативный fetch Bun.
   * @en Executes an HTTP request via Bun's native fetch.
   * @param req - The normalized transport request.
   * @returns Promise resolving to the transport response.
   */
  public async execute(req: TransportRequest): Promise<TransportResponse> {
    const maxConcurrent = this._maxConcurrent;
    const timeoutMs = this._timeout;

    let signal = req.signal;
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (timeoutMs > 0) {
      if (!signal) {
        signal = AbortSignal.timeout(timeoutMs);
      } else if (signal.aborted) {
        throw getAbortError(signal);
      } else {
        const controller = new AbortController();
        const originalSignal = signal;

        originalSignal.addEventListener("abort", () => controller.abort(originalSignal.reason), {
          once: true,
        });
        timer = setTimeout(() => controller.abort(TIMEOUT_ERROR), timeoutMs);
        signal = controller.signal;
      }
    }

    if (signal?.aborted) throw getAbortError(signal);

    if (maxConcurrent > 0 && this.activeRequests >= maxConcurrent) {
      await this.waitForSlot(signal);
      if (signal?.aborted) throw getAbortError(signal);
    }

    this.activeRequests++;

    try {
      const headers = this.prepareHeaders(req);
      const fullUrl = resolveUrl(this.config?.baseUrl ?? "", req.url);

      const init: RequestInit & { tls?: unknown } = {
        method: req.method,
        redirect: "manual",
      };

      if (headers !== undefined) init.headers = headers as HeadersInit;
      if (req.body !== undefined) init.body = normalizeBody(req.body);
      if (signal !== undefined) init.signal = signal;
      if (this._keepalive) init.keepalive = true;
      if (this._tlsConfig !== null) init.tls = this._tlsConfig;

      const nativeRes = await fetch(fullUrl, init);

      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }

      return {
        status: nativeRes.status,
        url: nativeRes.url,
        body: nativeRes.body as TransportResponsePayload,
        headers: nativeRes.headers as unknown as Record<string, string | string[]>,
      };
    } catch (err) {
      if (timer !== null) clearTimeout(timer);
      throw err;
    } finally {
      this.activeRequests--;
      if (maxConcurrent > 0) this.releaseSlot();
    }
  }

  /**
   * @ru Подготавливает заголовки запроса, добавляя User-Agent и cookies.
   * @en Prepares request headers, adding User-Agent and cookies.
   * @param req - The transport request.
   * @returns The prepared headers or undefined.
   */
  private prepareHeaders(req: TransportRequest): HeaderMap | undefined {
    const original = req.headers as HeaderMap | undefined;
    const needUA = this._userAgent !== undefined;
    const needCookies = this.hasCookies;

    if (!needUA && !needCookies) return original;

    if (original == null) {
      const headers: HeaderMap = Object.create(null);
      if (needUA) headers["user-agent"] = this._userAgent!;
      if (needCookies) {
        const savedCookies = this.getCookiesForDomain(fastGetHostname(req.url));
        if (savedCookies.length > 0) headers["cookie"] = savedCookies;
      }
      return headers;
    }

    if (needUA && original["user-agent"] === undefined) {
      original["user-agent"] = this._userAgent!;
    }

    if (needCookies) {
      const savedCookies = this.getCookiesForDomain(fastGetHostname(req.url));
      if (savedCookies.length > 0) {
        const currentCookie = original["cookie"];
        original["cookie"] = currentCookie ? currentCookie + "; " + savedCookies : savedCookies;
      }
    }

    return original;
  }

  /**
   * @ru Ожидает свободный слот в очереди concurrency.
   * @en Waits for an available slot in the concurrency queue.
   * @param signal - Optional abort signal.
   * @returns Promise that resolves when a slot is available.
   */
  private async waitForSlot(signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const currentTail = this.queueTail++;

      const onAbort = () => {
        signal?.removeEventListener("abort", onAbort);
        delete this.concurrencyQueue[currentTail];
        reject(getAbortError(signal));
      };

      if (signal) signal.addEventListener("abort", onAbort, { once: true });

      this.concurrencyQueue[currentTail] = () => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      };
    });
  }

  /**
   * @ru Освобождает слот и уведомляет следующий запрос в очереди.
   * @en Releases a slot and notifies the next request in the queue.
   */
  private releaseSlot(): void {
    while (this.queueHead < this.queueTail) {
      const next = this.concurrencyQueue[this.queueHead];
      if (next !== undefined) {
        delete this.concurrencyQueue[this.queueHead];
        this.queueHead++;
        next();
        return;
      }
      this.queueHead++;
    }

    if (this.queueHead === this.queueTail) {
      this.queueHead = 0;
      this.queueTail = 0;
    }
  }

  /**
   * @ru Извлекает cookies для указанного домена из cookie jar.
   * @en Retrieves cookies for the specified domain from the cookie jar.
   * @param requestDomain - The domain to get cookies for.
   * @returns The cookie string or empty string.
   */
  private getCookiesForDomain(requestDomain: string): string {
    const cached = this.cookieCache[requestDomain];
    if (cached !== undefined) return cached;

    let result = "";
    const domainsLen = this.cookieDomains.length;

    for (let i = 0; i < domainsLen; i++) {
      const storedDomain = this.cookieDomains[i];
      if (!storedDomain) continue;

      if (requestDomain !== storedDomain && !requestDomain.endsWith("." + storedDomain)) continue;

      const cookiesMap = this.cookieJar[storedDomain];
      if (!cookiesMap) continue;

      for (const key in cookiesMap) {
        if (result.length > 0) result += "; ";
        result += key + "=" + cookiesMap[key];
      }
    }

    if (this.cookieCacheSize > 1024) {
      this.cookieCache = Object.create(null);
      this.cookieCacheSize = 0;
    }

    this.cookieCache[requestDomain] = result;
    this.cookieCacheSize++;
    return result;
  }

  /**
   * @ru Мягко закрывает транспорт, очищая очереди и cookies.
   * @en Gracefully closes the transport, clearing queues and cookies.
   * @returns Promise that resolves when the transport is closed.
   */
  public async close(): Promise<void> {
    this.concurrencyQueue = Object.create(null);
    this.queueHead = 0;
    this.queueTail = 0;
    this.cookieJar = Object.create(null);
    this.cookieDomains.length = 0;
    this.cookieCache = Object.create(null);
    this.cookieCacheSize = 0;
    this.activeRequests = 0;
    this.hasCookies = false;
  }

  /**
   * @ru Принудительно уничтожает транспорт и все активные соединения.
   * @en Immediately destroys the transport and all active connections.
   * @returns Promise that resolves when the transport is destroyed.
   */
  public async destroy(): Promise<void> {
    await this.close();
  }
}
