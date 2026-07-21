/**
 * @typedef {{ destroy?: () => unknown | PromiseLike<unknown> }} OwnedComponent
 */

/** @param {unknown} error @param {string} property */
function reportStartupCleanupError(error, property) {
  console.error(`Failed to tear down startup component "${property}":`, error);
}

/**
 * Tracks application-created components independently from injected
 * dependencies. Components are registered as soon as construction completes,
 * before their init hook can retain any additional resources.
 */
export default class OwnedComponentStack {
  /** @param {object} owner */
  constructor(owner) {
    this.owner = /** @type {Record<string, unknown>} */ (owner);
    /** @type {OwnedComponent[]} */
    this.entries = [];
  }

  /**
   * @template {OwnedComponent} Component
   * @param {Component} component
   * @returns {Component}
   */
  own(component) {
    this.entries.push(component);
    return component;
  }

  /**
   * @template {new (...args: any[]) => OwnedComponent} Constructor
   * @param {Constructor} Component
   * @param {ConstructorParameters<Constructor>} args
   * @returns {InstanceType<Constructor>}
   */
  create(Component, ...args) {
    return /** @type {InstanceType<Constructor>} */ (
      this.own(new Component(...args))
    );
  }

  /**
   * @param {(error: unknown, property: string) => void} [reportError]
   */
  async destroyAll(reportError = reportStartupCleanupError) {
    const owned = this.entries.splice(0).reverse();

    for (const component of owned) {
      const properties = Object.entries(this.owner)
        .filter(([, value]) => value === component)
        .map(([property]) => property);
      for (const property of properties) this.owner[property] = null;

      try {
        await component.destroy?.();
      } catch (error) {
        reportError(error, properties[0] ?? "anonymous component");
      }
    }
  }
}
