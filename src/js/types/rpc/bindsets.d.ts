import type {
  CodedFailure,
  NoPayloadRpc,
  OptionalRpc,
  ProfileUpdateResult,
  RequiredRpc,
  ResponderOnlyNoPayloadRpc,
  ResponderOnlyOptionalRpc,
  ResponderOnlyRequiredRpc,
  StoredCommand,
} from "./base.js";

export type BindsetUpdateResult<Code extends string> =
  | ProfileUpdateResult
  | CodedFailure<Code>;

export interface BindsetRpcProtocol {
  "bindset-selector:add-key-to-bindset": RequiredRpc<
    { bindset?: string },
    BindsetUpdateResult<"invalid_operation" | "no_profile" | "add_failed">
  >;
  "bindset-selector:find-key-in-bindset": ResponderOnlyRequiredRpc<
    {
      keysObject?: Record<string, StoredCommand[]>;
      selectedKey?: string;
    },
    StoredCommand[] | null
  >;
  "bindset-selector:remove-key-from-bindset": RequiredRpc<
    { bindset?: string },
    BindsetUpdateResult<"invalid_operation" | "no_profile" | "remove_failed">
  >;
  "bindset-selector:set-active-bindset": RequiredRpc<
    { bindset?: string },
    undefined
  >;
  "bindset-selector:set-key": RequiredRpc<{ key?: string }, undefined>;
  "bindset:clone": OptionalRpc<
    { sourceBindset?: string; targetBindset?: string },
    BindsetUpdateResult<
      "invalid_name" | "no_profile" | "name_exists" | "source_not_found"
    >
  >;
  "bindset:create": OptionalRpc<
    { name?: string },
    BindsetUpdateResult<"invalid_name" | "no_profile" | "name_exists">
  >;
  "bindset:delete": OptionalRpc<
    { name?: string },
    BindsetUpdateResult<
      "invalid_name" | "no_profile" | "not_found" | "not_empty"
    >
  >;
  "bindset:delete-with-keys": OptionalRpc<
    { name?: string },
    BindsetUpdateResult<"invalid_name" | "no_profile" | "not_found">
  >;
  "bindset:get-available": ResponderOnlyNoPayloadRpc<string[]>;
  "bindset:get-collapsed-state": ResponderOnlyOptionalRpc<
    { bindsetName?: string },
    boolean
  >;
  "bindset:rename": OptionalRpc<
    { oldName?: string; newName?: string },
    BindsetUpdateResult<
      "invalid_name" | "no_profile" | "not_found" | "name_exists"
    >
  >;
  "bindset:toggle-collapse": RequiredRpc<{ bindsetName?: string }, boolean>;
}
