// Copy SampleEntropy code directly (browser no require)
const SampleEntropy = {
    /**
     * Sample Entropy (Richman & Moorman, 2000)
     * @param {Array} data - временной ряд
     * @param {number} m - длина паттерна (обычно 2)
     * @param {number} r - порог схожести (обычно 0.2 * std)
     * @returns {number} SampEn значение
     */
    calculate(data, m = 2, r = null) {
        const n = data.length;
        if (n < m + 1) return Infinity;
        
        // Стандартное отклонение
        const mean = data.reduce((a, b) => a + b, 0) / n;
        const std = Math.sqrt(
            data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / (n - 1)
        );
        
        if (std === 0) return 0;
        if (r === null) r = 0.2 * std;
        
        // Проверка схожести (без само-совпадений)
        const match = (i, j, length) => {
            for (let k = 0; k < length; k++) {
                if (Math.abs(data[i + k] - data[j + k]) > r) {
                    return false;
                }
            }
            return true;
        };
        
        // Подсчёт совпадений для длины m и m+1
        const countMatches = (length) => {
            let num = 0;
            let den = 0;
            
            for (let i = 0; i <= n - length - 1; i++) {
                let matches = 0;
                for (let j = i + 1; j <= n - length; j++) {
                    if (match(i, j, length)) matches++;
                }
                num += matches;
                den += (n - length - i);
            }
            
            return den > 0 ? num / den : 0;
        };
        
        const Cm = countMatches(m);
        const Cm1 = countMatches(m + 1);
        
        if (Cm === 0 || Cm1 === 0) return Infinity;
        
        return -Math.log(Cm1 / Cm);
    },

    /**
     * Sample Entropy для каждого частотного диапазона
     * @param {Array} spectrum - спектр сигнала
     * @param {Object} freqInfo - информация о частотах
     */
    calculateByBands(spectrum, freqInfo) {
        const bands = {
            delta: { min: 0.5, max: 4 },
            theta: { min: 4, max: 8 },
            alpha: { min: 8, max: 13 },
            beta: { min: 13, max: 30 },
            gamma: { min: 30, max: 62.5 }
        };
        
        const freqStep = freqInfo.frequencyStepHz || 0.244140625;
        const result = {};
        
        for (const [name, band] of Object.entries(bands)) {
            const startIdx = Math.ceil(band.min / freqStep);
            const endIdx = Math.floor(band.max / freqStep);
            const bandData = spectrum.slice(startIdx, endIdx + 1);
            
            result[name] = this.calculate(bandData);
        }
        
        return result;
    }
};

const Entropy = {
  sampleEntropy(data, m = 2, r = null) {
    return SampleEntropy.calculate(data, m, r);
  },

  sampleEntropyByBands(spectrum, freqInfo = {}) {
    return SampleEntropy.calculateByBands(spectrum, freqInfo);
  },
  normalizeToProbability(data) {
    const arr = Array.isArray(data) ? data : [];
    const sum = arr.reduce((a, b) => a + Math.abs(Number(b || 0)), 0);
    if (!arr.length) return [];
    if (sum === 0) return arr.map(() => 1 / arr.length);
    return arr.map((v) => Math.abs(Number(v || 0)) / sum);
  },

  shannon(data, base = 2) {
    const prob = this.normalizeToProbability(data);
    if (!prob.length) return 0;
    let e = 0;
    for (const p of prob) {
      if (p > 1e-8) e -= p * (Math.log(p) / Math.log(base));
    }
    return Number.isFinite(e) ? e : 0;
  },

  spectralByBand(spectrum, band, freqStep = 0.244140625) {
    const arr = Array.isArray(spectrum) ? spectrum : [];
    if (!arr.length || !band) return 0;
    const i1 = Math.max(0, Math.floor((band.min || 0) / freqStep));
    const i2 = Math.min(arr.length - 1, Math.floor((band.max || 0) / freqStep));
    if (i2 < i1) return 0;
    return this.shannon(arr.slice(i1, i2 + 1));
  },

  rhythmEntropy(rh) {
    const vals = [
      Number(rh?.delta || 0),
      Number(rh?.theta || 0),
      Number(rh?.alpha || 0),
      Number(rh?.beta || 0),
      Number(rh?.gamma || 0)
    ].filter((v) => v > 0);
    return vals.length ? this.shannon(vals) : 0;
  }
};

/**
 * Overlay for entropy visualization on headmap
 */
class EntropyOverlay {
    constructor(headMap) {
        this.headMap = headMap;
        this.entropyHistory = {}; // По каналам
        this.maxHistory = 60; // 6 секунд при 10 Гц
        this.channels = ['O1', 'T3', 'Fp1', 'Fp2', 'T4', 'O2']; // API order
    }

    /**
     * Расчёт энтропии из спектра API
     */
    calculateFromSpectrum(spectrumData) {
        const result = {
            shannon: {},
            sampen: {},
            avgSampEn: {}
        };

        const spec = spectrumData?.spectrum || [];
        const freqInfo = {
            frequencyStepHz: spectrumData?.frequencyStepHz || 0.244140625
        };

        spec.forEach((channelSpectrum, idx) => {
            const channelName = this.channels[idx];
            
            // Existing Shannon
            result.shannon[channelName] = Entropy.shannon(channelSpectrum);
            
            // New Sample Entropy by bands
            const bands = Entropy.sampleEntropyByBands(channelSpectrum, freqInfo);
            result.sampen[channelName] = bands;
            
            // Average SampEn across bands (primary value)
            const avgSampEn = Object.values(bands).reduce((a, b) => a + b, 0) / Object.keys(bands).length;
            result.avgSampEn[channelName] = avgSampEn;

            // Save primary avgSampEn to history (for charts/viz)
            if (!this.entropyHistory[channelName]) {
                this.entropyHistory[channelName] = [];
            }
            this.entropyHistory[channelName].push({
                t: Date.now(),
                value: avgSampEn  // Use SampEn avg instead of Shannon
            });

            // Limit history
            if (this.entropyHistory[channelName].length > this.maxHistory) {
                this.entropyHistory[channelName].shift();
            }
        });

        return result;
    }

    /**
     * Обновление визуализации на карте
     */
    update(entropy) {
        for (const [channel, sampenObj] of Object.entries(entropy.avgSampEn || entropy)) {
            const circle = document.getElementById(`ch-${channel}`);
            if (!circle) continue;

            // Нормализация SampEn 0-1 для цвета (adjust max if needed, SampEn typically 0-3+)
            const normalized = Math.min(1, sampenObj / 3);

            // Цвет от синего (низкая) до красного (высокая)
            const hue = 200 - (normalized * 200);
            circle.setAttribute('fill', `hsla(${hue}, 70%, 50%, 0.6)`);

            // Обновление значения под электродом (show avg SampEn)
            const valueText = document.getElementById(`val-${channel}`);
            if (valueText) {
                valueText.textContent = Number(sampenObj).toFixed(2);
            }
        }
    }

    /**
     * Получение данных для графика
     */
    getHistory(channel) {
        return this.entropyHistory[channel] || [];
    }
}

