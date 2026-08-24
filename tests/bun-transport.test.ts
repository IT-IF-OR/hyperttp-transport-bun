import { afterEach, describe, expect, it, vi } from "vitest";

import { BunTransport } from "../src/index.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("BunTransport", () => {
  it("supports REST and returns the raw response body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("ok", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const transport = new BunTransport({ baseUrl: "https://api.example.com" });
    const response = await transport.execute({
      url: "/health",
      method: "GET",
      headers: {},
      protocol: "rest",
    });

    expect(transport.protocols).toEqual(["rest"]);
    expect(transport.supports("rest")).toBe(true);
    expect(transport.supports("graphql")).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/health",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock.mock.calls[0]![1]).not.toHaveProperty("headers");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/plain");
    expect(await new Response(response.body as BodyInit).text()).toBe("ok");
  });

  it("bypasses the response cache for stream requests", async () => {
    const firstResponse = new Response("first");
    const secondResponse = new Response("second");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(firstResponse)
      .mockResolvedValueOnce(secondResponse);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const transport = new BunTransport({
      baseUrl: "https://api.example.com",
      network: { cache: { maxSize: 1 } },
    });
    const request = {
      url: "/audio.mp3",
      method: "GET",
      headers: {},
      protocol: "rest" as const,
      stream: true,
    };

    const first = await transport.execute(request);
    const second = await transport.execute(request);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(first.body).toBe(firstResponse.body);
    expect(second.body).toBe(secondResponse.body);
  });

  it("does not cache native response bodies for ordinary requests", async () => {
    const firstResponse = new Response("first");
    const secondResponse = new Response("second");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(firstResponse)
      .mockResolvedValueOnce(secondResponse);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const transport = new BunTransport({
      baseUrl: "https://api.example.com",
      network: { cache: { maxSize: 1 } },
    });
    const request = {
      url: "/response-with-body",
      method: "GET",
      headers: {},
      protocol: "rest" as const,
    };

    const first = await transport.execute(request);
    const second = await transport.execute(request);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(first.body).toBe(firstResponse.body);
    expect(second.body).toBe(secondResponse.body);
  });

  it("skips cookie lookups until a response sets a cookie", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("ok", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const transport = new BunTransport({ baseUrl: "https://api.example.com" });
    const getCookiesForDomain = vi.spyOn(transport as any, "getCookiesForDomain");

    await transport.execute({
      url: "/health",
      method: "GET",
      headers: {},
      protocol: "rest",
    });

    expect(getCookiesForDomain).not.toHaveBeenCalled();
  });

  it("uses cookies after receiving Set-Cookie", async () => {
    const headers = {
      getSetCookie: () => ["session=abc; Path=/"],
      forEach: (callback: (value: string, key: string) => void) => {
        callback("session=abc; Path=/", "set-cookie");
      },
    } as unknown as Headers;
    const response = {
      status: 200,
      url: "https://api.example.com/login",
      body: null,
      headers,
    } as Response;
    const fetchMock = vi.fn().mockResolvedValue(response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const transport = new BunTransport({ baseUrl: "https://api.example.com" });
    await transport.execute({ url: "/login", method: "POST", headers: {}, protocol: "rest" });
    await transport.execute({ url: "/profile", method: "GET", headers: {}, protocol: "rest" });

    expect(fetchMock.mock.calls[1]![1]).toEqual(
      expect.objectContaining({ headers: expect.objectContaining({ cookie: "session=abc" }) }),
    );
  });

  it("skips cookie parsing and lookup when the cookie cache is disabled", async () => {
    const getSetCookie = vi.fn(() => ["session=abc; Path=/"]);
    const headers = {
      getSetCookie,
      forEach: (callback: (value: string, key: string) => void) => {
        callback("session=abc; Path=/", "set-cookie");
      },
    } as unknown as Headers;
    const response = {
      status: 200,
      url: "https://api.example.com/login",
      body: null,
      headers,
    } as Response;
    const fetchMock = vi.fn().mockResolvedValue(response);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const transport = new BunTransport({
      baseUrl: "https://api.example.com",
      network: { cookieCache: { enabled: false } },
    });
    const getCookiesForDomain = vi.spyOn(transport as any, "getCookiesForDomain");

    await transport.execute({ url: "/login", method: "POST", headers: {}, protocol: "rest" });
    await transport.execute({ url: "/profile", method: "GET", headers: {}, protocol: "rest" });

    expect(getSetCookie).not.toHaveBeenCalled();
    expect(getCookiesForDomain).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[1]![1]).not.toHaveProperty("headers");
  });
});
