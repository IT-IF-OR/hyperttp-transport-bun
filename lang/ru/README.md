# BunTransport

`BunTransport` — высокопроизводительный HTTP-транспорт для экосистемы
[HyperTransport](https://github.com/IT-IF-OR), предназначенный для **среды Bun**.

Оборачивает нативный `fetch` и добавляет:

- ограничение параллелизма с FIFO-очередью
- таймауты запросов через `AbortSignal`
- автоматическую обработку cookies с TTL и LRU-эвикцией
- кэширование ответов для GET/HEAD-запросов
- стелс-режим / эмуляцию отпечатков браузера (JA3/JA4)
- нормализацию заголовков
- поддержку `keepalive`
- конфигурацию TLS (шифры, `rejectUnauthorized`)

---

## Интерфейс

```ts
export interface HyperTransport {
  execute(req: TransportRequest): Promise<TransportResponse>;
  close?(): Promise<void>;
  destroy?(): Promise<void>;
}
```

`BunTransport` реализует этот интерфейс и может использоваться как runtime-specific transport в HTTP-клиенте.

---

## Возможности

- реализация на основе `fetch` с поддержкой `signal`
- автоматическое объединение cookies из ответа и последующих запросов
- кэш cookies по домену с настраиваемым TTL
- кэш ответов для GET/HEAD-запросов (опционально, через `hcacher`)
- ограничение количества одновременных запросов с FIFO-очередью
- поддержка таймаутов
- стелс-режим: эмуляция TLS-отпечатков браузеров (Chrome, Firefox, Safari, Edge)
- поддержка `baseUrl` для относительных URL
- совместимость с `TransportRequest` / `TransportResponse`

---

## Бенчмарк

Результаты бенчмарка на **Bun 1.3.14** (20K запросов, 200 параллельных, 60 сек):

```text
Среда: linux 7.1.3-zen2-1-zen | Intel Core i5-8600K @ 3.60GHz
```

| Место | Клиент         | RPS    | Avg      | p50      | p90      | p99      | Ошибки |
| ----- | -------------- | ------ | -------- | -------- | -------- | -------- | ------ |
| 1     | bun-fetch      | 25.92K | 7.65 ms  | 7.69 ms  | 10.41 ms | 14.00 ms | 0      |
| 2     | undici         | 21.47K | 9.28 ms  | 9.54 ms  | 12.80 ms | 14.77 ms | 0      |
| 3     | @hyperttp/core | 14.70K | 13.53 ms | 12.03 ms | 17.36 ms | 19.72 ms | 0      |
| 4     | axios          | 6.24K  | 31.85 ms | 31.83 ms | 33.82 ms | 36.10 ms | 0      |

`BunTransport` (через `@hyperttp/core`) обеспечивает **в 2.4 раза больше пропускной способности** и **в 2.3 раза ниже латентность** (p50) по сравнению с `axios`.

---

## Установка

`BunTransport` рассчитан на Bun, поэтому проект должен запускаться в окружении Bun.

```bash
bun add @hyperttp/transport-bun
```

Зависимости: `@hyperttp/types`, `hcacher`.

---

## Использование

```ts
import { BunTransport } from "@hyperttp/transport-bun";

const transport = new BunTransport({
  baseUrl: "https://api.example.com",
  network: {
    timeout: 10_000,
    maxConcurrent: 32,
    keepAliveTimeout: 30_000,
    rejectUnauthorized: true,
  },
});

const response = await transport.execute({
  url: "/users",
  method: "GET",
  headers: {},
  body: null,
});

console.log(response.status);
console.log(await response.text());
```

---

## Конфигурация

`BunTransport` принимает объект `BunTransportConfig`:

```ts
interface BunTransportConfig extends HttpClientOptions {
  baseUrl?: string;
  stealth?: StealthOptions;
}
```

### Параметры сети

```ts
network?: {
  maxConcurrent?: number;
  timeout?: number;
  keepAliveTimeout?: number;
  rejectUnauthorized?: boolean;
  cookieCache?: {
    enabled?: boolean;
    maxSize?: number;
    ttl?: number;
  };
  cache?: {
    enabled?: boolean;
    maxSize?: number;
    ttl?: number;
  };
}
```

| Параметр             | Описание                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `maxConcurrent`      | Максимальное число активных запросов одновременно (0 = без лимита)                                             |
| `timeout`            | Глобальный таймаут запроса в миллисекундах (0 = без таймаута)                                                  |
| `keepAliveTimeout`   | Если задан, включает `keepalive`                                                                               |
| `rejectUnauthorized` | Передаётся в Bun `fetch` через `tls`                                                                           |
| `cookieCache`        | Настройки кэша cookies: `enabled` (по умолчанию true), `maxSize` (по умолчанию 256), `ttl` (по умолчанию 300с) |
| `cache`              | Настройки кэша ответов для GET/HEAD: `enabled`, `maxSize` (по умолчанию 256), `ttl` (по умолчанию 30с)         |

---

## Cookies

Транспорт поддерживает хранение cookies с TTL и LRU-эвикцией на основе `hcacher`.

### Как это работает

1. Если сервер возвращает `Set-Cookie`, cookies сохраняются по домену с TTL.
2. При следующих запросах к тому же домену cookies автоматически добавляются в заголовок `Cookie`.
3. Если пользователь передал свой `Cookie`, он объединяется с сохранёнными cookies.
4. Протухшие записи вытесняются автоматически (LRU).

### Пример

```ts
await transport.execute({
  url: "/login",
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ login: "demo", password: "secret" }),
});

// Cookies от /login автоматически отправляются
const res = await transport.execute({
  url: "/profile",
  method: "GET",
  headers: {},
  body: null,
});
```

---

## Кэширование ответов

При настройке `network.cache` GET и HEAD-запросы кэшируются автоматически с TTL и LRU-эвикцией.

```ts
const transport = new BunTransport({
  network: {
    cache: {
      enabled: true,
      maxSize: 512,
      ttl: 60_000, // 1 минута
    },
  },
});
```

Кэшированные ответы возвращаются мгновенно при повторных запросах к тому же URL в пределах окна TTL.

---

## Ограничение параллелизма

Если `maxConcurrent > 0`, новые запросы ставятся в очередь, пока не освободится слот.

Это полезно, когда нужно:

- не перегружать сервер
- ограничить нагрузку на runtime
- избежать всплесков сетевой активности

---

## Таймаут и отмена

Транспорт использует `AbortSignal`:

- если передан `req.signal`, он учитывается
- если задан `timeout`, создаётся `AbortSignal.timeout(...)`
- если оба сигнала есть, они объединяются через `AbortSignal.any(...)`

Если запрос отменён, выбрасывается причина сигнала либо стандартный `AbortError`.

---

## Stealth / маскировка

`BunTransport` поддерживает эмуляцию TLS-отпечатков браузеров для обхода fingerprint-защит (JA3/JA4).

### Поддерживаемые профили

| Профиль | TLS-шифры     | sec-ch-ua     | User-Agent  |
| ------- | ------------- | ------------- | ----------- |
| chrome  | Chrome suite  | Chrome 126    | Chrome 126  |
| firefox | Firefox suite | Firefox-style | Firefox 126 |
| safari  | Safari suite  | —             | Safari 17.0 |
| edge    | Chrome suite  | Chrome 126    | Edge 126    |

### Пример

```ts
const transport = new BunTransport({
  stealth: {
    fingerprint: "chrome",
  },
});
```

Стелс-пресеты применяются к каждому запросу. Ручные заголовки всегда имеют приоритет над пресетами.

---

## Методы ответа

`execute()` возвращает простой объект `TransportResponse`:

```ts
interface TransportResponse {
  status: number;
  url: string;
  headers: Record<string, string | string[]>;
  body: TransportResponsePayload | null;
}
```

### Особенность `body`

Если `body` существует, на него может быть добавлен метод `dump()`, который безопасно вычитывает поток и освобождает ресурсы.

---

## Внутренние утилиты

### `fastGetHostname(url: string): string`

Быстро извлекает hostname из URL с LRU-кэшем. Обрабатывает `//`, `scheme://`, `user@host` и порты.

### `resolveUrl(baseUrl: string, url: string): string`

Разрешает относительный URL относительно `baseUrl`. Абсолютные URL возвращаются как есть.

### `normalizeHeaders(headers): Record<string, string>`

Нормализует заголовки: переводит все ключи в нижний регистр, склеивает массивы (`;` для `cookie`, `,` для остальных).

---

## Закрытие

`BunTransport` поддерживает очистку ресурсов:

```ts
await transport.close();
await transport.destroy();
```

Оба метода очищают:

- очередь ожидания
- хранилище cookies
- кэш строк cookies
- кэш ответов
- счётчик активных запросов

---

## Примечания

- Транспорт рассчитан именно на **Bun**, а не на Node.js.
- Для `fetch` используется `redirect: "manual"`.
- Заголовки, тело и `signal` передаются почти без вмешательства, кроме нормализации и cookie-логики.
- `TransportRequest.body` передаётся напрямую как `BodyInit | null`.

---

## Лицензия

MIT
