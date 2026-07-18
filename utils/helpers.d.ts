import type { TransportRequest } from "@hyperttp/types";
/**
 * @ru Быстрое извлечение hostname из URL с кэшированием.
 * @en Fast hostname extraction from URL with caching.
 * @param url - The URL to extract hostname from.
 * @returns The extracted hostname.
 */
export declare function fastGetHostname(url: string): string;
/**
 * @ru Разрешает относительный URL относительно baseUrl.
 * @en Resolves a relative URL against a baseUrl.
 * @param baseUrl - The base URL.
 * @param url - The URL to resolve.
 * @returns The resolved absolute URL.
 */
export declare function resolveUrl(baseUrl: string, url: string): string;
/**
 * @ru Кэшированные DOMException для частых ошибок abort/timeout.
 * @en Cached DOMException for frequent abort/timeout errors.
 */
export declare const ABORT_ERROR: DOMException;
export declare const TIMEOUT_ERROR: DOMException;
/**
 * @ru Извлекает причину abort из signal или возвращает кэшированную ошибку.
 * @en Extracts abort reason from signal or returns cached error.
 * @param signal - Optional abort signal.
 * @returns The abort error or reason.
 */
export declare function getAbortError(signal?: AbortSignal): unknown;
/**
 * @ru Нормализует заголовки, переводя все ключи в нижний регистр (lowercase).
 * @en Normalizes headers by transforming all keys into lowercase layout.
 */
export declare function normalizeHeaders(headers: TransportRequest["headers"]): Record<string, string>;
//# sourceMappingURL=helpers.d.ts.map