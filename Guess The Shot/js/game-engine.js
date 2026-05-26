/**
 * Core rules engine — bullet economy, revert cooldown, round resolution.
 */
import {
  ACTIONS,
  MAX_BULLETS,
  START_BULLETS,
  REVERT_COOLDOWN_ROUNDS,
} from "./constants.js";

export function createPlayer(id, name) {
  return {
    id,
    name,
    bullets: START_BULLETS,
    alive: true,
    revertCooldown: 0, // rounds until revert is available (0 = ready)
    revertUsedThisMatch: false,
  };
}

export function createMatch(player1Name, player2Name) {
  return {
    round: 0,
    players: [
      createPlayer(1, player1Name || "Player 1"),
      createPlayer(2, player2Name || "Player 2"),
    ],
    history: [],
    winner: null,
    phase: "active",
  };
}

/** Whether an action is legal for the given player state */
export function canPerformAction(player, action) {
  if (!player.alive) return { ok: false, reason: "Player eliminated" };

  switch (action) {
    case ACTIONS.SHOOT:
      if (player.bullets < 1) return { ok: false, reason: "No bullets — reload first" };
      return { ok: true };
    case ACTIONS.RELOAD:
      if (player.bullets >= MAX_BULLETS) return { ok: false, reason: "Magazine full (6 max)" };
      return { ok: true };
    case ACTIONS.DEFENCE:
      return { ok: true };
    case ACTIONS.REVERT:
      if (player.revertCooldown > 0) {
        return { ok: false, reason: `Revert on cooldown (${player.revertCooldown} round(s))` };
      }
      return { ok: true };
    default:
      return { ok: false, reason: "Unknown action" };
  }
}

/**
 * Resolve one round between two committed actions.
 * Returns { deaths: [playerIds], messages: string[], bulletChanges, revertCooldownUpdates }
 */
export function resolveRound(match, actionP1, actionP2) {
  const p1 = match.players[0];
  const p2 = match.players[1];
  const messages = [];
  const deaths = [];

  let a1 = actionP1;
  let a2 = actionP2;

  // Track bullet spend for shoot (refund on mutual shoot)
  let p1Spent = false;
  let p2Spent = false;

  if (a1 === ACTIONS.SHOOT) {
    p1.bullets -= 1;
    p1Spent = true;
  }
  if (a2 === ACTIONS.SHOOT) {
    p2.bullets -= 1;
    p2Spent = true;
  }

  // --- Mutual special cases first ---
  if (a1 === ACTIONS.SHOOT && a2 === ACTIONS.SHOOT) {
    if (p1Spent) p1.bullets += 1;
    if (p2Spent) p2.bullets += 1;
    messages.push("Both fired — shots cancelled in mid-air!");
  } else if (a1 === ACTIONS.RELOAD && a2 === ACTIONS.RELOAD) {
    applyReload(p1, messages, "Player 1");
    applyReload(p2, messages, "Player 2");
  } else if (a1 === ACTIONS.DEFENCE && a2 === ACTIONS.DEFENCE) {
    messages.push("Both raised shields — stalemate.");
  } else if (a1 === ACTIONS.REVERT && a2 === ACTIONS.REVERT) {
    messages.push("Both attempted reflect — energies collided harmlessly.");
  } else {
  // --- Pairwise resolution ---
    const outcome = resolvePair(a1, a2, p1, p2, messages);
    deaths.push(...outcome.deaths);

    // Refund on cancelled shoot in pairwise (handled in resolvePair for mutual shoot only)
    // For shoot+shoot already handled above

    if (!(a1 === ACTIONS.RELOAD && a2 === ACTIONS.RELOAD)) {
      if (a1 === ACTIONS.RELOAD && !deaths.includes(2)) applyReload(p1, messages, p1.name);
      if (a2 === ACTIONS.RELOAD && !deaths.includes(1)) applyReload(p2, messages, p2.name);
    }
  }

  // Revert cooldown: 3 full rounds unavailable after use (no tick on use round)
  const p1UsedRevert = a1 === ACTIONS.REVERT;
  const p2UsedRevert = a2 === ACTIONS.REVERT;
  applyRevertCooldown(p1, p1UsedRevert);
  applyRevertCooldown(p2, p2UsedRevert);
  tickRevertCooldown(p1, p1UsedRevert);
  tickRevertCooldown(p2, p2UsedRevert);

  match.round += 1;

  deaths.forEach((id) => {
    const victim = match.players.find((p) => p.id === id);
    if (victim) victim.alive = false;
  });

  let winner = null;
  if (deaths.length === 1) {
    winner = match.players.find((p) => p.id !== deaths[0]);
  } else if (deaths.length === 2) {
    winner = null; // rare double KO — draw
  }

  const logEntry = {
    round: match.round,
    actions: [a1, a2],
    messages: [...messages],
    bulletsAfter: match.players.map((p) => p.bullets),
    deaths: [...deaths],
    winner: winner ? winner.id : null,
  };

  match.history.push(logEntry);
  if (winner) {
    match.winner = winner;
    match.phase = "ended";
  }

  return { deaths, messages, logEntry, winner };
}

