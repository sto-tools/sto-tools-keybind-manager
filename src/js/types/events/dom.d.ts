export type DomEventHandler = (event: Event) => unknown;
export type DomEventDetach = () => void;

/**
 * DOM registration is a local lifecycle seam. It never publishes the native
 * event onto the application EventBus.
 */
export interface DomEventSurface {
  onDom(
    target: string | EventTarget,
    domEvent: string,
    handler: DomEventHandler,
  ): DomEventDetach;

  onDomDebounced(
    target: string | EventTarget,
    domEvent: string,
    handler: DomEventHandler,
    delay?: number,
  ): DomEventDetach;
}
