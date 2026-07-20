import type i18next from "i18next";
import type CommandChainUI from "../components/ui/CommandChainUI.js";
import type ConfirmDialogUI from "../components/ui/ConfirmDialogUI.js";
import type KeyBrowserService from "../components/services/KeyBrowserService.js";
import type KeyBrowserUI from "../components/ui/KeyBrowserUI.js";
import type devMonitor from "../dev/DevMonitor.js";

declare global {
  interface LegacyCommandDefinition {
    command?: string;
    customizable?: boolean;
    description?: string;
    environment?: string;
    icon?: string;
    name?: string;
    parameters?: Record<string, unknown>;
    syntax?: string;
    warning?: string;
    [field: string]: unknown;
  }

  interface LegacyCommandCategory {
    commands: Record<string, LegacyCommandDefinition>;
    description?: string;
    icon?: string;
    name?: string;
    [field: string]: unknown;
  }

  interface LegacyVFXEffect {
    effect: string;
    label: string;
  }

  interface LegacyKeyLayout {
    name: string;
    rows: Array<Array<{ display: string; key: string }>>;
  }

  interface LegacyProfileDefinition {
    builds?: Record<string, unknown>;
    currentEnvironment?: string;
    description: string;
    name: string;
    [field: string]: unknown;
  }

  interface LegacySTOData {
    commands: Record<string, LegacyCommandCategory>;
    defaultProfiles: Record<string, LegacyProfileDefinition>;
    keyLayouts?: Record<string, LegacyKeyLayout>;
    settings?: {
      autoSave?: boolean;
      defaultMode?: string;
      language?: string;
      maxUndoSteps?: number;
      version?: string;
    };
    vfxEffects: Record<string, LegacyVFXEffect[]>;
    [field: string]: unknown;
  }

  interface Window {
    COMMANDS?: Record<
      string,
      LegacyCommandDefinition & { category: string; key: string }
    >;
    STO_DATA?: LegacySTOData;
    VFX_EFFECTS?: Record<string, LegacyVFXEffect[]>;
    applyTranslations?: (root?: Document | Element | null) => void;
    commandChainUI?: CommandChainUI;
    confirmDialog?: ConfirmDialogUI;
    devMonitor?: typeof devMonitor;
    i18next?: typeof i18next;
    keyBrowserService?: KeyBrowserService;
    keyBrowserUI?: KeyBrowserUI;
    localizeCommandData?: () => void;
  }
}

export {};
