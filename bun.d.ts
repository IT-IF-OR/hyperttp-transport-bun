import type { HyperTransport, TransportRequest, TransportResponse } from "@hyperttp/types";
import type { BunTransportConfig } from "./types/index.js";
/**
 * @ru Высокопроизводительный HTTP-транспорт для Bun с нативными оптимизациями и поддержкой Stealth-мимикрии.
 * Включает управление параллелизмом, cookie jar и кэширование доменов.
 * @en High-performance HTTP transport for Bun with native optimizations and Stealth mimicry support.
 * Includes concurrency management, cookie jar, and domain caching.
 */
export declare class BunTransport implements HyperTransport {
    /**
     * @ru Конфигурация транспорта.
     * @en Transport configuration.
     */
    config: BunTransportConfig;
    /**
     * @ru Кэш cookies по доменам с TTL и LRU-эвикцией (domain -> name -> value).
     * @en Cookie cache by domain with TTL and LRU eviction (domain -> name -> value).
     */
    private readonly cookieStore;
    /**
     * @ru Кэш сгенерированных строк cookies с TTL.
     * @en Cache of generated cookie strings with TTL.
     */
    private readonly cookieStringCache;
    /**
     * @ru Опциональный кэш HTTP-ответов для GET/HEAD запросов.
     * @en Optional HTTP response cache for GET/HEAD requests.
     */
    private readonly responseCache?;
    /**
     * @ru Счётчик активных (выполняющихся) запросов.
     * @en Counter of active (in-flight) requests.
     */
    private activeRequests;
    /**
     * @ru Очередь запросов, ожидающих свободного слота при достижении лимита параллелизма.
     * @en Queue of requests waiting for a free slot when concurrency limit is reached.
     */
    private concurrencyQueue;
    /**
     * @ru Индекс начала очереди (для FIFO обработки).
     * @en Queue head index (for FIFO processing).
     */
    private queueHead;
    /**
     * @ru Индекс конца очереди (для добавления новых элементов).
     * @en Queue tail index (for adding new elements).
     */
    private queueTail;
    /**
     * @ru Максимальное количество одновременных запросов (0 = без лимита).
     * @en Maximum number of concurrent requests (0 = unlimited).
     */
    private _maxConcurrent;
    /**
     * @ru Таймаут запроса в миллисекундах (0 = без таймаута).
     * @en Request timeout in milliseconds (0 = no timeout).
     */
    private _timeout;
    /**
     * @ru Флаг использования keep-alive соединений.
     * @en Flag for using keep-alive connections.
     */
    private _keepalive;
    /**
     * @ru Конфигурация TLS (отклонение невалидных сертификатов и шифры).
     * @en TLS configuration (reject unauthorized certificates and ciphers).
     */
    private _tlsConfig;
    /**
     * @ru Создаёт экземпляр BunTransport.
     * @en Creates a BunTransport instance.
     * @param config - Transport configuration.
     */
    constructor(config: BunTransportConfig);
    /**
     * @ru Обновляет внутреннее состояние на основе конфигурации.
     * Вызывается при создании и может быть вызвано при изменении конфига.
     * @en Updates internal state based on configuration.
     * Called on creation and can be called when config changes.
     */
    private invalidateConfig;
    /**
     * @ru Выполняет HTTP-запрос через нативный fetch Bun с управлением параллелизмом и таймаутами.
     * @en Executes an HTTP request via Bun's native fetch with concurrency management and timeouts.
     * @param req - The normalized transport request.
     * @returns Promise resolving to the transport response.
     * @throws Error if the request is aborted or times out.
     */
    execute(req: TransportRequest): Promise<TransportResponse>;
    /**
     * @ru Получает строку cookies для указанного домена с учётом родительских доменов.
     * @en Gets the cookie string for the specified domain, considering parent domains.
     * @param requestDomain - The domain to get cookies for.
     * @returns Semicolon-separated cookie string.
     */
    private getCookiesForDomain;
    /**
     * @ru Возвращает все домены из cookie store.
     * @en Returns all domains from the cookie store.
     */
    private getAllCookieDomains;
    /**
     * @ru Сохраняет cookies из заголовков Set-Cookie ответа в cookie jar.
     * @en Stores cookies from response Set-Cookie headers into the cookie jar.
     * @param requestUrl - The request URL for determining the default domain.
     * @param headers - Response headers containing Set-Cookie values.
     */
    private storeCookies;
    /**
     * @ru Ожидает освобождения слота в очереди параллелизма.
     * @en Waits for a slot to become available in the concurrency queue.
     * @param signal - Optional abort signal to cancel waiting.
     * @returns Promise that resolves when a slot is available.
     * @throws Error if the signal is aborted while waiting.
     */
    private waitForSlot;
    /**
     * @ru Освобождает слот и разблокирует следующий запрос в очереди.
     * @en Releases a slot and unblocks the next request in the queue.
     */
    private releaseSlot;
    /**
     * @ru Мягко закрывает транспорт, очищая очереди и cookie jar.
     * @en Gracefully closes the transport, clearing queues and cookie jar.
     * @returns Promise that resolves when cleanup is complete.
     */
    close(): Promise<void>;
    /**
     * @ru Принудительно уничтожает транспорт (алиас для close()).
     * @en Forcefully destroys the transport (alias for close()).
     * @returns Promise that resolves when cleanup is complete.
     */
    destroy(): Promise<void>;
}
//# sourceMappingURL=bun.d.ts.map