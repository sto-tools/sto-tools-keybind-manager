// STO Tools Keybind Manager - Vertigo Effects Data
// Visual effects data for disabling via dynFxSetFXExlusionList

// Custom error classes for better error handling
class VertigoError extends Error {
    constructor(message, code = 'VERTIGO_ERROR') {
        super(message);
        this.name = 'VertigoError';
        this.code = code;
    }
}

class InvalidEnvironmentError extends VertigoError {
    constructor(environment) {
        super(`Invalid environment '${environment}'. Valid environments are: space, ground`, 'INVALID_ENVIRONMENT');
        this.environment = environment;
    }
}

class InvalidEffectError extends VertigoError {
    constructor(effectName, environment) {
        super(`Invalid effect '${effectName}' for environment '${environment}'`, 'INVALID_EFFECT');
        this.effectName = effectName;
        this.environment = environment;
    }
}

const VERTIGO_EFFECTS = {
    space: [
        { label: "Advanced inhibiting turret shield bubble", effect: "Fx_Rep_Temporal_Ship_Chroniton_Stabilization_Proc" },
        { label: "Approaching Agony", effect: "Cfx_Lockboxfx_Cb29_Ship_Agony_Field" },
        { label: "Attack Pattern Alpha", effect: "Fx_Ship_Tac_Attackpatternalpha" },
        { label: "Attack Pattern Beta", effect: "Fx_Ship_Tac_Attackpatternbeta" },
        { label: "Attack Pattern Delta", effect: "Fx_Ship_Tac_Attackpatterndelta" },
        { label: "Attack Pattern Omega", effect: "Fx_Ship_Tac_Attackpatternomega" },
        { label: "Beacon of Kahless", effect: "Fx_Er_Bbs_Beacon_Of_Kahless_Flash" },
        { label: "Boost Morale", effect: "Fx_Ship_Spec_Powers_Command_Boost_Morale_Bufffx,Cfx_Ship_Spec_Powers_Command_Boost_Morale_Activate" },
        { label: "Brace for Impact", effect: "Fx_Bop_Braceforimpact,Cfx_Ship_Sci_Hazardemitter_Buff" },
        { label: "Breath of the Dragon", effect: "Fx_Ship_Cp_T6_Hysperian_Dragonbreath" },
        { label: "Call Emergency Artillery", effect: "Fx_Ships_Boffs_Cmd_Callartillery_Activate,Fx_Ships_Boffs_Cmd_Callartillery_Explosion" },
        { label: "Competitive Engine Buff Effect", effect: "Fx_Ship_Mod_Haste_Buff_Gen" },
        { label: "Co-opt Energy Weapons", effect: "Fx_Capt_Powers_Ship_Sci_Coopt_Energy_Wep_Aoe,Cfx_Capt_Powers_Ship_Sci_Coopt_Energy_Wep_Area" },
        { label: "Concentrate Fire Power", effect: "Fx_Ships_Boff_Cmd_Confire_Activatefx,Cfx_Ships_Boff_Cmd_Confire_Mark" },
        { label: "Cnidarian Jellyfish AoE", effect: "Cfx_Ship_Sp_T6_Jellyfish_Cnidarian_Defense_Aoe" },
        { label: "Dark Matter Anomaly", effect: "Cfx_Ship_Console_Dark_Matter_Anamoly_Costumefx" },
        { label: "Delphic Tear", effect: "Fx_Ships_Consoles_Cb21_Delphictear" },
        { label: "Destabilising Resonance Beam", effect: "P_Er_Ship_Destabilizing_Resonance_Beam_Aoe_Particles" },
        { label: "Elachi Walker Combat Pet (3 effects)", effect: "Soundfx_Elachiwalker_Footstep_Pet,Fx_Er_Tfo_Elachi_Walker_Combat_Pet_Deathfx,Soundfx_Elachiwalker_Petsummon" },
        { label: "Electrified Anomalies Trait", effect: "Fx_Tp_Ship_T6_Risian_Science_Electrified_Anomalies_Arc_Foe,Fx_Tp_Ship_T6_Risian_Science_Electrified_Anomalies_Arc_Friend" },
        { label: "Emergency Pwr to Shields", effect: "Fx_Ship_Eng_Emergencypowershields" },
        { label: "Emergency Pwr to Wep", effect: "Fx_Ship_Eng_Emergencypowerweapons" },
        { label: "Engineering Fleet III", effect: "Fx_Ship_Boff_Fleet_Capt_Engineering_Teambuff" },
        { label: "Engineering Team", effect: "Cfx_Ship_Crewteam_Engineeringteam_Buff" },
        { label: "EPS Power Transfer", effect: "Cfx_Ship_Eng_Epspowertransfer_Target" },
        { label: "Focus Frenzy", effect: "Fx_Skilltree_Ship_Ffrenzy_Activatefx" },
        { label: "Go Down Fighting", effect: "Fx_Bop_Godownfighting" },
        { label: "Hangar Pet Rank Up", effect: "Fx_Ship_Levelup_Fighter_Rankup" },
        { label: "Hazard Emitters", effect: "Cfx_Ship_Sci_Hazardemitter_Buff" },
        { label: "Intel Fleet III", effect: "Fx_Ship_Boff_Fleet_Capt_Intel_Teambuff" },
        { label: "Intel Team (uses 3 effects)", effect: "Cfx_Ship_Cruiser_Auras_Taunt,Cfx_Spc_Boffpowers_Intel_Intelteam_Buff,Fx_Ships_Intel_Lyinginwait" },
        { label: "Kemocite on ship animation", effect: "C1_E_Ship_Xindi_Lockboxcb15_Kemocite_Weaponry_Bufffx" },
        { label: "Kemocite HitFX ring", effect: "Fx_Ship_Xindi_Lockboxcb15_Kemocite_Weaponry_Aoe_Proc" },
        { label: "Kentari Ferocity Weapons Glow", effect: "P_Trait_Powers_Ship_Lukari_Colony_Kentari_Ferocity_Weapons_Glow" },
        { label: "Kobayashi Maru powerup silenced", effect: "Fx_Evr_Kmaru_Ship_Dev_Resupply_Drop_Powerup_Bufffx,Fx_Evr_Kmaru_Ship_Dev_Resupply_Drop_Powerup" },
        { label: "Less Obvious Loot Drop Common", effect: "Cfx_Space_Loot_Drop_Common_Costumefx" },
        { label: "Less Obvious Loot Drop Uncommon", effect: "Cfx_Space_Loot_Drop_Uncommon_Costumefx" },
        { label: "Less Obvious Loot Drop Rare", effect: "Cfx_Space_Loot_Drop_Rare_Costumefx" },
        { label: "Less Obvious Loot Drop Very Rare", effect: "Cfx_Space_Loot_Drop_Veryrare_Costumefx" },
        { label: "Less Obvious Loot Drop Lock Box", effect: "Cfx_Space_Loot_Drop_Chancebox_Costumefx" },
        { label: "Less Obvious Loot Drop Dilithium", effect: "Cfx_Space_Loot_Drop_Dilithium_Costumefx" },
        { label: "Miraculous Repairs", effect: "Fx_Bop_Miracleworker" },
        { label: "MW - Align Shield Frequencies", effect: "Fx_Spc_Boffpowers_Miracleworker_Alignshieldfrequencies_Hitfx" },
        { label: "MW - Destabilize Warp Core", effect: "Fx_Spc_Boffpowers_Miracleworker_Destabilizewarpcore" },
        { label: "MW - Exceed rated limits", effect: "Fx_Spc_Boffpowers_Miracleworker_Energyweaponsexceedratedlimits_Dot_Hitfx,Fx_Spc_Boffpowers_Miracleworker_Energyweaponsexceedratedlimits" },
        { label: "MW - Fix em up (and other green glows)", effect: "Fx_Ship_Mod_Damage_Buff" },
        { label: "MW - Mixed Armaments Synergy", effect: "Fx_Spc_Boffpowers_Miracleworker_Mixedarmamentssynergy" },
        { label: "MW - Narrow Sensor Bands", effect: "Fx_Spc_Boffpowers_Miracleworker_Narrowsensorbands" },
        { label: "MW - Null Pointer Flood", effect: "Fx_Spc_Boffpowers_Miracleworker_Nullpointerflood" },
        { label: "MW - Reroute shilds to Hull containment", effect: "Fx_Spc_Boffpowers_Miracleworker_Rerouteshieldstohullcontainment,Cfx_Spc_Boffpowers_Miracleworker_Rerouteshieldstohullcontainment" },
        { label: "Nadion Inversion", effect: "Fx_Bop_Nadioinversion" },
        { label: "Nanoprobe Shield Generator (Dyson Rep)", effect: "Cfx_Rp_Dyson_Ship_Reactive_Shielding" },
        { label: "Neutronic Eddies", effect: "Cfx_Ships_Cp_T6_Risian_Science_Neutronic_Edides_Costumefx" },
        { label: "Overwhelm Emitters", effect: "Fx_Ships_Boff_Cmd_Owemitters_Activatefx" },
        { label: "Photonic Officer", effect: "Fx_Bop_Photonicofficer_activate" },
        { label: "PILOT - Clean Getaway", effect: "Fx_Spc_Boff_Pilot_Cleangetaway_Activate" },
        { label: "PILOT - Coolant Ignition (mostly)", effect: "Fx_Spc_Boff_Pilot_Coolantinjection_Ignite,Fx_Spc_Boff_Pilot_Coolantinjection_Costumefx" },
        { label: "PILOT - Deploy Countermeasures", effect: "Fx_Spc_Boff_Pilot_Deploycm" },
        { label: "PILOT - Fly her apart", effect: "Cfx_Spc_Boff_Pilot_Flyapart_Dot" },
        { label: "PILOT - Form Up (mostly)", effect: "Fx_Spc_Boff_Pilot_Formup_Teleport,Fx_Spc_Boff_Pilot_Formup_Buff_Wepbuff" },
        { label: "PILOT - hold Together", effect: "Cfx_Spc_Boff_Pilot_Holdtogether" },
        { label: "PILOT - Lambda", effect: "Fx_Ship_Mod_Damage_Buff,Fx_Spc_Boff_Pilot_Aplambda_Bufffx,Fx_Spc_Boff_Pilot_Aplambda" },
        { label: "PILOT - Lock Trajectory", effect: "Fx_Spc_Boff_Pilot_Flares_Switch,Cfx_Spc_Boff_Pilot_Locktrajectory" },
        { label: "PILOT - Pilot Team", effect: "Cfx_Spc_Boff_Pilot_Pilotteam_Buff" },
        { label: "PILOT - Reroute Reserves to Weapons", effect: "Fx_Spc_Boff_Pilot_Reroute_Wepbuff,Fx_Spc_Boff_Pilot_Reroute_Activate" },
        { label: "PILOT - Subspace Boom", effect: "Cfx_Spc_Boff_Pilot_Ssboom_Costumefx_Neverdie,Fx_Spc_Boff_Pilot_Ssboom_Boom" },
        { label: "Plasma Storm", effect: "Cfx_Ship_Cp_Cb27_Generate_Plasma_Storm_Costumefx" },
        { label: "Rally Point Marker", effect: "Cfx_Ships_Boff_Cmd_Rallypoint_Marker" },
        { label: "Reverse Shield Polarity", effect: "Cfx_Ship_Eng_Reverseshieldpolarity_Buff" },
        { label: "Scattering Field", effect: "Cfx_Ship_Sci_Dampeningfield_Aoe,Cfx_Ship_Sci_Dampeningfield_Shield_Buff" },
        { label: "Science Team", effect: "Cfx_Ship_Crewteam_Scienceteam_Buff" },
        { label: "Science Fleet III", effect: "Fx_Ship_Boff_Fleet_Capt_Science_Teambuff" },
        { label: "Soliton Wave Generator (uses 4 effects)", effect: "Cfx_Ship_Risa_Loot_Soliton_Wave_Suckfx_Target,Cfx_Ship_Risa_Loot_Soliton_Wave_Suckfx,Cfx_Ship_Risa_Loot_Soliton_Wave_Out,Cfx_Ship_Risa_Loot_Soliton_Wave_In" },
        { label: "Spore Infused Anomalies", effect: "Fx_Trait_Powers_Ship_T6_Somerville_Sia_Blast" },
        { label: "Subspace Vortex Teleport Effect", effect: "Fx_Ship_Xindi_Lockboxcb15_Subspace_Vortex_Teleport" },
        { label: "Suppression Barrage", effect: "Cfx_Ships_Boff_Cmd_Sbarrage_Buff" },
        { label: "Surgical Strikes", effect: "Fx_Spc_Boffpowers_Int_Sstrikes_Buff" },
        { label: "Tactical Fleet III", effect: "Fx_Ship_Boff_Fleet_Capt_Tactical_Teambuff" },
        { label: "Tactical Initiative", effect: "Fx_Bop_Tacticalinitiative" },
        { label: "Tactical Team", effect: "Cfx_Ship_Crewteam_Tacticalteam_Buff" },
        { label: "Target Rich Environment", effect: "Fx_Ship_Trait_Cb20_Targetrichenvironment" },
        { label: "Temporal Anchor", effect: "Cfx_Ship_Trait_Temporal_Anchor_Costumefx" },
        { label: "Temporal Vortex Probe", effect: "C1_Eventreward_Fcd_Temporal_Vortex_Costumefx,Fx_Eventreward_Fcd_Temporal_Vortex_Blast" },
        { label: "Timeline Collapse (5 effects!)", effect: "Cfx_Ship_Temp_Tcollapse_Costume,Fx_Ship_Temp_Tcollapse_Hitfx,Fx_Ship_Temp_Tcollapse_Explode,Fx_Ship_Temp_Tcollapse_Beamhitfx,Fx_Ship_Temp_Tcollapse" },
        { label: "V'Ger Torpedo (Volatile Digital Transformation)", effect: "Fx_Ship_Torpedo_Plasma_Vger_Anniv_Explode,Cfx_Ship_Torpedo_Vger_Disintegrate_In_Tintable" },
        { label: "Viral Impulse Burst", effect: "Fx_Spc_Boffpowers_int_Viralimpulse" },
        { label: "Vulcan Jelly Fish Eject Red Matter", effect: "Cfx_ship_jellyfish_eject_red_matter_costumefx" },
        { label: "Vulnerability Assessment Sweep", effect: "Fx_Capt_Powers_Ship_Tac_Vulnerability_Assessment_Sweep" }
    ],
    ground: [
        { label: "Agony Field Generator", effect: "Fx_Ground_Lockboxfx_Cb29_Agony_Field_Generator" },
        { label: "Anti-time ground", effect: "Cfx_Rep_Temp_Char_Kit_Sci_Antitime_Entanglement_Field_Costumefx" },
        { label: "Ball Lightning", effect: "Cfx_Char_Kit_Univ_Sum_Ball_Lightning_Costumefx" },
        { label: "Chaos Blaze", effect: "Cfx_Char_Chaos_Blaze_Aoe" },
        { label: "Conussive Tachyon Emission", effect: "fx_Char_Delta_Rep_Cte_Aoe" },
        { label: "Disco Ball (Party Bomb)", effect: "Cfx_Char_Device_Partybomb" },
        { label: "Dot-7 Drone Support Field", effect: "Cfx_Er_Bbs_char_Dot7_Drone_support_Field" },
        { label: "Eng Proficiency (Character Glow)", effect: "Cfx_Ground_Kit_Eng_Engineeringproficiency" },
        { label: "Ever Watchful", effect: "Cfx_Ground_Kit_Tac_Overwatch_Bufffx,Fx_Ground_Kit_Tac_Overwatch_Activatefx" },
        { label: "Herald AP Beam Projector ground weapon", effect: "Fx_Char_Icoenergy_Rifle_Energyblast,Fx_Char_Icoenergy_Assault_Beam_Lockbox" },
        { label: "Lava Floor", effect: "Cfx_Char_Kit_Univ_Sum_The_Floor_Is_Lava_Costumefx,Cfx_Char_Kit_Univ_Sum_The_Floor_Is_Lava_Geyser" },
        { label: "Less Obvious Loot Drop Common", effect: "Cfx_Gnd_Loot_Drop_Common_Costumefx" },
        { label: "Less Obvious Loot Drop Uncommon", effect: "Cfx_Gnd_Loot_Drop_Uncommon_Costumefx" },
        { label: "Less Obvious Loot Drop Rare", effect: "Cfx_Gnd_Loot_Drop_Rare_Costumefx" },
        { label: "Less Obvious Loot Drop Very Rare", effect: "Cfx_Gnd_Loot_Drop_Veryrare_Costumefx" },
        { label: "Less Obvious Loot Drop Lock Box", effect: "Cfx_Gnd_Loot_Drop_Chancebox_Costumefx" },
        { label: "Less Obvious Loot Drop Dilithium", effect: "Cfx_Gnd_Loot_Drop_Dilithium_Costumefx" },
        { label: "Motivation (Tac Kit Module)", effect: "Cfx_Ground_Kit_Tac_Motivation_Buff,Fx_Ground_Kit_Tac_Motivation" },
        { label: "Orbital Devastation", effect: "Fx_Char_Voth_Orbitalstrike_Chasebeam" },
        { label: "Pahvan Crystal Prism noisy tether", effect: "Cfx_Er_Tfo_Pahvan_Crystal_Prism_Tether_Beam" },
        { label: "Rally Cry", effect: "Fx_Ground_Kit_Tac_Rallycry" },
        { label: "Red Riker Gun Sound effect", effect: "Cfx_Ep_Winterevent_Redriker_Sniper_Chargefx" },
        { label: "Scientific Aptitude (character glow)", effect: "Cfx_Ground_Kit_Sci_Scientificaptitude" },
        { label: "Solar Gateway", effect: "Fx_Char_Ico_Capt_Portal,Fx_Char_Ico_Capt_Portal_Sunbeam" },
        { label: "Smoke Grenade", effect: "Fx_Char_Grenade_smoke_costume,Fx_Char_Grenade_Smoke_Explode" },
        { label: "Sompek Energy Rebounder", effect: "Fx_Env_Gnd_Qadhos_Arena_Phaserhazard_Cylinder_Turret" },
        { label: "Strike Team III (character red glow)", effect: "Cfx_Ground_Kit_Tac_Striketeam" },
        { label: "Symphony of Lightning Char Glow", effect: "Fx_Er_Featured_Char_Kuumaarke_Wristgun_Tir_bufffx" },
        { label: "Symphony of Lightning Drone AoE", effect: "Cfx_Er_Featured_Char_Kuumaarke_Set_Symphony_Of_Lightning_Drone_Aoe" },
        { label: "Symphony of Lightning STRIKE", effect: "Fx_Er_Featured_Char_Kuumaarke_Set_Symphony_Of_Lightning_Strike" },
        { label: "Trajectory Bending", effect: "Cfx_Char_Xindi_Cb15_Tac_Kit_Trajectory_Bending" },
        { label: "Visual Dampening Field", effect: "Cfx_Char_Trait_Mirror_Vdfield" }
    ]
};

