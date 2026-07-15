import type { AliasRpcProtocol } from "./aliases.js";
import type { ApplicationRpcProtocol } from "./application.js";
import type { BindsetRpcProtocol } from "./bindsets.js";
import type { CommandRpcProtocol } from "./commands.js";
import type { DataRpcProtocol } from "./data.js";
import type { ImportExportRpcProtocol } from "./import-export.js";
import type { KeyRpcProtocol } from "./keys.js";
import type { ParameterPreferenceRpcProtocol } from "./parameters-preferences.js";

export interface RpcProtocol
  extends AliasRpcProtocol,
    BindsetRpcProtocol,
    CommandRpcProtocol,
    DataRpcProtocol,
    ImportExportRpcProtocol,
    KeyRpcProtocol,
    ParameterPreferenceRpcProtocol,
    ApplicationRpcProtocol {}
