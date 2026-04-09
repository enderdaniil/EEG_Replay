const API = {
  baseUrl: "http://127.0.0.1:2336",

  async request(command, method = "GET", query = {}) {
    const clean = Object.fromEntries(
      Object.entries(query || {}).filter(([, v]) => v !== "" && v !== null && v !== undefined)
    );
    const qs = new URLSearchParams(clean).toString();
    const url = `${this.baseUrl}/${command}${qs ? `?${qs}` : ""}`;

    const res = await fetch(url, { method });
    if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);

    const data = await res.json();
    if (data.result === false) {
      throw new Error(data.error || data.message || `${command}: result=false (${url})`);
    }
    return data;
  },

  version() { return this.request("version"); },
  currentDeviceInfo() { return this.request("currentDeviceInfo"); },
  currentDevicesInfo() { return this.request("currentDevicesInfo"); },
  listDevices() { return this.request("listDevices"); },
  startSearch() { return this.request("startSearch", "POST"); },
  stopSearch() { return this.request("stopSearch", "POST"); },
  async startDevice(params = {}) {
    const sn = String(params.sn ?? params.SN ?? "").trim();
    const id = String(params.id ?? params.Id ?? params.deviceId ?? "").trim();
    const index = params.index ?? params.deviceIndex;

    // 1) Жесткий приоритет SN -> ID -> index
    const attempts = [];
    if (sn) {
      attempts.push({ SN: sn });
      attempts.push({ sn });
    } else if (id) {
      attempts.push({ id });
      attempts.push({ Id: id });
      attempts.push({ deviceId: id });
    } else if (index !== "" && index !== null && index !== undefined && !Number.isNaN(Number(index))) {
      attempts.push({ index: Number(index) });
    }

    if (attempts.length === 0) {
      throw new Error("Please specify any of 'id' or 'sn' as an argument");
    }

    // 2) Пытаемся разными вариантами параметров, пока один не сработает
    let lastErr = null;
    for (const q of attempts) {
      try {
        return await this.request("startDevice", "POST", q);
      } catch (e) {
        lastErr = e;
      }
    }

    // 3) Финальный fallback: POST без query, но с телом (на случай нестандартной реализации API)
    try {
      const res = await fetch(`${this.baseUrl}/startDevice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attempts[0])
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} (${this.baseUrl}/startDevice)`);
      const data = await res.json();
      if (data.result === false) throw new Error(data.error || data.message || "startDevice result=false");
      return data;
    } catch (e) {
      throw new Error(`startDevice failed. Tried: ${attempts.map(a => JSON.stringify(a)).join(" | ")}. Last error: ${lastErr?.message || e.message}`);
    }
  },
  stopDevice() { return this.request("stopDevice", "POST"); },

  rhythms() { return this.request("rhythms"); },
  rhythmsHistory() { return this.request("rhythmsHistory"); },
  lastSpectrum() { return this.request("lastSpectrum"); },
  getSpectrum() { return this.request("getSpectrum"); },
  grabSpectrum() { return this.request("grabSpectrum"); },

  bci() { return this.request("bci"); },
  meditation() { return this.request("meditation"); },
  concentration() { return this.request("concentration"); },
  biosignalStateStatus() { return this.request("biosignalStateStatus"); },

  startRecord(params = {}) { return this.request("startRecord", "POST", params); },
  stopRecord() { return this.request("stopRecord", "POST"); },
  pauseRecord() { return this.request("pauseRecord", "POST"); },
  continueRecord() { return this.request("continueRecord", "POST"); },
  addEDFAnnotation(params = {}) { return this.request("addEDFAnnotation", "POST", params); },

  enableDataGrabMode() { return this.request("enableDataGrabMode", "POST"); },
  disableDataGrabMode() { return this.request("disableDataGrabMode", "POST"); },

  getFilters() { return this.request("getFilters"); },
  setFilters(params = {}) { return this.request("setFilters", "POST", params); },

  getAllSettings() { return this.request("getAllSettings"); },
  getSettings(key) { return this.request("getSettings", "GET", { key }); },
  setSettings(key, value) { return this.request("setSettings", "POST", { key, value }); },

  async testConnection() {
    const start = performance.now();
    try {
      const v = await this.version();
      return { success: true, version: v.version || "unknown", latency: Math.round(performance.now() - start) };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  bands: {
    delta: [0.5, 4],
    theta: [4, 8],
    alpha: [8, 13],
    beta: [13, 30],
    gamma: [30, 62.5]
  },

  channels6: ["O1", "T3", "Fp1", "Fp2", "T4", "O2"]
};
