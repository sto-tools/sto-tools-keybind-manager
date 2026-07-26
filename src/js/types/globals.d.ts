import type devMonitor from "../dev/DevMonitor.js";

declare global {
  interface Window {
    devMonitor?: typeof devMonitor;
    showDirectoryPicker?: () => Promise<unknown>;
  }
}

export {};
