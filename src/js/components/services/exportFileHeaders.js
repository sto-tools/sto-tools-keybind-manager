import { stoData } from "../../data.js";

/**
 * @param {{profileName: string, environment: string, keyCount: number, filename: string | null, translate: (key: string, options?: Record<string, unknown>) => string}} projection
 */
export function renderKeybindFileHeader({
  profileName,
  environment,
  keyCount,
  filename,
  translate,
}) {
  const timestamp = new Date().toLocaleString();
  return `; ================================================================
; ${profileName} - STO Keybind Configuration
; ================================================================
; ${translate("environment")} ${environment.toUpperCase()}
; ${translate("generated")} ${timestamp}
; ${translate("created_by")} STO Tools Keybind Manager v${stoData.settings.version}
;
; ${translate("statistics")}:
; - ${translate("total_commands")}: ${keyCount}
;
; To use this keybind file in Star Trek Online:
; 1. Save this file in your STO Live folder as a .txt file
; 2. In-game, type: /bind_load_file ${filename}
; 3. Your keybinds will be applied immediately
; ================================================================

`;
}

/**
 * @param {{profileName: string, aliasCount: number, translate: (key: string, options?: Record<string, unknown>) => string}} projection
 */
export function renderAliasFileHeader({ profileName, aliasCount, translate }) {
  const timestamp = new Date().toLocaleString();
  return `; ================================================================
; ${profileName} - STO Alias Configuration
; ================================================================
; ${translate("environment")} Alias
; ${translate("generated")} ${timestamp}
; ${translate("created_by")} STO Tools Keybind Manager v${stoData.settings.version}
;
; Alias Statistics:
; - Total aliases: ${aliasCount}
;
; To use these aliases in Star Trek Online:
; 1. Save this file as "CommandAliases.txt" (exactly, without quotes)
; 2. Place it in your STO directory:
;    [STO Install]\\Star Trek Online\\Live\\localdata\\CommandAliases.txt
; 3. The aliases will be available when you start the game
;
; Alternative: You can append these aliases to an existing CommandAliases.txt
; file if you already have one with other aliases.
;
; Common STO installation paths:
; - Steam: C:\\Program Files (x86)\\Steam\\steamapps\\common\\Star Trek Online
; - Epic: C:\\Program Files\\Epic Games\\Star Trek Online
; - Arc: C:\\Program Files (x86)\\Perfect World Entertainment\\Arc Games\\Star Trek Online
; ================================================================

`;
}