function applyReload(player, messages, label) {
  if (player.bullets < MAX_BULLETS) {
    player.bullets += 1;
    messages.push(`${label} reloaded (+1 bullet).`);
  } else {
    messages.push(`${label} tried to reload but magazine is full.`);
  }
}

function applyRevertCooldown(player, usedRevert) {
  if (usedRevert) {
    player.revertUsedThisMatch = true;
    // Unavailable for next REVERT_COOLDOWN_ROUNDS rounds (tick happens after round)
    player.revertCooldown = REVERT_COOLDOWN_ROUNDS;
  }
}

function tickRevertCooldown(player, usedRevertThisRound) {
  if (player.revertCooldown > 0 && !usedRevertThisRound) {
    player.revertCooldown -= 1;
  }
}

/**
 * Resolve non-symmetric action pairs.
 * Convention: p1 is "actor A", p2 is "actor B" in messages.
 */
function resolvePair(a1, a2, p1, p2, messages) {
  const deaths = [];

  const pairKey = [a1, a2].sort().join("|");

  // Shoot vs Reload — shooter wins, reloader dies
  if (
    (a1 === ACTIONS.SHOOT && a2 === ACTIONS.RELOAD) ||
    (a1 === ACTIONS.RELOAD && a2 === ACTIONS.SHOOT)
  ) {
    const shooter = a1 === ACTIONS.SHOOT ? p1 : p2;
    const victim = a1 === ACTIONS.SHOOT ? p2 : p1;
    messages.push(`${shooter.name} shot while ${victim.name} was reloading — elimination!`);
    deaths.push(victim.id);
    return { deaths };
  }

  // Shoot vs Defence
  if (
    (a1 === ACTIONS.SHOOT && a2 === ACTIONS.DEFENCE) ||
    (a1 === ACTIONS.DEFENCE && a2 === ACTIONS.SHOOT)
  ) {
    const defender = a1 === ACTIONS.DEFENCE ? p1 : p2;
    messages.push(`${defender.name}'s defence blocked the shot.`);
    return { deaths };
  }

  // Shoot vs Revert — bullet returns, shooter dies
  if (
    (a1 === ACTIONS.SHOOT && a2 === ACTIONS.REVERT) ||
    (a1 === ACTIONS.REVERT && a2 === ACTIONS.SHOOT)
  ) {
    const shooter = a1 === ACTIONS.SHOOT ? p1 : p2;
    const reflector = a1 === ACTIONS.REVERT ? p1 : p2;
    messages.push(`${reflector.name} reflected the bullet — ${shooter.name} is hit!`);
    deaths.push(shooter.id);
    return { deaths };
  }

  // Reload vs Defence / Revert — no combat
  if (
    (a1 === ACTIONS.RELOAD && (a2 === ACTIONS.DEFENCE || a2 === ACTIONS.REVERT)) ||
    (a2 === ACTIONS.RELOAD && (a1 === ACTIONS.DEFENCE || a1 === ACTIONS.REVERT))
  ) {
    messages.push("No shots fired — cautious maneuvers.");
    return { deaths };
  }

  // Defence vs Revert
  if (
    (a1 === ACTIONS.DEFENCE && a2 === ACTIONS.REVERT) ||
    (a1 === ACTIONS.REVERT && a2 === ACTIONS.DEFENCE)
  ) {
    messages.push("Shield and reflect idle — no exchange.");
    return { deaths };
  }

  // Shoot without opposing shoot handled above; fallback
  if (a1 === ACTIONS.SHOOT || a2 === ACTIONS.SHOOT) {
    messages.push("Shot fired but had no lethal interaction.");
  }

  return { deaths };
}

export function getRevertStatus(player) {
  if (player.revertCooldown <= 0) return { available: true, label: "Ready" };
  return {
    available: false,
    label: `${player.revertCooldown} round(s)`,
  };
}
