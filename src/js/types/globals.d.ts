import type i18next from "i18next";
import type CommandChainUI from "../components/ui/CommandChainUI.js";
import type KeyBrowserService from "../components/services/KeyBrowserService.js";
import type KeyBrowserUI from "../components/ui/KeyBrowserUI.js";
import type devMonitor from "../dev/DevMonitor.js";

declare global {
  interface Window {
    applyTranslations?: (root?: Document | Element | null) => void;
    commandChainUI?: CommandChainUI;
    devMonitor?: typeof devMonitor;
    i18next?: typeof i18next;
    keyBrowserService?: KeyBrowserService;
    keyBrowserUI?: KeyBrowserUI;
    showDirectoryPicker?: () => Promise<unknown>;
  }
}

export {};
