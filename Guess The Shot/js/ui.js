/**
 * DOM rendering, HUD updates, animations, round history.
 */
import { ACTIONS, ACTION_LABELS, ACTION_ICONS, GAME_PHASE } from "./constants.js";
import { getRevertStatus } from "./game-engine.js";

export class UIManager {
  constructor(root) {
    this.root = root;
    this.els = this.cacheElements();
    this.selectedAction = null;
    this.onActionSelect = null;
    this.onConfirm = null;
    this.onRestart = null;
  }

  cacheElements() {
    const q = (sel) => this.root.querySelector(sel);
    return {
      screens: this.root.querySelectorAll("[data-screen]"),
      roundNum: q("#round-num"),
      p1Name: q("#p1-name"),
      p2Name: q("#p2-name"),
      p1Bullets: q("#p1-bullets"),
      p2Bullets: q("#p2-bullets"),
      p1Revert: q("#p1-revert"),
      p2Revert: q("#p2-revert"),
      statusText: q("#status-text"),
      selectedAction: q("#selected-action"),
      actionButtons: this.root.querySelectorAll(".action-btn"),
      confirmBtn: q("#confirm-btn"),
      revealOverlay: q("#reveal-overlay"),
      revealP1: q("#reveal-p1"),
      revealP2: q("#reveal-p2"),
      revealMessages: q("#reveal-messages"),
      fxLayer: q("#fx-layer"),
      historyLog: q("#history-log"),
      winnerScreen: q("#winner-screen"),
      winnerTitle: q("#winner-title"),
      winnerSubtitle: q("#winner-subtitle"),
      waitingBanner: q("#waiting-banner"),
      localPassBanner: q("#local-pass-banner"),
      playerTurnLabel: q("#player-turn-label"),
      soundToggle: q("#sound-toggle"),
      roomCodeDisplay: q("#room-code-display"),
      onlineStatus: q("#online-status"),
      toast: q("#toast"),
    };
  }

  showScreen(name) {
    this.els.screens.forEach((s) => {
      s.classList.toggle("active", s.dataset.screen === name);
    });
  }

