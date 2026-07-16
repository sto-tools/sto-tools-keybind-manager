const specialKeyOrder = ["Space", "Tab", "Enter", "Escape"];

/** @param {string} a @param {string} b */
export function compareKeyNames(a, b) {
  const aFunction = a.match(/^F(\d+)$/);
  const bFunction = b.match(/^F(\d+)$/);
  if (aFunction && bFunction) {
    return parseInt(aFunction[1]) - parseInt(bFunction[1]);
  }
  if (aFunction) return -1;
  if (bFunction) return 1;

  const aNumeric = /^\d+$/.test(a);
  const bNumeric = /^\d+$/.test(b);
  if (aNumeric && bNumeric) return parseInt(a) - parseInt(b);
  if (aNumeric) return -1;
  if (bNumeric) return 1;

  const aLetter = /^[A-Z]$/.test(a);
  const bLetter = /^[A-Z]$/.test(b);
  if (aLetter && bLetter) return a.localeCompare(b);
  if (aLetter) return -1;
  if (bLetter) return 1;

  const aSpecial = specialKeyOrder.indexOf(a);
  const bSpecial = specialKeyOrder.indexOf(b);
  if (aSpecial !== -1 && bSpecial !== -1) return aSpecial - bSpecial;
  if (aSpecial !== -1) return -1;
  if (bSpecial !== -1) return 1;
  return a.localeCompare(b);
}

/** @param {string[] | unknown} keys */
export function sortKeyNames(keys) {
  return Array.isArray(keys) ? [...keys].sort(compareKeyNames) : [];
}
