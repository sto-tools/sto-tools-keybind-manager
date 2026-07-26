// Static registry until build tooling supports glob imports.
// Import each rule explicitly so rollup can bundle without `import.meta`.

import MaxLengthRule from "./MaxLength.js";
import StabilizedTrayOnlyRule from "./StabilizedTrayOnly.js";
import KeyCommandCountRule from "./KeyCommandCount.js";
import AliasMixedEnvironmentRule from "./AliasMixedEnvironment.js";
import CommandWarnRule from "./CommandWarnRule.js";
import UnsafeKeybindRule from "./UnsafeKeybindRule.js";
import STOTrayExecOptimizationRule from "./STOTrayExecOptimization.js";

/**
 * Build a validator set bound to one service's explicit dependencies.
 *
 * @param {{ i18n?: import('../serviceTypes.js').I18n | null }} [options]
 * @returns {import('./ValidatorBase.js').default[]}
 */
export function createValidatorRules({ i18n = null } = {}) {
  return [
    new MaxLengthRule(),
    new StabilizedTrayOnlyRule(),
    new KeyCommandCountRule(),
    new AliasMixedEnvironmentRule(),
    new CommandWarnRule({ i18n }),
    new UnsafeKeybindRule(),
    new STOTrayExecOptimizationRule(),
  ];
}
