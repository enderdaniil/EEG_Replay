const App = {
  headMap: null,
  connection: null,
  recorder: null,
  tabs: null,
  sync: null,

  pollTimer: null,
  polling: false,
  rhythmHistory: {
    delta: [], theta: [], alpha: [], beta: [], gamma: [],
    kurtosis: [], cv: [], iqr: [], q25: [], q50: [], q75: []
  },
  markerHistory: {
    tar: [],
    br: [],
    faFrontal: [],
    faT: [],
    faCortical: []
  },

  averagingMode: "individual",
  subtab: "rhythms",
  statsMode: "individual",
  lastSpectrum: null,
  corrMatrix: null,
  devicesCache: [],

  async init() {
    this.headMap = new HeadMap();
    this.connection = new ConnectionManager();
    this.recorder = new Recorder();
    this.sync = new WindowSync();
    this.tabs = new TabManager((main, sub) => this.onTabChange(main, sub));

    // Advanced analytics overlays
    this.overlays = {
        entropy: new EntropyOverlay(this.headMap),
        connectivity: new ConnectivityOverlay(this.headMap),
        asynchrony: new AsynchronyOverlay(this.headMap)
    };
    try {
        MetricsCharts.init();
    } catch (e) {
        console.warn('MetricsCharts init failed (no canvases yet)', e);
    }

    this.bindUI();
    this.bindSync();
    await this.bootstrap();
  },

  async bootstrap() {
    try {
      const v = await API.version();
      document.getElementById("versionBadge").textContent = `v${v.version || "--"}`;
      document.getElementById("apiStatus").textContent = "OK";
    } catch {
      document.getElementById("apiStatus").textContent = "ERR";
    }
  },

  bindUI() {
    document.getElementById("btnTestConnection").addEventListener("click", () => this.testConnection());
    document.getElementById("btnStartSearch").addEventListener("click", () => this.searchDevices());
    document.getElementById("btnListDevices").addEventListener("click", () => this.listDevices());

    document.getElementById("btnConnect").addEventListener("click", () => this.toggleConnection());
    document.getElementById("btnStartDevice").addEventListener("click", () => this.startDevice());
    document.getElementById("btnStopDevice").addEventListener("click", () => this.stopDevice());

    document.getElementById("btnRecord").addEventListener("click", () => this.toggleRecord());
    document.getElementById("btnPauseRecord").addEventListener("click", () => this.togglePauseRecord());

    document.getElementById("bandSelector").addEventListener("change", () => {
      this.recomputeMatrixFromLastSpectrum();
      this.updateCorrelationTable();
    });
    document.getElementById("exportMatrix").addEventListener("click", () => this.exportMatrixCSV());
    
    // Stats mode buttons - FIXED: Always recompute/render fresh
    document.querySelectorAll(".stats-mode-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".stats-mode-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.statsMode = btn.dataset.statsmode;
// Always use latest rhythms, recompute for this.statsMode only
        if (this.lastRhythms && this.lastRhythms.length >= 6) {
          console.log('[STATS BTN]', this.statsMode, 'rhythms len', this.lastRhythms.length);
          const allScopesStats = Statistics.calculate(this.lastRhythms, true);
          this.renderStats(allScopesStats, this.statsMode);
        } else {
          console.warn('[STATS BTN] No valid rhythms', this.lastRhythms?.length);
        }
      });
    });
  },

  bindSync() {
    this.sync.onMessage((msg) => {
      if (msg.type === "tab") {
        this.tabs.set(msg.data.main, msg.data.sub, true);
        this.averagingMode = msg.data.main;
        this.subtab = msg.data.sub;
        this.headMap.setSubtab(this.subtab);
      }
      if (msg.type === "connection-ui") this.updateConnectionButtons(msg.data.connected);
      if (msg.type === "record-ui") this.updateRecordButtons(msg.data);
    });
  },

  onTabChange(main, sub) {
    this.averagingMode = main;
    this.subtab = sub;
    this.headMap.setSubtab(sub);
    this.sync.broadcast("tab", { main, sub });
    this.recomputeMatrixFromLastSpectrum();
    this.updateCorrelationTable();
  },

  async testConnection() {
    const r = await API.testConnection();
    if (r.success) {
      this.toast(`API OK ${r.version}, ${r.latency}ms`, "success");
      document.getElementById("apiStatus").textContent = `${r.version} (${r.latency}ms)`;
    } else {
      this.toast(`API error: ${r.error}`, "error");
      document.getElementById("apiStatus").textContent = "ERR";
    }
  },

  async searchDevices() {
    try {
      this.connection.setState("searching");
      await API.startSearch();
      this.toast("Поиск устройств запущен", "success");
      setTimeout(async () => {
        await API.stopSearch();
        this.connection.setState("disconnected");
      }, 3000);
    } catch (e) {
      this.connection.setState("error");
      this.toast(e.message, "error");
    }
  },

  async listDevices() {
    try {
      const res = await API.listDevices();
      const devices = res.devices || [];
      this.devicesCache = devices;

      const sel = document.getElementById("deviceSelector");
      sel.innerHTML = "";
      devices.forEach((d, i) => {
        const opt = document.createElement("option");
        opt.value = i;
        opt.textContent = d?.name || d?.device || d?.serialNumber || `Device ${i}`;
        sel.appendChild(opt);
      });

      if (devices.length > 0) this.applySelectedDeviceToInputs(0);

      sel.onchange = () => {
        const idx = Number(sel.value || 0);
        this.applySelectedDeviceToInputs(idx);
      };

      this.toast(`Найдено устройств: ${devices.length}`, "success");
    } catch (e) {
      this.toast(e.message, "error");
    }
  },

  applySelectedDeviceToInputs(index) {
    const d = (this.devicesCache || [])[index] || {};
    const sn = d.serialNumber || d.sn || d.SN || d.deviceSN || d.deviceSn || "";
    const id = d.id || d.deviceId || d.Id || "";

    const snInput = document.getElementById("deviceSnInput");
    const idInput = document.getElementById("deviceIdInput");
    if (snInput) snInput.value = sn;
    if (idInput) idInput.value = id;
  },

  async toggleConnection() {
    if (this.connection.isConnected) this.disconnectUIOnly();
    else await this.connectUIOnly();
  },

  async connectUIOnly() {
    this.connection.setState("connecting");
    const r = await API.testConnection();
    if (!r.success) {
      this.connection.setState("error");
      this.toast(r.error, "error");
      return;
    }

    // Auto list devices on connect for better UX
    try {
      await this.listDevices();
    } catch (e) {
      console.warn("Auto listDevices failed:", e);
    }

    this.connection.setState("connected");
    this.updateConnectionButtons(true);
    this.sync.broadcast("connection-ui", { connected: true });
    this.startPolling();
  },

  disconnectUIOnly() {
    this.connection.setState("disconnected");
    this.updateConnectionButtons(false);
    this.sync.broadcast("connection-ui", { connected: false });
    this.stopPolling();
  },

  updateConnectionButtons(connected) {
    const startBtn = document.getElementById("btnStartDevice");
    const stopBtn = document.getElementById("btnStopDevice");
    const recordBtn = document.getElementById("btnRecord");
    const pauseBtn = document.getElementById("btnPauseRecord");

    const readyForDevice = connected && (this.devicesCache.length > 0 || 
      (document.getElementById("deviceSnInput")?.value.trim()) || 
      (document.getElementById("deviceIdInput")?.value.trim()));

    startBtn.disabled = !connected || !readyForDevice;
    stopBtn.disabled = !connected;
    recordBtn.disabled = !connected;
    pauseBtn.disabled = !connected;
  },

    async startDevice() {
      try {
        const sn = (document.getElementById("deviceSnInput")?.value || "").trim();
        const id = (document.getElementById("deviceIdInput")?.value || "").trim();
        const idxRaw = document.getElementById("deviceSelector")?.value;
        const hasIndex = idxRaw !== "" && idxRaw !== undefined && idxRaw !== null;
        const idx = hasIndex ? Number(idxRaw) : undefined;

        // Validate: prefer filled inputs, or valid index from populated list
        if (!sn && !id && (!hasIndex || this.devicesCache.length === 0)) {
          this.toast("Сначала нажмите '📋 Устройства' для списка или введите SN/ID вручную", "error");
          return;
        }
        if (hasIndex && idx !== undefined && idx >= 0 && idx < this.devicesCache.length) {
          // Auto-fill from cache if valid index
          this.applySelectedDeviceToInputs(idx);
        } else if (hasIndex) {
          this.toast("Неверный index. Запустите '📋 Устройства' и выберите из списка", "error");
          return;
        }

        const payload = sn ? { sn } : id ? { id } : { index: idx };
        await API.startDevice(payload);
        this.toast(`Устройство запущено: ${sn || id || 'index ' + idx}`, "success");
      } catch (e) {
        this.toast(`startDevice failed: ${e.message}. Проверьте SN/ID/index после '📋 Устройства'`, "error");
      }
    },

  async stopDevice() {
    try {
      await API.stopDevice();
      this.toast("Устройство остановлено", "warning");
    } catch (e) {
      this.toast(e.message, "error");
    }
  },

  async toggleRecord() {
    try {
      if (!this.recorder.isRecording) {
        await this.recorder.start();
        this.updateRecordButtons({ recording: true, paused: false });
        this.sync.broadcast("record-ui", { recording: true, paused: false });
        this.toast("Запись начата", "success");
      } else {
        await this.recorder.stop();
        this.updateRecordButtons({ recording: false, paused: false });
        this.sync.broadcast("record-ui", { recording: false, paused: false });
        this.toast("Запись остановлена", "warning");
      }
    } catch (e) {
      this.toast(e.message, "error");
    }
  },

  async togglePauseRecord() {
    if (!this.recorder.isRecording) return;
    try {
      if (!this.recorder.isPaused) {
        await this.recorder.pause();
        this.updateRecordButtons({ recording: true, paused: true });
      } else {
        await this.recorder.resume();
        this.updateRecordButtons({ recording: true, paused: false });
      }
    } catch (e) {
      this.toast(e.message, "error");
    }
  },

  updateRecordButtons(state) {
    const b = document.getElementById("btnRecord");
    const p = document.getElementById("btnPauseRecord");
    if (state.recording) {
      b.textContent = "⏹️ Стоп запись";
      p.textContent = state.paused ? "▶️ Продолжить" : "⏸️ Пауза";
    } else {
      b.textContent = "🔴 Запись";
      p.textContent = "⏸️ Пауза";
    }
  },

  normalizeSpectrumPayload(specRes) {
    if (!specRes) return null;
    if (Array.isArray(specRes.spectrum)) return specRes;
    if (specRes.lastspectrum && Array.isArray(specRes.lastspectrum.spectrum)) return specRes.lastspectrum;
    if (specRes.data && Array.isArray(specRes.data.spectrum)) return specRes.data;
    return null;
  },

  buildDerivedPerNode(rhythmsArray, spectrumRes) {
    const rhythmMap = {
      O1: rhythmsArray?.[0] || {},
      T3: rhythmsArray?.[1] || {},
      Fp1: rhythmsArray?.[2] || {},
      Fp2: rhythmsArray?.[3] || {},
      T4: rhythmsArray?.[4] || {},
      O2: rhythmsArray?.[5] || {}
    };

    const spec = this.normalizeSpectrumPayload(spectrumRes);
    const spectrumByName = {};
    if (spec?.spectrum) {
      const s = spec.spectrum;
      spectrumByName.O1 = s[0] || [];
      spectrumByName.T3 = s[1] || [];
      spectrumByName.Fp1 = s[2] || [];
      spectrumByName.Fp2 = s[3] || [];
      spectrumByName.T4 = s[4] || [];
      spectrumByName.O2 = s[5] || [];
    }

    const nodeOrder = this.averagingMode === "individual"
      ? ["O1", "T3", "Fp1", "Fp2", "T4", "O2"]
      : this.averagingMode === "pair"
        ? ["Fp1-Fp2", "T3-T4", "O1-O2"]
        : this.averagingMode === "hemisphere"
          ? ["Left", "Right"]
          : ["Global"];

    const groupChannels = {
      "Fp1-Fp2": ["Fp1", "Fp2"],
      "T3-T4": ["T3", "T4"],
      "O1-O2": ["O1", "O2"],
      Left: ["Fp1", "T3", "O1"],
      Right: ["Fp2", "T4", "O2"],
      Global: ["Fp1", "Fp2", "T3", "T4", "O1", "O2"]
    };

    const out = {};
    const step = Number(spec?.frequencyStepHz || 0.244140625);

    for (const node of nodeOrder) {
      const channels = this.averagingMode === "individual" ? [node] : groupChannels[node];
      const rhythms = channels.map(ch => rhythmMap[ch] || {});
      const avgRhythm = Averaging.avg(rhythms);

      const spectra = channels.map(ch => spectrumByName[ch] || []);
      const avgSpectrum = Correlation.avgVec(spectra);

      let peakHz = 0, peakVal = -Infinity;
      for (let i = 0; i < avgSpectrum.length; i++) {
        const v = Number(avgSpectrum[i] || 0);
        if (v > peakVal) { peakVal = v; peakHz = i * step; }
      }

      const total = avgSpectrum.reduce((a, b) => a + Number(b || 0), 0);
      let entropy = 0;
      if (total > 0) {
        for (const v of avgSpectrum) {
          const p = Number(v || 0) / total;
          if (p > 0) entropy -= p * Math.log2(p);
        }
      }

      const stats = Statistics.describe([
        Number(avgRhythm.delta || 0),
        Number(avgRhythm.theta || 0),
        Number(avgRhythm.alpha || 0),
        Number(avgRhythm.beta || 0),
        Number(avgRhythm.gamma || 0)
      ]);

      out[node] = {
        ...avgRhythm,
        spectrumArr: avgSpectrum,
        peakHz,
        entropy,
        stats
      };
    }

    return out;
  },

  recomputeMatrixFromLastSpectrum() {
    if (!this.lastSpectrum) return;
    const band = document.getElementById("bandSelector").value;
    const spec = this.normalizeSpectrumPayload(this.lastSpectrum);
    if (!spec) return;
    const corrResult = Correlation.matrixFromSpectrum(spec, band, this.averagingMode);
    this.corrMatrix = corrResult.matrix;
    this.validLabels = corrResult.usedChannels;
    this.headMap.setCorrelationMatrix(this.corrMatrix);
  },

  startPolling() {
    if (this.polling) return;
    this.polling = true;

    const tick = async () => {
      if (!this.polling) return;
      try {
        const [rh, bci, cdi, spec] = await Promise.all([
          API.rhythms().catch(() => null),
          API.bci().catch(() => null),
          API.currentDeviceInfo().catch(() => null),
          API.lastSpectrum().catch(() => null)
        ]);

        console.log('Poll API response:', rh); // DEBUG

        // Safe guard: skip if no rhythms data (device not started)
        if (!rh || rh.result === false || !rh.rhythms || !Array.isArray(rh.rhythms) || rh.rhythms.length === 0) {
          // Still update BCI/device info if available
          if (bci) this.onBCI(bci);
          if (cdi) this.onDeviceInfo(cdi);
          document.getElementById("lastUpdate").textContent = `Обновление: ${new Date().toLocaleTimeString()} (нет данных)`;
          this.pollTimer = setTimeout(tick, 250);
          return;
        }

        try {
          const rhythms = rh.rhythms;
          console.log('Using rhythms:', rhythms.length, 'items'); // DEBUG
          this.lastRhythms = rhythms; // Cache for stats mode switch
          this.lastSpectrum = spec;

          // Advanced analytics - SAFE calls
          if (this.overlays.entropy && spec) this.overlays.entropy.calculateFromSpectrum(spec);
          if (this.overlays.connectivity && this.dataHistory) {
            const corrMatrixNew = this.overlays.connectivity.calculateCorrelation(this.dataHistory.rhythms || [], document.getElementById('bandSelector').value);
            this.corrMatrix = corrMatrixNew;
            this.overlays.connectivity.render(corrMatrixNew);
          }
          if (this.overlays.asynchrony && rhythms) {
            const asynchronyData = this.overlays.asynchrony.calculateAsymmetryIndex(rhythms, 'alpha');
            this.lastAsymmetryData = asynchronyData;
            this.overlays.asynchrony.update(asynchronyData);
          }

          // Push rhythms history for connectivity
          if (!this.dataHistory) this.dataHistory = { rhythms: [] };
          this.dataHistory.rhythms.push(rhythms);
          if (this.dataHistory.rhythms.length > 100) this.dataHistory.rhythms.shift();

          const mapped = this.buildDerivedPerNode(rhythms, spec);
          this.headMap.update(mapped, spec, this.averagingMode);

          const allScopesStats = Statistics.calculate(rhythms, true);
          console.log('[POLL STATS]', this.statsMode, Object.keys(allScopesStats.paired || {}));
          const activeScopeStats = allScopesStats[this.statsMode] || {};
// Render ONLY active statsMode (fix over-rendering)
          this.renderStats(allScopesStats, this.statsMode);
          const markers = Statistics.calculateDynamicMarkers(rhythms);
          this.renderMarkers(markers);
          if (MetricsCharts.update) MetricsCharts.update(activeScopeStats, null, null, null);

// Live correlation matrix update - every poll for ALL subtabs/modes ✅ FIXED
          if (spec) {
            this.recomputeMatrixFromLastSpectrum();
          }
          this.updateCorrelationTable();  // Always update table
        } catch (innerErr) {
          console.error('Inner poll visualization error:', innerErr);
        }

        if (bci) this.onBCI(bci);
        if (cdi) this.onDeviceInfo(cdi);

        document.getElementById("lastUpdate").textContent = `Обновление: ${new Date().toLocaleTimeString()}`;
      } catch (e) {
        this.toast(`poll error: ${e.message}`, "error");
      }
      this.pollTimer = setTimeout(tick, 50);
    };
    tick();
  },

  stopPolling() {
    this.polling = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
  },

  renderStats(allScopesStats, activeScope = 'global') {
    const g = document.getElementById("statsGrid");
    const scopeStats = allScopesStats[activeScope] || {};
    
    console.log('[RENDER] Active scope:', activeScope, 'stats keys:', Object.keys(scopeStats));
    
    // Fallback if no stats
    if (Object.keys(scopeStats).length === 0) {
      g.innerHTML += '<div style="padding:20px;text-align:center;color:orange;font-weight:500;">⚠ No ' + activeScope + ' data. Check console [STAT]/[PAIR] logs.</div>';
      document.getElementById("statsCharts").innerHTML = '<div style="padding:20px;text-align:center;color:orange;">No charts: empty stats</div>';
      return;
    }
    
    // Scope header
    g.innerHTML = `<div style="grid-column: 1 / -1; padding: 12px; background: var(--bg-tertiary); border-radius: var(--radius); margin-bottom: 12px;">
      <h4 style="margin: 0; color: var(--text-primary);">📊 ${activeScope.toUpperCase()} Statistics</h4>
    </div>`;
    
    const subgroups = Object.keys(scopeStats);
    const rhythmKeys = ['delta', 'theta', 'alpha', 'beta', 'gamma'];
    
    subgroups.forEach(subgroup => {
      const subStats = scopeStats[subgroup];
      const gridItem = document.createElement('div');
      gridItem.style.background = 'var(--bg-tertiary)';
      gridItem.style.padding = '12px';
      gridItem.style.borderRadius = 'var(--radius)';
      gridItem.style.border = '1px solid var(--border)';
      gridItem.innerHTML = `
        <div style="font-weight: 700; margin-bottom: 8px; color: var(--text-primary);">${subgroup}</div>
        ${rhythmKeys.map(key => {
          const s = subStats[key];
          return `<div style="display: flex; justify-content: space-between; font-size: 12px; margin: 2px 0;">
            <span style="color: var(--text-secondary);">${key.toUpperCase()}</span>
            <span>${(isNaN(s?.mean) ? '--' : s.mean.toFixed(2))}</span>
          </div>`;
        }).join('')}
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); font-size: 11px;">
          <div style="display: flex; justify-content: space-between;">
            <span>CV</span><span>${subStats.overall?.cv?.toFixed(1) || '--'}%</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>IQR</span><span>${subStats.overall?.iqr?.toFixed(2) || '--'}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>Kurt</span><span>${subStats.overall?.kurtosis?.toFixed(2) || '--'}</span>
          </div>
        </div>
      `;
      g.appendChild(gridItem);
    });

    // Charts for active scope
    this.pushHistoryAndRenderScopeCharts(allScopesStats, activeScope);

    if (this.overlays && this.overlays.asynchrony && this.overlays.asynchrony.updatePanel) {
      this.overlays.asynchrony.updatePanel(this.lastAsymmetryData || {ai:0,left:0,right:0});
    }
  },

  pushHistoryAndRenderScopeCharts(allScopesStats, activeScope) {
    const scopeStats = allScopesStats[activeScope] || {};
    const subgroups = Object.keys(scopeStats);
    const rhythmKeys = ["delta", "theta", "alpha", "beta", "gamma"];
    
    // Scope-specific history - FIXED INIT
    if (!this.scopeHistories) this.scopeHistories = {};
    if (!this.scopeHistories[activeScope]) {
      this.scopeHistories[activeScope] = { subMeans: [], subOveralls: [] };
    }
    
    // Pre-init arrays for known pair count
    if (activeScope === 'paired' && this.scopeHistories[activeScope].subMeans.length < 3) {
      for (let i = 0; i < 3; i++) {
        if (!this.scopeHistories[activeScope].subMeans[i]) this.scopeHistories[activeScope].subMeans[i] = {};
        if (!this.scopeHistories[activeScope].subOveralls[i]) this.scopeHistories[activeScope].subOveralls[i] = {};
      }
    }
    
    // Push per-subgroup history (no averaging needed for charts)
    subgroups.forEach((subgroup, idx) => {
      const subStats = scopeStats[subgroup];
      rhythmKeys.forEach(k => {
        const val = subStats[k]?.mean || 0;
        if (!this.scopeHistories[activeScope].subMeans[idx]) this.scopeHistories[activeScope].subMeans[idx] = {};
        if (!this.scopeHistories[activeScope].subMeans[idx][k]) this.scopeHistories[activeScope].subMeans[idx][k] = [];
        this.scopeHistories[activeScope].subMeans[idx][k].push(val);
        if (this.scopeHistories[activeScope].subMeans[idx][k].length > 600) this.scopeHistories[activeScope].subMeans[idx][k].shift();
      });
      ['cv', 'iqr', 'kurtosis'].forEach(k => {
        const val = subStats.overall?.[k] || 0;
        if (!this.scopeHistories[activeScope].subOveralls[idx]) this.scopeHistories[activeScope].subOveralls[idx] = {};
        if (!this.scopeHistories[activeScope].subOveralls[idx][k]) this.scopeHistories[activeScope].subOveralls[idx][k] = [];
        this.scopeHistories[activeScope].subOveralls[idx][k].push(val);
        if (this.scopeHistories[activeScope].subOveralls[idx][k].length > 120) this.scopeHistories[activeScope].subOveralls[idx][k].shift();
      });
    });

    const host = document.getElementById("statsCharts");
    if (!host) return;
    
    if (activeScope === 'hemisphere') {
      // Hemisphere: Dual columns LEFT|RIGHT with history
      const leftIdx = 0, rightIdx = 1; // Fixed indices for Left/Right
      const hemiChartDefs = [];
      ['Left', 'Right'].forEach((side, sideIdx) => {
        const colClass = sideIdx === 0 ? 'left' : 'right';
        const sideColor = sideIdx === 0 ? 'var(--left-hemi)' : 'var(--right-hemi)';
        rhythmKeys.forEach(k => {
          hemiChartDefs.push({ 
            key: `${colClass}-${k}`, title: `${k.toUpperCase()} ${side}`, 
            color: this.colorByRhythm(k), col: colClass, subIdx: sideIdx 
          });
        });
        ['cv', 'iqr', 'kurtosis'].forEach(k => {
          hemiChartDefs.push({ 
            key: `${colClass}-${k}`, title: `${k.toUpperCase()} ${side}`, 
            color: k === 'cv' ? "#f59e0b" : k === 'iqr' ? "#a78bfa" : "#22d3ee", 
            col: colClass, subIdx: sideIdx 
          });
        });
      });
      
      host.innerHTML = `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
        <div><h5 style="text-align: center; color: var(--left-hemi);">LEFT</h5>${hemiChartDefs.filter(d=>d.col==='left').map(d=>`<div class="stats-chart-row"><div class="stats-chart-title">${d.title}</div><canvas id="chart-${d.key}" class="stats-canvas" width="300" height="45"></canvas></div>`).join('')}</div>
        <div><h5 style="text-align: center; color: var(--right-hemi);">RIGHT</h5>${hemiChartDefs.filter(d=>d.col==='right').map(d=>`<div class="stats-chart-row"><div class="stats-chart-title">${d.title}</div><canvas id="chart-${d.key}" class="stats-canvas" width="300" height="45"></canvas></div>`).join('')}</div>
      </div>`;
      
      hemiChartDefs.forEach(d => {
        const subIdx = d.subIdx;
        const metric = d.key.split('-')[1];
        const dataKey = d.key.includes('kurt') || d.key.includes('cv') || d.key.includes('iqr') 
          ? (this.scopeHistories[activeScope]?.subOveralls[subIdx]?.[metric] || [])
          : (this.scopeHistories[activeScope]?.subMeans[subIdx]?.[metric] || []);
        const canvas = document.getElementById(`chart-${d.key}`);
        if (canvas && dataKey.length > 0) this.drawLine(canvas, dataKey, d.color);
      });
      return;
    }
    
    // Other scopes: subgroup-multiplied charts
    if (activeScope === 'paired') {
      // FIXED: Dynamic subgroups matching actual data order
      const subgroups = Object.keys(scopeStats);
      console.log('[PAIRED CHARTS] subgroups=', subgroups);
      
      const chartContainer = document.createElement('div');
      chartContainer.style.display = 'grid';
      chartContainer.style.gridTemplateColumns = 'repeat(3, 1fr)';
      chartContainer.style.gap = '12px';
      
      subgroups.slice(0,3).forEach((groupName, colIdx) => {
        const colDiv = document.createElement('div');
        colDiv.innerHTML = `<h6 style="text-align: center; margin-bottom: 12px; color: var(--text-primary); font-size: 14px; font-weight: 600;">${groupName}</h6>`;
        
        const colChartDefs = [];
        rhythmKeys.forEach(k => colChartDefs.push({ 
          key: `p${colIdx}-${k}`, title: k.toUpperCase(), color: this.colorByRhythm(k), metric: k 
        }));
        ['cv', 'iqr', 'kurtosis'].forEach(k => colChartDefs.push({ 
          key: `p${colIdx}-${k}`, title: k.toUpperCase(), color: k === 'cv' ? "#f59e0b" : k === 'iqr' ? "#a78bfa" : "#22d3ee", metric: k 
        }));
        
        colChartDefs.forEach(def => {
          const chartDiv = document.createElement('div');
          chartDiv.className = 'stats-chart-row';
          chartDiv.innerHTML = `<div class="stats-chart-title" style="font-size:11px;margin-bottom:4px;">${def.title}</div><canvas id="chart-${def.key}" class="stats-canvas" width="100%" height="40" style="border-radius:6px;border:1px solid var(--border);"></canvas>`;
          colDiv.appendChild(chartDiv);
          
          // Draw immediately if data
          const subStats = scopeStats[groupName];
          const metric = def.metric;
          const dataKey = metric === 'cv' || metric === 'iqr' || metric === 'kurtosis'
            ? (this.scopeHistories[activeScope]?.subOveralls[colIdx]?.[metric] || [])
            : (this.scopeHistories[activeScope]?.subMeans[colIdx]?.[metric] || []);
          const canvas = document.getElementById(`chart-${def.key}`);
          if (canvas && dataKey.length > 0) {
            this.drawLine(canvas, dataKey, def.color);
          }
        });
        
        chartContainer.appendChild(colDiv);
      });
      
      host.innerHTML = '';
      host.appendChild(chartContainer);
      return;
    }
    
    const multiplier = activeScope === 'individual' ? 6 : activeScope === 'paired' ? 3 : 1;
    const chartDefs = [];
    for (let i = 0; i < multiplier; i++) {
      const subName = subgroups[i] || `Sub${i+1}`;
      rhythmKeys.forEach(k => chartDefs.push({ 
        key: `${subName}-${k}`, title: `${k.toUpperCase()} ${subName}`, color: this.colorByRhythm(k), subIdx: i 
      }));
      chartDefs.push({ key: `${subName}-cv`, title: `CV ${subName}`, color: "#f59e0b", subIdx: i });
      chartDefs.push({ key: `${subName}-iqr`, title: `IQR ${subName}`, color: "#a78bfa", subIdx: i });
      chartDefs.push({ key: `${subName}-kurt`, title: `Kurt ${subName}`, color: "#22d3ee", subIdx: i });
    }
    
    host.innerHTML = chartDefs.map(d => `<div class="stats-chart-row"><div class="stats-chart-title">${d.title}</div><canvas id="chart-${activeScope}-${d.key}" class="stats-canvas" width="300" height="45"></canvas></div>`).join('');
    
    chartDefs.forEach(d => {
      const subIdx = d.subIdx;
      const metric = d.key.split('-')[1];
      const dataKey = d.key.includes('kurt') || d.key.includes('cv') || d.key.includes('iqr') 
        ? (this.scopeHistories[activeScope].subOveralls[subIdx]?.[metric] || [])
        : (this.scopeHistories[activeScope].subMeans[subIdx]?.[metric] || []);
      const canvas = document.getElementById(`chart-${activeScope}-${d.key}`);
      if (canvas && dataKey.length) this.drawLine(canvas, dataKey, d.color);
    });
  },



  pushHistoryAndRenderCharts(stats) {
    const rhythmKeys = ["delta", "theta", "alpha", "beta", "gamma"];
    rhythmKeys.forEach((k) => {
      this.rhythmHistory[k].push(Number(stats[k].mean || 0));
      if (this.rhythmHistory[k].length > 120) this.rhythmHistory[k].shift();
    });

    const overall = stats.overall || {};
    const extra = {
      kurtosis: Number(overall.kurtosis || 0),
      cv: Number(overall.cv || 0),
      iqr: Number(overall.iqr || 0),
      q25: Number(overall.q25 || 0),
      q50: Number(overall.q50 || 0),
      q75: Number(overall.q75 || 0)
    };

    Object.entries(extra).forEach(([k, v]) => {
      this.rhythmHistory[k].push(v);
      if (this.rhythmHistory[k].length > 120) this.rhythmHistory[k].shift();
    });

    const host = document.getElementById("statsCharts");
    if (!host) return;

    const chartDefs = [
      ...rhythmKeys.map((k) => ({ key: k, title: `${k.toUpperCase()} mean (real-time)`, color: this.colorByRhythm(k) })),
      { key: "kurtosis", title: "Kurtosis (real-time)", color: "#22d3ee" },
      { key: "cv", title: "CV % (real-time)", color: "#f59e0b" },
      { key: "iqr", title: "IQR (real-time)", color: "#a78bfa" }
    ];

    host.innerHTML = chartDefs.map((d) => `
      <div class="stats-chart-row">
        <div class="stats-chart-title">${d.title}</div>
        <canvas id="chart-${d.key}" class="stats-canvas" width="600" height="90"></canvas>
      </div>
    `).join("") + `
      <div class="stats-chart-row">
        <div class="stats-chart-title">Distribution / Quartiles (Q25, Q50, Q75 + IQR)</div>
        <canvas id="chart-distribution" class="stats-canvas" width="1200" height="260"></canvas>
      </div>
    `;

    chartDefs.forEach((d) => {
      const canvas = document.getElementById(`chart-${d.key}`);
      if (!canvas) return;
      this.drawLine(canvas, this.rhythmHistory[d.key], d.color);
    });

    const distCanvas = document.getElementById("chart-distribution");
    if (distCanvas) {
      this.drawDistributionWithQuartiles(
        distCanvas,
        this.rhythmHistory.alpha,
        Number(overall.q25 || 0),
        Number(overall.q50 || 0),
        Number(overall.q75 || 0)
      );
    }
  },

  drawDistributionWithQuartiles(canvas, values, q25, q50, q75) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!values.length) return;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1e-6, max - min);

    const bins = 40;
    const hist = new Array(bins).fill(0);
    values.forEach((v) => {
      const idx = Math.max(0, Math.min(bins - 1, Math.floor(((v - min) / span) * bins)));
      hist[idx]++;
    });
    const maxCount = Math.max(...hist, 1);

    // histogram
    ctx.fillStyle = "rgba(59,130,246,0.5)";
    for (let i = 0; i < bins; i++) {
      const bw = w / bins;
      const bh = (hist[i] / maxCount) * (h - 30);
      ctx.fillRect(i * bw + 1, h - bh - 6, bw - 2, bh);
    }

    // IQR band
    const x25 = ((q25 - min) / span) * w;
    const x75 = ((q75 - min) / span) * w;
    ctx.fillStyle = "rgba(16,185,129,0.25)";
    ctx.fillRect(Math.max(0, x25), 0, Math.max(1, x75 - x25), h);

    // quartile markers
    const drawQ = (x, color, label) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = "bold 14px Segoe UI";
      ctx.fillText(label, Math.min(w - 70, Math.max(4, x + 4)), 18);
    };

    drawQ(((q25 - min) / span) * w, "#34d399", "Q25");
    drawQ(((q50 - min) / span) * w, "#60a5fa", "Q50");
    drawQ(((q75 - min) / span) * w, "#f472b6", "Q75");
  },

  drawLine(canvas, data, color) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Sparse grid lines - fewer lines, bigger spacing
    ctx.strokeStyle = "rgba(31, 41, 55, 0.4)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {  // 3 lines instead of 4
      const y = (h * 0.25) * (i + 1) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (!data.length) return;
    const recentData = data.slice(-Math.min(120, data.length));  // Last 120 points max
    const min = Math.min(...recentData);
    const max = Math.max(...recentData);
    const span = Math.max(1e-6, max - min);

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;  // Thicker line for emphasis
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.beginPath();
    recentData.forEach((v, i) => {
      const x = (i / Math.max(1, recentData.length - 1)) * (w - 1);
      const y = h - ((v - min) / span) * (h - 16) - 8;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.shadowBlur = 0;  // Reset shadow
    ctx.stroke();
  },

  colorByRhythm(k) {
    if (k === "delta") return "#1f77b4";
    if (k === "theta") return "#ff7f0e";
    if (k === "alpha") return "#2ca02c";
    if (k === "beta") return "#d62728";
    return "#9467bd";
  },

  onBCI(bci) {
    const meditation = Number(bci.meditation || 0);
    const concentration = Number(bci.concentration || 0);
    document.getElementById("meditationValue").textContent = `${meditation}%`;
    document.getElementById("concentrationValue").textContent = `${concentration}%`;
    document.getElementById("meditationBar").style.width = `${meditation}%`;
    document.getElementById("concentrationBar").style.width = `${concentration}%`;

    document.getElementById("attentionValue").textContent = Number(bci.attention || 0).toFixed(0);
    document.getElementById("smrValue").textContent = Number(bci.smr || 0).toFixed(0);
    document.getElementById("biosignalStateValue").textContent = String(bci.biosignal_state ?? bci.biosignalstate ?? "-");
  },

  onDeviceInfo(cdi) {
    const names = cdi.currentChannelsNames || API.channels6;
    const quality = cdi.quality || [];
    const f = cdi.currentFrequency ?? "--";

    document.getElementById("sampleRate").textContent = `${f} Гц`;
    document.getElementById("channelCount").textContent = String(cdi.currentChannels ?? names.length ?? "--");
    document.getElementById("recordDuration").textContent = this.formatRecordDuration(cdi.recordDuration);

    const q = document.getElementById("qualityGrid");
    q.innerHTML = names.map((n, i) => {
      const v = Number(quality[i] ?? 0);
      const color = v < 20 ? "#ef4444" : v < 90 ? "#f59e0b" : "#10b981";
      return `<div class="quality-item"><div>${n}</div><div class="quality-bar"><div class="quality-fill" style="width:${Math.max(0,Math.min(100,v))}%;background:${color}"></div></div><div>${v.toFixed(0)}%</div></div>`;
    }).join("");

    const d = cdi.device || {};
    const info = document.getElementById("deviceInfo");
    info.innerHTML = `
      <div class="info-item"><div class="info-label">Модель</div><div class="info-value">${d.model || "--"}</div></div>
      <div class="info-item"><div class="info-label">Имя</div><div class="info-value">${d.name || "--"}</div></div>
      <div class="info-item"><div class="info-label">SN</div><div class="info-value">${d.serialNumber || "--"}</div></div>
      <div class="info-item"><div class="info-label">Макс. каналы</div><div class="info-value">${d.maxChannels ?? "--"}</div></div>
      <div class="info-item"><div class="info-label">HPF/LPF</div><div class="info-value">${cdi.HPF ?? "--"} / ${cdi.LPF ?? "--"}</div></div>
      <div class="info-item"><div class="info-label">BSF/BSF2</div><div class="info-value">${cdi.BSF ?? "--"} / ${cdi.BSF2 ?? "--"}</div></div>
    `;
  },

  formatRecordDuration(v) {
    if (v == null) return "00:00:00";
    const sec = Math.max(0, Math.floor(Number(v)));
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  },

  matrixLabels() {
    if (this.validLabels && this.validLabels.length > 0) {
      return this.validLabels;
    }
    // Fallback to fixed labels by mode
    if (this.averagingMode === "pair") return ["Fp1-Fp2", "T3-T4", "O1-O2"];
    if (this.averagingMode === "hemisphere") return ["Left", "Right"];
    if (this.averagingMode === "global") return ["Global"];
    return API ? API.channels6 : ['O1', 'T3', 'Fp1', 'Fp2', 'T4', 'O2'];
  },

  updateCorrelationTable() {
    const body = document.getElementById("matrixBody");
    body.innerHTML = "";
    const m = this.corrMatrix;
    const labels = this.matrixLabels();
    if (!m || m.length === 0 || !Array.isArray(m)) {
      body.innerHTML = '<tr><td colspan="7" style="color:#94a3b8;text-align:center;padding:20px;font-style:italic">⏳ Ожидание спектральных данных...</td></tr>';
      return;
    }
    
    // Now sizes should always match due to validLabels usage
    if (m.length !== labels.length) {
      console.warn('Matrix-labels mismatch despite fixes:', m.length, labels.length);
      body.innerHTML = '<tr><td colspan="7" style="color:#f59e0b;text-align:center;padding:20px">⚠ Internal error: matrix-labels mismatch</td></tr>';
      return;
    }

    for (let i = 0; i < labels.length; i++) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${labels[i]}</td>` + labels.map((_, j) => {
        const v = Number(m[i]?.[j] ?? 0);
        return `<td style="background:${Correlation.toColor(v)}">${v.toFixed(2)}</td>`;
      }).join("");
      body.appendChild(tr);
    }
  },

  exportMatrixCSV() {
    if (!this.corrMatrix) return;
    const labels = this.matrixLabels();

    let csv = `,${labels.join(",")}\n`;
    for (let i = 0; i < labels.length; i++) {
      csv += labels[i];
      for (let j = 0; j < labels.length; j++) csv += `,${Number(this.corrMatrix[i][j]).toFixed(4)}`;
      csv += "\n";
    }
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `correlation_${document.getElementById("bandSelector").value}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast("CSV экспортирован", "success");
  },

  renderMarkers(markers) {
    const setValue = (id, val, fmt = (v) => v.toFixed(1)) => {
      const el = document.getElementById(id);
      if (el && Number.isFinite(val)) {
        el.textContent = fmt(val);
      } else if (el) {
        el.textContent = '—';
      }
    };
    setValue('tarValue', markers.tar * 100, (v) => v.toFixed(1) + '%');
    setValue('brValue', markers.br * 100, (v) => v.toFixed(1) + '%');
    setValue('faFrontalValue', markers.faFrontal, (v) => v.toFixed(2));
    setValue('faTValue', markers.faT, (v) => v.toFixed(2));
    setValue('faCorticalValue', markers.faCortical, (v) => v.toFixed(2));

    // History & charts
    const keys = ['tar', 'br', 'faFrontal', 'faT', 'faCortical'];
    keys.forEach(key => {
      this.markerHistory[key].push(Number(markers[key] || 0));
      if (this.markerHistory[key].length > 1200) this.markerHistory[key].shift();
    });
    this.renderMarkerCharts();
  },

  renderMarkerCharts() {
    const host = document.getElementById("markersCharts");
    if (!host) return;
    const chartDefs = [
      { key: 'tar', title: 'TAR % (60s)', color: '#ff7f0e' },
      { key: 'br', title: 'BR % (60s)', color: '#d62728' },
      { key: 'faFrontal', title: 'Frontal FA (60s)', color: '#3b82f6' },
      { key: 'faT', title: 'Temporal FA (60s)', color: '#10b981' },
      { key: 'faCortical', title: 'Cortical FA (60s)', color: '#ef4444' }
    ];
    host.innerHTML = chartDefs.map(d => `
      <div class="marker-chart-row">
        <div class="marker-chart-title">${d.title}</div>
        <canvas id="chart-${d.key}" class="marker-canvas" width="600" height="90"></canvas>
      </div>
    `).join('');
    chartDefs.forEach(d => {
      const canvas = document.getElementById(`chart-${d.key}`);
      if (canvas) this.drawLine(canvas, this.markerHistory[d.key], d.color);
    });
  },

  toast(text, type = "success") {
    const box = document.getElementById("toastContainer");
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = text;
    box.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }
};

