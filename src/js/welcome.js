export const welcome = {
  isFirstTime() {
    return !localStorage.getItem('sto_keybind_manager_visited')
  },

  showWelcomeMessage() {
    localStorage.setItem('sto_keybind_manager_visited', 'true')
    modalManager.show('aboutModal')
  },
}
