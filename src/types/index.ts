import type { HttpClientOptions, StealthOptions } from "@hyperttp/types";

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

  /**
   * @ru Параметры скрытности, эмуляции отпечатков TLS (JA3/JA4) и обхода систем DPI.
   * @en Stealth options for TLS fingerprint emulation and DPI evasion strategies.
   */
  stealth?: StealthOptions;
}
