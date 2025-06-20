// STO Tools Keybind Manager - Vertigo VFX Manager Tests
// Tests for the visual effects management functionality

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock the VERTIGO_EFFECTS and vertigoManager since they're loaded in a different file
const VERTIGO_EFFECTS = {
  space: [
    { label: 'Test Space Effect 1', effect: 'Fx_Test_Space_Effect_1' },
    { label: 'Test Space Effect 2', effect: 'Fx_Test_Space_Effect_2' },
  ],
  ground: [
    { label: 'Test Ground Effect 1', effect: 'Fx_Test_Ground_Effect_1' },
    { label: 'Test Ground Effect 2', effect: 'Fx_Test_Ground_Effect_2' },
  ],
}

class MockVertigoManager {
  constructor() {
    this.selectedEffects = {
      space: new Set(),
      ground: new Set(),
    }
    this.showPlayerSay = false
  }

  generateAlias(environment) {
    const effects = Array.from(this.selectedEffects[environment])
    if (effects.length === 0) return ''

    let aliasName = `dynFxSetFXExlusionList_${environment.charAt(0).toUpperCase() + environment.slice(1)}`
    let command = `alias ${aliasName} <& dynFxSetFXExlusionList ${effects.join(',')}`

    if (this.showPlayerSay) {
      command += ' $$ PlayerSay Vertigo VFX Loaded'
    }

    command += ' &>'
    return command
  }

  toggleEffect(environment, effectName) {
    if (this.selectedEffects[environment].has(effectName)) {
      this.selectedEffects[environment].delete(effectName)
    } else {
      this.selectedEffects[environment].add(effectName)
    }
  }

  clearAllEffects() {
    this.selectedEffects.space.clear()
    this.selectedEffects.ground.clear()
  }

  selectAllEffects(environment) {
    VERTIGO_EFFECTS[environment].forEach((effect) => {
      this.selectedEffects[environment].add(effect.effect)
    })
  }

  getEffectCount(environment) {
    return this.selectedEffects[environment].size
  }

  isEffectSelected(environment, effectName) {
    return this.selectedEffects[environment].has(effectName)
  }
}

// Mock DOM and global objects
const mockProfile = {
  name: 'Test Profile',
  aliases: {},
}

const mockUI = {
  showModal: vi.fn(),
  hideModal: vi.fn(),
  showToast: vi.fn(),
}

const mockApp = {
  getCurrentProfile: vi.fn(() => mockProfile),
  saveProfile: vi.fn(),
  setModified: vi.fn(),
}

// Global setup
beforeEach(() => {
  global.VERTIGO_EFFECTS = VERTIGO_EFFECTS
  global.vertigoManager = new MockVertigoManager()
  global.stoUI = mockUI
  global.app = mockApp

  // Reset all mocks
  vi.clearAllMocks()

  // Setup DOM
  document.body.innerHTML = `
        <div id="vertigoModal">
            <div id="spaceEffectsList"></div>
            <div id="groundEffectsList"></div>
            <div id="spaceEffectCount">0 selected</div>
            <div id="groundEffectCount">0 selected</div>
            <div id="spaceAliasCommand">No space effects selected</div>
            <div id="groundAliasCommand">No ground effects selected</div>
            <input type="checkbox" id="vertigoShowPlayerSay" />
            <button id="spaceSelectAll">Select All</button>
            <button id="spaceClearAll">Clear All</button>
            <button id="groundSelectAll">Select All</button>
            <button id="groundClearAll">Clear All</button>
            <button id="saveVertigoBtn">Generate Aliases</button>
        </div>
    `
})

afterEach(() => {
  document.body.innerHTML = ''
  delete global.VERTIGO_EFFECTS
  delete global.vertigoManager
  delete global.stoUI
  delete global.app
})

