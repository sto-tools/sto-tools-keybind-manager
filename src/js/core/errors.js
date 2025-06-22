/**
 * Shared error classes for STO Tools Keybind Manager
 */

class STOError extends Error {
  constructor(message, code = 'STO_ERROR') {
    super(message)
    this.name = 'STOError'
    this.code = code
  }
}

class VertigoError extends STOError {
  constructor(message, code = 'VFX_ERROR') {
    super(message, code)
    this.name = 'VertigoError'
  }
}

class InvalidEnvironmentError extends VertigoError {
  constructor(environment) {
    super(
      `Invalid environment '${environment}'. Valid environments are: space, ground`,
      'INVALID_ENVIRONMENT'
    )
    this.environment = environment
  }
}

class InvalidEffectError extends VertigoError {
  constructor(effectName, environment) {
    super(
      `Invalid effect '${effectName}' for environment '${environment}'`,
      'INVALID_EFFECT'
    )
    this.effectName = effectName
    this.environment = environment
  }
}

export { STOError, VertigoError, InvalidEnvironmentError, InvalidEffectError }

if (typeof window !== 'undefined') {
  window.STOError = STOError
  window.VertigoError = VertigoError
  window.InvalidEnvironmentError = InvalidEnvironmentError
  window.InvalidEffectError = InvalidEffectError
}
