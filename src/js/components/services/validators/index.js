// Static registry until build tooling supports glob imports.
// Import each rule explicitly so rollup can bundle without `import.meta`.

import MaxLengthRule from './MaxLength.js'

const rules = [
  new MaxLengthRule()
]

// Helper to allow runtime registration of additional validators
export function registerValidator (ruleInstance) {
  if (ruleInstance && typeof ruleInstance.run === 'function') {
    rules.push(ruleInstance)
  }
}

export default rules 