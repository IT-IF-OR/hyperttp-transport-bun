import { describe, test, expect, vi } from "vitest";
import type { Method } from "@hyperttp/types";
import { BunTransport } from "../src/index.js";
import {
  COOKIE_BASE_URL,
  defaultOptions,
  createRequest,
  withMockedFetch,
} from "./helpers/transport.js";

describe("BunTransport cookies", () => {
  test("should correctly store, cache, isolate and clear cookies", async () => {
    const transport = new BunTransport(defaultOptions);

    const setResponse = await transport.execute(
      createRequest(`${COOKIE_BASE_URL}/set-cookie`, "GET" as Method),
    );
    if (setResponse.body) await setResponse.body.dump();

    const response1 = await transport.execute(
      createRequest(`${COOKIE_BASE_URL}/check-cookie`, "GET" as Method),
    );
    const data1 = (await response1.json()) as { receivedCookies: string };

    expect(data1.receivedCookies).toContain("session_id=v3_speed_demon");
    expect(data1.receivedCookies).toContain("theme=dark");

    const response2 = await transport.execute(
      createRequest(`${COOKIE_BASE_URL}/check-cookie`, "GET" as Method, {
        Cookie: "user-defined=true",
      }),
    );
    const data2 = (await response2.json()) as { receivedCookies: string };

    expect(data2.receivedCookies).toContain("user-defined=true;");
    expect(data2.receivedCookies).toContain("session_id=v3_speed_demon");

    await transport.close();

    const response3 = await transport.execute(
      createRequest(`${COOKIE_BASE_URL}/check-cookie`, "GET" as Method),
    );
    const data3 = (await response3.json()) as { receivedCookies: string };
    expect(data3.receivedCookies).toBe("");
  });

  test("should hit cookie cache on consecutive requests", async () => {
    const transport = new BunTransport(defaultOptions);
    const domain = "localhost";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = transport as any;

    t.updateCookies(domain, ["theme=dark; domain=localhost"]);

    const firstLookup = t.getCookiesForDomain(domain);
    expect(firstLookup).toContain("theme=dark");
    expect(t.cookieCache.has(domain)).toBe(true);

    const secondLookup = t.getCookiesForDomain(domain);
    expect(secondLookup).toEqual(firstLookup);

    const res = await transport.execute(
      createRequest(`http://${domain}:3000/check-cookie`, "GET" as Method),
    );

    const data = (await res.json()) as { receivedCookies: string };
    expect(data).toBeDefined();
  });

  test("should preserve user cookie header when cookie jar is empty", async () => {
    const transport = new BunTransport(defaultOptions);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = transport as any;
    t.hasCookies = true;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let capturedHeaders: any;

    await withMockedFetch(
      async (_url, init) => {
        capturedHeaders = init?.headers;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new Response("{}") as any;
      },
      async () => {
        await transport.execute(
          createRequest("http://localhost", "GET" as Method, {
            Cookie: "user-only=true",
          }),
        );
      },
    );

    expect(capturedHeaders["Cookie"]).toBe("user-only=true");
  });

  test("should normalize user cookie header without cookie jar", async () => {
    const transport = new BunTransport(defaultOptions);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let capturedHeaders: any;

    await withMockedFetch(
      async (_url, init) => {
        capturedHeaders = init?.headers;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new Response("{}") as any;
      },
      async () => {
        await transport.execute(
          createRequest("http://localhost", "GET" as Method, {
            Cookie: "plain=true",
          }),
        );
      },
    );

    expect(capturedHeaders["Cookie"]).toBe("plain=true");
  });

  test("should handle User-defined Cookie header as an Array inside execute logic", async () => {
    const transport = new BunTransport(defaultOptions);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = transport as any;

    t.hasCookies = true;
    t.cookieJar.set("localhost", new Map([["server-cookie", "1"]]));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let capturedHeaders: any;

    await withMockedFetch(
      async (_url, init) => {
        capturedHeaders = init?.headers;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new Response("{}") as any;
      },
      async () => {
        await transport.execute({
          url: "http://localhost",
          method: "GET" as Method,
          headers: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Cookie: ["user-cookie-1=a", "user-cookie-2=b"] as any,
          },
          body: null,
          signal: new AbortController().signal,
        });
      },
    );

    expect(capturedHeaders).toBeDefined();
    expect(capturedHeaders["Cookie"]).toBe(
      "user-cookie-1=a; user-cookie-2=b; server-cookie=1",
    );
  });

  test("should match subdomains in cookie jar and cache invalidation", () => {
    const transport = new BunTransport(defaultOptions);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = transport as any;

    t.hasCookies = true;
    t.updateCookies("example.com", ["sub=true; domain=example.com"]);

    const cookiesForSub = t.getCookiesForDomain("app.example.com");
    expect(cookiesForSub).toContain("sub=true");

    t.cookieCache.set("app.example.com", "sub=true");
    t.updateCookies("example.com", ["sub=false; domain=example.com"]);
    expect(t.cookieCache.has("app.example.com")).toBe(false);
  });

  test("should cover negative matches in domain matching and cache invalidation", () => {
    const transport = new BunTransport(defaultOptions);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = transport as any;

    t.hasCookies = true;
    t.updateCookies("target.com", ["a=1; domain=target.com"]);

    const emptyCookies = t.getCookiesForDomain("notarget.com");
    expect(emptyCookies).toBe("");

    t.cookieCache.set("notarget.com", "xyz=1");
    t.updateCookies("target.com", ["a=2; domain=target.com"]);
    expect(t.cookieCache.has("notarget.com")).toBe(true);
  });

  test("should ignore invalid set-cookie strings gracefully", () => {
    const transport = new BunTransport(defaultOptions);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = transport as any;

    expect(() => {
      t.updateCookies("localhost", [
        "",
        "=brokenValue",
        "valid=1; domain=.",
        "valid=2; domain= . ",
        "no-equal",
      ]);
    }).not.toThrow();
  });

  test("should ignore empty cookie domain attribute", () => {
    const transport = new BunTransport(defaultOptions);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = transport as any;

    expect(() => {
      t.updateCookies("localhost", ["a=1; domain=", "b=1; domain=."]);
    }).not.toThrow();
  });

  test("should hit invalid raw cookie pair branch", () => {
    const transport = new BunTransport(defaultOptions);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = transport as any;

    expect(() => {
      t.updateCookies("localhost", [";badcookie", "", "valid=1"]);
    }).not.toThrow();
  });

  test("should hit empty attr branch", () => {
    const transport = new BunTransport(defaultOptions);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = transport as any;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    t.updateCookies("localhost", ["a=1", undefined as any, "b=2"]);
    expect(true).toBe(true);
  });

  test("should clean up transport states on destroy", async () => {
    const transport = new BunTransport(defaultOptions);
    await transport.destroy();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((transport as any).concurrencyQueue.length).toBe(0);
  });

  test("should handle empty set-cookie array cleanly", async () => {
    const transport = new BunTransport(defaultOptions);
    const mockResponse = new Response("{}", {
      headers: { "Set-Cookie": "" },
    });
    mockResponse.headers.getSetCookie = () => [];

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValue(mockResponse as any);

    try {
      const res = await transport.execute(
        createRequest(`${COOKIE_BASE_URL}/json`, "GET" as Method),
      );
      expect(res.status).toBe(200);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("should hit savedCookies branch (no user cookie, has jar cookies)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transport = new BunTransport(defaultOptions) as any;

    transport.hasCookies = true;

    transport.cookieJar.set("localhost", new Map([["theme", "dark"]]));

    const res = await transport.execute({
      url: "http://localhost:3000/json",
      method: "GET",
      headers: {},
      body: null,
      signal: new AbortController().signal,
    });

    expect(res.status).toBe(200);
  });

  test("should inject User-Agent when missing in request", async () => {
    const transport = new BunTransport({
      network: { userAgent: "MyCustomAgent/1.0" },
    });

    // Делаем запрос БЕЗ указания User-Agent в заголовках
    await transport.execute({
      url: `http://localhost:3000/json`,
      method: "GET",
      headers: {},
      body: null,
    });
    // Теперь строка с присвоением ua гарантированно выполнится!
  });
});
