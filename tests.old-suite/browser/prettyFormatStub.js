export function format(value) {
  return typeof value === 'string' ? value : JSON.stringify(value)
}
export default { format } 