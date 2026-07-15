import type {
  EventPayload,
  EventTopic,
  LegacyListenerTopic,
} from "./protocol.js";
import type { LegacyDomMirrorTopic } from "./legacy-dom.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;
type Assert<Condition extends true> = Condition;

/** A DOM compatibility mirror must never silently enter direct on/emit. */
export type AssertNoLegacyDomTopicsInEventProtocol = Assert<
  Equal<Extract<EventTopic, LegacyDomMirrorTopic>, never>
>;

type IsAny<Value> = 0 extends 1 & Value ? true : false;
type IsExactlyUnknown<Value> =
  IsAny<Value> extends true
    ? false
    : unknown extends Value
      ? [Value] extends [unknown]
        ? true
        : false
      : false;
type TopicsWithoutProducerAuthority = {
  [Topic in EventTopic]: IsExactlyUnknown<EventPayload<Topic>> extends true
    ? Topic
    : never;
}[EventTopic];

/** Every `unknown` payload belongs to the explicit listen-only surface. */
export type AssertUnknownPayloadsAreListenOnly = Assert<
  Equal<TopicsWithoutProducerAuthority, LegacyListenerTopic>
>;
