import { describe, test, expect } from "vitest";
import type { Method } from "@hyperttp/types";
import { BunTransport, fastGetHostname } from "../src/index.js";
import {
  BASE_URL,
  defaultOptions,
  createRequest,
} from "./helpers/transport.js";
import { getAbortError, throwIfAborted } from "../src/bun.js";

describe("BunTransport abort and utility branches", () => {
  test("should cover all logical branches in fastGetHostname", () => {
    expect(fastGetHostname("http://")).toBe("localhost");
    expect(fastGetHostname("/")).toBe("localhost");
    expect(fastGetHostname("http://localhost:8080")).toBe("localhost");
  });

  test("should execute execute logic with and without custom AbortSignal", async () => {
    const preAbortedController = new AbortController();
    preAbortedController.abort();

    const transport = new BunTransport({
      network: { timeout: 1, rejectUnauthorized: true },
    });

    await expect(
      transport.execute(
        createRequest(
          `${BASE_URL}/json`,
          "GET" as Method,
          {},
          null,
          preAbortedController.signal,
        ),
      ),
    ).rejects.toThrow();

    const transportWithoutTimeout = new BunTransport({
      network: { timeout: 0, rejectUnauthorized: true },
    });

    const abortedController = new AbortController();
    abortedController.abort();

    await expect(
      transportWithoutTimeout.execute(
        createRequest(
          `${BASE_URL}/json`,
          "GET" as Method,
          {},
          null,
          abortedController.signal,
        ),
      ),
    ).rejects.toThrow();
  });

  test("should use fallback Error when signal.reason is missing", async () => {
    const transport = new BunTransport({
      network: { timeout: 10, rejectUnauthorized: true },
    });

    const controller = new AbortController();
    controller.abort();

    await expect(
      transport.execute(
        createRequest(
          `${BASE_URL}/json`,
          "GET" as Method,
          {},
          null,
          controller.signal,
        ),
      ),
    ).rejects.toThrow();
  });

  test("should use manual aborted branch when throwIfAborted is unavailable", async () => {
    const transport = new BunTransport(defaultOptions);

    const controller = new AbortController();
    controller.abort();

    Object.defineProperty(controller.signal, "throwIfAborted", {
      value: undefined,
      configurable: true,
    });

    await expect(
      transport.execute(
        createRequest(
          `${BASE_URL}/json`,
          "GET" as Method,
          {},
          null,
          controller.signal,
        ),
      ),
    ).rejects.toThrow();
  });

  test("should hit manual signal.aborted branch", async () => {
    const transport = new BunTransport(defaultOptions);

    const controller = new AbortController();
    controller.abort();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (controller.signal as any).throwIfAborted;

    await expect(
      transport.execute(
        createRequest(
          `${BASE_URL}/json`,
          "GET" as Method,
          {},
          null,
          controller.signal,
        ),
      ),
    ).rejects.toThrow();
  });

  test("should hit fallback signal.aborted branch", async () => {
    const transport = new BunTransport(defaultOptions);

    const controller = new AbortController();
    controller.abort();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (controller.signal as any).throwIfAborted = undefined;

    await expect(
      transport.execute(
        createRequest(
          `${BASE_URL}/json`,
          "GET" as Method,
          {},
          null,
          controller.signal,
        ),
      ),
    ).rejects.toThrow();
  });

  test("should hit immediate aborted queue branch", async () => {
    const transport = new BunTransport({
      network: {
        maxConcurrent: 1,
        timeout: 5000,
        rejectUnauthorized: true,
      },
    });

    const blocker = transport.execute(
      createRequest(`${BASE_URL}/delay/1`, "GET" as Method),
    );

    await new Promise((r) => setTimeout(r, 50));

    const controller = new AbortController();
    controller.abort();

    await expect(
      transport.execute(
        createRequest(
          `${BASE_URL}/delay/1`,
          "GET" as Method,
          {},
          null,
          controller.signal,
        ),
      ),
    ).rejects.toThrow();

    await blocker;
  });

  test("should abort while waiting in concurrency queue", async () => {
    const transport = new BunTransport({
      network: {
        maxConcurrent: 1,
        timeout: 5000,
        rejectUnauthorized: true,
      },
    });

    const first = transport.execute(
      createRequest(`${BASE_URL}/delay/1`, "GET" as Method),
    );

    const controller = new AbortController();

    const second = transport.execute(
      createRequest(
        `${BASE_URL}/delay/1`,
        "GET" as Method,
        {},
        null,
        controller.signal,
      ),
    );

    controller.abort();

    await expect(second).rejects.toThrow();
    await first;
  });

  test("should reject immediately if queued signal is already aborted", async () => {
    const transport = new BunTransport({
      network: {
        maxConcurrent: 1,
        timeout: 5000,
        rejectUnauthorized: true,
      },
    });

    const first = transport.execute(
      createRequest(`${BASE_URL}/delay/1`, "GET" as Method),
    );

    const controller = new AbortController();
    controller.abort();

    await expect(
      transport.execute(
        createRequest(
          `${BASE_URL}/delay/1`,
          "GET" as Method,
          {},
          null,
          controller.signal,
        ),
      ),
    ).rejects.toThrow();

    await first;
  });

  test("should hit queue abort reject branch", async () => {
    const transport = new BunTransport({
      network: {
        maxConcurrent: 1,
        timeout: 5000,
        rejectUnauthorized: true,
      },
    });

    const blocker = transport.execute(
      createRequest(`${BASE_URL}/delay/2`, "GET" as Method),
    );

    await new Promise((r) => setTimeout(r, 30));

    const controller = new AbortController();
    controller.abort();

    const p = transport.execute(
      createRequest(
        `${BASE_URL}/delay/2`,
        "GET" as Method,
        {},
        null,
        controller.signal,
      ),
    );

    await expect(p).rejects.toThrow();
    await blocker;
  });

  test("should hit signal.reason fallback DOMException branch", () => {
    const signal = new AbortController().signal;

    Object.defineProperty(signal, "reason", {
      value: undefined,
      configurable: true,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = getAbortError(signal as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((err as any).name).toBe("AbortError");
  });

  test("should hit fallback throwIfAborted branch fully", () => {
    const controller = new AbortController();
    controller.abort();

    Object.defineProperty(controller.signal, "throwIfAborted", {
      value: undefined,
      configurable: true,
    });

    try {
      throwIfAborted(controller.signal);
    } catch (e) {
      expect((e as Error).name).toBe("AbortError");
      return;
    }

    throw new Error("Expected throwIfAborted to throw");
  });
});
