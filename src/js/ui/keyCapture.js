export const keyCapture = {
    startKeyCapture(modalContext = 'keySelectionModal') {
      console.log('[KeyCapture] startKeyCapture called for modal:', modalContext)
      this.isCapturingKeys = true
      this.pressedCodes = new Set()
      this.currentCaptureContext = modalContext
      this.hasCapturedValidKey = false  // Add flag to track if we've captured a valid key
      
      // Determine which elements to use based on modal context
      const captureStatusId = modalContext === 'addKeyModal' ? 'addKeyCaptureStatus' : 'keyCaptureStatus'
      const capturedKeysId = modalContext === 'addKeyModal' ? 'addKeyCapturedKeys' : 'capturedKeys'
      const captureBtnId = modalContext === 'addKeyModal' ? 'addKeyCaptureBtn' : 'keySelectionCaptureBtn'
  
      
      // Show capture status
      const captureStatus = document.getElementById(captureStatusId)
      const capturedKeys = document.getElementById(capturedKeysId)
      const captureBtn = document.getElementById(captureBtnId)
      
      console.log('[KeyCapture] Elements found:', {
        captureStatus: !!captureStatus,
        capturedKeys: !!capturedKeys,
        captureBtn: !!captureBtn,
        modalContext
      })
      
      if (captureStatus) captureStatus.style.display = 'block'
      if (capturedKeys) {
        capturedKeys.textContent = ''
        capturedKeys.setAttribute('data-placeholder', 'Press keys...')
      }
      if (captureBtn) captureBtn.disabled = true
      
      // Add event listeners
      console.log('[KeyCapture] Adding key event listeners to document')
      document.addEventListener('keydown', this.boundHandleKeyDown)
      document.addEventListener('keyup', this.boundHandleKeyUp)
      
      // Test if listeners are attached
      console.log('[KeyCapture] Event listeners attached:', {
        keydown: document.onkeydown,
        hasKeydown: !!document.onkeydown
      })
      
      // Focus on the modal to capture keys
      const modal = document.getElementById(modalContext)
      console.log('[KeyCapture] Modal found:', !!modal)
      if (modal) {
        modal.focus()
        console.log('[KeyCapture] Modal focused')
      }
      
      console.log('[KeyCapture] startKeyCapture completed')
    },
  
    stopKeyCapture() {
      this.isCapturingKeys = false
      this.pressedCodes.clear()
      
      // Determine which elements to use based on current context
      const modalContext = this.currentCaptureContext || 'keySelectionModal'
      const captureStatusId = modalContext === 'addKeyModal' ? 'addKeyCaptureStatus' : 'keyCaptureStatus'
      const captureBtnId = modalContext === 'addKeyModal' ? 'addKeyCaptureBtn' : 'keySelectionCaptureBtn'
  
      
      // Hide capture status
      const captureStatus = document.getElementById(captureStatusId)
      const captureBtn = document.getElementById(captureBtnId)
      
      if (captureStatus) captureStatus.style.display = 'none'
      if (captureBtn) captureBtn.disabled = false
      
      // Hide confirm section if in addKeyModal
      if (modalContext === 'addKeyModal') {
        const confirmSection = document.getElementById('addKeyConfirmSection')
        if (confirmSection) confirmSection.style.display = 'none'
      }
      
      // Remove event listeners
      document.removeEventListener('keydown', this.boundHandleKeyDown)
      document.removeEventListener('keyup', this.boundHandleKeyUp)
      
      // Clear context
      this.currentCaptureContext = null
    },
  
    handleKeyDown(event) {
      if (!this.isCapturingKeys) return
      
      // Ignore pure modifier presses
      if (this.isPureModifier(event.code)) {
        this.pressedCodes.add(event.code)
        this.updateCapturedKeysDisplay()
        return
      }
  
      // At this point, a "real" key was pressed—grab the full set
      this.pressedCodes.add(event.code)
      const chord = this.chordToString(this.pressedCodes)
      
      // Update display
      this.updateCapturedKeysDisplay(chord)
      
      // Add a button to select the captured key
      this.addCapturedKeySelectionButton(chord)
      
      // Mark that we've captured a valid key combination
      this.hasCapturedValidKey = true
      
      // Do NOT auto-stop capture; wait for user to confirm
      event.preventDefault()
    },
  
    addCapturedKeySelectionButton(chord) {
      const modalContext = this.currentCaptureContext || 'keySelectionModal'
   
      if (modalContext === 'addKeyModal') {
        // For addKeyModal, use the existing behavior
        const capturedKeysId = 'addKeyCapturedKeys'
        const capturedKeys = document.getElementById(capturedKeysId)
        if (!capturedKeys) return
        
        // Clear any existing selection button
        const existingButton = capturedKeys.querySelector('.captured-key-select-btn')
        if (existingButton) {
          existingButton.remove()
        }
        
        // Show the select button
        const selectButton = document.createElement('button')
        selectButton.className = 'btn btn-primary captured-key-select-btn'
        selectButton.textContent = `Select "${chord}"`
        selectButton.onclick = () => {
  
          const keyNameInput = document.getElementById('newKeyName')
          if (keyNameInput) {
            keyNameInput.value = chord
          }
          this.addKey(chord)
          modalManager.hide('addKeyModal')
          this.stopKeyCapture()
        }
        capturedKeys.appendChild(selectButton)
      } else {
        // For keySelectionModal, update the key preview and enable the Select This Key button
        const previewDisplay = document.getElementById('keyPreviewDisplay')
        const confirmBtn = document.getElementById('confirmKeySelection')
        
        if (previewDisplay && confirmBtn) {
          // Update the preview display with the captured key
          previewDisplay.innerHTML = `<span class="key-combination">${chord}</span>`
          
          // Enable the Select This Key button
          confirmBtn.disabled = false
          
          // Store the captured key for when the user clicks "Select This Key"
          this.selectedKey = chord
          this.selectedModifiers = [] // Clear any selected modifiers since we captured a complete key
          
          // Clear any selected modifiers in the UI
          const modifierBtns = document.querySelectorAll('.modifier-btn')
          modifierBtns.forEach(btn => {
            btn.dataset.selected = 'false'
          })
          
          // Clear any selected keys in the grids
          const keyItems = document.querySelectorAll('.key-item.selected')
          keyItems.forEach(item => {
            item.classList.remove('selected')
          })
        }
        
        // Stop key capture
        this.stopKeyCapture()
      }
    },
  
    handleKeyUp(event) {
      if (!this.isCapturingKeys) return
      
      // Only clear pressed codes if we haven't captured a valid key yet
      if (!this.hasCapturedValidKey) {
  
      this.pressedCodes.delete(event.code)
      this.updateCapturedKeysDisplay()
  
      }
    },
  
    isPureModifier(code) {
      return [
        'ShiftLeft', 'ShiftRight',
        'ControlLeft', 'ControlRight',
        'AltLeft', 'AltRight',
        'MetaLeft', 'MetaRight'
      ].includes(code)
    },
  
    chordToString(codes) {
      // Sort so you get a consistent order
      return [...codes]
        .sort()
        .map(code => {
          // Convert to STO key format
          if (code.startsWith('Control')) return 'Ctrl'
          if (code.startsWith('Alt')) return 'Alt'
          if (code.startsWith('Shift')) return 'Shift'
          if (code.startsWith('Meta')) return 'Meta'
          
          // DigitX → X
          const digitMatch = code.match(/^Digit(\d)$/)
          if (digitMatch) return digitMatch[1]
          
          // KeyX → X (for letters)
          const keyMatch = code.match(/^Key([A-Z])$/)
          if (keyMatch) return keyMatch[1]
          
          // Function keys
          if (code.startsWith('F') && /^F\d+$/.test(code)) {
            return code
          }
          
          // Special keys
          const specialKeyMap = {
            'Space': 'Space',
            'Enter': 'Enter',
            'Tab': 'Tab',
            'Escape': 'Escape',
            'Backspace': 'Backspace',
            'Delete': 'Delete',
            'Home': 'Home',
            'End': 'End',
            'PageUp': 'PageUp',
            'PageDown': 'PageDown',
            'ArrowUp': 'Up',
            'ArrowDown': 'Down',
            'ArrowLeft': 'Left',
            'ArrowRight': 'Right',
            'BracketLeft': '[',
            'BracketRight': ']',
            'Semicolon': ';',
            'Quote': "'",
            'Comma': ',',
            'Period': '.',
            'Slash': '/',
            'Backslash': '\\',
            'Minus': '-',
            'Equal': '=',
            'Backquote': '`',
            'IntlBackslash': '\\'
          }
          
          return specialKeyMap[code] || code.replace(/^Key/, '')
        })
        .join('+')
    },
  
    updateCapturedKeysDisplay(chord = null) {
      const modalContext = this.currentCaptureContext || 'keySelectionModal'
      const capturedKeysId = modalContext === 'addKeyModal' ? 'addKeyCapturedKeys' : 'capturedKeys'
      const capturedKeys = document.getElementById(capturedKeysId)
      if (!capturedKeys) return
      
      if (chord) {
        capturedKeys.textContent = chord
      } else if (this.pressedCodes.size > 0) {
        const currentChord = this.chordToString(this.pressedCodes)
        capturedKeys.textContent = currentChord
      } else {
        capturedKeys.textContent = ''
        capturedKeys.setAttribute('data-placeholder', 'Press keys...')
      }
    }
};
