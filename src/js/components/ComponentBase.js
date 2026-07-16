/**
 * ComponentBase - Base class for all application components
 * Provides common functionality including event bus access and lifecycle methods
 */
import {
  request as _cbRequest,
  respond as _cbRespond,
} from "../core/requestResponse.js";
import {
  activeBindsetFromPayload,
  selectedKeyFromPayload,
} from "../core/eventPayloads.js";

/** @typedef {typeof import('../core/eventBus.js').default} CoreEventBus */
/** @typedef {CoreEventBus} EventBus */
/** @typedef {import('../types/events/protocol.js').EventTopic} EventTopic */
/** @typedef {import('../types/events/protocol.js').EventEmitTopic} EventEmitTopic */
/** @typedef {import('../types/events/protocol.js').EventEmitOptions} EventEmitOptions */
/** @typedef {import('../types/events/protocol.js').EventEmitResult} EventEmitResult */
/** @typedef {import('../types/events/protocol.js').EventTopicsAllowingOmittedPayload} NullableEventTopic */
/** @typedef {import('../types/events/legacy-dom.js').LegacyDomMirrorTopic} LegacyDomMirrorTopic */
/** @typedef {import('../types/events/dynamic.js').DynamicEventTopic<unknown, string>} AnyDynamicEventTopic */
/** @typedef {import('../types/events/dynamic.js').ComponentReplyTopic<string, unknown>} AnyComponentReplyTopic */
/** @typedef {import('../types/rpc/transport.js').RpcReadyTopic} RpcReadyTopic */
/** @typedef {import('../types/rpc/transport.js').RpcRequiredTopic} RpcRequiredTopic */
/** @typedef {import('../types/rpc/transport.js').RpcOptionalTopic} RpcOptionalTopic */
/** @typedef {import('../types/rpc/transport.js').RpcNoPayloadTopic} RpcNoPayloadTopic */
/** @typedef {import('../types/rpc/transport.js').DynamicRpcTopic<unknown, unknown>} AnyDynamicRpcTopic */
/** @typedef {(data: unknown) => unknown} EventHandler */
/** @typedef {(event: Event) => unknown} DomEventHandler */
/** @typedef {(payload: unknown) => unknown | PromiseLike<unknown>} RawRpcHandler */
/**
 * @typedef {{
 *   currentProfile?: string | null,
 *   currentProfileData?: import('./services/serviceTypes.js').ProfileData | null,
 *   currentEnvironment?: string
 * }} DataCoordinatorInitialState
 */
/**
 * @typedef {import('../types/events/base.js').SelectionStateSnapshot} SelectionInitialState
 */
/** @typedef {{ settings?: Record<string, unknown> }} PreferencesInitialState */
/** @typedef {{ bindsets?: string[] }} BindsetInitialState */
/**
 * Runtime-only event-bus erasure used inside the typed wrapper bodies. Public
 * component calls are governed by the overloads below, never by this surface.
 *
 * @typedef {{
 *   on: (event: string, handler: EventHandler, context?: unknown) => unknown,
 *   off: (event: string, handler: EventHandler) => void,
 *   emit: (event: string, data?: unknown, options?: EventEmitOptions) => EventEmitResult,
 *   onDom: (target: string | EventTarget, domEvent: string, busEventOrHandler: string | DomEventHandler, handler?: DomEventHandler) => () => void,
 *   onDomDebounced: (target: string | EventTarget, domEvent: string, busEventOrHandler: string | DomEventHandler, handlerOrDelay?: DomEventHandler | number, delay?: number) => () => void
 * }} RawEventBus
 */
/**
 * @typedef {Omit<import('./services/serviceTypes.js').ServiceCache, 'activeBindset' | 'preferences'> & {
 *   activeBindset: string | undefined,
 *   preferences: import('./services/serviceTypes.js').ServicePreferences & Record<string, unknown> & {
 *     translateGeneratedMessages?: boolean
 *   },
 *   cachedSelections: import('../types/events/base.js').SelectionCache,
 *   editingContext?: import('../types/events/base.js').EditingContext | null,
 *   activeCommandChainBindset?: string,
 *   profiles?: Record<string, import('./services/serviceTypes.js').ProfileData>
 * }} ComponentCache
 */