// Vertigo management class
class VertigoManager {
    constructor() {
        this.selectedEffects = {
            space: new Set(),
            ground: new Set()
        };
        this.showPlayerSay = false;
    }

    // Generate the alias command for the given environment
    generateAlias(environment) {
        if (!this.selectedEffects[environment]) {
            throw new InvalidEnvironmentError(environment);
        }
        
        const effects = Array.from(this.selectedEffects[environment]);
        if (effects.length === 0) return '';

        let aliasName = `dynFxSetFXExlusionList_${environment.charAt(0).toUpperCase() + environment.slice(1)}`;
        let command = `alias ${aliasName} <& dynFxSetFXExlusionList ${effects.join(',')}`;
        
        if (this.showPlayerSay) {
            command += ' $$ PlayerSay Vertigo VFX Loaded';
        }
        
        command += ' &>';
        return command;
    }

    // Get selected effects for an environment
    getSelectedEffects(environment) {
        if (!this.selectedEffects[environment]) {
            throw new InvalidEnvironmentError(environment);
        }
        return Array.from(this.selectedEffects[environment]);
    }

    // Toggle an effect
    toggleEffect(environment, effectName) {
        if (!this.selectedEffects[environment]) {
            throw new InvalidEnvironmentError(environment);
        }
        
        if (!effectName) {
            throw new InvalidEffectError(effectName, environment);
        }
        
        if (this.selectedEffects[environment].has(effectName)) {
            this.selectedEffects[environment].delete(effectName);
        } else {
            this.selectedEffects[environment].add(effectName);
        }
    }

