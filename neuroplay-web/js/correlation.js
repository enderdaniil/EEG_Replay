const Correlation = {
  pearson(x, y) {
    const n = Math.min(x.length, y.length);
    if (!n) return 0;
    const a = x.slice(0, n), b = y.slice(0, n);
    const mx = a.reduce((s,v)=>s+v,0)/n;
    const my = b.reduce((s,v)=>s+v,0)/n;
    let num = 0, dx = 0, dy = 0;
    for (let i=0;i<n;i++) {
      const vx = a[i]-mx, vy = b[i]-my;
      num += vx*vy; dx += vx*vx; dy += vy*vy;
    }
    const den = Math.sqrt(dx*dy);
    return den === 0 ? 0 : num/den;
  },

  bandSlice(spectrumChannel, stepHz, bandName) {
    const [f1, f2] = API.bands[bandName] || API.bands.alpha;
    const i1 = Math.max(0, Math.floor(f1 / stepHz));
    const i2 = Math.max(i1 + 1, Math.floor(f2 / stepHz));
    return spectrumChannel.slice(i1, i2);
  },

matrixFromSpectrum(lastSpectrumData, band = "alpha", mode = "individual") {
    const channels = lastSpectrumData?.spectrum || [];
    const step = Number(lastSpectrumData?.frequencyStepHz || 0.244140625);

    if (!channels.length) return { matrix: [], usedChannels: [] };

    // API order: O1,T3,Fp1,Fp2,T4,O2
    const s = {
      O1: channels[0] || [],
      T3: channels[1] || [],
      Fp1: channels[2] || [],
      Fp2: channels[3] || [],
      T4: channels[4] || [],
      O2: channels[5] || []
    };

    const channelOrder = ['O1', 'T3', 'Fp1', 'Fp2', 'T4', 'O2'];
    const validChannels = channelOrder.filter(ch => s[ch] && s[ch].length > 0);

    if (validChannels.length === 0) return { matrix: [], usedChannels: [] };

    let vectors = [];
    let usedChannels = [];

    if (mode === "individual") {
      vectors = validChannels.map(ch => s[ch]);
      usedChannels = validChannels;
    } else if (mode === "pair") {
      const pairs = [
        { name: 'Fp1-Fp2', chans: ['Fp1', 'Fp2'] },
        { name: 'T3-T4', chans: ['T3', 'T4'] },
        { name: 'O1-O2', chans: ['O1', 'O2'] }
      ];
      for (const pair of pairs) {
        const validPairChans = pair.chans.filter(ch => validChannels.includes(ch));
        if (validPairChans.length > 0) {
          vectors.push(this.avgVec(validPairChans.map(ch => s[ch])));
          usedChannels.push(pair.name);
        }
      }
    } else if (mode === "hemisphere") {
      const hemiGroups = [
        { name: 'Left', chans: ['Fp1', 'T3', 'O1'] },
        { name: 'Right', chans: ['Fp2', 'T4', 'O2'] }
      ];
      for (const group of hemiGroups) {
        const validGroupChans = group.chans.filter(ch => validChannels.includes(ch));
        if (validGroupChans.length > 0) {
          vectors.push(this.avgVec(validGroupChans.map(ch => s[ch])));
          usedChannels.push(group.name);
        }
      }
    } else if (mode === "global") {
      const allValidVecs = validChannels.map(ch => s[ch]);
      if (allValidVecs.length > 0) {
        vectors.push(this.avgVec(allValidVecs));
        usedChannels.push('Global');
      }
    }

    if (vectors.length === 0) return { matrix: [], usedChannels: [] };

    const sliced = vectors.map(v => this.bandSlice(v, step, band));
    const n = sliced.length;
    const matrix = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));

    for (let i = 0; i < n; i++) {
      matrix[i][i] = 1;
      for (let j = i + 1; j < n; j++) {
        const c = this.pearson(sliced[i], sliced[j]);
        matrix[i][j] = c;
        matrix[j][i] = c;
      }
    }
    return { matrix, usedChannels };
  },

  avgVec(vectors) {
    const maxLen = Math.max(...vectors.map(v => v.length), 0);
    const out = new Array(maxLen).fill(0);
    let n = 0;
    for (const v of vectors) {
      if (!v || !v.length) continue;
      n++;
      for (let i = 0; i < maxLen; i++) out[i] += Number(v[i] || 0);
    }
    if (!n) return out;
    for (let i = 0; i < maxLen; i++) out[i] /= n;
    return out;
  },

  toColor(v) {
    const x = Math.max(-1, Math.min(1, Number(v || 0)));
    if (x >= 0) {
      const a = Math.abs(x);
      return `rgba(239,68,68,${a})`;
    }
    return `rgba(59,130,246,${Math.abs(x)})`;
  }
};

