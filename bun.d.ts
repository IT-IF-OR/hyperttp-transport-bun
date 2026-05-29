import type { HttpClientOptions, HyperTransport, TransportRequest, TransportResponse } from "@hyperttp/types";
export declare function fastGetHostname(url: string): string;
export declare function fastStreamDump(this: ReadableStream<Uint8Array>): Promise<void>;
export declare function getAbortError(signal?: AbortSignal): unknown;
export declare function throwIfAborted(signal?: AbortSignal): void;
export declare function normalizeCookieHeader(value: string | string[] | undefined): string;
export declare function normalizeHeaderValue(name: string, value: string | string[]): string;
export declare class BunTransport implements HyperTransport {
    config: HttpClientOptions;
    private cookieJar;
    private cookieCache;
    private activeRequests;
    private concurrencyQueue;
    private hasCookies;
    private _maxConcurrent;
    private _timeout;
    private _userAgent;
    private _keepalive;
    private _tlsConfig;
    constructor(config: HttpClientOptions);
    private invalidateConfig;
    execute(req: TransportRequest): Promise<TransportResponse>;
    private prepareHeaders;
    private getCookiesForDomain;
    private updateCookies;
    close(): Promise<void>;
    destroy(): Promise<void>;
}
//# sourceMappingURL=bun.d.ts.map