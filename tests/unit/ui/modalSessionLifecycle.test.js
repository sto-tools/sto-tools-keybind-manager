import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  captureModalViewDraft,
  releaseModalSessionResources,
  restoreModalViewDraft,
} from "../../../src/js/components/ui/modalSessionLifecycle.js";

/** @returns {HTMLDivElement} */
function createModal() {
  const modal = document.createElement("div");
  modal.innerHTML = `
    <div class="modal-body">
      <input class="tracked-input" type="text" value="first">
      <input class="tracked-input" type="text" value="selection source">
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

describe("modalSessionLifecycle", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("captures and restores modal scroll, repeated-control focus, and selection", () => {
    const predecessor = createModal();
    const predecessorBody = /** @type {HTMLElement} */ (
      predecessor.querySelector(".modal-body")
    );
    predecessorBody.scrollTop = 41;
    predecessorBody.scrollLeft = 9;
    const predecessorInput = /** @type {HTMLInputElement} */ (
      predecessor.querySelectorAll(".tracked-input")[1]
    );
    predecessorInput.focus();
    predecessorInput.setSelectionRange(2, 8, "backward");

    const draft = captureModalViewDraft(document, predecessor, [
      ".tracked-input",
    ]);
    predecessor.remove();
    const replacement = createModal();

    restoreModalViewDraft(replacement, draft);

    const replacementBody = /** @type {HTMLElement} */ (
      replacement.querySelector(".modal-body")
    );
    const replacementInput = replacement.querySelectorAll(".tracked-input")[1];
    expect(replacementBody.scrollTop).toBe(41);
    expect(replacementBody.scrollLeft).toBe(9);
    expect(document.activeElement).toBe(replacementInput);
    expect(replacementInput).toMatchObject({
      selectionStart: 2,
      selectionEnd: 8,
      selectionDirection: "backward",
    });
  });

  it("returns neutral view state when focus and modal body are absent", () => {
    const outside = document.createElement("button");
    const modal = document.createElement("div");
    document.body.append(outside, modal);
    outside.focus();

    const draft = captureModalViewDraft(document, modal, ["button"]);
    expect(draft).toEqual({
      bodyScrollTop: 0,
      bodyScrollLeft: 0,
      focus: null,
    });
    expect(() => restoreModalViewDraft(modal, draft)).not.toThrow();
    expect(document.activeElement).toBe(outside);
  });

  it("clears owned references and attempts every release after cleanup errors", () => {
    const modalElement = createModal();
    const scheduledShowDetach = vi.fn(() => {
      throw new Error("scheduled");
    });
    const documentDetach = vi.fn(() => {
      throw new Error("document");
    });
    const modalHiddenDetach = vi.fn(() => {
      throw new Error("hidden");
    });
    const detachControls = vi.fn(() => {
      throw new Error("controls");
    });
    const modalManager = {
      show: vi.fn(),
      hide: vi.fn(() => {
        throw new Error("hide");
      }),
      unregisterRegenerateCallback: vi.fn(() => {
        throw new Error("callback");
      }),
    };
    const regenerateCallback = vi.fn();
    const session = {
      modalId: "owned-modal",
      modalElement,
      regenerateCallback,
      scheduledShowDetach,
      documentDetach,
      modalHiddenDetach,
    };
    const cleanupErrors = [];

    releaseModalSessionResources({
      session,
      modalManager,
      detachControls,
      onCleanupError: (error) => cleanupErrors.push(error),
    });

    expect(session).toMatchObject({
      scheduledShowDetach: null,
      documentDetach: null,
      modalHiddenDetach: null,
    });
    expect(scheduledShowDetach).toHaveBeenCalledOnce();
    expect(detachControls).toHaveBeenCalledOnce();
    expect(documentDetach).toHaveBeenCalledOnce();
    expect(modalHiddenDetach).toHaveBeenCalledOnce();
    expect(modalManager.unregisterRegenerateCallback).toHaveBeenCalledWith(
      "owned-modal",
      regenerateCallback,
    );
    expect(modalManager.hide).toHaveBeenCalledWith("owned-modal");
    expect(modalElement.isConnected).toBe(false);
    expect(cleanupErrors.map((error) => error.message)).toEqual([
      "scheduled",
      "controls",
      "document",
      "hidden",
      "callback",
      "hide",
    ]);
  });

  it("can release a hidden-notice settlement without hiding again", () => {
    const modalElement = createModal();
    const modalManager = {
      show: vi.fn(),
      hide: vi.fn(),
      unregisterRegenerateCallback: vi.fn(),
    };
    const session = {
      modalId: "already-hidden",
      modalElement,
      regenerateCallback: vi.fn(),
      scheduledShowDetach: null,
      documentDetach: null,
      modalHiddenDetach: null,
    };

    releaseModalSessionResources({
      session,
      modalManager,
      detachControls: vi.fn(),
      hideModal: false,
      onCleanupError: vi.fn(),
    });

    expect(modalManager.hide).not.toHaveBeenCalled();
    expect(modalElement.isConnected).toBe(false);
  });
});
