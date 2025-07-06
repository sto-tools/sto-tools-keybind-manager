import ValidatorBase from './ValidatorBase.js'

const CMD_MAP = (typeof window !== 'undefined' && window.COMMANDS) ? window.COMMANDS : {}

function getCmdDefFromString(commandStr){
  if(!commandStr) return null
  const normalized = commandStr.trim().toLowerCase()

  for(const key in CMD_MAP){
    const def = CMD_MAP[key]
    if(!def || !def.command) continue
    const defCmd = def.command.trim().toLowerCase()

    // Direct equal match
    if(normalized === defCmd){
      return { ...def, _id: key }
    }

    // Starts-with match handles parameter strings (e.g. '+power_exec Distribute_Shields')
    if(normalized.startsWith(defCmd)){
      return { ...def, _id: key }
    }

    // Also handle first token equal (legacy behaviour)
    const firstToken = normalized.split(/\s+/)[0]
    if(firstToken === defCmd){
      return { ...def, _id: key }
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

    const warnings = []

    for(const c of commands){
      const str = typeof c==='string'?c:(c.command||'')
      const def = getCmdDefFromString(str)
      if(def && def.warning){
        // Translate command name if possible
        let name = def.name || str
        if(def._id && typeof window !== 'undefined' && window.i18next && window.i18next.t){
          const nameKey = `command_definitions.${def._id}.name`
          const translatedName = window.i18next.t(nameKey)
          if(translatedName && translatedName !== nameKey){
            name = translatedName
          }
        }

        // Translate warning text
        let warnText = def.warning
        if(typeof window !== 'undefined' && window.i18next && window.i18next.t){
          const t = window.i18next.t(def.warning)
          warnText = t && t !== def.warning ? t : def.warning
        }

        warnings.push({ name, warnText })
      }
    }

    return warnings
  }

  run(ctx){
    const warnings = this.validate(ctx)
    if(!warnings || warnings.length === 0) return null

    // Produce one issue per warning
    return warnings.map(({ name, warnText }) => ({
      id: this.id,
      severity: 'warning',
      defaultMessage: `${name} - ${warnText}`
    }))
  }
} 