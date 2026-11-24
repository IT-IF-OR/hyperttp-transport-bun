export type Fingerprint = "chrome" | "firefox" | "safari" | "edge";

export interface StealthOptions {
  fingerprint?: Fingerprint;
  ciphers?: string;
}

export interface CacheOptions {
  enabled?: boolean;
  maxSize?: number;
  ttl?: number;
}

/**
 * @ru Конфигурация транспорта Bun.
 * @en Bun transport configuration.
 */
export interface BunTransportConfig {
  /**
   * Enables HTTP/2 for Bun.serve when the runtime supports it. This only
   * applies to REST: Bun.serve Response objects cannot emit gRPC trailers.
   * Use `@hyperttp/transport-node`'s Http2Transport for gRPC on Bun.
   */
  http2?: boolean;

  /**
   * @ru Базовый URL для всех запросов.
   * @en Base URL for all requests.
   */
  baseUrl?: string;

  /**
   * @ru Параметры скрытности, эмуляции отпечатков TLS (JA3/JA4) и обхода систем DPI.
   * @en Stealth options for TLS fingerprint emulation and DPI evasion strategies.
   */
  stealth?: StealthOptions;

  network?: {
    /**
     * Enables HTTP/2 for Bun.serve when the runtime supports it. This only
     * applies to REST: Bun.serve Response objects cannot emit gRPC trailers.
     * Use `@hyperttp/transport-node`'s Http2Transport for gRPC on Bun.
     */
    http2?: boolean;
    timeout?: number;
    maxConcurrent?: number;
    keepAliveTimeout?: number;
    rejectUnauthorized?: boolean;
    cache?: CacheOptions;
    cookieCache?: CacheOptions;
  };
}
