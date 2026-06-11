import type { HttpClientOptions, HyperTransport, TransportRequest, TransportResponse } from "@hyperttp/types";
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
export declare class BunTransport implements HyperTransport {
    config: BunTransportConfig;
    private cookieJar;
    private readonly cookieDomains;
    private cookieCache;
    private cookieCacheSize;
    private activeRequests;
    private concurrencyQueue;
    private queueHead;
    private queueTail;
    private hasCookies;
    private _maxConcurrent;
    private _timeout;
    private _userAgent;
    private _keepalive;
    private _tlsConfig;
    /**
     * @ru Создаёт экземпляр BunTransport.
     * @en Creates a BunTransport instance.
     * @param config - Transport configuration.
     */
    constructor(config: BunTransportConfig);
    /**
     * @ru Инвалидирует кэшированные настройки при изменении конфигурации.
     * @en Invalidates cached settings when configuration changes.
     */
    private invalidateConfig;
    /**
     * @ru Выполняет HTTP-запрос через нативный fetch Bun.
     * @en Executes an HTTP request via Bun's native fetch.
     * @param req - The normalized transport request.
     * @returns Promise resolving to the transport response.
     */
    execute(req: TransportRequest): Promise<TransportResponse>;
    /**
     * @ru Подготавливает заголовки запроса, добавляя User-Agent и cookies.
     * @en Prepares request headers, adding User-Agent and cookies.
     * @param req - The transport request.
     * @returns The prepared headers or undefined.
     */
    private prepareHeaders;
    /**
     * @ru Ожидает свободный слот в очереди concurrency.
     * @en Waits for an available slot in the concurrency queue.
     * @param signal - Optional abort signal.
     * @returns Promise that resolves when a slot is available.
     */
    private waitForSlot;
    /**
     * @ru Освобождает слот и уведомляет следующий запрос в очереди.
     * @en Releases a slot and notifies the next request in the queue.
     */
    private releaseSlot;
    /**
     * @ru Извлекает cookies для указанного домена из cookie jar.
     * @en Retrieves cookies for the specified domain from the cookie jar.
     * @param requestDomain - The domain to get cookies for.
     * @returns The cookie string or empty string.
     */
    private getCookiesForDomain;
    /**
     * @ru Мягко закрывает транспорт, очищая очереди и cookies.
     * @en Gracefully closes the transport, clearing queues and cookies.
     * @returns Promise that resolves when the transport is closed.
     */
    close(): Promise<void>;
    /**
     * @ru Принудительно уничтожает транспорт и все активные соединения.
     * @en Immediately destroys the transport and all active connections.
     * @returns Promise that resolves when the transport is destroyed.
     */
    destroy(): Promise<void>;
}
//# sourceMappingURL=bun.d.ts.map