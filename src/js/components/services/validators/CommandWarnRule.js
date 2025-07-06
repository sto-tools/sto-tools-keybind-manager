import ValidatorBase from './ValidatorBase.js'

const CMD_MAP = (typeof window !== 'undefined' && window.COMMANDS) ? window.COMMANDS : {}

function getCmdDef(token){
  token = token.toLowerCase()
  for(const key in CMD_MAP){
    const def = CMD_MAP[key]
    if(def && def.command && def.command.toLowerCase() === token){
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
      messageKey:'commands_with_internal_warnings'
    })
  }

  validate(ctx){
    const { commands } = ctx
    if(!Array.isArray(commands)) return null
    const warnList = []
    for(const c of commands){
      const str = typeof c==='string'?c:(c.command||'')
      const token = str.trim().split(/\s+/)[0]
      const def = getCmdDef(token)
      if(def && def.warning){
        warnList.push(def.name || token)
      }
    }
    if(warnList.length){
      return {
        severity:'warning',
        key:'commands_with_internal_warnings',
        params:{ list: warnList.join(', ') },
        defaultMessage:`The following commands have warnings: ${warnList.join(', ')}`
      }
    }
    return null
  }
} 