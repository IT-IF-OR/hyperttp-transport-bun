import { fastGetHostname, getAbortError, normalizeHeaders, resolveUrl, TIMEOUT_ERROR, } from "./utils/helpers.js";
import { CacheManager } from "hcacher";
/**
 * @ru Статические пресеты браузерных заголовков для маскировки под реальных пользователей.
 * Используются stealth-режимом для обхода fingerprint-защит.
 * @en Static presets of browser headers for masking as real users.
 * Used by stealth mode to bypass fingerprint protections.
 */
const STEALTH_HEADER_PRESETS = {
    chrome: {
        "sec-ch-ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Linux"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        "accept-language": "en-US,en;q=0.9",
    },
    firefox: {
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "accept-language": "en-US,en;q=0.5",
        "upgrade-insecure-requests": "1",
    },
};
/**
 * @ru Пресеты User-Agent, соответствующие TLS-отпечаткам (JA3/JA4).
 * @en User-Agent presets matching the TLS fingerprints (JA3/JA4).
 */
const STEALTH_UA_PRESETS = {
    chrome: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    firefox: "Mozilla/5.0 (X11; Linux; rv:126.0) Gecko/20100101 Firefox/126.0",
    safari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    edge: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
};
/**
 * @ru Возвращает строку шифров TLS для указанного профиля браузера.
 * @en Returns the TLS cipher suite string for the specified browser profile.
 * @param fingerprint - Browser fingerprint profile.
 * @returns Colon-separated cipher suite string, or empty string if not found.
 */
function getCiphersForProfile(fingerprint) {
    if (!fingerprint)
        return "";
    switch (fingerprint) {
        case "chrome":
        case "edge":
            return [
                "TLS_AES_128_GCM_SHA256",
                "TLS_AES_256_GCM_SHA384",
                "TLS_CHACHA20_POLY1305_SHA256",
                "ECDHE-ECDSA-AES128-GCM-SHA256",
                "ECDHE-RSA-AES128-GCM-SHA256",
            ].join(":");
        case "firefox":
            return [
                "TLS_AES_128_GCM_SHA256",
                "TLS_CHACHA20_POLY1305_SHA256",
                "TLS_AES_256_GCM_SHA384",
                "ECDHE-ECDSA-AES128-GCM-SHA256",
                "ECDHE-RSA-AES128-GCM-SHA256",
            ].join(":");
        case "safari":
            return [
                "TLS_AES_256_GCM_SHA384",
                "TLS_CHACHA20_POLY1305_SHA256",
                "TLS_AES_128_GCM_SHA256",
                "ECDHE-ECDSA-AES256-GCM-SHA384",
                "ECDHE-RSA-AES256-GCM-SHA384",
            ].join(":");
        default:
            return "";
    }
}
/**
 * @ru Безопасно применяет стелс-пресеты, отдавая абсолютный приоритет ручным заголовкам.
 * @en Safely applies stealth presets, giving absolute priority to manual headers.
 * @param headers - The headers object to modify.
 * @param stealth - Stealth configuration options.
 * @returns The modified headers object.
 */
function applyStealthHeaders(headers, stealth) {
    if (!stealth || !stealth.fingerprint)
        return headers;
    const presetName = stealth.fingerprint;
    const presetHeaders = STEALTH_HEADER_PRESETS[presetName];
    if (presetHeaders) {
        for (const key in presetHeaders) {
            if (headers[key] === undefined) {
                headers[key] = presetHeaders[key];
            }
        }
    }
    const currentUA = headers["user-agent"];
    if (currentUA === undefined || currentUA === "hyperttp/2.0" || currentUA === "Hyperttp/2.0") {
        const browserUA = STEALTH_UA_PRESETS[presetName];
        if (browserUA) {
            headers["user-agent"] = browserUA;
        }
    }
    return headers;
}
/**
 * @ru Высокопроизводительный HTTP-транспорт для Bun с нативными оптимизациями и поддержкой Stealth-мимикрии.
 * Включает управление параллелизмом, cookie jar и кэширование доменов.
 * @en High-performance HTTP transport for Bun with native optimizations and Stealth mimicry support.
 * Includes concurrency management, cookie jar, and domain caching.
 */
