/**
 * Profile Normalizer
 * 
 * Migrates legacy profile data to use canonical string commands:
 * - Converts rich command objects to strings
 * - Converts alias commands from single string to array
 * - Ensures all command data uses string[] format
 * - Removes old VFX aliases (now virtual)
 */

import { normalizeToString, normalizeToStringArray as _normalizeToStringArray } from './commandDisplayAdapter.js'

// Current migration version - profiles not matching this will be migrated
const CURRENT_MIGRATION_VERSION = '2.1.1'

// Migration rules - defines what migrations to run for each version upgrade
// Each rule defines migrations FROM a version TO the next version
const MIGRATION_RULES = {
  '2.0.0': {
    targetVersion: '2.1.0',
    migrations: ['removeVFXAliases']
  },
  '2.1.0': {
    targetVersion: '2.1.1',
    migrations: ['fixVFXCommandSpelling']
  }
  // Future example:
  // '2.1.1': {
  //   targetVersion: '2.2.0',
  //   migrations: ['someNewMigration']
  // }
}

// Get the migration path from current version to target version
function getMigrationPath(currentVersion, targetVersion) {
  const path = []
  let version = currentVersion || '2.0.0' // Default to 2.0.0 if no version (pre-migration profiles)
  
  while (version !== targetVersion && MIGRATION_RULES[version]) {
    const rule = MIGRATION_RULES[version]
    path.push({
      fromVersion: version,
      toVersion: rule.targetVersion,
      migrations: rule.migrations
    })
    version = rule.targetVersion
  }
  
  return path
}

// Lightweight, synchronous optimisation: convert 'TrayExecByTray 1 t s' → '+TrayExecByTray t s'
// and 'TrayExecByTrayWithBackup 1 t s bt bs' → '+TrayExecByTrayWithBackup t s bt bs'
function optimizeTrayCommandSync(cmd) {
  if (typeof cmd !== 'string') return cmd
  const trayRegex   = /^(?:STO)?TrayExecByTray\s+1\s+(\d+)\s+(\d+)$/i
  const backupRegex = /^TrayExecByTrayWithBackup\s+1\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/i
  let m = cmd.match(trayRegex)
  if (m) {
    return `+TrayExecByTray ${m[1]} ${m[2]}`
  }
  m = cmd.match(backupRegex)
  if (m) {
    return `+TrayExecByTrayWithBackup ${m[1]} ${m[2]} ${m[3]} ${m[4]}`
  }
  return cmd
}

function normalizeToStringArrayOptimized(commands) {
  return _normalizeToStringArray(commands).map(optimizeTrayCommandSync)
}

/**
 * Normalize a profile to use canonical string commands
 * @param {Object} profile - Profile to normalize
 * @returns {Object} Normalized profile (mutates original)
 */
export function normalizeProfile(profile) {
  if (!profile || typeof profile !== 'object') {
    return profile
  }

  let hasChanges = false
  const currentVersion = profile.migrationVersion || '2.0.0'
  
  // Get migration path from current version to target version
  const migrationPath = getMigrationPath(currentVersion, CURRENT_MIGRATION_VERSION)
  
  // Run all migrations in sequence
  for (const step of migrationPath) {
    console.log(`[ProfileNormalizer] Migrating from ${step.fromVersion} to ${step.toVersion}`)
    
    for (const migration of step.migrations) {
      if (migration === 'removeVFXAliases') {
        hasChanges = runVFXAliasMigration(profile) || hasChanges
      } else if (migration === 'fixVFXCommandSpelling') {
        hasChanges = runVFXCommandSpellingMigration(profile) || hasChanges
      }
      // Future migrations can be added here
    }
  }

  // Always run legacy command normalization (for backwards compatibility)
  hasChanges = runLegacyCommandNormalization(profile) || hasChanges

  // Update lastModified if we made changes
  if (hasChanges || currentVersion !== CURRENT_MIGRATION_VERSION) {
    profile.lastModified = new Date().toISOString()
    profile.migrationVersion = CURRENT_MIGRATION_VERSION
  }

  return profile
}

// Migration: Remove old VFX aliases (2.0.0 -> 2.1.0)
function runVFXAliasMigration(profile) {
  let hasChanges = false
  
  if (profile.aliases && typeof profile.aliases === 'object') {
    for (const [aliasName, aliasData] of Object.entries(profile.aliases)) {
      if (aliasData && typeof aliasData === 'object') {
        // Remove VFX aliases - they're now virtual and managed by VFXManagerService
        if (aliasData.type === 'vfx-alias' || aliasName.startsWith('dynFxSetFXExclusionList')) {
          console.log(`[ProfileNormalizer] Removing old VFX alias: ${aliasName}`)
          delete profile.aliases[aliasName]
          hasChanges = true
        }
      }
    }
  }
  
  return hasChanges
}

