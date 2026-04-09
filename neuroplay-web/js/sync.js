class WindowSync {
  constructor() {
    this.id = `w_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    this.channel = new BroadcastChannel("neuroplay_sync");
    this.listeners = [];
    this.isMaster = false;

    this.channel.onmessage = (e) => {
      const msg = e.data;
      if (!msg || msg.source === this.id) return;
      if (msg.type === "master-announce") this.isMaster = false;
      this.listeners.forEach(fn => fn(msg));
    };

    this.tryBecomeMaster();
    setInterval(() => this.broadcast("master-announce", { id: this.id }), 3000);
  }

  tryBecomeMaster() {
    if (!localStorage.getItem("neuroplay_master")) {
      localStorage.setItem("neuroplay_master", this.id);
      this.isMaster = true;
    } else {
      this.isMaster = localStorage.getItem("neuroplay_master") === this.id;
    }
  }

  broadcast(type, data) {
    this.channel.postMessage({ type, data, source: this.id, ts: Date.now() });
  }

  onMessage(fn) {
    this.listeners.push(fn);
  }
}