export default class ComponentBase {
  // Static FinalizationRegistry for automatic cleanup when components are garbage collected
  static cleanupRegistry = new FinalizationRegistry((heldValue) => {
    if (heldValue && heldValue.component && heldValue.component.destroy) {
      console.log(
        `[ComponentBase] Finalizing ${heldValue.constructorName || "Component"}`,
      );
      heldValue.component.destroy();
    }
  });
  /** @param {EventBus | null} [eventBus] */
  constructor(eventBus = null) {
    this.eventBus = eventBus;
    this.componentName = this.constructor.name;
    this.initialized = false;
    this.destroyed = false;
    /** @type {ComponentCache} */
    this.cache = {
      selectedKey: null,
      selectedAlias: null,
      currentEnvironment: "space",
      currentProfile: null,
      profile: null,
      keys: {},
      aliases: {},
      builds: {},
      preferences: {},
      activeBindset: "Primary Bindset",
      bindsetNames: ["Primary Bindset"],
      cachedSelections: {
        space: null,
        ground: null,
        alias: null,
      },
    };
    /** @type {AnyComponentReplyTopic | ""} */
    this._myReplyTopic = "";
    this._currentEnvironment = "space";
    this._currentProfileId = null;
    /** @type {Map<string, Array<{ handler: EventHandler, context: unknown }>>} */
    this.eventListeners = new Map(); // Track event listeners for cleanup
    /** @type {Array<() => void>} */
    this.domEventListeners = []; // Track DOM event listeners for cleanup

    // Register this instance for automatic cleanup when garbage collected
    ComponentBase.cleanupRegistry.register(this, {
      component: this,
      constructorName: this.constructor.name,
    });
  }

  /**
   * Initialize the component
   * Override this method in subclasses to implement component-specific initialization
   */
  init() {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.destroyed = false;

    // Initialize cache early to ensure it's available for event listeners
    this.initializeCache();

    // ---------------------------------------------------------
    // Late-Join State Registration handshake setup
    // ---------------------------------------------------------
    // 1) Listen for other components registering so we can
    //    respond with our current state.
    this.addEventListener(
      "component:register",
      this._onComponentRegister.bind(this),
    );

    // 2) Prepare a unique reply topic for this component instance
    this._myReplyTopic = /** @type {AnyComponentReplyTopic} */ (
      `component:registered:reply:${this.getComponentName()}:${Date.now()}`
    );
    this.addEventListener(this._myReplyTopic, this._onInitialState.bind(this));

    // 3) Announce our readiness so existing components can reply
    this.emit("component:register", {
      name: this.getComponentName(),
      replyTopic: this._myReplyTopic,
    });

    // 4) Set up standardized event listeners for common state
    this._setupStandardizedEventListeners();

    // 5) Call the optional UI-specific initialization hook
    this.uiInit();

    // 6) Continue with component-specific initialization
    this.onInit();
  }

  // Initialize cache in constructor if needed
  /** @param {Partial<ComponentCache> & Record<string, unknown>} [additionalCacheData] */
  initializeCache(additionalCacheData = {}) {
    if (!this.cache) {
      this.cache = {
        selectedKey: null,
        selectedAlias: null,
        currentEnvironment: "space",
        currentProfile: null,
        profile: null,
        keys: {},
        aliases: {},
        builds: {},
        preferences: {},
        activeBindset: "Primary Bindset",
        bindsetNames: ["Primary Bindset"],
        cachedSelections: {
          space: null,
          ground: null,
          alias: null,
        },
        ...additionalCacheData,
      };
    } else {
      Object.assign(this.cache, additionalCacheData);
    }
  }

