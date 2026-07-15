import type i18next from "i18next";
import type AliasBrowserUI from "../components/ui/AliasBrowserUI.js";
import type CommandChainUI from "../components/ui/CommandChainUI.js";
import type ConfirmDialogUI from "../components/ui/ConfirmDialogUI.js";
import type DataService from "../components/services/DataService.js";
import type InputDialogUI from "../components/ui/InputDialogUI.js";
import type KeyBrowserService from "../components/services/KeyBrowserService.js";
import type KeyBrowserUI from "../components/ui/KeyBrowserUI.js";
import type devMonitor from "../dev/DevMonitor.js";
import type { STOCommandParser } from "../lib/STOCommandParser.js";

declare global {
  var STO_DATA: LegacySTOData | undefined;

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
    COMMAND_CATEGORIES?: Record<string, LegacyCommandCategory>;
    DEFAULT_SETTINGS?: {
      autoSave: boolean;
      defaultMode: string;
      exportFormat: string;
      keyLayout: string;
      language: string;
      maxUndoSteps: number;
      showTooltips: boolean;
    };
    KEY_LAYOUTS?: Record<string, LegacyKeyLayout>;
    SAMPLE_ALIASES?: Record<
      string,
      { commands: string[]; description: string; name: string }
    >;
    SAMPLE_PROFILES?: Array<
      LegacyProfileDefinition & {
        builds: Record<string, unknown>;
        created: string;
        id: string;
        modified: string;
      }
    >;
    STO_DATA?: LegacySTOData;
    TRAY_CONFIG?: {
      defaultTray: number;
      maxCommandsPerSlot: number;
      maxTrays: number;
      slotsPerTray: number;
    };
    VFX_EFFECTS?: Record<string, LegacyVFXEffect[]>;
    applyTranslations?: (root?: Document | Element | null) => void;
    commandChainUI?: CommandChainUI;
    confirmDialog?: ConfirmDialogUI;
    dataService?: DataService;
    devMonitor?: typeof devMonitor;
    i18next?: typeof i18next;
    inputDialog?: InputDialogUI;
    keyBrowserService?: KeyBrowserService;
    keyBrowserUI?: KeyBrowserUI;
    localizeCommandData?: () => void;
    stoAliases?: AliasBrowserUI;
    stoCommandParser?: STOCommandParser;
  }
}

export {};