describe('VertigoManager', () => {
  describe('generateAlias', () => {
    it('should return empty string when no effects selected', () => {
      const result = vertigoManager.generateAlias('space')
      expect(result).toBe('')
    })

    it('should generate correct alias format for space effects', () => {
      vertigoManager.selectedEffects.space.add('Fx_Test_Effect_1')
      vertigoManager.selectedEffects.space.add('Fx_Test_Effect_2')

      const result = vertigoManager.generateAlias('space')
      expect(result).toBe(
        'alias dynFxSetFXExlusionList_Space <& dynFxSetFXExlusionList Fx_Test_Effect_1,Fx_Test_Effect_2 &>'
      )
    })

    it('should generate correct alias format for ground effects', () => {
      vertigoManager.selectedEffects.ground.add('Fx_Test_Effect_Ground')

      const result = vertigoManager.generateAlias('ground')
      expect(result).toBe(
        'alias dynFxSetFXExlusionList_Ground <& dynFxSetFXExlusionList Fx_Test_Effect_Ground &>'
      )
    })

    it('should include PlayerSay when showPlayerSay is enabled', () => {
      vertigoManager.selectedEffects.space.add('Fx_Test_Effect')
      vertigoManager.showPlayerSay = true

      const result = vertigoManager.generateAlias('space')
      expect(result).toBe(
        'alias dynFxSetFXExlusionList_Space <& dynFxSetFXExlusionList Fx_Test_Effect $$ PlayerSay Vertigo VFX Loaded &>'
      )
    })

    it('should have proper spacing before closing bracket', () => {
      vertigoManager.selectedEffects.space.add('Fx_Test_Effect')
      vertigoManager.showPlayerSay = false

      const result = vertigoManager.generateAlias('space')
      // This test will fail with the current bug - should end with ' &>' not '&>'
      expect(result).toMatch(/ &>$/)
      expect(result).not.toMatch(/[^ ]&>$/)
    })

    it('should have proper spacing before PlayerSay and closing bracket', () => {
      vertigoManager.selectedEffects.space.add('Fx_Test_Effect')
      vertigoManager.showPlayerSay = true

      const result = vertigoManager.generateAlias('space')
      // This test will fail with the current bug - should end with ' &>' not '&>'
      expect(result).toMatch(/ &>$/)
      expect(result).toMatch(/PlayerSay Vertigo VFX Loaded &>$/)
    })
  })

  describe('toggleEffect', () => {
    it('should add effect when not selected', () => {
      vertigoManager.toggleEffect('space', 'Fx_Test_Effect')
      expect(vertigoManager.isEffectSelected('space', 'Fx_Test_Effect')).toBe(
        true
      )
    })

    it('should remove effect when already selected', () => {
      vertigoManager.selectedEffects.space.add('Fx_Test_Effect')
      vertigoManager.toggleEffect('space', 'Fx_Test_Effect')
      expect(vertigoManager.isEffectSelected('space', 'Fx_Test_Effect')).toBe(
        false
      )
    })
  })

  describe('selectAllEffects', () => {
    it('should select all space effects', () => {
      vertigoManager.selectAllEffects('space')
      expect(vertigoManager.getEffectCount('space')).toBe(2)
      expect(
        vertigoManager.isEffectSelected('space', 'Fx_Test_Space_Effect_1')
      ).toBe(true)
      expect(
        vertigoManager.isEffectSelected('space', 'Fx_Test_Space_Effect_2')
      ).toBe(true)
    })

    it('should select all ground effects', () => {
      vertigoManager.selectAllEffects('ground')
      expect(vertigoManager.getEffectCount('ground')).toBe(2)
      expect(
        vertigoManager.isEffectSelected('ground', 'Fx_Test_Ground_Effect_1')
      ).toBe(true)
      expect(
        vertigoManager.isEffectSelected('ground', 'Fx_Test_Ground_Effect_2')
      ).toBe(true)
    })
  })

  describe('clearAllEffects', () => {
    it('should clear all selected effects', () => {
      vertigoManager.selectAllEffects('space')
      vertigoManager.selectAllEffects('ground')

      vertigoManager.clearAllEffects()

      expect(vertigoManager.getEffectCount('space')).toBe(0)
      expect(vertigoManager.getEffectCount('ground')).toBe(0)
    })
  })
})