  bindEvents({ onActionSelect, onConfirm, onRestart, onSoundToggle }) {
    this.onActionSelect = onActionSelect;
    this.onConfirm = onConfirm;
    this.onRestart = onRestart;

    this.els.actionButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.dataset.action;
        if (btn.disabled) return;
        this.selectAction(action);
        onActionSelect?.(action);
      });
    });

    this.els.confirmBtn?.addEventListener("click", () => onConfirm?.());
    this.root.querySelector("#restart-btn")?.addEventListener("click", () => onRestart?.());
    this.els.soundToggle?.addEventListener("change", (e) => onSoundToggle?.(e.target.checked));
  }

  selectAction(action, { silent } = {}) {
    this.selectedAction = action;
    this.els.actionButtons.forEach((btn) => {
      btn.classList.toggle("selected", btn.dataset.action === action);
    });
    const label = ACTION_LABELS[action] || "—";
    if (this.els.selectedAction) {
      this.els.selectedAction.textContent = `${ACTION_ICONS[action] || ""} ${label}`;
    }
  }

  setActionButtonsEnabled(enabledMap) {
    this.els.actionButtons.forEach((btn) => {
      const action = btn.dataset.action;
      const state = enabledMap[action];
      btn.disabled = !state?.ok;
      btn.title = state?.reason || "";
      btn.classList.toggle("disabled", !state?.ok);
    });
  }

  updateHUD(match, activePlayerIndex, phase) {
    const [p1, p2] = match.players;
    if (this.els.roundNum) this.els.roundNum.textContent = String(match.round + 1);
    if (this.els.p1Name) this.els.p1Name.textContent = p1.name;
    if (this.els.p2Name) this.els.p2Name.textContent = p2.name;
    this.renderBullets(this.els.p1Bullets, p1.bullets);
    this.renderBullets(this.els.p2Bullets, p2.bullets);
    this.renderRevert(this.els.p1Revert, p1);
    this.renderRevert(this.els.p2Revert, p2);

    const aliveClass = (el, alive) => el?.classList.toggle("eliminated", !alive);
    aliveClass(this.root.querySelector("#p1-panel"), p1.alive);
    aliveClass(this.root.querySelector("#p2-panel"), p2.alive);
  }

  renderBullets(container, count) {
    if (!container) return;
    container.innerHTML = "";
    for (let i = 0; i < 6; i++) {
      const shell = document.createElement("span");
      shell.className = "bullet-shell" + (i < count ? " filled" : "");
      container.appendChild(shell);
    }
  }

  renderRevert(el, player) {
    if (!el) return;
    const st = getRevertStatus(player);
    el.textContent = st.available ? "● READY" : `◌ ${st.label}`;
    el.classList.toggle("ready", st.available);
    el.classList.toggle("cooldown", !st.available);
  }

  setStatus(text) {
    if (this.els.statusText) this.els.statusText.textContent = text;
  }

  setWaiting(show, message = "Waiting for opponent…") {
    this.els.waitingBanner?.classList.toggle("visible", show);
    if (show && this.els.waitingBanner) {
      this.els.waitingBanner.querySelector(".waiting-text").textContent = message;
    }
  }

  setLocalPass(show, playerName) {
    this.els.localPassBanner?.classList.toggle("visible", show);
    if (show && this.els.localPassBanner) {
      this.els.localPassBanner.querySelector(".pass-text").textContent =
        `Pass device to ${playerName} — selections are hidden`;
    }
  }

  setPlayerTurn(label) {
    if (this.els.playerTurnLabel) this.els.playerTurnLabel.textContent = label;
  }

  setConfirmEnabled(on) {
    if (this.els.confirmBtn) {
      this.els.confirmBtn.disabled = !on;
    }
  }

  hideSelectionUI(hide) {
    this.root.querySelector(".action-grid")?.classList.toggle("hidden", hide);
    this.els.confirmBtn?.classList.toggle("hidden", hide);
  }

  async playReveal(p1Action, p2Action, messages, names = []) {
    const overlay = this.els.revealOverlay;
    if (!overlay) return;

    const p1Label = this.root.querySelector("#reveal-p1-label");
    const p2Label = this.root.querySelector("#reveal-p2-label");
    if (p1Label) p1Label.textContent = names[0] || "P1";
    if (p2Label) p2Label.textContent = names[1] || "P2";

    overlay.classList.add("active");
    this.els.revealP1.textContent = "???";
    this.els.revealP2.textContent = "???";
    this.els.revealMessages.innerHTML = "";

    await this.delay(500);
    this.els.revealP1.textContent = this.formatAction(p1Action);
    await this.delay(450);
    this.els.revealP2.textContent = this.formatAction(p2Action);
    await this.delay(400);

    const msgEl = this.els.revealMessages;
    if (msgEl && messages.length) {
      for (let i = 0; i < messages.length; i++) {
        await this.delay(350);
        const p = document.createElement("p");
        p.className = "reveal-msg";
        p.textContent = messages[i];
        msgEl.appendChild(p);
      }
    }

    await this.delay(900);
    overlay.classList.remove("active");
  }

  formatAction(action) {
    return `${ACTION_ICONS[action] || ""} ${ACTION_LABELS[action] || action}`;
  }

  playFX(type, side) {
    const fx = document.createElement("div");
    fx.className = `fx fx-${type} fx-${side || "center"}`;
    this.els.fxLayer?.appendChild(fx);
    setTimeout(() => fx.remove(), 1200);
  }

  appendHistory(entry, names) {
    const li = document.createElement("li");
    const [n1, n2] = names;
    li.innerHTML = `<span class="log-round">R${entry.round}</span>
      <span class="log-actions">${ACTION_ICONS[entry.actions[0]]} vs ${ACTION_ICONS[entry.actions[1]]}</span>
      <span class="log-detail">${entry.messages.join(" ")}</span>`;
    this.els.historyLog?.prepend(li);
  }

  clearHistory() {
    if (this.els.historyLog) this.els.historyLog.innerHTML = "";
  }

  showWinner(winnerName, subtitle) {
    this.els.winnerScreen?.classList.add("active");
    if (this.els.winnerTitle) this.els.winnerTitle.textContent = `${winnerName} Wins!`;
    if (this.els.winnerSubtitle) this.els.winnerSubtitle.textContent = subtitle || "";
  }

  hideWinner() {
    this.els.winnerScreen?.classList.remove("active");
  }

  setRoomCode(code) {
    if (this.els.roomCodeDisplay) this.els.roomCodeDisplay.textContent = code || "—";
  }

  setOnlineStatus(text) {
    if (this.els.onlineStatus) this.els.onlineStatus.textContent = text;
  }

  toast(msg, duration = 2500) {
    const t = this.els.toast;
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), duration);
  }

  delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
}
