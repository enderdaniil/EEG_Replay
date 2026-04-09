class PlaybackManager {
  constructor(app) {
    this.app = app;
    this.playbackData = null;
    this.isPlaying = false;
    this.isPaused = false;
    this.currentTime = 0; // in seconds
    this.duration = 0;
    this.playbackSpeed = 1;
    this.timer = null;
    this.lastFrameTime = 0;
    this.onUpdateCallback = null;
  }

  async loadFile(filePath) {
    console.log('[PLAYBACK] Loading:', filePath);
    try {
      const response = await fetch(filePath);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.playbackData = await response.json();
      
      this.duration = this.playbackData.durationSec || this.playbackData.rhythmsHistory?.length || 0;
      this.currentTime = 0;
      
      console.log('[PLAYBACK] Loaded:', {
        duration: this.duration,
        channels: this.playbackData.channels,
        sfreq: this.playbackData.sfreq,
        rhythmsLength: this.playbackData.rhythmsHistory?.length,
        spectrumLength: this.playbackData.spectrumHistory?.length
      });
      
      return true;
    } catch (e) {
      console.error('[PLAYBACK] Load error:', e);
      return false;
    }
  }

  play() {
    if (!this.playbackData) return;
    if (this.isPlaying && !this.isPaused) return;
    
    this.isPlaying = true;
    this.isPaused = false;
    this.lastFrameTime = performance.now();
    
    console.log('[PLAYBACK] Play at', this.currentTime, 's');
    this.tick();
  }

  pause() {
    this.isPaused = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log('[PLAYBACK] Paused at', this.currentTime, 's');
  }

  stop() {
    this.isPlaying = false;
    this.isPaused = false;
    this.currentTime = 0;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log('[PLAYBACK] Stopped');
  }

  seek(timeSeconds) {
    this.currentTime = Math.max(0, Math.min(timeSeconds, this.duration - 1));
    console.log('[PLAYBACK] Seek to', this.currentTime, 's');
    
    if (this.isPlaying && !this.isPaused) {
      this.renderFrame();
    }
  }

  setSpeed(speed) {
    this.playbackSpeed = speed;
    console.log('[PLAYBACK] Speed:', speed);
  }

  tick() {
    if (!this.isPlaying || this.isPaused) return;
    
    const now = performance.now();
    const deltaTime = (now - this.lastFrameTime) / 1000; // seconds
    this.lastFrameTime = now;
    
    // Advance time based on playback speed
    this.currentTime += deltaTime * this.playbackSpeed;
    
    if (this.currentTime >= this.duration) {
      this.currentTime = this.duration - 1;
      this.stop();
      return;
    }
    
    this.renderFrame();
    
    // Schedule next frame (aim for ~20fps for smooth playback)
    this.timer = setTimeout(() => this.tick(), 50);
  }

  renderFrame() {
    if (!this.playbackData) return;
    
    const idx = Math.floor(this.currentTime);
    const rhythms = this.playbackData.rhythmsHistory[idx];
    const spectrum = this.playbackData.spectrumHistory[idx];
    const rawData = this.playbackData.rawData;
    
    if (!rhythms || !spectrum) {
      console.warn('[PLAYBACK] No data at index', idx);
      return;
    }
    
    // Convert rhythms to the format expected by the app
    // The original API returns rhythms as array of objects per channel
    const rhythmsArray = rhythms.map(ch => ({
      delta: ch.delta,
      theta: ch.theta,
      alpha: ch.alpha,
      beta: ch.beta,
      gamma: ch.gamma
    }));
    
    // Convert spectrum to expected format
    const spectrumRes = {
      spectrum: spectrum.spectrum,
      frequencyStepHz: spectrum.frequencyStepHz
    };
    
    console.log('[PLAYBACK] Render frame', idx, '/', this.playbackData.rhythmsHistory.length);
    
    // Update the main app with this data
    if (this.app) {
      this.app.lastRhythms = rhythmsArray;
      this.app.lastSpectrum = spectrumRes;
      
      // Build derived per-node data
      const mapped = this.app.buildDerivedPerNode(rhythmsArray, spectrumRes);
      this.app.headMap.update(mapped, spectrumRes, this.app.averagingMode);
      
      // Calculate and render statistics
      const allScopesStats = Statistics.calculate(rhythmsArray, true);
      const activeScopeStats = allScopesStats[this.app.statsMode] || {};
      this.app.renderStats(allScopesStats, this.app.statsMode);
      
      // Update markers
      const markers = Statistics.calculateDynamicMarkers(rhythmsArray);
      this.app.renderMarkers(markers);
      
      // Update correlation matrix
      if (spectrumRes) {
        this.app.recomputeMatrixFromLastSpectrum();
      }
      this.app.updateCorrelationTable();
      
      // Update charts if available
      if (MetricsCharts.update) {
        MetricsCharts.update(activeScopeStats, null, null, null);
      }
      
      // Update timestamp display
      document.getElementById("lastUpdate").textContent = 
        `Обновление: ${new Date().toLocaleTimeString()} (${this.currentTime.toFixed(1)}s)`;
    }
  }

  getCurrentTime() {
    return this.currentTime;
  }

  getDuration() {
    return this.duration;
  }

  isPlayingState() {
    return this.isPlaying && !this.isPaused;
  }
}