/**
 * Overlay for connectivity visualization
 */
class ConnectivityOverlay {
    constructor(headMap) {
        this.headMap = headMap;
        this.connectionLayer = document.getElementById('connectionLines');
        this.threshold = 0.3;
    }

    /**
     * Расчёт корреляции Пирсона из истории ритмов
     */
    calculateCorrelation(rhythmsHistory, rhythm = 'alpha', windowSize = 50) {
        const matrix = [];
        const channels = ['O1', 'T3', 'Fp1', 'Fp2', 'T4', 'O2']; // API order

        const recent = rhythmsHistory.slice(-windowSize);
        const nChannels = channels.length;

        for (let i = 0; i < nChannels; i++) {
            matrix[i] = [];
            for (let j = 0; j < nChannels; j++) {
                if (i === j) {
                    matrix[i][j] = 1;
                } else if (j < i) {
                    matrix[i][j] = matrix[j][i];
                } else {
                    // Data1/2 from recent history per channel
                    const data1 = recent.map(h => Number(h[i]?.[rhythm] || 0));
                    const data2 = recent.map(h => Number(h[j]?.[rhythm] || 0));
                    matrix[i][j] = Correlation.pearson(data1, data2);
                }
            }
        }

        return matrix;
    }

    /**
     * Отрисовка линий связности на карте
     */
    render(matrix) {
        this.connectionLayer.innerHTML = '';
        const positions = this.headMap.positions; // individual positions
        const channels = Object.keys(positions);

        for (let i = 0; i < channels.length; i++) {
            for (let j = i + 1; j < channels.length; j++) {
                const corr = matrix[i][j];
                if (Math.abs(corr) < this.threshold) continue;

                const pos1 = positions[channels[i]];
                const pos2 = positions[channels[j]];

                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('class', 'connection-line');
                line.setAttribute('x1', pos1.x);
                line.setAttribute('y1', pos1.y);
                line.setAttribute('x2', pos2.x);
                line.setAttribute('y2', pos2.y);

                // Цвет: красный = положительная, синий = отрицательная
                const hue = corr > 0 ? 0 : 220;
                const alpha = Math.min(0.9, Math.abs(corr) * 1.2);
                const width = 1 + Math.abs(corr) * 5;

                line.setAttribute('stroke', `hsla(${hue}, 80%, 55%, ${alpha})`);
                line.setAttribute('stroke-width', width);
                line.setAttribute('data-corr', corr.toFixed(3));
                line.setAttribute('data-channels', `${channels[i]}-${channels[j]}`);

                // Tooltip
                line.addEventListener('mouseenter', (e) => {
                    this.showTooltip(e, channels[i], channels[j], corr);
                });

                this.connectionLayer.appendChild(line);
            }
        }
    }

    showTooltip(e, ch1, ch2, corr) {
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.innerHTML = `
            <div class="tooltip-title">${ch1} ↔ ${ch2}</div>
            <div class="tooltip-row">
                <span class="tooltip-label">Корреляция:</span>
                <span class="tooltip-value">${corr > 0 ? '+' : ''}${corr.toFixed(3)}</span>
            </div>
            <div class="tooltip-row">
                <span class="tooltip-label">Интерпретация:</span>
                <span class="tooltip-value">${this.interpret(corr)}</span>
            </div>
        `;
        tooltip.style.position = 'fixed';
        tooltip.style.left = `${e.clientX + 15}px`;
        tooltip.style.top = `${e.clientY + 15}px`;
        tooltip.style.background = '#1e293b';
        tooltip.style.border = '1px solid #334155';
        tooltip.style.color = '#f1f5f9';
        tooltip.style.padding = '8px';
        tooltip.style.borderRadius = '8px';
        tooltip.style.fontSize = '12px';
        tooltip.style.zIndex = '2000';
        document.body.appendChild(tooltip);

        setTimeout(() => tooltip.remove(), 2000);
    }

    interpret(corr) {
        const abs = Math.abs(corr);
        if (abs >= 0.7) return corr > 0 ? '🔴 Сильная синхронизация' : '🔵 Сильная антикорреляция';
        if (abs >= 0.4) return corr > 0 ? '🟡 Умеренная связь' : '🔵 Умеренная обратная связь';
        return '⚪ Слабая связь';
    }
}

