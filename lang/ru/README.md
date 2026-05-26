# BunTransport

`BunTransport` — реализация сетевого транспорта для `HyperTransport`, рассчитанная на запуск в среде **Bun**.

Он оборачивает `fetch`, добавляет:

- ограничение параллелизма;
- таймауты через `AbortSignal`;
- автообработку cookies;
- нормализацию заголовков;
- поддержку `keepalive`;
- доступ к `tls`-настройкам Bun.

---

## Интерфейс

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

`BunTransport` реализует этот интерфейс и может использоваться как runtime-specific transport в HTTP-клиенте.

---

## Возможности

- `fetch`-основа с поддержкой `signal`
- `redirect: "manual"`
- автоматическое объединение cookies из ответа и последующих запросов
- кеш cookies по домену
- ограничение количества одновременных запросов
- таймаут на запрос
- подстановка `User-Agent`, если он задан в конфиге
- совместимость с `TransportRequest` / `TransportResponse`

---

## Установка

`BunTransport` рассчитан на Bun, поэтому проект должен запускаться в окружении Bun.

```bash
bun install
```

---

## Использование

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

## Конфигурация

`BunTransport` читает настройки из `HttpClientOptions.network`.

Используются следующие параметры:

```ts
network?: {
  maxConcurrent?: number;
  timeout?: number;
  userAgent?: string;
  keepAliveTimeout?: number;
  rejectUnauthorized?: boolean;
}
```

### Поведение параметров

- `maxConcurrent` — максимальное число активных запросов одновременно.
- `timeout` — общий таймаут запроса в миллисекундах.
- `userAgent` — подставляется в `User-Agent`, если заголовок не был передан вручную.
- `keepAliveTimeout` — если задан, включает `keepalive`.
- `rejectUnauthorized` — передаётся в Bun `fetch` через `tls`.

---

## Cookies

Транспорт умеет хранить и повторно использовать cookies между запросами.

### Как это работает

1. Если сервер возвращает `Set-Cookie`, cookies сохраняются по домену.
2. При следующих запросах к тому же домену cookies автоматически добавляются в заголовок `Cookie`.
3. Если пользователь передал свой `Cookie`, он объединяется с сохранёнными cookies.

### Пример

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

## Ограничение параллелизма

Если `maxConcurrent > 0`, новые запросы ставятся в очередь, пока не освободится слот.

Это полезно, когда нужно:

- не перегружать сервер;
- ограничить нагрузку на runtime;
- избежать всплесков сетевой активности.

---

## Таймаут и отмена

Транспорт использует `AbortSignal`:

- если передан `req.signal`, он учитывается;
- если задан `timeout`, создаётся `AbortSignal.timeout(...)`;
- если оба сигнала есть, они объединяются через `AbortSignal.any(...)`.

Если запрос отменён, выбрасывается причина сигнала либо стандартный `AbortError`.

---

## Методы ответа

`BunTransportResponse` оборачивает native `Response` и предоставляет:

- `status`
- `url`
- `body`
- `text()`
- `json()`
- `headers`

### Особенность `body`

Если `body` существует, на него может быть добавлен метод `dump()`, который безопасно вычитывает поток и освобождает ресурсы.

---

## Внутренние утилиты

### `fastGetHostname(url: string): string`

Быстро извлекает hostname из URL без лишней нормализации.

### `normalizeHeaderValue(name, value)`

Нормализует заголовки:

- `Cookie` склеивается через `;`
- остальные массивы — через `,`

### `normalizeCookieHeader(value)`

Преобразует cookie-значение к строке.

### `throwIfAborted(signal)`

Проверяет, не был ли запрос отменён.

---

## Закрытие

`BunTransport` поддерживает очистку ресурсов:

```ts
await transport.close();
await transport.destroy();
```

Оба метода очищают:

- очередь ожидания;
- cookie jar;
- cookie cache.

---

## Примечания

- Транспорт рассчитан именно на **Bun**, а не на Node.js.
- Для `fetch` используется `redirect: "manual"`.
- Заголовки, тело и `signal` передаются почти без вмешательства, кроме нормализации и cookie-логики.
- `TransportRequest.body` приводится к `BodyInit | null`.

---

## Лицензия

MIT