// Migration: Fix VFX command spelling (2.1.0 -> 2.1.1)
function runVFXCommandSpellingMigration(profile) {
  let hasChanges = false

  // Only fix VFX aliases that the tool actually generates
  const vfxAliasNames = [
    'dynFxSetFXExclusionList_Combined',
    'dynFxSetFXExclusionList_Space',
    'dynFxSetFXExclusionList_Ground'
  ]

  // Fix alias commands ONLY for VFX Manager aliases
  // Note: We don't touch keybinds - if users manually put wrong spelling there, that's on them to resolve
  if (profile.aliases && typeof profile.aliases === 'object') {
    for (const aliasName of vfxAliasNames) {
      if (profile.aliases[aliasName] && typeof profile.aliases[aliasName] === 'object') {
        const aliasData = profile.aliases[aliasName]
        if (aliasData.commands) {
          const corrected = correctVFXCommandSpelling(aliasData.commands)
          if (JSON.stringify(corrected) !== JSON.stringify(aliasData.commands)) {
            console.log(`[ProfileNormalizer] Fixing VFX command spelling in alias: ${aliasName}`)
            profile.aliases[aliasName].commands = corrected
            hasChanges = true
          }
        }
      }
    }
  }

  return hasChanges
}

// Helper function to correct VFX command spelling
function correctVFXCommandSpelling(commands) {
  if (!commands) return commands

  // Handle string commands
  if (typeof commands === 'string') {
    return commands.replace(/\bdynFxSetFXExclusionList\b/g, 'dynFxSetFXExlusionList')
  }

  // Handle array of commands
  if (Array.isArray(commands)) {
    return commands.map(cmd => {
      if (typeof cmd === 'string') {
        return cmd.replace(/\bdynFxSetFXExclusionList\b/g, 'dynFxSetFXExlusionList')
      }
      return cmd
    })
  }

  return commands
}

// Legacy command normalization (always runs for backwards compatibility)
function runLegacyCommandNormalization(profile) {
  let hasChanges = false

  // Normalize keybind commands in all environments
  if (profile.builds && typeof profile.builds === 'object') {
    for (const [envName, envData] of Object.entries(profile.builds)) {
      if (envData && envData.keys && typeof envData.keys === 'object') {
        for (const [keyName, keyCommands] of Object.entries(envData.keys)) {
          const normalized = normalizeKeyCommands(keyCommands)
          if (JSON.stringify(normalized) !== JSON.stringify(keyCommands)) {
            profile.builds[envName].keys[keyName] = normalized
            hasChanges = true
          }
        }
      }
    }
  }

  // Normalize alias commands
  if (profile.aliases && typeof profile.aliases === 'object') {
    for (const [aliasName, aliasData] of Object.entries(profile.aliases)) {
      if (aliasData && typeof aliasData === 'object') {        
        const normalized = normalizeAliasCommands(aliasData.commands)
        if (JSON.stringify(normalized) !== JSON.stringify(aliasData.commands)) {
          profile.aliases[aliasName].commands = normalized
          hasChanges = true
        }
      }
    }
  }
  
  return hasChanges
}

/**
 * Normalize keybind commands array
 * @param {*} keyCommands - Commands for a key (array, string, or other)
 * @returns {string[]} Normalized string array
 */
function normalizeKeyCommands(keyCommands) {
  // Handle null/undefined
  if (!keyCommands) {
    return []
  }

  // Handle string (legacy single command)
  if (typeof keyCommands === 'string') {
    if (keyCommands.includes('$$')) {
      // Split command chain
      return keyCommands.split(/\s*\$\$\s*/)
        .map(cmd => cmd.trim())
        .filter(cmd => cmd.length > 0)
    } else {
      return keyCommands.trim() ? [keyCommands.trim()] : []
    }
  }

  // Handle array (current expected format, but may contain rich objects)
  if (Array.isArray(keyCommands)) {
    return normalizeToStringArrayOptimized(keyCommands)
  }

  // Handle single rich object
  if (typeof keyCommands === 'object') {
    const cmdStr = normalizeToString(keyCommands)
    return cmdStr ? [cmdStr] : []
  }

  // Unknown format, return empty array
  console.warn('normalizeKeyCommands: Unknown format for key commands:', keyCommands)
  return []
}

/**
 * Normalize alias commands
 * @param {*} aliasCommands - Commands for an alias
 * @returns {string[]} Normalized string array
 */
function normalizeAliasCommands(aliasCommands) {
  // Handle null/undefined
  if (!aliasCommands) {
    return []
  }

  // Handle string (legacy format - split by $$)
  if (typeof aliasCommands === 'string') {
    if (aliasCommands.includes('$$')) {
      return aliasCommands.split(/\s*\$\$\s*/)
        .map(cmd => cmd.trim())
        .filter(cmd => cmd.length > 0)
    } else {
      return aliasCommands.trim() ? [aliasCommands.trim()] : []
    }
  }

  // Handle array (already correct format, but may contain rich objects)
  if (Array.isArray(aliasCommands)) {
    return normalizeToStringArrayOptimized(aliasCommands)
  }

  // Handle single rich object
  if (typeof aliasCommands === 'object') {
    const cmdStr = normalizeToString(aliasCommands)
    return cmdStr ? [cmdStr] : []
  }

  // Unknown format, return empty array
  console.warn('normalizeAliasCommands: Unknown format for alias commands:', aliasCommands)
  return []
}

/**
 * Check if a profile needs normalization
 * @param {Object} profile - Profile to check
 * @returns {boolean} True if normalization is needed
 */
export function needsNormalization(profile) {
  if (!profile || typeof profile !== 'object') {
    return false
  }

  // Check for migration version - migrate any profile not on current version
  if (profile.migrationVersion === CURRENT_MIGRATION_VERSION) {
    return false
  }
  
  // If migration version is different, always migrate (covers version-specific migrations)
  if (profile.migrationVersion !== CURRENT_MIGRATION_VERSION) {
    return true
  }

  // This should never be reached due to above logic, but kept for safety
  return false
}



 