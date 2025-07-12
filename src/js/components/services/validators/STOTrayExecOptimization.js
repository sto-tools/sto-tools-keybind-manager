import ValidatorBase from './ValidatorBase.js'

export default class STOTrayExecOptimizationRule extends ValidatorBase {
  constructor () {
    super({
      id: 'stoTrayExecOptimization',
      defaultSeverity: 'warning',
      messageKey: 'sto_tray_exec_optimization_suggestion',
      tags: ['length', 'optimization', 'tray']
    })
  }

  /**
   * @param {Object} ctx – { key, length, commands, stabilized, generatedCommand }
   */
  validate (ctx) {
    const { length, generatedCommand } = ctx
    
    // Only warn if we're at or approaching the line length limit (900+ characters)
    if (length < 900) {
      return null
    }
    
    // Count STOTrayExecByTray instances in the actual generated command
    const matches = generatedCommand.match(/STOTrayExecByTray/g)
    const totalSTOTrayExecCount = matches ? matches.length : 0
    
    if (totalSTOTrayExecCount > 0) {
      // Each STOTrayExecByTray -> TrayExecByTray replacement saves 3 characters
      const potentialSavings = totalSTOTrayExecCount * 3
      const newLength = length - potentialSavings
      
      return {
        severity: 'warning',
        key: 'sto_tray_exec_optimization_suggestion',
        params: { 
          currentLength: length, 
          potentialSavings,
          newLength,
          count: totalSTOTrayExecCount
        },
        defaultMessage: `Command chain is ${length} characters. Replacing ${totalSTOTrayExecCount} instance(s) of STOTrayExecByTray with TrayExecByTray would save ${potentialSavings} characters (new length: ${newLength}).`
      }
    }
    
    return null
  }
}