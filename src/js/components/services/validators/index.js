// Static registry until build tooling supports glob imports.
// Import each rule explicitly so rollup can bundle without `import.meta`.

import MaxLengthRule from './MaxLength.js'
import StabilizedTrayOnlyRule from './StabilizedTrayOnly.js'
import KeyCommandCountRule from './KeyCommandCount.js'
import AliasMixedEnvironmentRule from './AliasMixedEnvironment.js'
import CommandWarnRule from './CommandWarnRule.js'
import UnsafeKeybindRule from './UnsafeKeybindRule.js'
import STOTrayExecOptimizationRule from './STOTrayExecOptimization.js'

const rules = [
  new MaxLengthRule(),
  new StabilizedTrayOnlyRule(),
  new KeyCommandCountRule(),
  new AliasMixedEnvironmentRule(),
  new CommandWarnRule(),
  new UnsafeKeybindRule(),
  new STOTrayExecOptimizationRule()
]

// Helper to allow runtime registration of additional validators
export function registerValidator (ruleInstance) {
  if (ruleInstance && typeof ruleInstance.run === 'function') {
    rules.push(ruleInstance)
  }
}

export default rules 