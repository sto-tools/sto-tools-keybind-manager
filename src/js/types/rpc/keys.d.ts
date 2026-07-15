import type {
  CodedFailure,
  NoPayloadRpc,
  OptionalRpc,
  RequiredRpc,
  ResponderOnlyOptionalRpc,
  ResponderOnlyRequiredRpc,
  StoredCommand,
} from "./base.js";

export type KeyCategory = {
  keys: string[];
  name: string;
  icon: string;
  priority: number;
};

export type KeyCategories = Record<string, KeyCategory>;

export type BindsetSection = {
  name: string;
  keys: string[];
  keyCount: number;
  isCollapsed: boolean;
};

export type KeyAddResult =
  | {
      success: true;
      key: string;
      environment: string;
      bindset: string;
    }
  | CodedFailure<
      | "invalid_key_name"
      | "no_profile_selected"
      | "key_already_exists"
      | "failed_to_add_key"
    >;

export type KeyDeleteResult =
  | { success: true; key: string; environment: string }
  | CodedFailure<
      "no_profile_selected" | "key_not_found" | "failed_to_delete_key"
    >;

export type KeyDuplicateResult =
  | {
      success: true;
      sourceKey: string;
      newKey: string;
      environment: string;
    }
  | CodedFailure<
      | "no_profile_selected"
      | "failed_to_duplicate_key"
      | "invalid_key_name"
      | "key_not_found"
      | "key_already_exists"
      | "no_commands_to_duplicate"
    >;

export interface KeyRpcProtocol {
  "key:add": OptionalRpc<{ key?: string; bindset?: string }, KeyAddResult>;
  "key:categorize-by-command": RequiredRpc<
    {
      keysWithCommands: Record<string, StoredCommand[]>;
      allKeys: string[];
    },
    KeyCategories
  >;
  "key:categorize-by-type": RequiredRpc<
    {
      keysWithCommands: Record<string, StoredCommand[]>;
      allKeys: string[];
    },
    KeyCategories
  >;
  "key:compare": ResponderOnlyRequiredRpc<
    { keyA: string; keyB: string },
    number
  >;
  "key:delete": OptionalRpc<{ key?: string }, KeyDeleteResult>;
  "key:duplicate": ResponderOnlyOptionalRpc<
    { key?: string },
    KeyDuplicateResult
  >;
  "key:duplicate-with-name": OptionalRpc<
    { sourceKey?: string | null; newKey?: string },
    KeyDuplicateResult
  >;
  "key:filter": ResponderOnlyRequiredRpc<
    { keys: string[]; filter?: string },
    string[]
  >;
  "key:get-all": NoPayloadRpc<Record<string, StoredCommand[]>>;
  "key:get-all-sectional": NoPayloadRpc<Record<string, BindsetSection>>;
  "key:get-category-state": RequiredRpc<
    { categoryId: string; mode: string },
    boolean
  >;
  "key:get-selected": NoPayloadRpc<string | null>;
  "key:select": RequiredRpc<
    {
      keyName: string | null;
      environment?: string;
      bindset?: string | null;
    },
    string | null
  >;
  "key:show-all": ResponderOnlyRequiredRpc<{ keys: string[] }, string[]>;
  "key:sort": RequiredRpc<{ keys: string[] }, string[]>;
  "key:toggle-category": RequiredRpc<
    { categoryId: string; mode: string },
    boolean
  >;
}
