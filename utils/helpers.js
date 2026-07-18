/**
 * @ru Кэш hostname'ов для быстрого извлечения домена из URL.
 * @en Hostname cache for fast domain extraction from URLs.
 */
let hostnameCacheSize = 0;
let hostnameCache = Object.create(null);
let lastUrl = "";
let lastHost = "";
/**
 * @ru Быстрое извлечение hostname из URL с кэшированием.
 * @en Fast hostname extraction from URL with caching.
 * @param url - The URL to extract hostname from.
 * @returns The extracted hostname.
 */
export function fastGetHostname(url) {
    if (url === lastUrl)
        return lastHost;
    if (!url)
        return "localhost";
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
        if (start === 0)
            return "localhost";
    }
    else {
        const schemeIdx = url.indexOf("://");
        if (schemeIdx !== -1)
            start = schemeIdx + 3;
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
    if (atIdx !== -1 && atIdx < end)
        start = atIdx + 1;
    const colonIdx = url.indexOf(":", start);
    if (colonIdx !== -1 && colonIdx < end)
        end = colonIdx;
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
export function resolveUrl(baseUrl, url) {
    if (url.charCodeAt(0) === 47)
        return baseUrl + url;
    if (url.startsWith("http://") || url.startsWith("https://"))
        return url;
    return baseUrl + "/" + url;
}
/**
 * @ru Кэшированные DOMException для частых ошибок abort/timeout.
 * @en Cached DOMException for frequent abort/timeout errors.
 */
export const ABORT_ERROR = new DOMException("The operation was aborted.", "AbortError");
export const TIMEOUT_ERROR = new DOMException("The operation was aborted due to timeout.", "TimeoutError");
/**
 * @ru Извлекает причину abort из signal или возвращает кэшированную ошибку.
 * @en Extracts abort reason from signal or returns cached error.
 * @param signal - Optional abort signal.
 * @returns The abort error or reason.
 */
export function getAbortError(signal) {
    return signal?.reason ?? ABORT_ERROR;
}
/**
 * @ru Нормализует заголовки, переводя все ключи в нижний регистр (lowercase).
 * @en Normalizes headers by transforming all keys into lowercase layout.
 */
export function normalizeHeaders(headers) {
    if (!headers)
        return Object.create(null);
    const out = Object.create(null);
    if (headers instanceof Headers) {
        headers.forEach((value, key) => {
            out[key.toLowerCase()] = value;
        });
        return out;
    }
    if (Array.isArray(headers)) {
        for (let i = 0; i < headers.length; i++) {
            const pair = headers[i];
            if (!pair)
                continue;
            out[pair[0].toLowerCase()] = pair[1];
        }
        return out;
    }
    const src = headers;
    for (const key in src) {
        const value = src[key];
        if (value == null)
            continue;
        const lowerKey = key.toLowerCase();
        if (Array.isArray(value)) {
            out[lowerKey] = lowerKey === "cookie" ? value.join("; ") : value.join(", ");
            continue;
        }
        out[lowerKey] = String(value);
    }
    return out;
}
//# sourceMappingURL=helpers.js.map