  // Extend cache with additional properties after initialization
  /** @param {Partial<ComponentCache> & Record<string, unknown>} [additionalCacheData] */
  extendCache(additionalCacheData = {}) {
    if (this.cache) {
      Object.assign(this.cache, additionalCacheData);
    } else {
      this.initializeCache(additionalCacheData);
    }
  }

  /**
   * Set up standardized event listeners for common state changes
   * This eliminates repetitive event listener setup in individual components
   */
  _setupStandardizedEventListeners() {
    // Initialize cache
    this.initializeCache();

    // Cache selection state from SelectionService broadcasts
    this.addEventListener("key-selected", (data) => {
      this.cache.selectedKey = selectedKeyFromPayload(data);
      this.cache.selectedAlias = null; // Clear alias when key selected
    });

    this.addEventListener("alias-selected", (data) => {
      this.cache.selectedAlias = data.name;
      this.cache.selectedKey = null; // Clear key when alias selected
    });

    this.addEventListener("editing-context-changed", ({ context }) => {
      this.cache.editingContext = context;
    });

    this.addEventListener("selection:state-changed", (state) => {
      this._cacheSelectionState(state);
    });

    // Cache environment changes
    this.addEventListener("environment:changed", (data) => {
      const env = typeof data === "string" ? data : data?.environment;
      if (env) {
        this.cache.currentEnvironment = env;
        // Update keys cache for new environment if we have builds data
        if (this.cache.builds && this.cache.builds[env]) {
          this.cache.keys = this.cache.builds[env].keys || {};
        }
      }
    });

    // Cache profile updates from DataCoordinator
    this.addEventListener("profile:updated", ({ profileId, profile }) => {
      if (this.cache && profileId === this.cache.currentProfile) {
        this.cache.profile = profile;
        // Handle null profile gracefully
        if (!profile) {
          this.cache.builds = null;
          this.cache.keys = {};
          this.cache.aliases = {};
          return;
        }
        // Update keys for current environment
        if (profile.builds) {
          this.cache.builds = profile.builds;
          const currentBuild = profile.builds[this.cache.currentEnvironment];
          this.cache.keys = currentBuild?.keys || {};
        } else if (profile.keys) {
          this.cache.keys = profile.keys;
        }
        // Update aliases
        this.cache.aliases = profile.aliases || {};
      }
    });

    // Handle profile switches
    this.addEventListener(
      "profile:switched",
      ({ profileId, profile, environment }) => {
        this.cache.currentProfile = profileId;
        this.cache.profile = profile;
        this.cache.currentEnvironment = environment || "space";
        // Backward compatibility for components expecting underscore names
        this._currentEnvironment = this.cache.currentEnvironment;
        this._currentProfileId = profileId;

        // Handle null profile gracefully
        if (!profile) {
          this.cache.builds = null;
          this.cache.keys = {};
          this.cache.aliases = {};
          return;
        }

        // CRITICAL FIX: Use virtual profile structure first
        // DataCoordinator provides flattened keys and aliases in virtual profiles
        if (profile.keys) {
          // Use virtual profile's flattened keys structure
          this.cache.keys = profile.keys;
        } else if (profile.builds) {
          // Fallback to nested structure for backward compatibility
          const currentBuild = profile.builds[this.cache.currentEnvironment];
          this.cache.keys = currentBuild?.keys || {};
          this.cache.builds = profile.builds;
        } else {
          this.cache.keys = {};
          this.cache.builds = null;
        }

        // Use virtual profile's aliases (already flattened)
        this.cache.aliases = profile.aliases || {};
      },
    );

    // Cache preference changes
    this.addEventListener("preferences:changed", (data) => {
      if (data.changes) {
        // Update cached preferences with the changes
        Object.assign(this.cache.preferences, data.changes);
      } else if (data.key && data.value !== undefined) {
        // Handle legacy single preference change format
        this.cache.preferences[data.key] = data.value;
      }
    });

    // Listen for initial preferences loading
    this.addEventListener("preferences:loaded", (data) => {
      console.log(`[${this.componentName}] preferences:loaded received:`, data);
      if (data.settings) {
        Object.assign(this.cache.preferences, data.settings);
        console.log(
          `[${this.componentName}] Updated preferences cache from preferences:loaded`,
        );
      }
    });

    // Cache bindset state changes
    this.addEventListener("bindset-selector:active-changed", (data) => {
      this.cache.activeBindset = activeBindsetFromPayload(data);
    });

    // Cache bindset list changes
    this.addEventListener("bindsets:changed", (data) => {
      if (data.names && Array.isArray(data.names)) {
        this.cache.bindsetNames = data.names;
      }
    });

    // Also listen for preferences:saved events which contain full settings
    this.addEventListener("preferences:saved", (data) => {
      console.log(`[${this.componentName}] preferences:saved received:`, data);
      if (data.settings) {
        Object.assign(this.cache.preferences, data.settings);
        console.log(
          `[${this.componentName}] Updated preferences cache from preferences:saved`,
        );
      }
    });
  }

