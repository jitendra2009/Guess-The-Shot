/**
 * Main application — game flow, local & online multiplayer orchestration.
 */
import { ACTIONS, GAME_PHASE } from "./constants.js";
import {
  createMatch,
  canPerformAction,
  resolveRound,
} from "./game-engine.js";
import { audio } from "./audio.js";
import { MultiplayerClient, MODE } from "./multiplayer.js";
import { UIManager } from "./ui.js";

class GuessTheShotApp {
  constructor() {
    this.root = document.getElementById("app");
    this.ui = new UIManager(this.root);
    this.mp = new MultiplayerClient({
      onMessage: (m) => this.onWsMessage(m),
      onStatus: (s) => this.ui.setOnlineStatus(s),
      onError: (e) => this.ui.toast(e),
    });

    this.match = null;
    this.phase = GAME_PHASE.MENU;
    this.mode = null; // local | online
    this.localPlayerStep = 1; // 1 or 2 during selection
    this.pendingActions = { 1: null, 2: null };
    this.myPlayerId = 1; // online: 1 host, 2 guest
    this.opponentReady = false;
  }

  init() {
    this.ui.bindEvents({
      onActionSelect: (a) => this.onActionSelect(a),
      onConfirm: () => this.onConfirm(),
      onRestart: () => this.restart(),
      onSoundToggle: (on) => audio.setEnabled(on),
    });

    this.bindMenu();
  }

  bindMenu() {
    document.getElementById("btn-local")?.addEventListener("click", () => this.startLocal());
    document.getElementById("btn-online-host")?.addEventListener("click", () => this.startOnlineHost());
    document.getElementById("btn-online-join")?.addEventListener("click", () => this.showJoinPanel());
    document.getElementById("btn-join-submit")?.addEventListener("click", () => this.joinOnline());
    document.getElementById("btn-back-menu")?.addEventListener("click", () => this.goMenu());
    document.getElementById("btn-game-menu")?.addEventListener("click", () => this.goMenu());
  }

  goMenu() {
    this.mp.leave();
    this.phase = GAME_PHASE.MENU;
    this.ui.hideWinner();
    this.ui.showScreen("menu");
  }

  startLocal() {
    const n1 = document.getElementById("p1-name-input")?.value.trim() || "Player 1";
    const n2 = document.getElementById("p2-name-input")?.value.trim() || "Player 2";
    this.mode = MODE.LOCAL;
    this.myPlayerId = 1;
    this.beginMatch(n1, n2);
  }

  async startOnlineHost() {
    const n1 = document.getElementById("host-name-input")?.value.trim() || "Host";
    const n2 = "Guest";
    this.mode = MODE.ONLINE_HOST;
    this.myPlayerId = 1;
    try {
      await this.mp.connect(MultiplayerClient.getDefaultWsUrl());
      this.mp.createRoom();
      this.ui.showScreen("lobby");
      this.ui.setOnlineStatus("Creating room…");
      // Wait for room_created in onWsMessage before starting match UI
      this._pendingHostStart = { n1, n2 };
    } catch {
      this.ui.toast("Could not connect. Run: npm start");
    }
  }

  showJoinPanel() {
    document.getElementById("join-panel")?.classList.add("visible");
  }

  async joinOnline() {
    const code = document.getElementById("room-code-input")?.value.trim().toUpperCase();
    const name = document.getElementById("guest-name-input")?.value.trim() || "Guest";
    if (!code) return this.ui.toast("Enter a room code");
    this.mode = MODE.ONLINE_GUEST;
    this.myPlayerId = 2;
    try {
      await this.mp.connect(MultiplayerClient.getDefaultWsUrl());
      this.mp.joinRoom(code);
      this._guestName = name;
    } catch {
      this.ui.toast("Could not connect. Run: npm start");
    }
  }

