import bridgeOfficer from "./commands/bridgeOfficer.js";
import camera from "./commands/camera.js";
import combat from "./commands/combat.js";
import communication from "./commands/communication.js";
import cosmetic from "./commands/cosmetic.js";
import custom from "./commands/custom.js";
import movement from "./commands/movement.js";
import power from "./commands/power.js";
import system from "./commands/system.js";
import targeting from "./commands/targeting.js";
import team from "./commands/team.js";
import tray from "./commands/tray.js";

/** @type {Record<string, import('../components/services/serviceTypes.js').CommandCategory>} */
const commandCategories = {
  custom,
  targeting,
  combat,
  cosmetic,
  bridge_officer: bridgeOfficer,
  tray,
  power,
  movement,
  camera,
  communication,
  team,
  system,
};

export { commandCategories };
export default commandCategories;
