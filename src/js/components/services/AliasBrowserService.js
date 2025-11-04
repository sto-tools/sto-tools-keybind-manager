import ComponentBase from '../ComponentBase.js'

/**
 * AliasBrowserService – source-of-truth for alias CRUD & selection.
 * Uses DataCoordinator broadcast/cache pattern.
 */
export default class AliasBrowserService extends ComponentBase {
  constructor ({ ui, eventBus } = {}) {
    super(eventBus)
    this.componentName = 'AliasBrowserService'
    this.ui = ui
    
    if (this.eventBus) {
      // Register request/response endpoints for alias operations
      this.respond('alias:get-all', () => this.getAliases())
      this.respond('alias-browser:create', ({ name, description = '' } = {}) => this.createAlias(name, description))
    }
  }

  onInit() {
    this.setupEventListeners()
  }

  setupEventListeners() {
    // Listen for profile updates
    this.addEventListener('profile:updated', ({ profileId, profile }) => {
      if (typeof window !== 'undefined') {
        console.log(`[AliasBrowserService] profile:updated received. profileId: ${profileId}, cache.currentProfile: ${this.cache.currentProfile}, match: ${profileId === this.cache.currentProfile}`)
      }
      if (profileId === this.cache.currentProfile) {
        this.updateCacheFromProfile(profile)
        this.emit('aliases-changed', { aliases: this.cache.aliases })
      }
    })

    // Listen for profile switched
    this.addEventListener('profile:switched', ({ profileId, profile, environment }) => {
      this.cache.currentProfile = profileId
      
      if (environment) {
        this.cache.currentEnvironment = environment
      }
      
      this.updateCacheFromProfile(profile)
      this.emit('aliases-changed', { aliases: this.cache.aliases })
    })

    // Listen for environment changes
    this.addEventListener('environment:changed', async (payload) => {
      const env = typeof payload === 'string' ? payload : payload?.environment
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log(`[AliasBrowserService] environment:changed received. payload:`, payload, `parsed env: ${env}`)
      }
      if (env) {
        this.cache.currentEnvironment = env
      }
    })

      
  }

  updateCacheFromProfile(profile) {
    if (!profile) {
      return
    }
        
    this.cache.profile = profile
    this.cache.aliases = profile.aliases || {}
  }

  getAliases() {
    return Object.fromEntries(Object.entries(this.cache.aliases || {}).filter(([key, value]) => value.type !== 'vfx-alias')) 
  }

  async selectAlias(name) {
    const result = await this.request('selection:select-alias', { 
      aliasName: name
    })
    
    return result
  }

  async createAlias(name, description = '') {
    const result = await this.request('alias:add', { name, description })
    
    if (result) {
      // Auto-select the newly created alias
      await this.selectAlias(name)
    }

    return result
  }
} 