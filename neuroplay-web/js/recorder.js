class Recorder {
  constructor() {
    this.isRecording = false;
    this.isPaused = false;
    this.startedAt = null;
  }

  async start(path = "") {
    await API.enableDataGrabMode();
    await API.startRecord(path ? { path } : {});
    this.isRecording = true;
    this.isPaused = false;
    this.startedAt = Date.now();
  }

  async stop() {
    const res = await API.stopRecord();
    this.isRecording = false;
    this.isPaused = false;
    await API.disableDataGrabMode();

    if (res.files && Array.isArray(res.files)) {
      const edf = res.files.find(f => (f.type || "").toLowerCase() === "edf");
      if (edf?.data) this.downloadBase64(edf.data, `${res.baseName || "recording"}.edf`, "application/edf");
    }

    const meta = {
      finishedAt: new Date().toISOString(),
      startedAt: this.startedAt ? new Date(this.startedAt).toISOString() : null,
      durationSec: this.startedAt ? (Date.now() - this.startedAt) / 1000 : 0,
      baseName: res.baseName || null
    };
    this.downloadText(JSON.stringify(meta, null, 2), `record_meta_${Date.now()}.json`, "application/json");
    return res;
  }

  async pause() {
    await API.pauseRecord();
    this.isPaused = true;
  }

  async resume() {
    await API.continueRecord();
    this.isPaused = false;
  }

  async addAnnotation(text, pos, duration = 0) {
    return API.addEDFAnnotation({ text, pos, duration });
  }

  downloadBase64(base64, filename, mime) {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  downloadText(text, filename, mime = "text/plain") {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }
}
