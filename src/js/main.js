import './constants.js';
import './eventBus.js';
import './data.js';
import './errors.js';
import STOStorage from './storage.js';
import STOProfileManager from './profiles.js';
import STOKeybindFileManager from './keybinds.js';
import STOAliasManager from './aliases.js';
import STOExportManager from './export.js';
import STOModalManager from './modalManager.js';
import STOUIManager from './ui.js';
import STOCommandManager from './commands.js';
import STOFileExplorer from './fileexplorer.js';
import VertigoManager, { VFX_EFFECTS } from './vertigo_data.js';
import STOToolsKeybindManager from './app.js';
import './version.js';

const stoStorage = new STOStorage();
const stoProfiles = new STOProfileManager();
const stoKeybinds = new STOKeybindFileManager();
const stoAliases = new STOAliasManager();
const stoExport = new STOExportManager();
const modalManager = new STOModalManager();
const stoUI = new STOUIManager();
const stoCommands = new STOCommandManager();
const stoFileExplorer = new STOFileExplorer();
const vertigoManager = new VertigoManager();
Object.assign(window, {
  stoStorage,
  stoProfiles,
  stoKeybinds,
  stoAliases,
  stoExport,
  modalManager,
  stoUI,
  stoCommands,
  stoFileExplorer,
  vertigoManager,
  VFX_EFFECTS,
  VERTIGO_EFFECTS: VFX_EFFECTS
});

const app = new STOToolsKeybindManager();
window.app = app;

eventBus.on('sto-app-ready', () => {
  stoProfiles.init();
  stoKeybinds.init();
  stoAliases.init();
  stoExport.init();
  stoFileExplorer.init();
});
