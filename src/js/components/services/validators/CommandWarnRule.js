import ValidatorBase from './ValidatorBase.js'

const CMD_MAP = (typeof window !== 'undefined' && window.COMMANDS) ? window.COMMANDS : {}

function getCmdDef(token){
  token = token.toLowerCase()
  for(const key in CMD_MAP){
    const def = CMD_MAP[key]
    if(def && def.command && def.command.toLowerCase() === token){
      if (typeof def === 'object' && def) {
        return { ...def, _id: key }
      }
      return def
    }
  }
  return null
}

export default class CommandWarnRule extends ValidatorBase{
  constructor(){
    super({
      id:'commandWarnings',
      defaultSeverity:'warning',
      messageKey:'_internal_command_warning'
    })
  }

  validate(ctx){
    const { commands } = ctx
    if(!Array.isArray(commands) || commands.length === 0) return null

    const details = []

    for(const c of commands){
      const str = typeof c==='string'?c:(c.command||'')
      const token = str.trim().split(/\s+/)[0]
      const def = getCmdDef(token)
      if(def && def.warning){
        let name = def.name || token
        if(def._id && typeof window !== 'undefined' && window.i18next && window.i18next.t){
          const nameKey = `command_definitions.${def._id}.name`
          const translatedName = window.i18next.t(nameKey)
          if(translatedName && translatedName !== nameKey){
            name = translatedName
          }
        }
        let warnText = def.warning
        if(typeof window !== 'undefined' && window.i18next && window.i18next.t){
          const t = window.i18next.t(def.warning)
          warnText = t && t !== def.warning ? t : def.warning
        }
        details.push(`${name} - ${warnText}`)
      }
    }

    if(details.length === 0) return null

    const list = details.join(', ')

    // Return a single aggregated issue so that CommandChainValidatorService can translate it
    return {
      severity: 'warning',
      key: 'commands_with_internal_warnings',
      params: { list },
      defaultMessage: list
    }
  }

  run(ctx){
    const res = this.validate(ctx)
    return res || null
  }
} 