import { describe, test, expect } from "vitest";
import type { Method } from "@hyperttp/types";
import { BunTransport } from "../src/index.js";
import {
  BASE_URL,
  defaultOptions,
  createRequest,
} from "./helpers/transport.js";
import { normalizeHeaderValue } from "../src/bun.js";

describe("BunTransport response wrappers", () => {
  test("should handle empty body gracefully (e.g. 204 No Content)", async () => {
    const transport = new BunTransport(defaultOptions);
    const response = await transport.execute(
      createRequest(`${BASE_URL}/status/204`, "GET" as Method),
    );

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
  });

  test("should hit JSON cache when branch is pre-initialized", async () => {
    const transport = new BunTransport(defaultOptions);
    const response = await transport.execute(
      createRequest(`${BASE_URL}/json`, "GET" as Method),
    );

    const mockCache = { cached: true };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (response as any)._cachedJson = mockCache;

    const data = await response.json();
    expect(data).toBe(mockCache);
  });

  test("should cover both sides of optional chaining for toJSON", async () => {
    const transport = new BunTransport(defaultOptions);
    const response = await transport.execute(
      createRequest(`${BASE_URL}/json`, "GET" as Method),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (response as any)._cachedHeaders = null;
    expect(response.headers).toBeDefined();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nativeResponse = (response as any)._nativeResponse;
    nativeResponse.headers.toJSON = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (response as any)._cachedHeaders = null;
    expect(response.headers).toBeDefined();
  });

  test("should hit cached headers branch", async () => {
    const transport = new BunTransport(defaultOptions);
    const response = await transport.execute(
      createRequest(`${BASE_URL}/json`, "GET" as Method),
    );

    const first = response.headers;
    const second = response.headers;

    expect(first).toBe(second);
  });

  test("should expose native response url getter", async () => {
    const transport = new BunTransport(defaultOptions);

    const res = await transport.execute(
      createRequest(`${BASE_URL}/json`, "GET" as Method),
    );

    expect(typeof res.url).toBe("string");
  });

  test("should hit cached text early return", async () => {
    const transport = new BunTransport(defaultOptions);

    const res = await transport.execute(
      createRequest(`${BASE_URL}/json`, "GET" as Method),
    );

    await res.text();
    const cached = await res.text();

    expect(typeof cached).toBe("string");
  });

  test("should inject .dump() method into response body and drain the stream successfully", async () => {
    const transport = new BunTransport(defaultOptions);

    const response = await transport.execute(
      createRequest(`${BASE_URL}/stream/3`, "GET" as Method),
    );

    expect(response.status).toBe(200);

    const body = response.body;
    if (!body) throw new Error("Response body is missing");

    expect(typeof body.dump).toBe("function");

    await body.dump();

    const webStream = body as ReadableStream<Uint8Array>;
    expect(webStream.locked).toBe(true);
    expect(() => webStream.getReader()).toThrow();
  });

  test("should early return in fastStreamDump when stream is already locked", async () => {
    const transport = new BunTransport(defaultOptions);

    const res = await transport.execute(
      createRequest(`${BASE_URL}/stream`, "GET" as Method),
    );

    if (!res.body) throw new Error("missing body");

    const reader = (res.body as ReadableStream).getReader();

    await expect(res.body.dump()).resolves.toBeUndefined();

    reader.releaseLock();
  });

  test("should handle error in fastStreamDump catch block", async () => {
    const transport = new BunTransport(defaultOptions);
    const res = await transport.execute(
      createRequest(`${BASE_URL}/json`, "GET" as Method),
    );

    if (res.body) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nativeStream = res.body as any;

      if (typeof nativeStream.getReader === "function") {
        const reader = nativeStream.getReader();

        Object.defineProperty(nativeStream, "locked", {
          get: () => false,
          configurable: true,
        });

        await res.body.dump();

        reader.releaseLock();
      }
    }
  });

  test("should force coverage for array-based header normalization (Line 77)", async () => {
    const result = normalizeHeaderValue("X-Test-Header", ["val1", "val2"]);
    expect(result).toBe("val1, val2");
  });
});
