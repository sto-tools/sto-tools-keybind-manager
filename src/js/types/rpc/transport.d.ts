import type {
  MaybePromise,
  RpcEmptyPayload,
  RpcPayloadMode,
  RpcSpec,
} from "./base.js";
import type { RpcProtocol } from "./protocol.js";

export type RpcKnownTopic = Extract<keyof RpcProtocol, string>;
export type RpcReadyTopic = {
  [K in RpcKnownTopic]: RpcProtocol[K] extends { kind: "ready" } ? K : never;
}[RpcKnownTopic];

/** Topics with an observed requester and responder in the Phase 0 inventory. */
export type RpcRequestableTopic = {
  [K in RpcReadyTopic]: RpcProtocol[K] extends { availability: "paired" }
    ? K
    : never;
}[RpcReadyTopic];

export type RpcTopicWithMode<M extends RpcPayloadMode> = {
  [K in RpcRequestableTopic]: RpcProtocol[K] extends { mode: M } ? K : never;
}[RpcRequestableTopic];

export type RpcResponderTopicWithMode<M extends RpcPayloadMode> = {
  [K in RpcReadyTopic]: RpcProtocol[K] extends { mode: M } ? K : never;
}[RpcReadyTopic];

export type RpcRequiredTopic = RpcTopicWithMode<"required">;
export type RpcOptionalTopic = RpcTopicWithMode<"optional">;
export type RpcNoPayloadTopic = RpcTopicWithMode<"none">;
export type RpcResponderRequiredTopic = RpcResponderTopicWithMode<"required">;
export type RpcResponderOptionalTopic = RpcResponderTopicWithMode<"optional">;
export type RpcResponderNoPayloadTopic = RpcResponderTopicWithMode<"none">;

export type RpcRequest<K extends RpcReadyTopic> =
  RpcProtocol[K] extends RpcSpec<
    infer Request,
    unknown,
    RpcPayloadMode,
    "paired" | "responder-only"
  >
    ? Request
    : never;

export type RpcResult<K extends RpcReadyTopic> =
  RpcProtocol[K] extends RpcSpec<
    unknown,
    infer Result,
    RpcPayloadMode,
    "paired" | "responder-only"
  >
    ? Result
    : never;

export type RpcHandler<K extends RpcReadyTopic> =
  K extends RpcResponderNoPayloadTopic
    ? () => MaybePromise<RpcResult<K>>
    : K extends RpcResponderOptionalTopic
      ? (payload?: RpcRequest<K>) => MaybePromise<RpcResult<K>>
      : (payload: RpcRequest<K>) => MaybePromise<RpcResult<K>>;

declare const dynamicRpcTopicBrand: unique symbol;
export type DynamicRpcTopic<Request = unknown, Result = unknown> = string & {
  readonly [dynamicRpcTopicBrand]: readonly [Request, Result];
};

export interface RpcRequester {
  <K extends RpcRequiredTopic>(
    topic: K,
    payload: RpcRequest<K>,
  ): Promise<RpcResult<K>>;
  <K extends RpcOptionalTopic>(
    topic: K,
    payload?: RpcRequest<K>,
  ): Promise<RpcResult<K>>;
  <K extends RpcNoPayloadTopic>(
    topic: K,
    payload?: RpcEmptyPayload,
  ): Promise<RpcResult<K>>;
  <Request, Result>(
    topic: DynamicRpcTopic<Request, Result>,
    payload: Request,
  ): Promise<Result>;
}

export type RpcRequestId = `${number}_${string}`;
export type RpcRequestTopic<K extends string> = `rpc:${K}`;
export type RpcReplyTopic<K extends string> = `${K}::reply::${RpcRequestId}`;

export interface RpcRequestEnvelope<K extends RpcReadyTopic> {
  requestId: RpcRequestId;
  replyTopic: RpcReplyTopic<K>;
  payload: RpcRequest<K>;
}

export interface RpcSuccessEnvelope<K extends RpcReadyTopic> {
  requestId: RpcRequestId;
  data: RpcResult<K>;
  error?: never;
}

export interface RpcFailureEnvelope {
  requestId: RpcRequestId;
  error: string;
  data?: never;
}

export type RpcReplyEnvelope<K extends RpcReadyTopic> =
  | RpcSuccessEnvelope<K>
  | RpcFailureEnvelope;

export interface RawRpcMessage {
  requestId?: string;
  replyTopic?: string;
  payload?: unknown;
  data?: unknown;
  error?: string;
}

export type NoPayload = RpcEmptyPayload;
