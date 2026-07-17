import type { EventPayload, EventTopic } from "./protocol.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;
type Assert<Condition extends true> = Condition;

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

/** Every maintained direct topic has an explicit producer-owned payload. */
export type AssertNoUnknownEventPayloads = Assert<
  Equal<TopicsWithoutProducerAuthority, never>
>;
