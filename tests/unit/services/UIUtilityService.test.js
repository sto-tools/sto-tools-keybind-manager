import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import UIUtilityService from "../../../src/js/components/services/UIUtilityService.js";
import { createEventBusFixture } from "../../fixtures/index.js";

/**
 * Unit tests – UIUtilityService (clipboard and drag-drop utilities)
 */

describe("UIUtilityService", () => {
  let fixture;
  let service;

  beforeEach(() => {
    fixture = createEventBusFixture();
    service = new UIUtilityService(fixture.eventBus);
  });

  afterEach(() => {
    if (!service.destroyed) service.destroy();
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it("should have drag state initialized", () => {
    expect(service.dragState).toEqual({
      isDragging: false,
      dragElement: null,
      dragData: null,
    });
  });

  it("should initialize drag and drop functionality", () => {
    // Create a mock container element
    const container = document.createElement("div");
    container.id = "test-container";
    document.body.appendChild(container);

    // Mock event listener to verify it's called
    const addEventListenerSpy = vi.spyOn(container, "addEventListener");

    // Call initDragAndDrop
    service.initDragAndDrop(container, {
      draggableSelector: ".draggable",
      onDragStart: vi.fn(),
      onDragEnd: vi.fn(),
    });

    // Verify event listeners were added
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "dragstart",
      expect.any(Function),
    );
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "dragend",
      expect.any(Function),
    );
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "dragover",
      expect.any(Function),
    );
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "drop",
      expect.any(Function),
    );

    // Cleanup
    document.body.removeChild(container);
    addEventListenerSpy.mockRestore();
  });

  it("tracks the retained drag lifecycle and invokes drop callbacks", () => {
    const container = document.createElement("div");
    const draggable = document.createElement("div");
    const child = document.createElement("span");
    draggable.className = "draggable";
    draggable.dataset.commandId = "command-1";
    draggable.appendChild(child);
    container.appendChild(draggable);
    document.body.appendChild(container);

    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    const onDrop = vi.fn();
    service.initDragAndDrop(container, {
      draggableSelector: ".draggable",
      dropZoneSelector: ".draggable",
      onDragStart,
      onDragEnd,
      onDrop,
    });

    const setData = vi.fn();
    const dataTransfer = { effectAllowed: "", setData };
    const dragStart = new Event("dragstart", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(dragStart, "dataTransfer", { value: dataTransfer });
    child.dispatchEvent(dragStart);

    expect(service.dragState).toEqual({
      isDragging: true,
      dragElement: draggable,
      dragData: draggable.dataset,
    });
    expect(dataTransfer.effectAllowed).toBe("move");
    expect(setData).toHaveBeenCalledWith("text/html", draggable.outerHTML);
    expect(onDragStart).toHaveBeenCalledWith(dragStart, service.dragState);

    const dragOver = new MouseEvent("dragover", {
      bubbles: true,
      cancelable: true,
    });
    child.dispatchEvent(dragOver);
    expect(dragOver.defaultPrevented).toBe(true);

    const drop = new MouseEvent("drop", {
      bubbles: true,
      cancelable: true,
    });
    child.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(onDrop).toHaveBeenCalledWith(drop, service.dragState, draggable);

    const dragEnd = new Event("dragend", { bubbles: true });
    child.dispatchEvent(dragEnd);
    expect(service.dragState).toEqual({
      isDragging: false,
      dragElement: null,
      dragData: null,
    });
    expect(onDragEnd).toHaveBeenCalledWith(dragEnd, service.dragState);

    container.remove();
  });

  it("replaces and disposes native drag delegates without duplicate drops", () => {
    const container = document.createElement("div");
    const draggable = document.createElement("div");
    draggable.className = "draggable";
    container.append(draggable);
    document.body.append(container);
    const predecessorDrop = vi.fn();
    const successorDrop = vi.fn();

    const predecessorDetach = service.initDragAndDrop(container, {
      onDrop: predecessorDrop,
    });
    const successorDetach = service.initDragAndDrop(container, {
      onDrop: successorDrop,
    });

    draggable.dispatchEvent(new Event("dragstart", { bubbles: true }));
    draggable.dispatchEvent(
      new MouseEvent("drop", { bubbles: true, cancelable: true }),
    );
    expect(predecessorDrop).not.toHaveBeenCalled();
    expect(successorDrop).toHaveBeenCalledOnce();

    predecessorDetach?.();
    service.destroy();
    successorDetach?.();
    draggable.dispatchEvent(
      new MouseEvent("drop", { bubbles: true, cancelable: true }),
    );
    expect(successorDrop).toHaveBeenCalledOnce();
    expect(service.dragState).toEqual({
      isDragging: false,
      dragElement: null,
      dragData: null,
    });
    container.remove();
  });

  describe("Event Handlers", () => {
    it("should handle copy to clipboard events", async () => {
      const copyToClipboardSpy = vi
        .spyOn(service, "copyToClipboard")
        .mockResolvedValue({ success: true });

      await service.handleCopyToClipboard({ text: "test text" });

      expect(copyToClipboardSpy).toHaveBeenCalledWith("test text");

      copyToClipboardSpy.mockRestore();
    });

    it("should handle init drag drop events", async () => {
      const container = document.createElement("div");
      container.id = "drag-container";
      document.body.appendChild(container);
      const initDragAndDrop = vi.spyOn(service, "initDragAndDrop");

      await service.handleInitDragDrop({
        containerId: "drag-container",
        options: { test: true },
      });

      expect(initDragAndDrop).toHaveBeenCalledWith(container, { test: true });

      document.body.removeChild(container);
      initDragAndDrop.mockRestore();
    });
  });

  describe("transport lifecycle", () => {
    const retainedEvent = "ui:copy-to-clipboard";
    const retainedDragDropEvent = "ui:init-drag-drop";
    const canonicalRpc = "utility:copy-to-clipboard";
    const retiredRpc = "ui:copy-to-clipboard";

    const expectTransportState = ({ event, dragDrop, canonical, retired }) => {
      expect(fixture.eventBus.getListenerCount(retainedEvent)).toBe(event);
      expect(fixture.eventBus.getListenerCount(retainedDragDropEvent)).toBe(
        dragDrop,
      );
      expect(fixture.eventBus.getListenerCount(`rpc:${canonicalRpc}`)).toBe(
        canonical,
      );
      expect(fixture.eventBus.getListenerCount(`rpc:${retiredRpc}`)).toBe(
        retired,
      );
    };

    it("keeps retained UI events and the canonical clipboard RPC live across teardown, reinitialization, and replacement", async () => {
      const predecessorCopy = vi
        .spyOn(service, "copyToClipboard")
        .mockResolvedValue({
          success: true,
          message: "content_copied_to_clipboard",
        });
      const initDragAndDrop = vi.spyOn(service, "initDragAndDrop");

      expectTransportState({
        event: 0,
        dragDrop: 0,
        canonical: 0,
        retired: 0,
      });

      service.init();
      service.init();

      expectTransportState({
        event: 1,
        dragDrop: 1,
        canonical: 1,
        retired: 0,
      });

      fixture.eventBus.emit(retainedEvent, { text: "event copy" });
      await vi.waitFor(() => {
        expect(predecessorCopy).toHaveBeenCalledWith("event copy");
      });

      const dragContainer = document.createElement("div");
      document.body.appendChild(dragContainer);
      fixture.eventBus.emit(retainedDragDropEvent, {
        container: dragContainer,
        options: { draggableSelector: ".drag-probe" },
      });
      expect(initDragAndDrop).toHaveBeenCalledWith(dragContainer, {
        draggableSelector: ".drag-probe",
      });
      dragContainer.remove();

      await expect(
        service.request(canonicalRpc, { text: "rpc copy" }),
      ).resolves.toEqual({
        success: true,
        message: "content_copied_to_clipboard",
      });
      expect(predecessorCopy).toHaveBeenCalledWith("rpc copy");

      service.destroy();
      expectTransportState({
        event: 0,
        dragDrop: 0,
        canonical: 0,
        retired: 0,
      });

      fixture.eventBus.emit(retainedEvent, { text: "after destroy" });
      await Promise.resolve();
      expect(predecessorCopy).not.toHaveBeenCalledWith("after destroy");

      service.init();
      expectTransportState({
        event: 1,
        dragDrop: 1,
        canonical: 1,
        retired: 0,
      });

      fixture.eventBus.emit(retainedEvent, { text: "after reinit" });
      await vi.waitFor(() => {
        expect(predecessorCopy).toHaveBeenCalledWith("after reinit");
      });

      service.destroy();
      const predecessorCallCount = predecessorCopy.mock.calls.length;
      const replacement = new UIUtilityService(fixture.eventBus);
      service = replacement;
      const replacementCopy = vi
        .spyOn(replacement, "copyToClipboard")
        .mockResolvedValue({
          success: true,
          message: "content_copied_to_clipboard",
        });
      replacement.init();

      expectTransportState({
        event: 1,
        dragDrop: 1,
        canonical: 1,
        retired: 0,
      });

      fixture.eventBus.emit(retainedEvent, { text: "replacement copy" });
      await vi.waitFor(() => {
        expect(replacementCopy).toHaveBeenCalledOnce();
      });
      expect(replacementCopy).toHaveBeenCalledWith("replacement copy");
      expect(predecessorCopy).toHaveBeenCalledTimes(predecessorCallCount);
    });
  });

  describe("copyToClipboard", () => {
    let originalClipboard;
    let originalExecCommand;

    beforeEach(() => {
      originalClipboard = Object.getOwnPropertyDescriptor(
        navigator,
        "clipboard",
      );
      originalExecCommand = document.execCommand;
    });

    afterEach(() => {
      if (originalClipboard) {
        Object.defineProperty(navigator, "clipboard", originalClipboard);
      } else {
        delete navigator.clipboard;
      }
      document.execCommand = originalExecCommand;
      vi.restoreAllMocks();
    });

    it("returns success payload when clipboard API is available", async () => {
      const writeText = vi.fn().mockResolvedValue();
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });

      const result = await service.copyToClipboard("hello world");

      expect(writeText).toHaveBeenCalledWith("hello world");
      expect(result).toEqual({
        success: true,
        message: "content_copied_to_clipboard",
      });
    });

    it("falls back to execCommand when clipboard API rejects", async () => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: vi.fn().mockRejectedValue(new Error("no clipboard")),
        },
        configurable: true,
      });
      document.execCommand = vi.fn().mockReturnValue(true);

      const result = await service.copyToClipboard("fallback text");

      expect(document.execCommand).toHaveBeenCalledWith("copy");
      expect(result).toEqual({
        success: true,
        message: "content_copied_to_clipboard",
      });
    });

    it("returns failure payload when fallback copy fails", async () => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: vi.fn().mockRejectedValue(new Error("no clipboard")),
        },
        configurable: true,
      });
      document.execCommand = vi.fn(() => {
        throw new Error("exec fail");
      });

      const result = await service.copyToClipboard("cannot copy");

      expect(document.execCommand).toHaveBeenCalledWith("copy");
      expect(result).toEqual({
        success: false,
        message: "failed_to_copy_to_clipboard",
      });
    });
  });
});