  /**
   * Destroy the component and clean up resources
   * Override this method in subclasses to implement component-specific cleanup
   */
  destroy() {
    if (this.destroyed) {
      console.warn(`${this.constructor.name} is already destroyed`);
      return;
    }

    this.destroyed = true;
    this.initialized = false;

    // Clean up event listeners
    this.cleanupEventListeners();

    // Component-specific cleanup in subclasses
    this.onDestroy();
  }

  /**
   * Hook for component-specific initialization
   * Override in subclasses
   */
  onInit() {
    // Override in subclasses
  }

  /**
   * Optional hook for UI-specific initialization.
   * UIComponentBase overrides this while service components use the no-op.
   */
  uiInit() {
    // Override in UI subclasses
  }

  /**
   * Hook for component-specific cleanup
   * Override in subclasses - DO NOT override destroy() directly
   * This method is called automatically when the component is garbage collected
   * via FinalizationRegistry
   */
  onDestroy() {
    // Override in subclasses for cleanup logic
  }

  /**
   * Register a known application-event listener and track it for cleanup.
   * @template {EventTopic} KnownTopic
   * @overload
   * @param {KnownTopic} event
   * @param {import('../types/events/protocol.js').EventHandler<KnownTopic>} handler
   * @param {unknown} [context]
   * @returns {void}
   */
  /**
   * Register an explicitly branded dynamic-event listener.
   * @template Payload
   * @template {string} Family
   * @overload
   * @param {import('../types/events/dynamic.js').DynamicEventTopic<Payload, Family>} event
   * @param {(payload: Payload) => unknown} handler
   * @param {unknown} [context]
   * @returns {void}
   */
  /**
   * @param {EventTopic | AnyDynamicEventTopic} event
   * @param {EventHandler} handler
   * @param {unknown} [context]
   * @returns {void}
   */
  addEventListener(event, handler, context = null) {
    if (!this.eventBus) {
      // Silently ignore if no event bus is available – useful during unit tests
      return;
    }

    const eventBus = /** @type {RawEventBus} */ (
      /** @type {unknown} */ (this.eventBus)
    );
    eventBus.on(event, handler, context);

    // Track for cleanup
    let listeners = this.eventListeners.get(event);
    if (!listeners) {
      listeners = [];
      this.eventListeners.set(event, listeners);
    }
    listeners.push({ handler, context });
  }

  /**
   * Register a DOM event listener and track it for cleanup
   * @param {() => void} detachFn - The cleanup function returned by eventBus.onDom
   */
  addDomEventListener(detachFn) {
    if (typeof detachFn === "function") {
      this.domEventListeners.push(detachFn);
    }
  }