    // Clear all selected effects
    clearAllEffects() {
        this.selectedEffects.space.clear();
        this.selectedEffects.ground.clear();
    }

    // Set all effects for an environment
    selectAllEffects(environment) {
        if (!VERTIGO_EFFECTS[environment]) {
            throw new InvalidEnvironmentError(environment);
        }
        
        if (!this.selectedEffects[environment]) {
            throw new InvalidEnvironmentError(environment);
        }
        
        VERTIGO_EFFECTS[environment].forEach(effect => {
            this.selectedEffects[environment].add(effect.effect);
        });
    }

    // Get effect count for an environment
    getEffectCount(environment) {
        if (!this.selectedEffects[environment]) {
            throw new InvalidEnvironmentError(environment);
        }
        return this.selectedEffects[environment].size;
    }

    // Check if effect is selected
    isEffectSelected(environment, effectName) {
        if (!this.selectedEffects[environment]) {
            throw new InvalidEnvironmentError(environment);
        }
        return this.selectedEffects[environment].has(effectName);
    }

    // Save state to current profile
    saveState(profile) {
        if (!profile.vertigoSettings) {
            profile.vertigoSettings = {};
        }
        
        profile.vertigoSettings = {
            selectedEffects: {
                space: Array.from(this.selectedEffects.space),
                ground: Array.from(this.selectedEffects.ground)
            },
            showPlayerSay: this.showPlayerSay
        };
    }

    // Load state from current profile
    loadState(profile) {
        if (profile && profile.vertigoSettings) {
            const settings = profile.vertigoSettings;
            
            // Restore selected effects
            this.selectedEffects.space = new Set(settings.selectedEffects?.space || []);
            this.selectedEffects.ground = new Set(settings.selectedEffects?.ground || []);
            
            // Restore PlayerSay setting
            this.showPlayerSay = settings.showPlayerSay || false;
        } else {
            // Reset to defaults if no saved state
            this.selectedEffects.space.clear();
            this.selectedEffects.ground.clear();
            this.showPlayerSay = false;
        }
    }
}

// Global vertigo manager instance
const vertigoManager = new VertigoManager();

// Make globals accessible
window.VERTIGO_EFFECTS = VERTIGO_EFFECTS;
window.vertigoManager = vertigoManager;
window.VertigoError = VertigoError;
window.InvalidEnvironmentError = InvalidEnvironmentError;
window.InvalidEffectError = InvalidEffectError; 