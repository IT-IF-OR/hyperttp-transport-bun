# Changelog

All notable changes to this project will be documented in this file.

---

## [0.2.4] - 2026-07-18

### Added

- Response caching for GET/HEAD requests via `hcacher` `CacheManager` with TTL and LRU eviction
- Configurable `cookieCache` and `cache` options in `BunTransportConfig.network`

### Changed

- Replaced manual cookie jar (`Map`/`Record`) with `CacheManager`-backed `cookieStore` and `cookieStringCache`
- Improved abort signal lifecycle: proper `addEventListener`/`removeEventListener` cleanup in `execute()`
- Removed `normalizeBody` helper — request body is now passed directly as `BodyInit`

### Dependencies

- Added `hcacher` `^0.1.0` as peer dependency
- Updated `@hyperttp/types` to `^0.2.5`
- Updated TypeScript to `^7.0.2`
- Updated `@dirold2/dev-tools` to `^1.1.0`

---

## [0.2.3] - 2026-06-16

### Added

- **Stealth mimicry**: browser-like TLS fingerprint emulation with Chrome, Firefox, Safari, Edge presets
- Browser-specific TLS cipher suite configuration per fingerprint profile
- `STEALTH_HEADER_PRESETS` and `STEALTH_UA_PRESETS` static presets
- `applyStealthHeaders()` for safe stealth header injection with manual header priority
- `StealthOptions` and `Fingerprint` type imports from `@hyperttp/types`

### Changed

- Optimized `fastGetHostname` with single-entry LRU cache (`lastUrl`/`lastHost`)
- Expanded hostname cache capacity from 512 to 1024 entries
- Extracted helpers to `src/utils/helpers.ts` (hostname, resolveUrl, abort, normalizeBody, normalizeHeaders)
- Moved `BunTransportConfig` interface to `src/types/index.ts`
- Replaced `Map`-based concurrency queue with index-based ring buffer (`queueHead`/`queueTail`)

### Dependencies

- Updated `@hyperttp/types` to `^0.2.3`
- Updated `oxfmt` to `^0.55.0`, `oxlint` to `^1.70.0`

---

## [0.2.2] - 2026-06-11

### Changed

- Migrated linting from ESLint to `oxlint`
- Migrated formatting from Prettier to `oxfmt`
- Restructured `package.json`: added `sideEffects: false`, `main`, `types` fields, updated `keywords`
- Optimized `fastGetHostname` cache: `Map` → plain `Object.create(null)` with LRU reset at 1024 entries
- Cached `ABORT_ERROR` and `TIMEOUT_ERROR` as static `DOMException` instances

### Added

- `resolveUrl(baseUrl, url)` utility for relative URL resolution
- `normalizeBody(body)` utility for request body normalization
- Bilingual JSDoc comments (`@ru`/`@en`) across all public and internal APIs
- `oxfmtrc.json` and `oxlintrc.json` configuration files

### Removed

- ESLint, Prettier, `eslint-plugin-import`, `typescript-eslint`, `globals` dev dependencies
- `prepublishOnly` script

---

## [0.2.1] - 2026-06-07

### Added

- **Stealth mimicry**: browser-like TLS fingerprint emulation with Chrome, Firefox, Safari, Edge presets
- Browser-specific TLS cipher suite configuration per fingerprint profile
- `STEALTH_HEADER_PRESETS` and `STEALTH_UA_PRESETS` static presets
- `applyStealthHeaders()` for safe stealth header injection with manual header priority
- `StealthOptions` and `Fingerprint` type imports from `@hyperttp/types`

### Changed

- Optimized `fastGetHostname` with single-entry LRU cache (`lastUrl`/`lastHost`)
- Expanded hostname cache capacity from 512 to 1024 entries
- Extracted helpers to `src/utils/helpers.ts` (hostname, resolveUrl, abort, normalizeBody, normalizeHeaders)
- Moved `BunTransportConfig` interface to `src/types/index.ts`
- Replaced `Map`-based concurrency queue with index-based ring buffer (`queueHead`/`queueTail`)

### Dependencies

- Updated `@hyperttp/types` to `^0.2.0`

---

## [0.2.0] - 2026-06-04

### Changed

- **Breaking**: Removed `BunTransportResponse` wrapper class — `execute()` now returns a plain `TransportResponse` object
- Removed `fastStreamDump` function — stream dump is now a simple `cancel()` call
- Removed `throwIfAborted` and `normalizeCookieHeader` exports
- Simplified `normalizeHeaderValue` — inline ternary instead of multi-line conditional
- Simplified abort check to `signal?.aborted` guard
- Cookie merging logic streamlined (direct string concatenation instead of array push + join)
- Concurrency queue now checks `queue.length > 0` before releasing slot

### Added

- `BunTransportConfig` interface extending `HttpClientOptions` with optional `baseUrl`
- `resolveUrl(baseUrl, url)` for relative URL resolution
- `normalizeBody(body)` for `TransportRequest.body` → `BodyInit` conversion
- `fastGetHostname` with `Map`-based hostname cache (512 entries, auto-clear)
- Extracted types to `src/types/index.ts`
- Extracted utilities to `src/utils/helpers.ts`

### Dependencies

- Updated build script: added `rm -rf ./dist/` and `bun update` to build pipeline

---

## [0.1.5] - 2026-05-29

### Added

- `dump()` method on `BunTransportResponse` for stream consumption and resource cleanup

### Changed

- Optimized `prepareHeaders` — replaced `Object.fromEntries` + `.map()` with direct `for...in` loop
- Optimized cookie merging — direct conditional concatenation instead of array push + join
- Updated `@hyperttp/types` peer dependency to `^0.1.5`

### Removed

- `typescript` optional peer dependency

---

## [0.1.1] - 2026-05-26

### Added

- `require` export entry point in `exports` field
- `./package.json` export entry

---

## [0.1.0] - 2026-05-26

### Added

- Initial release of `@hyperttp/transport-bun`
- `BunTransport` class implementing `HyperTransport` interface
- Concurrency limiting with configurable `maxConcurrent` and FIFO queue
- Request timeouts via `AbortSignal` with `AbortSignal.any()` composition
- Automatic cookie handling: per-domain cookie jar with merge on subsequent requests
- `BunTransportResponse` wrapper with `status`, `url`, `body`, `text()`, `json()`, `headers`
- Header normalization (lowercasing, array joining for Cookie and other headers)
- `keepalive` support via `keepAliveTimeout` config
- TLS configuration (`rejectUnauthorized`) passed to Bun `fetch`
- `fastGetHostname(url)` utility for fast hostname extraction
- `normalizeHeaderValue`, `normalizeCookieHeader`, `throwIfAborted` utilities
