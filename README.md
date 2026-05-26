# BunTransport

`BunTransport` is a network transport implementation for `HyperTransport`, designed to run in the **Bun runtime**.

It wraps `fetch` and adds:

- concurrency limiting
- request timeouts via `AbortSignal`
- automatic cookie handling
- header normalization
- `keepalive` support
- access to Bun `tls` options

---

## Interface

```ts
/**
 * @ru Общий интерфейс для реализации сетевых транспортов.
 * @en Unified interface for building runtime-specific network transports.
 */
export interface HyperTransport {
  execute(req: TransportRequest): Promise<TransportResponse>;
  close?(): Promise<void>;
  destroy?(): Promise<void>;
}
```

`BunTransport` implements this interface and can be used as a runtime-specific HTTP transport in client libraries.

---

## Features

- `fetch`-based implementation with `signal` support
- `redirect: "manual"`
- automatic merging of cookies from responses and subsequent requests
- cookie cache per domain
- request concurrency limiting
- request timeout support
- automatic `User-Agent` injection from config (if not provided manually)
- compatibility with `TransportRequest` / `TransportResponse`

---

## Installation

`BunTransport` is designed for Bun, so the project must run in the Bun runtime.

```bash
bun install
```

---

## Usage

```ts
import { BunTransport } from "./BunTransport";

const transport = new BunTransport({
  network: {
    timeout: 10_000,
    maxConcurrent: 32,
    userAgent: "Hyperttp/1.0",
    keepAliveTimeout: 30_000,
    rejectUnauthorized: true,
  },
});

const response = await transport.execute({
  url: "https://example.com",
  method: "GET",
  headers: {},
  body: null,
});

console.log(response.status);
console.log(await response.text());
```

---

## Configuration

`BunTransport` reads configuration from `HttpClientOptions.network`.

Supported options:

```ts
network?: {
  maxConcurrent?: number;
  timeout?: number;
  userAgent?: string;
  keepAliveTimeout?: number;
  rejectUnauthorized?: boolean;
}
```

### Option behavior

- `maxConcurrent` — maximum number of concurrent active requests.
- `timeout` — global request timeout in milliseconds.
- `userAgent` — injected into `User-Agent` header if not explicitly set.
- `keepAliveTimeout` — enables `keepalive` mode when provided.
- `rejectUnauthorized` — passed to Bun `fetch` via `tls` configuration.

---

## Cookies

The transport supports persistent cookie storage and reuse between requests.

### How it works

1. When the server returns `Set-Cookie`, cookies are stored per domain.
2. On subsequent requests to the same domain, cookies are automatically attached to the `Cookie` header.
3. If the user provides their own `Cookie` header, it is merged with stored cookies.

### Example

```ts
await transport.execute({
  url: "https://example.com/login",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ login: "demo", password: "secret" }),
});

const res = await transport.execute({
  url: "https://example.com/profile",
  method: "GET",
  headers: {},
  body: null,
});
```

---

## Concurrency limiting

If `maxConcurrent > 0`, incoming requests are queued until a slot becomes available.

This is useful for:

- preventing server overload
- limiting runtime resource usage
- avoiding traffic spikes

---

## Timeout & cancellation

The transport uses `AbortSignal`:

- if `req.signal` is provided, it is respected
- if `timeout` is set, `AbortSignal.timeout(...)` is created
- if both exist, they are combined using `AbortSignal.any(...)`

If a request is aborted, the signal reason (or a default `AbortError`) is thrown.

---

## Response API

`BunTransportResponse` wraps the native `Response` and provides:

- `status`
- `url`
- `body`
- `text()`
- `json()`
- `headers`

### Body behavior

If `body` exists, a `dump()` method may be attached to it, allowing safe stream consumption and resource cleanup.

---

## Internal utilities

### `fastGetHostname(url: string): string`

Fast hostname extraction from a URL without full parsing.

### `normalizeHeaderValue(name, value)`

Normalizes header values:

- `Cookie` headers are joined using `;`
- other arrays are joined using `,`

### `normalizeCookieHeader(value)`

Converts cookie header values into a normalized string.

### `throwIfAborted(signal)`

Checks whether an operation has been aborted and throws if so.

---

## Shutdown

`BunTransport` supports resource cleanup:

```ts
await transport.close();
await transport.destroy();
```

Both methods clear:

- pending request queue
- cookie jar
- cookie cache

---

## Notes

- Designed specifically for the **Bun runtime**, not Node.js.
- Uses `redirect: "manual"` for fetch requests.
- Minimal interference with request data; only headers, cookies, and signals are normalized or extended.
- `TransportRequest.body` is treated as `BodyInit | null`.

---

## License

MIT