export class BunTransport {
    /**
     * @ru Конфигурация транспорта.
     * @en Transport configuration.
     */
    config;
    /**
     * @ru Кэш cookies по доменам с TTL и LRU-эвикцией (domain -> name -> value).
     * @en Cookie cache by domain with TTL and LRU eviction (domain -> name -> value).
     */
    cookieStore;
    /**
     * @ru Кэш сгенерированных строк cookies с TTL.
     * @en Cache of generated cookie strings with TTL.
     */
    cookieStringCache;
    /**
     * @ru Опциональный кэш HTTP-ответов для GET/HEAD запросов.
     * @en Optional HTTP response cache for GET/HEAD requests.
     */
    responseCache;
    /**
     * @ru Счётчик активных (выполняющихся) запросов.
     * @en Counter of active (in-flight) requests.
     */
    activeRequests = 0;
    /**
     * @ru Очередь запросов, ожидающих свободного слота при достижении лимита параллелизма.
     * @en Queue of requests waiting for a free slot when concurrency limit is reached.
     */
    concurrencyQueue = Object.create(null);
    /**
     * @ru Индекс начала очереди (для FIFO обработки).
     * @en Queue head index (for FIFO processing).
     */
    queueHead = 0;
    /**
     * @ru Индекс конца очереди (для добавления новых элементов).
     * @en Queue tail index (for adding new elements).
     */
    queueTail = 0;
    /**
     * @ru Максимальное количество одновременных запросов (0 = без лимита).
     * @en Maximum number of concurrent requests (0 = unlimited).
     */
    _maxConcurrent = 0;
    /**
     * @ru Таймаут запроса в миллисекундах (0 = без таймаута).
     * @en Request timeout in milliseconds (0 = no timeout).
     */
    _timeout = 0;
    /**
     * @ru Флаг использования keep-alive соединений.
     * @en Flag for using keep-alive connections.
     */
    _keepalive = false;
    /**
     * @ru Конфигурация TLS (отклонение невалидных сертификатов и шифры).
     * @en TLS configuration (reject unauthorized certificates and ciphers).
     */
    _tlsConfig = null;
    /**
     * @ru Создаёт экземпляр BunTransport.
     * @en Creates a BunTransport instance.
     * @param config - Transport configuration.
     */
    constructor(config) {
        this.config = config;
        const cookieCfg = config?.network?.cookieCache;
        this.cookieStore = new CacheManager({
            enabled: cookieCfg?.enabled ?? true,
            maxSize: cookieCfg?.maxSize ?? 256,
            ttl: cookieCfg?.ttl ?? 300_000,
            touchOnGet: true,
        });
        this.cookieStringCache = new CacheManager({
            enabled: cookieCfg?.enabled ?? true,
            maxSize: cookieCfg?.maxSize ?? 1024,
            ttl: cookieCfg?.ttl ?? 60_000,
            touchOnGet: true,
        });
        const cacheCfg = config?.network?.cache;
        if (cacheCfg?.enabled !== false && (cacheCfg?.maxSize || cacheCfg?.ttl)) {
            this.responseCache = new CacheManager({
                enabled: cacheCfg?.enabled ?? true,
                maxSize: cacheCfg?.maxSize ?? 256,
                ttl: cacheCfg?.ttl ?? 30_000,
                touchOnGet: true,
            });
        }
        this.invalidateConfig();
    }
    /**
     * @ru Обновляет внутреннее состояние на основе конфигурации.
     * Вызывается при создании и может быть вызвано при изменении конфига.
     * @en Updates internal state based on configuration.
     * Called on creation and can be called when config changes.
     */
    invalidateConfig() {
        const net = this.config?.network;
        this._maxConcurrent = net?.maxConcurrent ?? 0;
        this._timeout = net?.timeout ?? 0;
        this._keepalive = !!net?.keepAliveTimeout;
        this._tlsConfig = (net?.rejectUnauthorized ?? true) ? null : { rejectUnauthorized: false };
    }
    /**
     * @ru Выполняет HTTP-запрос через нативный fetch Bun с управлением параллелизмом и таймаутами.
     * @en Executes an HTTP request via Bun's native fetch with concurrency management and timeouts.
     * @param req - The normalized transport request.
     * @returns Promise resolving to the transport response.
     * @throws Error if the request is aborted or times out.
     */
    async execute(req) {
        const maxConcurrent = this._maxConcurrent;
        const timeoutMs = this._timeout;
        let signal = req.signal;
        let timer = null;
        let abortHandler = null;
        let originalSignal = null;
        if (timeoutMs > 0) {
            if (!signal) {
                signal = AbortSignal.timeout(timeoutMs);
            }
            else if (signal.aborted) {
                throw getAbortError(signal);
            }
            else {
                const controller = new AbortController();
                originalSignal = signal;
                abortHandler = () => controller.abort(originalSignal.reason);
                originalSignal.addEventListener("abort", abortHandler);
                timer = setTimeout(() => controller.abort(TIMEOUT_ERROR), timeoutMs);
                signal = controller.signal;
            }
        }
        if (signal?.aborted) {
            if (timer !== null)
                clearTimeout(timer);
            if (originalSignal && abortHandler)
                originalSignal.removeEventListener("abort", abortHandler);
            throw getAbortError(signal);
        }
        if (maxConcurrent > 0 && this.activeRequests >= maxConcurrent) {
            try {
                await this.waitForSlot(signal);
            }
            catch (err) {
                if (timer !== null)
                    clearTimeout(timer);
                if (originalSignal && abortHandler)
                    originalSignal.removeEventListener("abort", abortHandler);
                throw err;
            }
            if (signal?.aborted) {
                if (timer !== null)
                    clearTimeout(timer);
                if (originalSignal && abortHandler)
                    originalSignal.removeEventListener("abort", abortHandler);
                throw getAbortError(signal);
            }
        }
        this.activeRequests++;
        try {
            const fullUrl = resolveUrl(this.config?.baseUrl ?? "", req.url);
            if (this.responseCache && (req.method === "GET" || req.method === "HEAD") && !req.body) {
                const cacheKey = `${req.method}:${fullUrl}`;
                const cached = this.responseCache.get(cacheKey);
                if (cached !== undefined) {
                    return cached;
                }
            }
            let headers = normalizeHeaders(req.headers);
            const requestDomain = fastGetHostname(fullUrl);
            const activeCookies = this.getCookiesForDomain(requestDomain);
            if (activeCookies.length > 0) {
                headers["cookie"] = headers["cookie"]
                    ? headers["cookie"] + "; " + activeCookies
                    : activeCookies;
            }
            const stealth = req.stealth || this.config.stealth ? { ...this.config.stealth, ...req.stealth } : undefined;
            if (stealth) {
                headers = applyStealthHeaders(headers, stealth);
            }
            const init = {
                method: req.method,
                redirect: req.redirect ?? "manual",
                headers: headers,
            };
            if (req.body !== undefined)
                init.body = req.body;
            if (signal !== undefined)
                init.signal = signal;
            if (this._keepalive)
                init.keepalive = true;
            let requestTlsConfig = this._tlsConfig;
            if (stealth?.ciphers || stealth?.fingerprint) {
                const ciphers = stealth.ciphers ?? getCiphersForProfile(stealth.fingerprint);
                if (ciphers) {
                    requestTlsConfig = requestTlsConfig
                        ? { ...requestTlsConfig, ciphers }
                        : { rejectUnauthorized: true, ciphers };
                }
            }
            if (requestTlsConfig !== null)
                init.tls = requestTlsConfig;
            const nativeRes = await fetch(fullUrl, init);
            this.storeCookies(fullUrl, nativeRes.headers);
            const bodyStream = nativeRes.body;
            const responseHeaders = (() => {
                const resH = Object.create(null);
                nativeRes.headers.forEach((value, key) => {
                    resH[key.toLowerCase()] = value;
                });
                return resH;
            })();
            const response = {
                status: nativeRes.status,
                url: nativeRes.url,
                body: bodyStream,
                headers: responseHeaders,
            };
            if (this.responseCache && (req.method === "GET" || req.method === "HEAD") && !req.body) {
                const cacheKey = `${req.method}:${fullUrl}`;
                this.responseCache.set(cacheKey, response);
            }
            return response;
        }
        finally {
            if (timer !== null) {
                clearTimeout(timer);
            }
            if (originalSignal && abortHandler) {
                originalSignal.removeEventListener("abort", abortHandler);
            }
            this.activeRequests--;
            if (maxConcurrent > 0)
                this.releaseSlot();
        }
    }
    /**
     * @ru Получает строку cookies для указанного домена с учётом родительских доменов.
     * @en Gets the cookie string for the specified domain, considering parent domains.
     * @param requestDomain - The domain to get cookies for.
     * @returns Semicolon-separated cookie string.
     */
    getCookiesForDomain(requestDomain) {
        const cached = this.cookieStringCache.get(requestDomain);
        if (cached !== undefined)
            return cached;
        let result = "";
        const domains = this.cookieStore.size > 0 ? this.getAllCookieDomains() : [];
        for (let i = 0; i < domains.length; i++) {
            const storedDomain = domains[i];
            if (requestDomain !== storedDomain && !requestDomain.endsWith("." + storedDomain))
                continue;
            const cookiesMap = this.cookieStore.get(storedDomain);
            if (!cookiesMap)
                continue;
            for (const key in cookiesMap) {
                if (result.length > 0)
                    result += "; ";
                result += key + "=" + cookiesMap[key];
            }
        }
        this.cookieStringCache.set(requestDomain, result);
        return result;
    }
    /**
     * @ru Возвращает все домены из cookie store.
     * @en Returns all domains from the cookie store.
     */
    getAllCookieDomains() {
        const domains = [];
        const store = this.cookieStore.storage;
        for (const key of store.keys()) {
            domains.push(key);
        }
        return domains;
    }
    /**
     * @ru Сохраняет cookies из заголовков Set-Cookie ответа в cookie jar.
     * @en Stores cookies from response Set-Cookie headers into the cookie jar.
     * @param requestUrl - The request URL for determining the default domain.
     * @param headers - Response headers containing Set-Cookie values.
     */
    storeCookies(requestUrl, headers) {
        if (typeof headers.getSetCookie !== "function")
            return;
        const setCookies = headers.getSetCookie();
        if (setCookies.length === 0)
            return;
        const defaultDomain = fastGetHostname(requestUrl);
        for (let i = 0; i < setCookies.length; i++) {
            const rawCookie = setCookies[i];
            if (!rawCookie)
                continue;
            const firstSemicolon = rawCookie.indexOf(";");
            const mainPair = firstSemicolon === -1 ? rawCookie : rawCookie.slice(0, firstSemicolon);
            const eqIdx = mainPair.indexOf("=");
            if (eqIdx === -1)
                continue;
            const name = mainPair.slice(0, eqIdx).trim();
            const value = mainPair.slice(eqIdx + 1).trim();
            if (!name)
                continue;
            let domain = defaultDomain;
            if (firstSemicolon !== -1) {
                const parts = rawCookie.split(";");
                for (let j = 1; j < parts.length; j++) {
                    const part = parts[j].trim();
                    if (part.length > 7 && part.toLowerCase().startsWith("domain=")) {
                        const rawDomain = part.slice(7).trim();
                        if (rawDomain) {
                            domain = rawDomain.charCodeAt(0) === 46 ? rawDomain.slice(1) : rawDomain;
                        }
                        break;
                    }
                }
            }
            const existing = this.cookieStore.get(domain) ?? Object.create(null);
            existing[name] = value;
            this.cookieStore.set(domain, existing);
            this.cookieStringCache.delete(domain);
        }
    }
    /**
     * @ru Ожидает освобождения слота в очереди параллелизма.
     * @en Waits for a slot to become available in the concurrency queue.
     * @param signal - Optional abort signal to cancel waiting.
     * @returns Promise that resolves when a slot is available.
     * @throws Error if the signal is aborted while waiting.
     */
    async waitForSlot(signal) {
        return new Promise((resolve, reject) => {
            const currentTail = this.queueTail++;
            const onAbort = () => {
                signal?.removeEventListener("abort", onAbort);
                delete this.concurrencyQueue[currentTail];
                reject(getAbortError(signal));
            };
            if (signal)
                signal.addEventListener("abort", onAbort, { once: true });
            this.concurrencyQueue[currentTail] = () => {
                signal?.removeEventListener("abort", onAbort);
                resolve();
            };
        });
    }
    /**
     * @ru Освобождает слот и разблокирует следующий запрос в очереди.
     * @en Releases a slot and unblocks the next request in the queue.
     */
    releaseSlot() {
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
     * @ru Мягко закрывает транспорт, очищая очереди и cookie jar.
     * @en Gracefully closes the transport, clearing queues and cookie jar.
     * @returns Promise that resolves when cleanup is complete.
     */
    async close() {
        this.concurrencyQueue = Object.create(null);
        this.queueHead = 0;
        this.queueTail = 0;
        this.cookieStore.clear();
        this.cookieStringCache.clear();
        this.responseCache?.clear();
        this.activeRequests = 0;
    }
    /**
     * @ru Принудительно уничтожает транспорт (алиас для close()).
     * @en Forcefully destroys the transport (alias for close()).
     * @returns Promise that resolves when cleanup is complete.
     */
    async destroy() {
        await this.close();
    }
}
//# sourceMappingURL=bun.js.map