import ComponentBase from "../ComponentBase.js";

/** @typedef {() => void} DetachFunction */
/**
 * @typedef {Object} DragDropOptions
 * @property {string} [draggableSelector]
 * @property {string} [dropZoneSelector]
 * @property {((event: DragEvent, state: DragState) => void) | null} [onDragStart]
 * @property {((event: DragEvent, state: DragState) => void) | null} [onDragEnd]
 * @property {((event: DragEvent, state: DragState, dropZone: Element) => void) | null} [onDrop]
 */
/** @typedef {{ isDragging: boolean, dragElement: HTMLElement | null, dragData: DOMStringMap | null }} DragState */

/*
 * UIUtilityService - Handles miscellaneous UI utility functions
 * All operations are accessible via eventBus events or requestResponse
 */
export default class UIUtilityService extends ComponentBase {
  /** @param {import('./serviceTypes.js').EventBus} eventBus */
  constructor(eventBus) {
    super(eventBus);
    this.componentName = "UIUtilityService";

    /** @type {DragState} */
    this.dragState = {
      isDragging: false,
      dragElement: null,
      dragData: null,
    };
    /** @type {DetachFunction[]} */
    this.requestDetachers = [];

    this.setupEventListeners();
  }

  onDestroy() {
    // Clean up request handlers
    if (this.requestDetachers) {
      this.requestDetachers.forEach((detach) => detach());
      this.requestDetachers = [];
    }

    super.onDestroy();
  }

  setupEventListeners() {
    const eventBus = this.eventBus;
    if (!eventBus) return;

    // Clipboard operations
    eventBus.on("ui:copy-to-clipboard", this.handleCopyToClipboard.bind(this));

    // Drag and drop
    eventBus.on("ui:init-drag-drop", this.handleInitDragDrop.bind(this));

    // Request/Response handlers for operations that need return values
    this.setupRequestHandlers();
  }

  setupRequestHandlers() {
    // Store detach functions for cleanup
    this.requestDetachers = [];

    const copyHandler = async (
      { text = "" } = /** @type {{ text?: string }} */ ({}),
    ) => this.copyToClipboard(text);
    this.requestDetachers.push(
      this.respond("ui:copy-to-clipboard", copyHandler),
    );
    this.requestDetachers.push(
      this.respond("utility:copy-to-clipboard", copyHandler),
    );
  }

  // Event Handlers
  /** @param {{ text: string }} payload */
  async handleCopyToClipboard({ text }) {
    const result = await this.copyToClipboard(text);
    this.emit("ui:clipboard-result", { success: result, text });
  }

  /** @param {{ container?: HTMLElement | null, containerId?: string, options?: DragDropOptions }} payload */
  async handleInitDragDrop({ container, containerId, options = {} }) {
    const element =
      container || (containerId ? document.getElementById(containerId) : null);
    this.initDragAndDrop(element, options);
    this.emit("ui:drag-drop-initialized", { containerId, options });
  }

  // Core Utility Methods
  /** @param {string} text */
  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return { success: true, message: "content_copied_to_clipboard" };
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();

      try {
        document.execCommand("copy");
        return { success: true, message: "content_copied_to_clipboard" };
      } catch {
        return { success: false, message: "failed_to_copy_to_clipboard" };
      } finally {
        document.body.removeChild(textArea);
      }
    }
  }

  /** @param {HTMLElement | null} container @param {DragDropOptions} [options] */
  initDragAndDrop(container, options = {}) {
    if (!container) return;

    const {
      draggableSelector = ".draggable",
      dropZoneSelector = draggableSelector,
      onDragStart = null,
      onDragEnd = null,
      onDrop = null,
    } = options;

    container.addEventListener("dragstart", (e) => {
      const target = e.target instanceof Element ? e.target : null;
      const dragEl = target?.closest(draggableSelector);
      if (dragEl) {
        if (!(dragEl instanceof HTMLElement)) return;
        //
        this.dragState.isDragging = true;
        this.dragState.dragElement = dragEl;
        this.dragState.dragData = dragEl.dataset;

        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/html", dragEl.outerHTML);
        }

        if (onDragStart) onDragStart(e, this.dragState);
      }
    });

    container.addEventListener("dragend", (e) => {
      const target = e.target instanceof Element ? e.target : null;
      const dragEl = target?.closest(draggableSelector);
      if (dragEl) {
        //
        this.dragState.isDragging = false;
        this.dragState.dragElement = null;
        this.dragState.dragData = null;

        if (onDragEnd) onDragEnd(e, this.dragState);
      }
    });

    // Allow dropping and keep track of the current row we are hovering over
    /** @type {Element | null} */
    let lastHoverDropZone = null;
    container.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!dropZoneSelector) return;

      const target = e.target instanceof Element ? e.target : null;
      const hoverEl = target?.closest(dropZoneSelector) ?? null;
      if (hoverEl && hoverEl !== lastHoverDropZone) {
        lastHoverDropZone = hoverEl;
      }
    });

    container.addEventListener("drop", (e) => {
      e.preventDefault();

      // Identify the element that should be treated as the drop target based on selector
      let dropZone = null;
      if (dropZoneSelector) {
        // Use closest to find ancestor matching selector (works even if event.target is a child)
        if (e.target instanceof Element) {
          dropZone = e.target.closest(dropZoneSelector);
        }
        //
        if (
          !dropZone &&
          typeof document !== "undefined" &&
          document.elementFromPoint
        ) {
          const pointEl = document.elementFromPoint(e.clientX, e.clientY);
          dropZone = pointEl?.closest
            ? pointEl.closest(dropZoneSelector)
            : null;
        }

        // Final fallback to the last row we hovered over
        if (!dropZone) {
          dropZone = lastHoverDropZone;
        }
      }

      if (dropZone) {
        //
        if (dropZone && onDrop) onDrop(e, this.dragState, dropZone);
      }
    });
  }
}
