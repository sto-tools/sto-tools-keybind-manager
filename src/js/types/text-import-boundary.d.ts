export type TextImportDiagnostic =
  | {
      code: "unrecognized_keybind_line" | "unsafe_keybind_name";
      line: number;
      source: string;
    }
  | {
      code: "unrecognized_alias_line" | "unsafe_alias_name";
      line: number;
      source: string;
    };

export interface KeybindTextEntry {
  key: string;
  raw: string;
  line: number;
}

export interface AliasTextEntry {
  name: string;
  commands: string;
  description?: string;
  line: number;
}

export type KeybindTextFailure =
  | { success: false; error: "invalid_keybind_file_content" }
  | {
      success: false;
      error: "keybind_file_too_large";
      size: number;
      limit: number;
    };

export type AliasTextFailure =
  | { success: false; error: "invalid_alias_file_content" }
  | {
      success: false;
      error: "alias_file_too_large";
      size: number;
      limit: number;
    };

export type KeybindTextDecodeResult =
  | KeybindTextFailure
  | {
      success: true;
      value: {
        entries: Record<string, KeybindTextEntry>;
        diagnostics: TextImportDiagnostic[];
      };
    };

export type AliasTextDecodeResult =
  | AliasTextFailure
  | {
      success: true;
      value: {
        entries: Record<string, AliasTextEntry>;
        diagnostics: TextImportDiagnostic[];
      };
    };