  /**
   * @overload
   * @param {string | EventTarget} target
   * @param {string} domEvent
   * @param {DomEventHandler} busEventOrHandler
   * @returns {() => void}
   */
  /**
   * @overload
   * @param {string | EventTarget} target
   * @param {string} domEvent
   * @param {LegacyDomMirrorTopic} busEventOrHandler
   * @param {DomEventHandler} [handler]
   * @returns {() => void}
   */
  /**
   * Wrapper for eventBus.onDom that automatically tracks the cleanup function.
   * @param {string | EventTarget} target
   * @param {string} domEvent
   * @param {LegacyDomMirrorTopic | DomEventHandler} busEventOrHandler
   * @param {DomEventHandler} [handler]
   * @returns {() => void}
   */
  onDom(target, domEvent, busEventOrHandler, handler) {
    if (!this.eventBus) {
      // Silently ignore if no event bus is available – useful during unit tests
      return () => {};
    }

    // Call eventBus.onDom and get the cleanup function
    const eventBus = /** @type {RawEventBus} */ (
      /** @type {unknown} */ (this.eventBus)
    );
    const cleanupFn = eventBus.onDom(
      target,
      domEvent,
      busEventOrHandler,
      handler,
    );

    // Track the cleanup function for automatic cleanup
    this.addDomEventListener(cleanupFn);

    return cleanupFn;
  }

  /**
   * @overload
   * @param {string | EventTarget} target
   * @param {string} domEvent
   * @param {DomEventHandler} busEventOrHandler
   * @param {number} [handlerOrDelay]
   * @returns {() => void}
   */
  /**
   * @overload
   * @param {string | EventTarget} target
   * @param {string} domEvent
   * @param {LegacyDomMirrorTopic} busEventOrHandler
   * @param {DomEventHandler | number} [handlerOrDelay]
   * @param {number} [delay]
   * @returns {() => void}
   */
  /**
   * Wrapper for eventBus.onDomDebounced that automatically tracks the cleanup function.
   * @param {string | EventTarget} target
   * @param {string} domEvent
   * @param {LegacyDomMirrorTopic | DomEventHandler} busEventOrHandler
   * @param {DomEventHandler | number} [handlerOrDelay]
   * @param {number} [delay]
   * @returns {() => void}
   */
  onDomDebounced(target, domEvent, busEventOrHandler, handlerOrDelay, delay) {
    if (!this.eventBus) {
      // Silently ignore if no event bus is available – useful during unit tests
      return () => {};
    }

    // Call eventBus.onDomDebounced and get the cleanup function
    const eventBus = /** @type {RawEventBus} */ (
      /** @type {unknown} */ (this.eventBus)
    );
    const cleanupFn = eventBus.onDomDebounced(
      target,
      domEvent,
      busEventOrHandler,
      handlerOrDelay,
      delay,
    );

    // Track the cleanup function for automatic cleanup
    this.addDomEventListener(cleanupFn);

    return cleanupFn;
  }

