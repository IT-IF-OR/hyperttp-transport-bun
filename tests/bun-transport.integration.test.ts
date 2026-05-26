import { describe, test, expect } from "vitest";
import type { Method } from "@hyperttp/types";
import { BunTransport, fastGetHostname } from "../src/index.js";
import {
  BASE_URL,
  defaultOptions,
  createRequest,
} from "./helpers/transport.js";

describe("BunTransport Integration Tests", () => {
  test("should successfully execute GET /json and parse payload", async () => {
    const transport = new BunTransport(defaultOptions);

    const response = await transport.execute(
      createRequest(`${BASE_URL}/json`, "GET" as Method),
    );

    expect(response.status).toBe(200);

    const data = (await response.json()) as {
      ok: boolean;
      timestamp: number;
      random: number;
    };

    expect(data.ok).toBe(true);
  });

  test("should successfully send data to POST /post and read text response", async () => {
    const transport = new BunTransport(defaultOptions);
    const payload = "hyperttp_v3_test";

    const response = await transport.execute(
      createRequest(`${BASE_URL}/post`, "POST" as Method, {}, payload),
    );

    expect(response.status).toBe(200);

    const text = await response.text();
    expect(text).toBe(`ok method=POST body=${payload}`);
  });

  test("should successfully handle large payloads via /large", async () => {
    const transport = new BunTransport(defaultOptions);

    const response = await transport.execute(
      createRequest(`${BASE_URL}/large`, "GET" as Method),
    );

    expect(response.status).toBe(200);

    const data = (await response.json()) as { ok: boolean; payload: string };
    expect(data.ok).toBe(true);
    expect(data.payload.length).toBeGreaterThan(100000);
  });

  test("should successfully stream data chunk by chunk from /stream", async () => {
    const transport = new BunTransport(defaultOptions);

    const response = await transport.execute(
      createRequest(`${BASE_URL}/stream`, "GET" as Method),
    );

    expect(response.status).toBe(200);

    const body = response.body;
    if (!body) throw new Error("Response body is missing");

    const reader = (body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let receivedChunksCount = 0;
    let fullText = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunkText = decoder.decode(value, { stream: true });
      fullText += chunkText;

      if (chunkText.startsWith("chunk-")) {
        receivedChunksCount++;
      }
    }

    expect(receivedChunksCount).toBe(5);
    expect(fullText).toContain("done\n");
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

  describe("fastGetHostname utility", () => {
    test("should extract hostname correctly in edge cases", () => {
      expect(fastGetHostname("")).toBe("localhost");
      expect(fastGetHostname("/relative/path")).toBe("localhost");
      expect(fastGetHostname("http://google.com/path")).toBe("google.com");
      expect(fastGetHostname("https://example.com:8080/json")).toBe(
        "example.com",
      );
      expect(fastGetHostname("http://127.0.0.1?query=1")).toBe("127.0.0.1");
      expect(fastGetHostname("localhost")).toBe("localhost");
    });
  });

  test("should abort request when timeout is reached", async () => {
    const transport = new BunTransport({
      network: {
        timeout: 50,
        rejectUnauthorized: true,
      },
    });

    await expect(
      transport.execute(createRequest(`${BASE_URL}/delay/1`, "GET" as Method)),
    ).rejects.toThrow();
  });

  test("should queue requests when maxConcurrent limit is reached", async () => {
    const transport = new BunTransport({
      network: {
        maxConcurrent: 2,
        timeout: 5000,
        rejectUnauthorized: true,
      },
    });

    const startTime = Date.now();

    const [p1, p2, p3] = [
      transport.execute(createRequest(`${BASE_URL}/delay/1`, "GET" as Method)),
      transport.execute(createRequest(`${BASE_URL}/delay/1`, "GET" as Method)),
      transport.execute(createRequest(`${BASE_URL}/delay/1`, "GET" as Method)),
    ];

    await Promise.all([p1, p2, p3]);
    const duration = Date.now() - startTime;

    expect(duration).toBeGreaterThanOrEqual(1500);
  });
});
