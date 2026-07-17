import type STOToolsKeybindManager from "../../app.js";
import type {
  DragDropOptions,
  ToastKind,
  VfxManagerCapability,
} from "./base.js";
import type { ComponentReplyTopic } from "./dynamic.js";

export interface UiEventProtocol {
  "about:show": null;
  "file-explorer:open": null;
  "modal:hide": { modalId: string };
  "modal:show": { modalId: string };
  "toast:show": { message: string; type: ToastKind; duration?: number };
  "ui:copy-to-clipboard": { text: string };
  "ui:init-drag-drop": {
    container?: Element | null;
    containerId?: string;
    options?: DragDropOptions;
  };
  "vfx:save-effects": null;
  "vfx:show-modal": null;
  "component:register": {
    name: string;
    replyTopic: ComponentReplyTopic;
  };
  "modal:hidden": { modalId: string; success: boolean };
  "modal:regenerated": { modalId: string };
  "modal:shown": { modalId: string; success: boolean };
  "sto-app-ready": { app: STOToolsKeybindManager };
  "vfx:modal-populate": { vfxManager: VfxManagerCapability };
}
