import type CommandChainUI from "../components/ui/CommandChainUI.js";
import type KeyBrowserService from "../components/services/KeyBrowserService.js";
import type KeyBrowserUI from "../components/ui/KeyBrowserUI.js";
import type devMonitor from "../dev/DevMonitor.js";

declare global {
  interface Window {
    commandChainUI?: CommandChainUI;
    devMonitor?: typeof devMonitor;
    keyBrowserService?: KeyBrowserService;
    keyBrowserUI?: KeyBrowserUI;
    showDirectoryPicker?: () => Promise<unknown>;
  }
}

export {};
