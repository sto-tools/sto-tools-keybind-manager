/** @typedef {{result: unknown, settlement: unknown}} ScalarCompletion */
/** @typedef {{tail: Promise<void>, pending: number, active: boolean, owner: ScalarOwnerProtocol | null}} ScalarDomain */
/** @type {Map<string, WeakMap<object, ScalarDomain>>} */
const domains = new Map();

/**
 * Private writer admission for synchronous scalar ports. Direct methods retain
 * synchronous results, but cannot accept work while an admitted RPC/load or a
 * reentrant writer owns the domain. RPCs queue; their listener settlement does
 * not retain the writer tail. Domains survive replacement on the same bus.
 */
export class ScalarOwnerProtocol {
  /** @type {ScalarDomain} */
  #domain;
  #generation = 0;
  #ready = false;
  /** @type {{destroyed: boolean, _responseDetachFunctions: Array<() => void>}} */
  #owner;

  /** @param {{destroyed: boolean, _responseDetachFunctions: Array<() => void>}} owner @param {string} kind @param {object} key */
  constructor(owner, kind, key) {
    this.#owner = owner;
    let cohort = domains.get(kind);
    if (!cohort) {
      cohort = new WeakMap();
      domains.set(kind, cohort);
    }
    let domain = cohort.get(key);
    if (!domain) {
      domain = {
        tail: Promise.resolve(),
        pending: 0,
        active: false,
        owner: null,
      };
      cohort.set(key, domain);
    }
    this.#domain = domain;
  }

  get ready() {
    return this.#ready && !this.#owner.destroyed && this.#domain.owner === this;
  }

  /** @param {number} generation @param {boolean} [requireReady] */
  #assertCurrent(generation, requireReady = true) {
    if (
      generation !== this.#generation ||
      this.#domain.owner !== this ||
      this.#owner.destroyed ||
      (requireReady && !this.#ready)
    ) {
      throw new Error("operation_cancelled");
    }
  }

  /**
   * Startup hydration is synchronous when idle. A replacement created inside
   * a predecessor write waits its domain tail before loading accepted storage.
   * @param {(assertCurrent: () => void) => void} load
   * @param {() => void} [afterLoad]
   * @returns {Promise<void> | void}
   */
  activate(load, afterLoad = () => {}) {
    const prior = this.#domain.owner;
    if (prior && prior !== this) prior.cancel();
    this.#domain.owner = this;
    const generation = ++this.#generation;
    this.#ready = false;
    const hydrate = () => {
      const assertCurrent = () => this.#assertCurrent(generation, false);
      assertCurrent();
      load(assertCurrent);
      assertCurrent();
      this.#ready = true;
      afterLoad();
    };
    if (this.#domain.active || this.#domain.pending > 0) {
      return this.#enqueue(hydrate);
    }
    this.#domain.active = true;
    try {
      hydrate();
    } finally {
      this.#domain.active = false;
    }
  }

  cancel() {
    this.#generation += 1;
    this.#ready = false;
    for (const detach of this.#owner._responseDetachFunctions) detach();
    this.#owner._responseDetachFunctions = [];
  }

  /** @template T @param {() => T} operation @returns {Promise<T>} */
  #enqueue(operation) {
    this.#domain.pending += 1;
    const started = this.#domain.tail.then(() => {
      this.#domain.active = true;
      try {
        return operation();
      } finally {
        this.#domain.active = false;
        this.#domain.pending -= 1;
      }
    });
    this.#domain.tail = started.then(
      () => undefined,
      () => undefined,
    );
    return started;
  }

  /** @template T @param {(assertCurrent: () => void) => {result: T, settlement: unknown}} operation @returns {T} */
  runDirect(operation) {
    const generation = this.#generation;
    this.#assertCurrent(generation);
    if (this.#domain.active || this.#domain.pending > 0) {
      throw new Error("operation_in_progress");
    }
    this.#domain.active = true;
    try {
      const completion = operation(() => this.#assertCurrent(generation));
      void settleScalarPublication(completion.settlement);
      return completion.result;
    } finally {
      this.#domain.active = false;
    }
  }

  /** @template T @param {(assertCurrent: () => void) => {result: T, settlement: unknown}} operation @returns {Promise<T>} */
  enqueue(operation) {
    const generation = this.#generation;
    this.#assertCurrent(generation);
    const committed = this.#enqueue(() => {
      const assertCurrent = () => this.#assertCurrent(generation);
      assertCurrent();
      return operation(assertCurrent);
    });
    return committed.then(async ({ result, settlement }) => {
      await settleScalarPublication(settlement);
      // Publication was invoked after durable adoption. A later teardown
      // cannot revoke this accepted result while its own listeners settle.
      return result;
    });
  }
}

/** @param {unknown} settlement */
async function settleScalarPublication(settlement) {
  try {
    await settlement;
  } catch (error) {
    console.error("scalar_owner_publication_failed", error);
  }
}