  /**
   * Remove a known application-event listener.
   * @template {EventTopic} KnownTopic
   * @overload
   * @param {KnownTopic} event
   * @param {import('../types/events/protocol.js').EventHandler<KnownTopic>} handler
   * @returns {void}
   */
  /**
   * Remove an explicitly branded dynamic-event listener.
   * @template Payload
   * @template {string} Family
   * @overload
   * @param {import('../types/events/dynamic.js').DynamicEventTopic<Payload, Family>} event
   * @param {(payload: Payload) => unknown} handler
   * @returns {void}
   */
  /**
   * @param {EventTopic | AnyDynamicEventTopic} event
   * @param {EventHandler} handler
   * @returns {void}
   */
  removeEventListener(event, handler) {
    if (!this.eventBus) {
      // Silently ignore if no event bus is available – useful during unit tests
      return;
    }

    const eventBus = /** @type {RawEventBus} */ (
      /** @type {unknown} */ (this.eventBus)
    );
    eventBus.off(event, handler);

    // Remove from tracking
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.findIndex((l) => l.handler === handler);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit a known event whose protocol permits a null payload.
   * @template {NullableEventTopic} NullTopic
   * @overload
   * @param {NullTopic} event
   * @param {import('../types/events/protocol.js').EventPayload<NullTopic>} [data]
   * @param {EventEmitOptions} [options]
   * @returns {EventEmitResult}
   */
  /**
   * Emit a known event with its required protocol payload.
   * @template {Exclude<EventEmitTopic, NullableEventTopic>} PayloadTopic
   * @overload
   * @param {PayloadTopic} event
   * @param {import('../types/events/protocol.js').EventPayload<PayloadTopic>} data
   * @param {EventEmitOptions} [options]
   * @returns {EventEmitResult}
   */
  /**
   * Emit an explicitly branded dynamic event.
   * @template Payload
   * @template {string} Family
   * @overload
   * @param {import('../types/events/dynamic.js').DynamicEventTopic<Payload, Family>} event
   * @param {Payload} data
   * @param {EventEmitOptions} [options]
   * @returns {EventEmitResult}
   */
  /**
   * @param {EventEmitTopic | AnyDynamicEventTopic} event
   * @param {unknown} [data]
   * @param {EventEmitOptions} [options]
   * @returns {EventEmitResult}
   */
  emit(event, data = null, options = {}) {
    if (typeof window !== "undefined") {
      console.log(
        `[${this.getComponentName()}] emit → ${event} (options: ${JSON.stringify(options)})`,
        data,
      );
    }

    // Emit via event bus if available
    if (this.eventBus && typeof this.eventBus.emit === "function") {
      const eventBus = /** @type {RawEventBus} */ (
        /** @type {unknown} */ (this.eventBus)
      );
      return eventBus.emit(event, data, options);
    } else if (!this.eventBus) {
      // No event bus – skip routing
      return Promise.resolve();
    }

    return Promise.resolve();
  }

  /**
   * Clean up all tracked event listeners
   */
  cleanupEventListeners() {
    if (!this.eventBus) return;
    const eventBus = /** @type {RawEventBus} */ (
      /** @type {unknown} */ (this.eventBus)
    );

    // Clean up regular event listeners
    for (const [event, listeners] of this.eventListeners) {
      listeners.forEach(({ handler }) => {
        eventBus.off(event, handler);
      });
    }
    this.eventListeners.clear();

    // Clean up DOM event listeners
    this.domEventListeners.forEach((detachFn) => {
      try {
        detachFn();
      } catch (error) {
        console.error("Error cleaning up DOM event listener:", error);
      }
    });
    this.domEventListeners = [];
  }

  /**
   * Check if component is initialized
   * @returns {boolean}
   */
  isInitialized() {
    return this.initialized && !this.destroyed;
  }

  /**
   * Get component name for debugging
   * @returns {string}
   */
  getComponentName() {
    return this.componentName || this.constructor.name;
  }

  // ---------------------------------------------------------
  // Late-Join State Registration internal handlers
  // ---------------------------------------------------------
  /**
   * @param {{ name?: string, replyTopic?: AnyComponentReplyTopic }} registration
   */
  _onComponentRegister({ name, replyTopic } = {}) {
    // Ignore our own registration messages
    if (name === this.getComponentName()) return;

    // If we are active, provide our current state to the requester
    if (this.initialized && !this.destroyed && replyTopic) {
      this.emit(replyTopic, {
        sender: this.getComponentName(),
        state: this.getCurrentState(),
      });
    }
  }

  /**
   * Centralized handling of common state from DataCoordinator and SelectionService
   * This eliminates repetitive caching code in individual components
   */
  /** @param {string} sender @param {unknown} state */
  _handleInitialState(sender, state) {
    if (!state) return;

    // Handle DataCoordinator state
    if (sender === "DataCoordinator") {
      const coordinatorState = /** @type {DataCoordinatorInitialState} */ (
        state
      );
      // Handle profile ID from both sources
      const profileId =
        coordinatorState.currentProfile ||
        (coordinatorState.currentProfileData &&
          coordinatorState.currentProfileData.id);
      const profile = coordinatorState.currentProfileData;

      if (profileId) {
        // Cache profile ID
        this.cache.currentProfile = profileId;
      }

      if (profile) {
        // Cache profile data
        this.cache.profile = profile;
        this.cache.currentEnvironment = profile.environment || "space";
      } else if (coordinatorState.currentEnvironment) {
        // Handle environment without profile data
        this.cache.currentEnvironment = coordinatorState.currentEnvironment;
      }

      // Cache build-specific data if profile exists
      if (profile) {
        if (profile.builds) {
          this.cache.builds = profile.builds;
          // Cache keys for current environment
          const currentBuild = profile.builds[this.cache.currentEnvironment];
          this.cache.keys = currentBuild?.keys || {};
        } else if (profile.keys) {
          // Legacy format support
          this.cache.keys = profile.keys;
        }

        // Cache aliases
        this.cache.aliases = profile.aliases || {};
      }

      console.log(
        `[ComponentBase] ${this.getComponentName()} cached DataCoordinator state:`,
        {
          currentProfile: this.cache.currentProfile,
          currentEnvironment: this.cache.currentEnvironment,
        },
      );
    }

    // Handle SelectionService state
    if (sender === "SelectionService" && state) {
      const selectionState = /** @type {SelectionInitialState} */ (state);
      this._cacheSelectionState(selectionState);

      console.log(
        `[ComponentBase] ${this.getComponentName()} cached SelectionService state:`,
        {
          selectedKey: this.cache.selectedKey,
          selectedAlias: this.cache.selectedAlias,
          currentEnvironment: this.cache.currentEnvironment,
        },
      );
    }

    // Handle PreferencesService state
    if (sender === "PreferencesService" && state) {
      const preferencesState = /** @type {PreferencesInitialState} */ (state);
      // Cache preferences settings
      if (
        preferencesState.settings &&
        typeof preferencesState.settings === "object"
      ) {
        Object.assign(this.cache.preferences, preferencesState.settings);
        console.log(
          `[ComponentBase] ${this.getComponentName()} cached PreferencesService state:`,
          {
            bindToAliasMode: this.cache.preferences.bindToAliasMode,
            bindsetsEnabled: this.cache.preferences.bindsetsEnabled,
            settingsCount: Object.keys(preferencesState.settings).length,
          },
        );
      }
    }

    // Handle BindsetService state
    if (sender === "BindsetService" && state) {
      const bindsetState = /** @type {BindsetInitialState} */ (state);
      // Cache bindset names
      if (bindsetState.bindsets && Array.isArray(bindsetState.bindsets)) {
        this.cache.bindsetNames = bindsetState.bindsets;
        console.log(
          `[ComponentBase] ${this.getComponentName()} cached BindsetService state:`,
          {
            bindsetNames: this.cache.bindsetNames,
          },
        );
      }
    }
  }

  /** @param {SelectionInitialState} selectionState */
  _cacheSelectionState(selectionState) {
    this.cache.selectedKey = selectionState.selectedKey;
    this.cache.selectedAlias = selectionState.selectedAlias;
    this.cache.currentEnvironment = selectionState.currentEnvironment;
    this.cache.editingContext = selectionState.editingContext;
    this.cache.cachedSelections = { ...selectionState.cachedSelections };
  }

  /**
   * @param {{ sender?: string, state?: unknown }} message
   */
  _onInitialState({ sender, state } = {}) {
    if (!sender) return;

    if (typeof window !== "undefined") {
      console.log(
        `[ComponentBase] ${this.getComponentName()} received initial state from ${sender}`,
        state,
      );
    }

    // Handle common state first
    this._handleInitialState(sender, state);

    // Then call component-specific handler
    if (typeof this.handleInitialState === "function") {
      this.handleInitialState(sender, state);
    }
  }

  /**
   * Retrieve a serialisable snapshot representing the component's current state.
   * Stateful subclasses MUST override this to provide meaningful data.
   * @returns {unknown}
   */
  getCurrentState() {
    return null; // Default: no state – subclasses should override
  }

  /**
   * Optional hook invoked when another component sends its initial state
   * during the late-join handshake. Subclasses can override to merge or
   * process the provided state.
   * @param {string} sender - Name of the component that sent the state
   * @param {unknown} state - Serializable state snapshot
   */
  /* eslint-disable-next-line */
  handleInitialState(sender, state) {
    // No-op by default. Override in subclasses if needed.
  }

  /**
   * Request a protocol operation whose payload is required.
   * @template {RpcRequiredTopic} RequiredTopic
   * @overload
   * @param {RequiredTopic} topic
   * @param {import('../types/rpc/transport.js').RpcRequest<RequiredTopic>} payload
   * @returns {Promise<import('../types/rpc/transport.js').RpcResult<RequiredTopic>>}
   */
  /**
   * Request a protocol operation whose payload is optional.
   * @template {RpcOptionalTopic} OptionalTopic
   * @overload
   * @param {OptionalTopic} topic
   * @param {import('../types/rpc/transport.js').RpcRequest<OptionalTopic>} [payload]
   * @returns {Promise<import('../types/rpc/transport.js').RpcResult<OptionalTopic>>}
   */
  /**
   * Request a protocol operation with no business payload.
   * @template {RpcNoPayloadTopic} EmptyTopic
   * @overload
   * @param {EmptyTopic} topic
   * @param {import('../types/rpc/transport.js').RpcRequest<EmptyTopic>} [payload]
   * @returns {Promise<import('../types/rpc/transport.js').RpcResult<EmptyTopic>>}
   */
  /**
   * Request an explicitly branded dynamic RPC operation.
   * @template Request
   * @template Result
   * @overload
   * @param {import('../types/rpc/transport.js').DynamicRpcTopic<Request, Result>} topic
   * @param {Request} payload
   * @returns {Promise<Result>}
   */
  /**
   * @param {RpcReadyTopic | AnyDynamicRpcTopic} topic
   * @param {unknown} [payload]
   * @returns {Promise<unknown>}
   */
  async request(topic, payload = {}) {
    if (typeof window !== "undefined") {
      console.log(`[${this.getComponentName()}] request → ${topic}`, payload);
    }
    if (!this.eventBus) {
      throw new Error(`Cannot request "${topic}" without an event bus`);
    }
    const eventBus = /** @type {CoreEventBus} */ (
      /** @type {unknown} */ (this.eventBus)
    );
    const rawRequest =
      /** @type {(bus: CoreEventBus, topic: string, payload: unknown) => Promise<unknown>} */ (
        /** @type {unknown} */ (_cbRequest)
      );
    return await rawRequest(eventBus, topic, payload);
  }

  /**
   * Register a handler for a known RPC operation.
   * @template {RpcReadyTopic} KnownRpcTopic
   * @overload
   * @param {KnownRpcTopic} topic
   * @param {import('../types/rpc/transport.js').RpcHandler<KnownRpcTopic>} handler
   * @returns {() => void}
   */
  /**
   * Register a handler for an explicitly branded dynamic RPC operation.
   * @template Request
   * @template Result
   * @overload
   * @param {import('../types/rpc/transport.js').DynamicRpcTopic<Request, Result>} topic
   * @param {(payload: Request) => import('../types/rpc/base.js').MaybePromise<Result>} handler
   * @returns {() => void}
   */
  /**
   * Runtime implementation for the typed responder overloads.
   * @param {RpcReadyTopic | AnyDynamicRpcTopic} topic
   * @param {RawRpcHandler} handler
   * @returns {() => void}
   */
  respond(topic, handler) {
    if (!this.eventBus) return () => {};

    const eventBus = /** @type {CoreEventBus} */ (
      /** @type {unknown} */ (this.eventBus)
    );
    const rawRespond =
      /** @type {(bus: CoreEventBus, topic: string, handler: (payload: unknown) => Promise<unknown>) => () => void} */ (
        /** @type {unknown} */ (_cbRespond)
      );
    return rawRespond(eventBus, topic, async (payload) => {
      if (typeof window !== "undefined") {
        console.log(
          `[${this.getComponentName()}] respond handler → ${topic}`,
          payload,
        );
      }
      return await handler(payload);
    });
  }
}
