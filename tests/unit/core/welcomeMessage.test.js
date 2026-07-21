import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkAndShowWelcomeMessage } from "../../../src/js/core/welcomeMessage.js";

describe("checkAndShowWelcomeMessage", () => {
  beforeEach(() => localStorage.clear());

  it("records the first visit before showing the welcome modal", () => {
    const modalManager = { show: vi.fn(), hide: vi.fn() };

    const attempt = checkAndShowWelcomeMessage(localStorage, modalManager);
    attempt?.commit();
    attempt?.rollback();

    expect(localStorage.getItem("sto_keybind_manager_visited")).toBe("true");
    expect(modalManager.show).toHaveBeenCalledOnce();
    expect(modalManager.show).toHaveBeenCalledWith("aboutModal");
    expect(modalManager.hide).not.toHaveBeenCalled();
  });

  it("does not show the welcome modal after the visit is recorded", () => {
    const modalManager = { show: vi.fn() };
    localStorage.setItem("sto_keybind_manager_visited", "true");

    const attempt = checkAndShowWelcomeMessage(localStorage, modalManager);

    expect(attempt).toBeNull();
    expect(modalManager.show).not.toHaveBeenCalled();
  });

  it("rolls back only the first-visit side effects created by the attempt", () => {
    const modalManager = { show: vi.fn().mockReturnValue(true), hide: vi.fn() };
    const attempt = checkAndShowWelcomeMessage(localStorage, modalManager);

    attempt?.rollback();
    attempt?.rollback();

    expect(localStorage.getItem("sto_keybind_manager_visited")).toBeNull();
    expect(modalManager.hide).toHaveBeenCalledOnce();
    expect(modalManager.hide).toHaveBeenCalledWith("aboutModal");
  });

  it("restores a prior empty marker instead of deleting it", () => {
    const modalManager = { show: vi.fn(), hide: vi.fn() };
    localStorage.setItem("sto_keybind_manager_visited", "");

    const attempt = checkAndShowWelcomeMessage(localStorage, modalManager);
    attempt?.rollback();

    expect(localStorage.getItem("sto_keybind_manager_visited")).toBe("");
  });

  it("does not overwrite a marker changed after the attempt began", () => {
    const modalManager = { show: vi.fn(), hide: vi.fn() };
    const attempt = checkAndShowWelcomeMessage(localStorage, modalManager);
    localStorage.setItem("sto_keybind_manager_visited", "external-owner");

    attempt?.rollback();

    expect(localStorage.getItem("sto_keybind_manager_visited")).toBe(
      "external-owner",
    );
    expect(modalManager.hide).toHaveBeenCalledWith("aboutModal");
  });

  it("rolls back a partial modal failure before propagating it", () => {
    const modalManager = {
      show: vi.fn(() => {
        throw new Error("modal failed after activation");
      }),
      hide: vi.fn(),
    };

    expect(() =>
      checkAndShowWelcomeMessage(localStorage, modalManager),
    ).toThrow("modal failed after activation");
    expect(localStorage.getItem("sto_keybind_manager_visited")).toBeNull();
    expect(modalManager.hide).toHaveBeenCalledWith("aboutModal");
  });
});
