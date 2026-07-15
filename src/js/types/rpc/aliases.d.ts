import type {
  AliasDefinition,
  CodedFailure,
  NoPayloadRpc,
  OptionalRpc,
  RequiredRpc,
  ResponderOnlyOptionalRpc,
} from "./base.js";

export type AliasMutationInput = {
  name?: string;
  description?: string;
};

export type AliasAddResult =
  | {
      success: true;
      message: "alias_created";
      data: { name: string };
    }
  | CodedFailure<
      | "invalid_alias_name"
      | "no_profile_selected"
      | "alias_already_exists"
      | "failed_to_add_alias"
    >;

export type AliasDeleteResult =
  | {
      success: true;
      message: "alias_deleted";
      data: { name: string };
    }
  | CodedFailure<
      "no_profile_selected" | "alias_not_found" | "failed_to_delete_alias"
    >;

export type AliasDuplicateResult =
  | {
      success: true;
      message: "alias_duplicated";
      data: { from: string; to: string };
    }
  | CodedFailure<
      | "invalid_alias_name"
      | "alias_not_found"
      | "alias_already_exists"
      | "failed_to_duplicate_alias"
    >;

export type AliasImportResult =
  | ({
      success: true;
      imported: { aliases: number };
    } & {
      skipped: number;
      overwritten: number;
      cleared: number;
      errors: string[];
      message: string;
    })
  | CodedFailure<
      "no_aliases_found_in_file" | "no_active_profile" | "import_failed"
    >;

export interface AliasRpcProtocol {
  "alias-browser:create": OptionalRpc<AliasMutationInput, AliasAddResult>;
  "alias:add": OptionalRpc<AliasMutationInput, AliasAddResult>;
  "alias:delete": OptionalRpc<{ name?: string }, AliasDeleteResult>;
  "alias:duplicate-with-name": OptionalRpc<
    { sourceName?: string; newName?: string },
    AliasDuplicateResult
  >;
  "alias:get-all": NoPayloadRpc<Record<string, AliasDefinition>>;
  "alias:import-file": ResponderOnlyOptionalRpc<
    { content?: string },
    AliasImportResult
  >;
  "alias:select": RequiredRpc<{ aliasName: string | null }, string | null>;
  "alias:validate-name": OptionalRpc<{ name?: string }, boolean>;
}