// Initialize playback manager after App is defined
let playbackManager = null;

document.addEventListener("DOMContentLoaded", async () => {
  await App.init();
  
  // Initialize playback manager
  playbackManager = new PlaybackManager(App);
  
  // Bind playback UI controls
  const btnPlaybackMode = document.getElementById("btnPlaybackMode");
  const recordingSelector = document.getElementById("recordingSelector");
  const btnPlay = document.getElementById("btnPlay");
  const btnPause = document.getElementById("btnPause");
  const btnStop = document.getElementById("btnStop");
  const playbackSpeed = document.getElementById("playbackSpeed");
  const playbackProgressContainer = document.getElementById("playbackProgressContainer");
  const playbackSeek = document.getElementById("playbackSeek");
  const currentTimeDisplay = document.getElementById("currentTimeDisplay");
  const durationDisplay = document.getElementById("durationDisplay");
  
  let isPlaybackMode = false;
  
  btnPlaybackMode.addEventListener("click", () => {
    isPlaybackMode = !isPlaybackMode;
    
    if (isPlaybackMode) {
      // Switch to playback mode
      recordingSelector.style.display = "inline-block";
      btnPlay.style.display = "inline-block";
      btnPause.style.display = "inline-block";
      btnStop.style.display = "inline-block";
      playbackSpeed.style.display = "inline-block";
      playbackProgressContainer.style.display = "flex";
      btnPlaybackMode.textContent = "📡 Режим LIVE";
      
      // Stop any live polling
      if (App.polling) {
        App.stopPolling();
      }
    } else {
      // Switch back to live mode
      recordingSelector.style.display = "none";
      btnPlay.style.display = "none";
      btnPause.style.display = "none";
      btnStop.style.display = "none";
      playbackSpeed.style.display = "none";
      playbackProgressContainer.style.display = "none";
      btnPlaybackMode.textContent = "📁 Режим записи";
      
      // Stop playback
      if (playbackManager) {
        playbackManager.stop();
      }
      
      // Restart live polling if connected
      if (App.connection?.isConnected) {
        App.startPolling();
      }
    }
  });
  
  recordingSelector.addEventListener("change", async () => {
    const filePath = recordingSelector.value;
    if (!filePath) {
      btnPlay.disabled = true;
      btnPause.disabled = true;
      btnStop.disabled = true;
      return;
    }
    
    const loaded = await playbackManager.loadFile(filePath);
    if (loaded) {
      btnPlay.disabled = false;
      btnPause.disabled = true;
      btnStop.disabled = true;
      
      // Update duration display
      const duration = playbackManager.getDuration();
      durationDisplay.textContent = formatTime(duration);
      playbackSeek.max = duration;
      playbackSeek.value = 0;
      currentTimeDisplay.textContent = "0:00";
    }
  });
  
  btnPlay.addEventListener("click", () => {
    if (!playbackManager.playbackData) return;
    
    playbackManager.play();
    btnPlay.disabled = true;
    btnPause.disabled = false;
    btnStop.disabled = false;
  });
  
  btnPause.addEventListener("click", () => {
    playbackManager.pause();
    btnPlay.disabled = false;
    btnPlay.textContent = "▶️ Resume";
    btnPause.disabled = true;
  });
  
  btnStop.addEventListener("click", () => {
    playbackManager.stop();
    btnPlay.disabled = false;
    btnPlay.textContent = "▶️ Play";
    btnPause.disabled = true;
    btnStop.disabled = true;
    
    // Reset displays
    playbackSeek.value = 0;
    currentTimeDisplay.textContent = "0:00";
  });
  
  playbackSpeed.addEventListener("change", () => {
    playbackManager.setSpeed(parseFloat(playbackSpeed.value));
  });
  
  // Seek functionality
  playbackSeek.addEventListener("input", () => {
    const time = parseFloat(playbackSeek.value);
    playbackManager.seek(time);
    currentTimeDisplay.textContent = formatTime(time);
  });
  
  // Helper function to format time
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
});
