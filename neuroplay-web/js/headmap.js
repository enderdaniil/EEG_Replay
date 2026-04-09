class HeadMap {
  constructor() {
    this.svg = document.getElementById("headMap");
    this.overlayLayer = document.getElementById("overlayLayer");
    this.channelMarkers = document.getElementById("channelMarkers");
    this.connectionLines = document.getElementById("connectionLines");

    this.positions = {
      Fp1: { x: 150, y: 120 }, Fp2: { x: 250, y: 120 },
      T3: { x: 75, y: 250 }, T4: { x: 325, y: 250 },
      O1: { x: 150, y: 380 }, O2: { x: 250, y: 380 }
    };

    this.groupPositions = {
      "Fp1-Fp2": { x: 200, y: 120 },
      "T3-T4": { x: 200, y: 250 },
      "O1-O2": { x: 200, y: 380 },
      Left: { x: 120, y: 250 },
      Right: { x: 280, y: 250 },
      Global: { x: 200, y: 250 }
    };

    this.currentSubtab = "rhythms";
    this.currentMode = "individual";
    this.currentDataByChannel = {};
    this.corrMatrix = null;
    this.tooltip = this.createTooltip();
    this.renderMarkers();
  }

  createTooltip() {
    const t = document.createElement("div");
    t.style.position = "fixed";
    t.style.display = "none";
    t.style.background = "#1e293b";
    t.style.border = "1px solid #334155";
    t.style.color = "#f1f5f9";
    t.style.padding = "8px";
    t.style.borderRadius = "8px";
    t.style.fontSize = "12px";
    t.style.zIndex = 2000;
    document.body.appendChild(t);
    return t;
  }

  renderMarkers() {
    this.channelMarkers.innerHTML = "";
    Object.entries(this.positions).forEach(([name, p]) => {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("transform", `translate(${p.x},${p.y})`);
      g.setAttribute("data-channel", name);

      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("r", "18");
      c.setAttribute("class", "channel-circle");
      c.setAttribute("id", `ch-${name}`);
      g.appendChild(c);

      const l = document.createElementNS("http://www.w3.org/2000/svg", "text");
      l.setAttribute("class", "channel-label");
      l.setAttribute("y", "-24");
      l.textContent = name;
      g.appendChild(l);

      const v = document.createElementNS("http://www.w3.org/2000/svg", "text");
      v.setAttribute("class", "channel-value");
      v.setAttribute("y", "30");
      v.setAttribute("id", `val-${name}`);
      v.textContent = "--";
      g.appendChild(v);

      g.addEventListener("mouseenter", (e) => this.showTooltip(e, name));
      g.addEventListener("mousemove", (e) => this.moveTooltip(e));
      g.addEventListener("mouseleave", () => this.hideTooltip());

      this.channelMarkers.appendChild(g);
    });
  }

  showTooltip(e, name) {
    const d = this.currentDataByChannel[name] || {};
    const s = d.stats || {};
    this.tooltip.innerHTML = `
      <div><b>${name}</b></div>
      <div>δ ${Number(d.delta || 0).toFixed(2)} θ ${Number(d.theta || 0).toFixed(2)}</div>
      <div>α ${Number(d.alpha || 0).toFixed(2)} β ${Number(d.beta || 0).toFixed(2)} γ ${Number(d.gamma || 0).toFixed(2)}</div>
      <div>peak ${Number(d.peakHz || 0).toFixed(1)} Hz | H ${Number(d.entropy || 0).toFixed(3)}</div>
      <div>μ ${Number(s.mean || 0).toFixed(2)} σ ${Number(s.stdDev || 0).toFixed(2)}</div>
      <div>CV ${Number(s.cv || 0).toFixed(1)}% Skew ${Number(s.skewness || 0).toFixed(2)} Kurt ${Number(s.kurtosis || 0).toFixed(2)}</div>
      <div>IQR ${Number(s.iqr || 0).toFixed(2)} | ${s.normality || 'unknown'}</div>
    `;
    this.tooltip.style.display = "block";
    this.moveTooltip(e);
  }

  moveTooltip(e) {
    this.tooltip.style.left = `${e.clientX + 12}px`;
    this.tooltip.style.top = `${e.clientY + 12}px`;
  }

  hideTooltip() { this.tooltip.style.display = "none"; }

  setSubtab(tab) {
    this.currentSubtab = tab;
    this.renderOverlay();
  }

  setCorrelationMatrix(matrix) {
    this.corrMatrix = matrix;
    if (this.currentSubtab === "connectivity") this.renderConnectivity();
  }

  update(channelMap, _spectrumData, mode = "individual") {
    this.currentMode = mode;
    this.currentDataByChannel = channelMap || {};

    // base circles are used in individual mode, muted otherwise
    for (const ch of Object.keys(this.positions)) {
      const d = this.currentDataByChannel[ch];
      const el = document.getElementById(`ch-${ch}`);
      const val = document.getElementById(`val-${ch}`);
      if (!el || !val) continue;

      if (mode !== "individual") {
        el.setAttribute("fill", "rgba(100,116,139,0.18)");
        val.textContent = "--";
        continue;
      }

      if (!d) {
        el.setAttribute("fill", "rgba(100,116,139,0.2)");
        val.textContent = "--";
        continue;
      }

      const alpha = Number(d.alpha || 0);
      const intensity = Math.min(1, alpha / 50);
      el.setAttribute("fill", `rgba(59,130,246,${0.2 + intensity * 0.8})`);
      val.textContent = `α ${alpha.toFixed(1)}`;
    }

    this.renderOverlay();
  }

  renderOverlay() {
    this.overlayLayer.innerHTML = "";
    this.connectionLines.innerHTML = "";

    if (this.currentSubtab === "rhythms") this.renderRhythmRings();
    else if (this.currentSubtab === "spectrum") this.renderSpectrumHeat();
    else if (this.currentSubtab === "peak") this.renderPeakColors();
    else if (this.currentSubtab === "connectivity") this.renderConnectivity();
    else if (this.currentSubtab === "entropy") this.renderEntropy();
    else if (this.currentSubtab === "statistics") this.renderStatisticsOverlay();

    this.renderValueLabels();
  }

  currentEntries() {
    if (this.currentMode === "individual") {
      return Object.entries(this.positions).map(([name, pos]) => [name, pos, this.currentDataByChannel[name]]);
    }
    return Object.entries(this.groupPositions)
      .filter(([name]) => this.currentDataByChannel[name])
      .map(([name, pos]) => [name, pos, this.currentDataByChannel[name]]);
  }

  renderRhythmRings() {
    const keys = ["delta", "theta", "alpha", "beta", "gamma"];
    const colors = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd"];
const barWidth = 10, barSpacing = 2, barHeightMax = 35, barY = 50;
    
    for (const [name, p, d] of this.currentEntries()) {
      if (!d) continue;
      
      // Group for this sensor's bars - translate to sensor position
      const barsG = document.createElementNS("http://www.w3.org/2000/svg", "g");
      barsG.setAttribute("transform", `translate(${p.x}, ${p.y})`);
      barsG.setAttribute("data-sensor", name);
      
      const offset = 0;
      
      keys.forEach((k, i) => {
        const val = Number(d[k] || 0);
        const barHeight = Math.min(barHeightMax, val / 3);
        const barX = 25 + offset + i * (barWidth + barSpacing);  // RIGHT of sensor center
        
        // Bar background
        const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bg.setAttribute("x", barX);
        bg.setAttribute("y", barY - barHeightMax);
        bg.setAttribute("width", barWidth);
        bg.setAttribute("height", barHeightMax);
        bg.setAttribute("fill", "rgba(30,41,59,0.3)");
        barsG.appendChild(bg);
        
        // Bar fill
        const bar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bar.setAttribute("x", barX);
        bar.setAttribute("y", barY - barHeight);
        bar.setAttribute("width", barWidth);
        bar.setAttribute("height", barHeight);
        bar.setAttribute("fill", colors[i]);
        bar.setAttribute("rx", "3");
        bar.setAttribute("class", "rhythm-bar");
        barsG.appendChild(bar);
        
        // Value label
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", barX + barWidth/2);
        label.setAttribute("y", barY + 8);
        label.setAttribute("fill", "#e2e8f0");
        label.setAttribute("font-size", "8");
        label.setAttribute("text-anchor", "middle");
        label.textContent = val.toFixed(1);
        barsG.appendChild(label);
        
        // Rhythm symbol
        const symbol = document.createElementNS("http://www.w3.org/2000/svg", "text");
        symbol.setAttribute("x", barX + barWidth/2);
        symbol.setAttribute("y", barY - barHeightMax - 4);
        symbol.setAttribute("fill", colors[i]);
        symbol.setAttribute("font-size", "9");
        symbol.setAttribute("font-weight", "bold");
        symbol.setAttribute("text-anchor", "middle");
        symbol.textContent = k[0].toUpperCase();
        barsG.appendChild(symbol);
      });
      
      this.overlayLayer.appendChild(barsG);  // Append positioned group
    }
  }

  renderSpectrumHeat() {
    for (const [, p, d] of this.currentEntries()) {
      if (!d) continue;
      const arr = d.spectrumArr || [];
      const power = arr.reduce((a, b) => a + Number(b || 0), 0) / Math.max(1, arr.length);
      const a = Math.min(1, power / 40);
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", p.x); c.setAttribute("cy", p.y);
      c.setAttribute("r", this.currentMode === "individual" ? 42 : 36);
      c.setAttribute("fill", `rgba(249,115,22,${a})`);
      this.overlayLayer.appendChild(c);
    }
  }

  renderPeakColors() {
    for (const [, p, d] of this.currentEntries()) {
      if (!d) continue;
      const hz = Number(d.peakHz || 0);
      let color = "#64748b";
      if (hz >= 0.5 && hz < 4) color = "#1f77b4";
      else if (hz < 8) color = "#ff7f0e";
      else if (hz < 13) color = "#2ca02c";
      else if (hz < 30) color = "#d62728";
      else color = "#9467bd";

      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", p.x);
      c.setAttribute("cy", p.y);
      c.setAttribute("r", this.currentMode === "individual" ? 20 : 26);
      c.setAttribute("fill", color);
      c.setAttribute("opacity", "0.85");
      this.overlayLayer.appendChild(c);
    }
  }

  renderEntropy() {
    for (const [, p, d] of this.currentEntries()) {
      if (!d) continue;
      const e = Number(d.entropy || 0);
      const a = Math.min(1, e / 8);
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", p.x);
      c.setAttribute("cy", p.y);
      c.setAttribute("r", this.currentMode === "individual" ? 20 : 26);
      c.setAttribute("fill", `rgba(16,185,129,${a})`);
      this.overlayLayer.appendChild(c);
    }
  }

  renderStatisticsOverlay() {
    for (const [, p, d] of this.currentEntries()) {
      if (!d) continue;
      const s = d.stats || {};
      const strength = Math.min(1, Math.abs(Number(s.cv || 0)) / 100);
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", p.x);
      c.setAttribute("cy", p.y);
      c.setAttribute("r", this.currentMode === "individual" ? 20 : 26);
      c.setAttribute("fill", `rgba(99,102,241,${0.2 + strength * 0.8})`);
      this.overlayLayer.appendChild(c);
    }
  }

  renderConnectivity() {
    // Delegate to overlay
    if (App && App.overlays && App.overlays.connectivity) {
      App.overlays.connectivity.render(App.corrMatrix || []);
    } else {
      // Fallback
      this.connectionLines.innerHTML = "";
      if (!this.corrMatrix || this.corrMatrix.length < 2) return;
      // ... existing logic
    }
  }

  renderValueLabels() {
    const metricBySubtab = {
      rhythms: (d) => `δ${Number(d.delta || 0).toFixed(1)} θ${Number(d.theta || 0).toFixed(1)} α${Number(d.alpha || 0).toFixed(1)} β${Number(d.beta || 0).toFixed(1)} γ${Number(d.gamma || 0).toFixed(1)}`,
      spectrum: (d) => {
        const arr = d.spectrumArr || [];
        const p = arr.reduce((a, b) => a + Number(b || 0), 0) / Math.max(1, arr.length);
        return `P ${p.toFixed(2)}`;
      },
      peak: (d) => `Hz ${Number(d.peakHz || 0).toFixed(2)}`,
      connectivity: (d) => `α ${Number(d.alpha || 0).toFixed(2)}`,
      entropy: (d) => `H ${Number(d.entropy || 0).toFixed(3)}`,
      statistics: (d) => {
        const s = d.stats || {};
        return `μ${Number(s.mean || 0).toFixed(1)} σ${Number(s.stdDev || 0).toFixed(1)} cv${Number(s.cv || 0).toFixed(1)}%`;
      }
    };

    const fmt = metricBySubtab[this.currentSubtab] || metricBySubtab.rhythms;
    for (const [name, p, d] of this.currentEntries()) {
      if (!d) continue;

      const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
      title.setAttribute("x", p.x);
      title.setAttribute("y", p.y - 30);
      title.setAttribute("fill", "#f1f5f9");
      title.setAttribute("font-size", "11");
      title.setAttribute("text-anchor", "middle");
      title.textContent = name;
      this.overlayLayer.appendChild(title);

      const value = document.createElementNS("http://www.w3.org/2000/svg", "text");
      value.setAttribute("x", p.x);
      value.setAttribute("y", p.y + 38);
      value.setAttribute("fill", "#94a3b8");
      value.setAttribute("font-size", "9");
      value.setAttribute("text-anchor", "middle");
      value.textContent = fmt(d);
      this.overlayLayer.appendChild(value);
    }
  }
}
