import { afterEach, describe, expect, it, vi } from "vitest";

import { checkAndShowWelcomeMessage } from "../../../src/js/core/welcomeMessage.js";

function createVisitedState(initialValue = null) {
  let value = initialValue;
  const port = {
    loadExact: vi.fn(() => value),
    markVisited: vi.fn(() => {
      value = "true";
    }),
    compensate: vi.fn((expected, prior) => {
      if (value !== expected) return false;
      value = prior;
      return true;
    }),
  };
  return {
    port,
    getValue: () => value,
    replaceExact: (replacement) => {
      value = replacement;
    },
  };
}

describe("checkAndShowWelcomeMessage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("records the first visit before showing the welcome modal", () => {
    const visited = createVisitedState();
    const modalManager = {
      show: vi.fn(() => expect(visited.getValue()).toBe("true")),
      hide: vi.fn(),
    };

    const attempt = checkAndShowWelcomeMessage(visited.port, modalManager);
    attempt?.commit();
    attempt?.rollback();

    expect(visited.getValue()).toBe("true");
    expect(visited.port.markVisited).toHaveBeenCalledOnce();
    expect(visited.port.compensate).not.toHaveBeenCalled();
    expect(modalManager.show).toHaveBeenCalledOnce();
    expect(modalManager.show).toHaveBeenCalledWith("aboutModal");
    expect(modalManager.hide).not.toHaveBeenCalled();
  });

  it.each(["true", "false", "0", "external-owner"])(
    "does not show the welcome modal after the truthy marker %s is recorded",
    (value) => {
      const visited = createVisitedState(value);
      const modalManager = { show: vi.fn() };

      const attempt = checkAndShowWelcomeMessage(visited.port, modalManager);

      expect(attempt).toBeNull();
      expect(visited.port.markVisited).not.toHaveBeenCalled();
      expect(modalManager.show).not.toHaveBeenCalled();
    },
  );

  it("rolls back only the first-visit side effects created by the attempt", () => {
    const visited = createVisitedState();
    const modalManager = { show: vi.fn().mockReturnValue(true), hide: vi.fn() };
    const attempt = checkAndShowWelcomeMessage(visited.port, modalManager);

    attempt?.rollback();
    attempt?.rollback();

    expect(visited.getValue()).toBeNull();
    expect(visited.port.compensate).toHaveBeenCalledOnce();
    expect(visited.port.compensate).toHaveBeenCalledWith("true", null);
    expect(modalManager.hide).toHaveBeenCalledOnce();
    expect(modalManager.hide).toHaveBeenCalledWith("aboutModal");
  });

  it("restores a prior empty marker instead of deleting it", () => {
    const visited = createVisitedState("");
    const modalManager = { show: vi.fn(), hide: vi.fn() };

    const attempt = checkAndShowWelcomeMessage(visited.port, modalManager);
    attempt?.rollback();

    expect(visited.getValue()).toBe("");
    expect(visited.port.compensate).toHaveBeenCalledWith("true", "");
  });

  it("does not overwrite a marker changed after the attempt began", () => {
    const visited = createVisitedState();
    const modalManager = { show: vi.fn(), hide: vi.fn() };
    const attempt = checkAndShowWelcomeMessage(visited.port, modalManager);
    visited.replaceExact("external-owner");

    attempt?.rollback();

    expect(visited.getValue()).toBe("external-owner");
    expect(visited.port.compensate).toHaveReturnedWith(false);
    expect(modalManager.hide).toHaveBeenCalledWith("aboutModal");
  });

  it("rolls back a partial modal failure before propagating it", () => {
    const visited = createVisitedState();
    const failure = new Error("modal failed after activation");
    const modalManager = {
      show: vi.fn(() => {
        throw failure;
      }),
      hide: vi.fn(),
    };

    expect(() =>
      checkAndShowWelcomeMessage(visited.port, modalManager),
    ).toThrow(failure);
    expect(visited.getValue()).toBeNull();
    expect(modalManager.hide).toHaveBeenCalledWith("aboutModal");
  });

  it.each([null, {}, { show: vi.fn(() => false), hide: vi.fn() }])(
    "compensates without hiding a modal that was not shown",
    (modalManager) => {
      const visited = createVisitedState();
      const attempt = checkAndShowWelcomeMessage(visited.port, modalManager);

      attempt?.rollback();

      expect(visited.getValue()).toBeNull();
      if (modalManager?.hide) {
        expect(modalManager.hide).not.toHaveBeenCalled();
      }
    },
  );

  it.each(["loadExact", "markVisited"])(
    "propagates %s failures before activating the welcome modal",
    (method) => {
      const visited = createVisitedState();
      const failure = new Error(`${method} failed`);
      visited.port[method].mockImplementation(() => {
        throw failure;
      });
      const modalManager = { show: vi.fn(), hide: vi.fn() };

      expect(() =>
        checkAndShowWelcomeMessage(visited.port, modalManager),
      ).toThrow(failure);
      expect(modalManager.show).not.toHaveBeenCalled();
      expect(visited.port.compensate).not.toHaveBeenCalled();
    },
  );

  it("attempts compensation after hide fails and preserves the first rollback error", () => {
    const visited = createVisitedState();
    const hideFailure = new Error("hide failed");
    const compensationFailure = new Error("compensation failed");
    const modalManager = {
      show: vi.fn(),
      hide: vi.fn(() => {
        throw hideFailure;
      }),
    };
    visited.port.compensate.mockImplementation(() => {
      throw compensationFailure;
    });
    const attempt = checkAndShowWelcomeMessage(visited.port, modalManager);

    expect(() => attempt?.rollback()).toThrow(hideFailure);
    expect(visited.port.compensate).toHaveBeenCalledWith("true", null);
    expect(() => attempt?.rollback()).not.toThrow();
    expect(visited.port.compensate).toHaveBeenCalledOnce();
  });

  it("propagates a compensation failure when hiding succeeds", () => {
    const visited = createVisitedState();
    const failure = new Error("compensation failed");
    visited.port.compensate.mockImplementation(() => {
      throw failure;
    });
    const attempt = checkAndShowWelcomeMessage(visited.port, {
      show: vi.fn(),
      hide: vi.fn(),
    });

    expect(() => attempt?.rollback()).toThrow(failure);
  });

  it("preserves a show failure even when its rollback also fails", () => {
    const visited = createVisitedState();
    const failure = new Error("show failed");
    visited.port.compensate.mockImplementation(() => {
      throw new Error("compensation failed");
    });

    expect(() =>
      checkAndShowWelcomeMessage(visited.port, {
        show() {
          throw failure;
        },
        hide() {
          throw new Error("hide failed");
        },
      }),
    ).toThrow(failure);
    expect(visited.port.compensate).toHaveBeenCalledOnce();
  });

  it("uses an independently injected port without reading poisoned ambient storage", () => {
    const visited = createVisitedState("");
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("ambient storage read");
    });
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new Error("ambient session storage read");
    });

    const attempt = checkAndShowWelcomeMessage(visited.port, { show: vi.fn() });
    attempt?.rollback();

    expect(visited.getValue()).toBe("");
    expect(visited.port.compensate).toHaveBeenCalledWith("true", "");
  });
});
