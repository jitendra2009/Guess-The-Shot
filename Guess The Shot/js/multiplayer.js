/**
 * Multiplayer transport — local pass-and-play + WebSocket online sync.
 */
export const MODE = {
  LOCAL: "local",
  ONLINE_HOST: "online_host",
  ONLINE_GUEST: "online_guest",
};

export class MultiplayerClient {
  constructor({ onMessage, onStatus, onError }) {
    this.ws = null;
    this.mode = null;
    this.roomCode = null;
    this.role = null;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.onError = onError;
  }

  get isOnline() {
    return this.mode === MODE.ONLINE_HOST || this.mode === MODE.ONLINE_GUEST;
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);
      } catch (e) {
        reject(e);
        return;
      }

      this.ws.onopen = () => {
        this.onStatus?.("connected");
        resolve();
      };

      this.ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          this.onMessage?.(data);
        } catch {
          this.onError?.("Bad server message");
        }
      };

      this.ws.onerror = () => {
        this.onError?.("Connection failed");
        reject(new Error("WebSocket error"));
      };

      this.ws.onclose = () => {
        this.onStatus?.("disconnected");
      };
    });
  }

  send(type, payload = {}) {
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify({ type, ...payload }));
    }
  }

  createRoom() {
    this.mode = MODE.ONLINE_HOST;
    this.role = "host";
    this.send("create_room");
  }

  joinRoom(code) {
    this.mode = MODE.ONLINE_GUEST;
    this.role = "guest";
    this.send("join_room", { code });
  }

  syncState(state) {
    this.send("game_sync", { state });
  }

  notifyActionReady(action) {
    this.send("action_ready", { action });
  }

  leave() {
    this.send("leave_room");
    this.ws?.close();
    this.ws = null;
    this.mode = null;
    this.roomCode = null;
  }

  static getDefaultWsUrl() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const host = location.hostname || "localhost";
    const port = location.port || (location.protocol === "https:" ? "443" : "8080");
    // When served from file:// or static host on 5500, point to game server
    if (location.port && location.port !== "8080") {
      return `${proto}//${host}:8080`;
    }
    return `${proto}//${host}:${port}`;
  }
}
