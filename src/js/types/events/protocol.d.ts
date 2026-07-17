import type { AliasEventProtocol } from "./aliases.js";
import type { BindsetEventProtocol } from "./bindsets.js";
import type { CommandEventProtocol } from "./commands.js";
import type { DataEventProtocol } from "./data.js";
import type { DynamicEventTopic, DynamicEventPayload } from "./dynamic.js";
import type { KeyEventProtocol } from "./keys.js";
import type { LegacyDomMirrorSurface } from "./legacy-dom.js";
import type { PreferencesEventProtocol } from "./preferences.js";
import type { ProfileEventProtocol } from "./profiles.js";
import type { SelectionEventProtocol } from "./selection.js";
import type { StorageEventProtocol } from "./storage.js";
import type { UiEventProtocol } from "./ui.js";

/**
 * The complete direct application-event registry captured for Phase 1.
 * Each literal production topic is declared in exactly one domain interface.
 * Dynamic transport topics and legacy DOM mirrors are deliberately separate.
 */
export interface EventProtocol
  extends AliasEventProtocol,
    BindsetEventProtocol,
    CommandEventProtocol,
    DataEventProtocol,
    KeyEventProtocol,
    PreferencesEventProtocol,
    ProfileEventProtocol,
    SelectionEventProtocol,
    StorageEventProtocol,
    UiEventProtocol {}

export type EventTopic = Extract<keyof EventProtocol, string>;
export type EventPayload<Topic extends EventTopic> = EventProtocol[Topic];
export type EventHandler<Topic extends EventTopic> = (
  payload: EventPayload<Topic>,
) => unknown;
export type DynamicEventHandler<
  Topic extends DynamicEventTopic<unknown, string>,
> = (payload: DynamicEventPayload<Topic>) => unknown;
export type EventDetach = () => void;
export interface EventEmitOptions {
  synchronous?: boolean;
}
export type EventEmitResult = Promise<void | PromiseSettledResult<unknown>[]>;

export type EventEmitTopic = EventTopic;

export type EventEmitArguments<Topic extends EventEmitTopic> =
  null extends EventPayload<Topic>
    ? [payload?: EventPayload<Topic>, options?: EventEmitOptions]
    : [payload: EventPayload<Topic>, options?: EventEmitOptions];

export type EventTopicsAllowingOmittedPayload = {
  [Topic in EventEmitTopic]: null extends EventPayload<Topic> ? Topic : never;
}[EventEmitTopic];

/**
 * Runtime event-bus contract. Literal application topics are checked against
 * EventProtocol. Dynamic topics must carry an explicit payload-bearing brand;
 * a plain or template-literal `string` is deliberately not an escape hatch.
 */
export interface TypedEventBus extends LegacyDomMirrorSurface {
  on<Topic extends EventTopic>(
    topic: Topic,
    handler: EventHandler<Topic>,
    context?: unknown,
  ): EventDetach;
  on<Payload, Family extends string>(
    topic: DynamicEventTopic<Payload, Family>,
    handler: (payload: Payload) => unknown,
    context?: unknown,
  ): EventDetach;

  off<Topic extends EventTopic>(
    topic: Topic,
    handler: EventHandler<Topic>,
  ): void;
  off<Payload, Family extends string>(
    topic: DynamicEventTopic<Payload, Family>,
    handler: (payload: Payload) => unknown,
  ): void;

  once<Topic extends EventTopic>(
    topic: Topic,
    handler: EventHandler<Topic>,
  ): EventDetach;
  once<Payload, Family extends string>(
    topic: DynamicEventTopic<Payload, Family>,
    handler: (payload: Payload) => unknown,
  ): EventDetach;

  emit<Topic extends EventEmitTopic>(
    topic: Topic,
    ...args: EventEmitArguments<Topic>
  ): EventEmitResult;
  emit<Payload, Family extends string>(
    topic: DynamicEventTopic<Payload, Family>,
    payload: Payload,
    options?: EventEmitOptions,
  ): EventEmitResult;

  clear(): void;
  hasListeners(topic: string): boolean;
}
