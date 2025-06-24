/**
 * uiRendering (legacy shim)
 * --------------------------------------------------
 * The original `uiRendering` module contained ~500 lines of direct DOM
 * manipulation for building the key-grid.  That logic has been migrated
 * into the new `KeyBrowserUI` class.  A handful of legacy modules and
 * unit-tests still expect the presence of `uiRendering.renderKeyGrid` –
 * either via `Object.assign(app, uiRendering)` or by calling
 * `app.renderKeyGrid()` directly.
 *
 * To keep those call-sites functional while we finish the migration, we
 * expose a **single** no-frills proxy that delegates to the new
 * component, and nothing else.  All other helpers were removed.
 */

export const uiRendering = {
  /**
   * Bridge to the new key-grid renderer.
   *
   * Any legacy code that invokes `renderKeyGrid()` will now trigger the
   * `KeyBrowserUI.render()` method – assuming the application bootstrap
   * has placed the instance on `window.keyBrowserUI` (which `app.js` now
   * does).
   */
  renderKeyGrid () {
    if (window.keyBrowserUI && typeof window.keyBrowserUI.render === 'function') {
      window.keyBrowserUI.render()
    }
  },

  /**
   * Basic helper used by parameterCommands to split modifier keys on new
   * lines for small key badges.
   */
  formatKeyName (keyName = '') {
    return keyName.replace(/\+/g, '<br>+')
  },
} 