  onWsMessage(msg) {
    switch (msg.type) {
      case "room_created":
        this.mp.roomCode = msg.code;
        this.ui.setRoomCode(msg.code);
        this.ui.showScreen("lobby");
        this.ui.setOnlineStatus("Waiting for guest to join…");
        break;
      case "guest_joined":
        this.ui.setOnlineStatus("Opponent connected!");
        if (this._pendingHostStart) {
          const { n1, n2 } = this._pendingHostStart;
          this.beginMatch(n1, n2);
          this._pendingHostStart = null;
        }
        break;
      case "room_joined":
        this.ui.setOnlineStatus("Connected — starting match");
        this.beginMatch("Host", this._guestName || "Guest");
        break;
      case "action_ready":
        this.handleRemoteAction(msg);
        break;
      case "game_sync":
        this.applyRemoteState(msg.state);
        break;
      case "peer_left":
        this.ui.toast(msg.message || "Opponent left");
        setTimeout(() => this.goMenu(), 2000);
        break;
      case "error":
        this.ui.toast(msg.message);
        break;
    }
  }

  beginMatch(n1, n2) {
    this.match = createMatch(n1, n2);
    this.pendingActions = { 1: null, 2: null };
    this.localPlayerStep = 1;
    this.opponentReady = false;
    this.ui.clearHistory();
    this.ui.hideWinner();
    this.ui.showScreen("game");
    this.ui.updateHUD(this.match, 0, this.phase);
    this.startSelectionPhase();
  }

  restart() {
    if (!this.match) return;
    const [p1, p2] = this.match.players.map((p) => p.name);
    this.beginMatch(p1, p2);
    if (this.mp.isOnline) {
      this.mp.syncState({ type: "restart" });
    }
  }

  startSelectionPhase() {
    this.phase = GAME_PHASE.SELECT;
    this.ui.setWaiting(false);
    this.ui.hideSelectionUI(false);
    this.ui.selectAction(null);
    this.selectedAction = null;

    if (this.mode === MODE.LOCAL) {
      this.localPlayerStep = 1;
      this.pendingActions = { 1: null, 2: null };
      this.enterLocalPlayerTurn(1);
    } else {
      const me = this.getMyPlayer();
      this.ui.setPlayerTurn(`${me.name} — choose secretly`);
      this.ui.setLocalPass(false);
      this.updateActionButtonsFor(me);
      this.ui.setStatus("Select your action, then confirm.");
      this.ui.setConfirmEnabled(false);
    }
  }

  enterLocalPlayerTurn(playerId) {
    const player = this.match.players[playerId - 1];
    this.ui.setPlayerTurn(`${player.name}'s turn`);
    this.ui.setLocalPass(playerId === 2, player.name);
    this.ui.setStatus("Choose your action — opponent cannot see this.");
    this.ui.selectAction(null);
    this.updateActionButtonsFor(player);
    this.ui.setConfirmEnabled(false);
    // Hide previous player's selection visually
    this.root.querySelector(".selection-panel")?.classList.remove("hidden");
  }

  getMyPlayer() {
    return this.match.players[this.myPlayerId - 1];
  }

  updateActionButtonsFor(player) {
    const map = {};
    Object.values(ACTIONS).forEach((action) => {
      map[action] = canPerformAction(player, action);
    });
    this.ui.setActionButtonsEnabled(map);
  }

  onActionSelect(action) {
    audio.playSelect();
    this.selectedAction = action;
    this.ui.setConfirmEnabled(!!action);
  }

  onConfirm() {
    const action = this.selectedAction;
    if (!action) return;

    const player = this.getCurrentSelectingPlayer();
    const check = canPerformAction(player, action);
    if (!check.ok) {
      this.ui.toast(check.reason);
      return;
    }

    audio.playConfirm();

    if (this.mode === MODE.LOCAL) {
      this.pendingActions[this.localPlayerStep] = action;
      if (this.localPlayerStep === 1) {
        this.localPlayerStep = 2;
        document.querySelector(".selection-panel")?.classList.add("hidden");
        setTimeout(() => {
          document.querySelector(".selection-panel")?.classList.remove("hidden");
          this.enterLocalPlayerTurn(2);
        }, 300);
      } else {
        this.resolveAndAdvance();
      }
    } else {
      this.pendingActions[this.myPlayerId] = action;
      this.mp.notifyActionReady(action);
      this.phase = GAME_PHASE.WAITING;
      this.ui.hideSelectionUI(true);
      this.ui.setWaiting(true);
      this.ui.setStatus("Locked in — waiting for opponent.");
      if (this.opponentReady && this.pendingActions[this.opponentId()]) {
        this.resolveAndAdvance();
      }
    }
  }

