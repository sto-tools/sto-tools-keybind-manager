export type StoredCommand =
  import("../../components/services/serviceTypes.js").StoredCommand;
export type AliasDefinition =
  import("../../components/services/serviceTypes.js").AliasDefinition;
export type Profile =
  import("../../components/services/serviceTypes.js").ProfileData;
export type ProfileOperations =
  import("../../components/services/serviceTypes.js").ProfileOperations;
export type CoordinatorState =
  import("../../components/services/serviceTypes.js").CoordinatorState;
export type CommandDefinition =
  import("../../components/services/serviceTypes.js").CommandDefinition;
export type CommandCategory =
  import("../../components/services/serviceTypes.js").CommandCategory;
export type CommandImportSource =
  import("../../components/services/serviceTypes.js").CommandImportSource;
export type KBFImportConfiguration =
  import("../../components/services/serviceTypes.js").KBFImportConfiguration;
export type KBFParseResult =
  import("../../components/services/serviceTypes.js").KBFParseResult;

export type Settings = Record<string, unknown>;
export type UnknownRecord = Record<string, unknown>;
export type Environment = "space" | "ground" | "alias" | (string & {});

export type RpcPayloadMode = "none" | "optional" | "required";
export type RpcAvailability = "paired" | "responder-only";
export type RpcEmptyPayload = undefined | Readonly<Record<PropertyKey, never>>;
export type MaybePromise<T> = T | PromiseLike<T>;

export interface RpcSpec<
  Request,
  Result,
  Mode extends RpcPayloadMode,
  Availability extends RpcAvailability = "paired",
> {
  readonly kind: "ready";
  readonly request: Request;
  readonly result: Result;
  readonly mode: Mode;
  readonly availability: Availability;
}

export type RequiredRpc<Request, Result> = RpcSpec<Request, Result, "required">;
export type OptionalRpc<Request, Result> = RpcSpec<Request, Result, "optional">;
export type NoPayloadRpc<Result> = RpcSpec<RpcEmptyPayload, Result, "none">;

export type ResponderOnlyRequiredRpc<Request, Result> = RpcSpec<
  Request,
  Result,
  "required",
  "responder-only"
>;
export type ResponderOnlyOptionalRpc<Request, Result> = RpcSpec<
  Request,
  Result,
  "optional",
  "responder-only"
>;
export type ResponderOnlyNoPayloadRpc<Result> = RpcSpec<
  RpcEmptyPayload,
  Result,
  "none",
  "responder-only"
>;

export type CodedFailure<Code extends string> = {
  success: false;
  error: Code;
  params?: Record<string, unknown>;
};

export type ProfileUpdateResult = {
  success: true;
  profile: Profile;
};

export type ImportCounters = {
  skipped: number;
  overwritten: number;
  cleared: number;
  errors: string[];
  message: string;
};
