import type { Environment } from "./base.js";

declare const dynamicEventTopicBrand: unique symbol;

/**
 * The only generic escape from the explicit EventProtocol map. A caller must
 * carry the payload type in the topic itself; a plain `string` is deliberately
 * not assignable to this type.
 */
export type DynamicEventTopic<Payload, Family extends string> = string & {
  readonly [dynamicEventTopicBrand]: {
    readonly payload: Payload;
    readonly family: Family;
  };
};

export type DynamicEventPayload<Topic> =
  Topic extends DynamicEventTopic<infer Payload, string> ? Payload : never;

export interface ComponentStateReply<Sender extends string, State> {
  sender: Sender;
  state: State;
}

/**
 * State is intentionally generic: the late-join snapshot is discriminated by
 * sender and cannot honestly be widened to one common object shape.
 */
export type ComponentReplyTopic<
  Sender extends string,
  State,
> = `component:registered:reply:${string}:${number}` &
  DynamicEventTopic<
    ComponentStateReply<Sender, State>,
    "component-late-join-reply"
  >;

export type RpcRequestId = `${number}_${string}`;

export type RpcReplyEventTopic<
  BusinessTopic extends string,
  Result,
> = `${BusinessTopic}::reply::${RpcRequestId}` &
  DynamicEventTopic<RpcReplyEnvelope<Result>, "rpc-reply">;

export interface RpcRequestEnvelope<
  BusinessTopic extends string,
  Request,
  Result,
> {
  requestId: RpcRequestId;
  replyTopic: RpcReplyEventTopic<BusinessTopic, Result>;
  payload: Request;
}

export type RpcReplyEnvelope<Result> =
  | { requestId: RpcRequestId; data: Result; error?: never }
  | { requestId: RpcRequestId; error: string; data?: never };

/** Request and result stay correlated through the branded request topic. */
export type RpcRequestEventTopic<
  BusinessTopic extends string,
  Request,
  Result,
> = `rpc:${BusinessTopic}` &
  DynamicEventTopic<
    RpcRequestEnvelope<BusinessTopic, Request, Result>,
    "rpc-request"
  >;

export interface ObservedStoreProtocol {
  currentMode: Environment;
}

/** The only observed production store notification is store:currentMode. */
export type StoreEventTopic<
  Property extends Extract<keyof ObservedStoreProtocol, string>,
> = `store:${Property}` &
  DynamicEventTopic<ObservedStoreProtocol[Property], "store-notification">;

/**
 * Future proxy properties must explicitly supply their assigned value type;
 * this prevents the store family from becoming an unqualified string escape.
 */
export type DynamicStoreEventTopic<
  Property extends string,
  Value,
> = `store:${Property}` & DynamicEventTopic<Value, "store-notification">;
