/** Game constants and action identifiers */
export const ACTIONS = {
  SHOOT: "shoot",
  RELOAD: "reload",
  DEFENCE: "defence",
  REVERT: "revert",
};

export const ACTION_LABELS = {
  [ACTIONS.SHOOT]: "Shoot",
  [ACTIONS.RELOAD]: "Reload",
  [ACTIONS.DEFENCE]: "Defence",
  [ACTIONS.REVERT]: "Revert Bullet",
};

export const ACTION_ICONS = {
  [ACTIONS.SHOOT]: "🎯",
  [ACTIONS.RELOAD]: "🔄",
  [ACTIONS.DEFENCE]: "🛡️",
  [ACTIONS.REVERT]: "↩️",
};

export const MAX_BULLETS = 6;
export const START_BULLETS = 1;
export const ACTIONS_PER_ROUND = 4;
export const REVERT_COOLDOWN_ROUNDS = 3;

export const GAME_PHASE = {
  MENU: "menu",
  SETUP: "setup",
  SELECT: "select",
  WAITING: "waiting",
  REVEAL: "reveal",
  ENDED: "ended",
};
