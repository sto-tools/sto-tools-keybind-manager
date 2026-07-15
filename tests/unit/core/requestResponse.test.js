import { afterEach, describe, expect, it, vi } from "vitest";
import eventBus from "../../../src/js/core/eventBus.js";
import { request, respond } from "../../../src/js/core/requestResponse.js";

describe("requestResponse - Simple Implementation Tests", () => {
  afterEach(() => {
    vi.useRealTimers();
    // Clear all event listeners after each test
    eventBus.clear();
  });

  describe("parameter validation", () => {
    it("should throw error when eventBus is null", () => {
      expect(() => {
        request(null, "test:topic", { data: "test" });
      }).toThrow(
        'Request failed: eventBus is null/undefined for topic "test:topic". Component may not be properly initialized.',
      );
    });

    it("should use default eventBus when undefined is passed", () => {
      expect(() => {
        request(undefined, "test:topic", { data: "test" });
      }).toThrow(
        'Request failed: No handler registered for topic "test:topic". Component may not be properly initialized.',
      );
    });

    it("should throw error when topic is null and no handler is registered", () => {
      expect(() => {
        request(eventBus, null, { data: "test" });
      }).toThrow(
        'Request failed: No handler registered for topic "[UNDEFINED_TOPIC]". Component may not be properly initialized.',
      );
    });

    it("should throw error when topic is undefined and no handler is registered", () => {
      expect(() => {
        request(eventBus, undefined, { data: "test" });
      }).toThrow(
        'Request failed: No handler registered for topic "[UNDEFINED_TOPIC]". Component may not be properly initialized.',
      );
    });

    it("should handle non-string topics correctly", () => {
      expect(() => {
        request(null, 123, { data: "test" });
      }).toThrow(
        'Request failed: eventBus is null/undefined for topic "123". Component may not be properly initialized.',
      );
    });
  });

  describe("handler existence check", () => {
    it("should throw error when no handler is registered for topic", () => {
      expect(() => {
        request(eventBus, "nonexistent:topic", { data: "test" });
      }).toThrow(
        'Request failed: No handler registered for topic "nonexistent:topic". Component may not be properly initialized.',
      );
    });

    it("should throw error when no handler is registered for null topic", () => {
      expect(() => {
        request(eventBus, null, { data: "test" });
      }).toThrow(
        'Request failed: No handler registered for topic "[UNDEFINED_TOPIC]". Component may not be properly initialized.',
      );
    });

    it("should succeed when handler is registered", async () => {
      const detach = respond(eventBus, "test:valid-topic", async (payload) => {
        return { received: payload.data, timestamp: Date.now() };
      });

      try {
        const result = await request(eventBus, "test:valid-topic", {
          data: "valid data",
        });
        expect(result).toEqual({
          received: "valid data",
          timestamp: expect.any(Number),
        });
      } finally {
        detach();
      }
    });
  });

  describe("functional request/response", () => {
    it("should handle successful request/response cycle", async () => {
      const detach = respond(eventBus, "test:success", async (payload) => {
        return { success: true, received: payload };
      });

      try {
        const result = await request(eventBus, "test:success", {
          message: "hello",
        });
        expect(result).toEqual({
          success: true,
          received: { message: "hello" },
        });
      } finally {
        detach();
      }
    });

    it("should handle handler throwing errors", async () => {
      const detach = respond(eventBus, "test:error", async () => {
        throw new Error("Handler error occurred");
      });

      try {
        await expect(request(eventBus, "test:error", {})).rejects.toThrow(
          "Handler error occurred",
        );
      } finally {
        detach();
      }
    });

    it("should handle handler returning promises", async () => {
      const detach = respond(eventBus, "test:promise", async (payload) => {
        return new Promise((resolve) => {
          setTimeout(() => resolve({ delayed: true, payload }), 50);
        });
      });

      try {
        const result = await request(eventBus, "test:promise", {
          data: "test",
        });
        expect(result).toEqual({ delayed: true, payload: { data: "test" } });
      } finally {
        detach();
      }
    });

    it("should reject on timeout and remove the ephemeral reply listener", async () => {
      vi.useFakeTimers();
      let requestEnvelope;
      eventBus.on("rpc:test:timeout", (message) => {
        requestEnvelope = message;
      });

      const pendingRequest = request(eventBus, "test:timeout", {}, 25);

      expect(requestEnvelope).toEqual({
        requestId: expect.any(String),
        replyTopic: expect.stringMatching(/^test:timeout::reply::/),
        payload: {},
      });
      expect(eventBus.hasListeners(requestEnvelope.replyTopic)).toBe(true);

      const rejection =
        expect(pendingRequest).rejects.toThrow("Request timed out");
      await vi.advanceTimersByTimeAsync(25);
      await rejection;

      expect(eventBus.hasListeners(requestEnvelope.replyTopic)).toBe(false);
    });

    it("should stop handling requests after the responder is detached", async () => {
      const detach = respond(eventBus, "test:detached", () => ({ ok: true }));

      await expect(request(eventBus, "test:detached", {})).resolves.toEqual({
        ok: true,
      });

      detach();

      expect(() => request(eventBus, "test:detached", {})).toThrow(
        'Request failed: No handler registered for topic "test:detached". Component may not be properly initialized.',
      );
    });
  });
});