  getCurrentSelectingPlayer() {
    if (this.mode === MODE.LOCAL) {
      return this.match.players[this.localPlayerStep - 1];
    }
    return this.getMyPlayer();
  }

  opponentId() {
    return this.myPlayerId === 1 ? 2 : 1;
  }

  handleRemoteAction(msg) {
    const remoteId = msg.role === "host" ? 1 : 2;
    this.pendingActions[remoteId] = msg.action;
    this.opponentReady = true;

    if (this.mode !== MODE.LOCAL && this.pendingActions[this.myPlayerId]) {
      this.resolveAndAdvance();
    }
  }

  applyRemoteState(state) {
    if (state?.type === "restart") this.restart();
  }

  async resolveAndAdvance() {
    const a1 = this.pendingActions[1];
    const a2 = this.pendingActions[2];
    if (!a1 || !a2) return;

    this.phase = GAME_PHASE.REVEAL;
    this.ui.setWaiting(false);
    this.ui.hideSelectionUI(true);

    const names = this.match.players.map((p) => p.name);
    const result = resolveRound(this.match, a1, a2);

    audio.playReveal();
    await this.ui.playReveal(a1, a2, result.messages, names);

    this.playActionFX(a1, a2, result);

    this.ui.updateHUD(this.match, 0, this.phase);
    this.ui.appendHistory(result.logEntry, names);

    if (this.mp.isOnline && this.myPlayerId === 1) {
      this.mp.syncState({ match: this.serializeMatch() });
    }

    this.pendingActions = { 1: null, 2: null };
    this.opponentReady = false;

    if (result.winner) {
      this.endGame(result.winner);
    } else {
      setTimeout(() => this.startSelectionPhase(), 600);
    }
  }

  playActionFX(a1, a2, result) {
    if (a1 === ACTIONS.SHOOT || a2 === ACTIONS.SHOOT) {
      if (a1 === ACTIONS.SHOOT && a2 === ACTIONS.SHOOT) {
        audio.playCancel();
        this.ui.playFX("clash", "center");
      } else {
        audio.playShoot();
        this.ui.playFX("shot", a1 === ACTIONS.SHOOT ? "left" : "right");
      }
    }
    if (a1 === ACTIONS.DEFENCE || a2 === ACTIONS.DEFENCE) {
      if (result.messages.some((m) => m.includes("blocked"))) {
        audio.playShield();
        this.ui.playFX("shield", "center");
      }
    }
    if (a1 === ACTIONS.RELOAD || a2 === ACTIONS.RELOAD) audio.playReload();
    if (a1 === ACTIONS.REVERT || a2 === ACTIONS.REVERT) {
      if (result.messages.some((m) => m.includes("reflected"))) {
        audio.playRevert();
        this.ui.playFX("revert", "center");
      }
    }
    if (result.deaths.length) {
      audio.playDeath();
      result.deaths.forEach((id) => {
        this.ui.playFX("death", id === 1 ? "left" : "right");
      });
    }
  }

  endGame(winner) {
    this.phase = GAME_PHASE.ENDED;
    audio.playWin();
    this.ui.showWinner(winner.name, `Victory in ${this.match.round} rounds`);
    if (this.mp.isOnline) {
      this.mp.syncState({ type: "ended", winner: winner.name });
    }
  }

  serializeMatch() {
    return {
      round: this.match.round,
      players: this.match.players,
      history: this.match.history,
      winner: this.match.winner,
    };
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const app = new GuessTheShotApp();
  app.init();
});

const ws = new WebSocket("https://guess-the-shot.onrender.com");
