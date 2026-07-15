/**
 * Shared error classes for STO Tools Keybind Manager
 */

class STOError extends Error {
  /** @param {string} message @param {string} [code] */
  constructor(message, code = "STO_ERROR") {
    super(message);
    this.name = "STOError";
    this.code = code;
  }
}

class VertigoError extends STOError {
  /** @param {string} message @param {string} [code] */
  constructor(message, code = "VFX_ERROR") {
    super(message, code);
    this.name = "VertigoError";
  }
}

class InvalidEnvironmentError extends VertigoError {
  /** @param {string} environment */
  constructor(environment) {
    super(
      `Invalid environment '${environment}'. Valid environments are: space, ground`,
      "INVALID_ENVIRONMENT",
    );
    this.environment = environment;
  }
}

class InvalidEffectError extends VertigoError {
  /** @param {string} effectName @param {string} environment */
  constructor(effectName, environment) {
    super(
      `Invalid effect '${effectName}' for environment '${environment}'`,
      "INVALID_EFFECT",
    );
    this.effectName = effectName;
    this.environment = environment;
  }
}

export { STOError, VertigoError, InvalidEnvironmentError, InvalidEffectError };

if (typeof window !== "undefined") {
  Object.assign(window, {
    STOError,
    VertigoError,
    InvalidEnvironmentError,
    InvalidEffectError,
  });
}
