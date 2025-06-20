export default class STOModalManager {
  constructor() {
    this.overlayId = 'modalOverlay'
  }

  getOverlay() {
    return document.getElementById(this.overlayId)
  }

  show(id) {
    const modal = typeof id === 'string' ? document.getElementById(id) : id
    const overlay = this.getOverlay()
    if (overlay && modal) {
      overlay.classList.add('active')
      modal.classList.add('active')
      document.body.classList.add('modal-open')

      const firstInput = modal.querySelector('input, textarea, select')
      if (firstInput) {
        setTimeout(() => firstInput.focus(), 100)
      }
      return true
    }
    return false
  }

  hide(id) {
    const modal = typeof id === 'string' ? document.getElementById(id) : id
    const overlay = this.getOverlay()
    if (overlay && modal) {
      modal.classList.remove('active')

      // Hide overlay if no other modals are active
      if (!document.querySelector('.modal.active')) {
        overlay.classList.remove('active')
        document.body.classList.remove('modal-open')
      }
      return true
    }
    return false
  }
}

// Global instance