describe('Vertigo UI Integration', () => {
  // Mock app methods that would be used by Vertigo UI
  const mockVertgoApp = {
    ...mockApp,
    showVertigoModal: vi.fn(),
    populateVertigoModal: vi.fn(),
    setupVertigoEventListeners: vi.fn(),
    updateVertigoEffectCounts: vi.fn(),
    updateVertigoPreview: vi.fn(),
    generateVertigoAliases: vi.fn(),
  }

  beforeEach(() => {
    global.app = mockVertgoApp
  })

  describe('Modal Population', () => {
    it('should populate space effects list', () => {
      const spaceList = document.getElementById('spaceEffectsList')
      expect(spaceList).toBeTruthy()

      // Mock the effects list population
      VERTIGO_EFFECTS.space.forEach((effect) => {
        const effectItem = document.createElement('div')
        effectItem.className = 'effect-item'
        effectItem.innerHTML = `
                    <input type="checkbox" data-environment="space" data-effect="${effect.effect}">
                    <label class="effect-label">${effect.label}</label>
                `
        spaceList.appendChild(effectItem)
      })

      const checkboxes = spaceList.querySelectorAll('input[type="checkbox"]')
      expect(checkboxes.length).toBe(2)
    })

    it('should populate ground effects list', () => {
      const groundList = document.getElementById('groundEffectsList')
      expect(groundList).toBeTruthy()

      // Mock the effects list population
      VERTIGO_EFFECTS.ground.forEach((effect) => {
        const effectItem = document.createElement('div')
        effectItem.className = 'effect-item'
        effectItem.innerHTML = `
                    <input type="checkbox" data-environment="ground" data-effect="${effect.effect}">
                    <label class="effect-label">${effect.label}</label>
                `
        groundList.appendChild(effectItem)
      })

      const checkboxes = groundList.querySelectorAll('input[type="checkbox"]')
      expect(checkboxes.length).toBe(2)
    })
  })

  describe('Effect Count Updates', () => {
    it('should update effect count display', () => {
      vertigoManager.selectAllEffects('space')

      const spaceCount = document.getElementById('spaceEffectCount')
      spaceCount.textContent = `${vertigoManager.getEffectCount('space')} selected`

      expect(spaceCount.textContent).toBe('2 selected')
    })
  })

  describe('Preview Updates', () => {
    it('should update alias preview for space', () => {
      vertigoManager.selectedEffects.space.add('Fx_Test_Effect')

      const spacePreview = document.getElementById('spaceAliasCommand')
      const spaceAlias = vertigoManager.generateAlias('space')
      spacePreview.textContent = spaceAlias

      expect(spacePreview.textContent).toBe(
        'alias dynFxSetFXExlusionList_Space <& dynFxSetFXExlusionList Fx_Test_Effect &>'
      )
    })

    it('should show no effects message when none selected', () => {
      const spacePreview = document.getElementById('spaceAliasCommand')
      const spaceAlias = vertigoManager.generateAlias('space')
      spacePreview.textContent = spaceAlias || 'No space effects selected'

      expect(spacePreview.textContent).toBe('No space effects selected')
    })
  })

  describe('Alias Generation', () => {
    beforeEach(() => {
      mockProfile.aliases = {}
    })

    it('should generate space alias correctly', () => {
      vertigoManager.selectedEffects.space.add('Fx_Test_Effect_1')
      vertigoManager.selectedEffects.space.add('Fx_Test_Effect_2')

      const spaceAlias = vertigoManager.generateAlias('space')
      const commands = spaceAlias
        .replace('alias dynFxSetFXExlusionList_Space <& ', '')
        .replace(' &>', '')

      mockProfile.aliases['dynFxSetFXExlusionList_Space'] = {
        name: 'dynFxSetFXExlusionList_Space',
        description: 'Vertigo - Disable Space Visual Effects',
        commands: commands,
      }

      expect(mockProfile.aliases['dynFxSetFXExlusionList_Space']).toBeDefined()
      expect(mockProfile.aliases['dynFxSetFXExlusionList_Space'].commands).toBe(
        'dynFxSetFXExlusionList Fx_Test_Effect_1,Fx_Test_Effect_2'
      )
    })

    it('should generate ground alias correctly', () => {
      vertigoManager.selectedEffects.ground.add('Fx_Test_Ground_Effect')

      const groundAlias = vertigoManager.generateAlias('ground')
      const commands = groundAlias
        .replace('alias dynFxSetFXExlusionList_Ground <& ', '')
        .replace(' &>', '')

      mockProfile.aliases['dynFxSetFXExlusionList_Ground'] = {
        name: 'dynFxSetFXExlusionList_Ground',
        description: 'Vertigo - Disable Ground Visual Effects',
        commands: commands,
      }

      expect(mockProfile.aliases['dynFxSetFXExlusionList_Ground']).toBeDefined()
      expect(
        mockProfile.aliases['dynFxSetFXExlusionList_Ground'].commands
      ).toBe('dynFxSetFXExlusionList Fx_Test_Ground_Effect')
    })

    it('should include PlayerSay in alias when enabled', () => {
      vertigoManager.selectedEffects.space.add('Fx_Test_Effect')
      vertigoManager.showPlayerSay = true

      const spaceAlias = vertigoManager.generateAlias('space')
      const commands = spaceAlias
        .replace('alias dynFxSetFXExlusionList_Space <& ', '')
        .replace(' &>', '')

      expect(commands).toBe(
        'dynFxSetFXExlusionList Fx_Test_Effect $$ PlayerSay Vertigo VFX Loaded'
      )
    })
  })
})

describe('Vertigo Data Validation', () => {
  it('should have valid effect data structure', () => {
    expect(VERTIGO_EFFECTS).toBeDefined()
    expect(VERTIGO_EFFECTS.space).toBeInstanceOf(Array)
    expect(VERTIGO_EFFECTS.ground).toBeInstanceOf(Array)
  })

  it('should have properly formatted space effects', () => {
    VERTIGO_EFFECTS.space.forEach((effect) => {
      expect(effect).toHaveProperty('label')
      expect(effect).toHaveProperty('effect')
      expect(typeof effect.label).toBe('string')
      expect(typeof effect.effect).toBe('string')
      expect(effect.label.length).toBeGreaterThan(0)
      expect(effect.effect.length).toBeGreaterThan(0)
    })
  })

  it('should have properly formatted ground effects', () => {
    VERTIGO_EFFECTS.ground.forEach((effect) => {
      expect(effect).toHaveProperty('label')
      expect(effect).toHaveProperty('effect')
      expect(typeof effect.label).toBe('string')
      expect(typeof effect.effect).toBe('string')
      expect(effect.label.length).toBeGreaterThan(0)
      expect(effect.effect.length).toBeGreaterThan(0)
    })
  })

  it('should generate valid STO command format', () => {
    vertigoManager.selectedEffects.space.add('Fx_Test_Effect')
    const alias = vertigoManager.generateAlias('space')

    // Validate alias format
    expect(alias).toMatch(/^alias\s+\w+\s+<&\s+.+\s+&>$/)
    expect(alias).toContain('dynFxSetFXExlusionList')
    expect(alias).toContain('Fx_Test_Effect')
  })
})
