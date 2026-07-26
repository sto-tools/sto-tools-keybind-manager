import type { RequiredRpc } from "./base.js";

export type UiDialogType = "warning" | "danger" | "info" | "success";

export interface UiDialogRequest {
  message: string;
  title: string;
  type: UiDialogType;
  context: string;
}

export interface UiRpcProtocol {
  "ui:confirm": RequiredRpc<UiDialogRequest, boolean>;
  "ui:inform": RequiredRpc<UiDialogRequest, boolean>;
}
