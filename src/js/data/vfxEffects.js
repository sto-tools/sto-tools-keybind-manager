import catalog from "./vfxEffects.json";

/** @typedef {{ label: string, effect: string }} VFXEffect */
/** @typedef {{ space: VFXEffect[], ground: VFXEffect[] }} VFXEffects */

/** @type {VFXEffects} */
const vfxEffects = catalog;

export { vfxEffects };
export default vfxEffects;
