const Statistics = {
calculate(rhythmsArray, allScopes = false) {
    const safe = Array.isArray(rhythmsArray) ? rhythmsArray : [];
    if (safe.length === 0) return {};
    
    console.log('[STAT] calculate() rhythms len=', safe.length, 'sample[0]=', safe[0] ? Object.keys(safe[0]) : 'empty');

    const scopes = {
      individual: {},
      paired: {},
      hemisphere: {},
      global: {}
    };

    // Helper to compute stats for a single rhythm across values
    const computeRhythmStats = (values, rhythmKey) => {
      const vals = values.map(r => Number(r?.[rhythmKey] || 0));
      return this.describe(vals);
    };

    // 1. Individual - per channel
    const channelNames = ['O1', 'T3', 'Fp1', 'Fp2', 'T4', 'O2'];
    channelNames.forEach((chName, idx) => {
      if (safe[idx]) {
        const chRhythm = safe[idx];
        scopes.individual[chName] = {
          delta: computeRhythmStats([chRhythm], 'delta'),
          theta: computeRhythmStats([chRhythm], 'theta'),
          alpha: computeRhythmStats([chRhythm], 'alpha'),
          beta: computeRhythmStats([chRhythm], 'beta'),
          gamma: computeRhythmStats([chRhythm], 'gamma'),
          overall: this.describe(Object.values(chRhythm).map(Number).filter(v => v > 0))
        };
      }
    });

    // 2. Paired, Hemisphere, Global via Averaging
    ['paired', 'hemisphere', 'global'].forEach(scopeMode => {
      try {
        const avgGroups = Averaging.apply(safe, scopeMode);
        
        if (scopeMode === 'paired') {
          console.log('[PAIR] avgGroups=', Object.keys(avgGroups));
          if (Object.keys(avgGroups).length === 0) {
            console.warn('[PAIR] Empty avgGroups - fallback');
            avgGroups = {'Fp1-Fp2': {delta:0,theta:0,alpha:0,beta:0,gamma:0}, 'T3-T4': {delta:0,theta:0,alpha:0,beta:0,gamma:0}, 'O1-O2': {delta:0,theta:0,alpha:0,beta:0,gamma:0}};
          }
        }
        
        for (const [groupName, avgRhythm] of Object.entries(avgGroups)) {
          scopes[scopeMode][groupName] = {
            delta: computeRhythmStats([avgRhythm], 'delta'),
            theta: computeRhythmStats([avgRhythm], 'theta'),
            alpha: computeRhythmStats([avgRhythm], 'alpha'),
            beta: computeRhythmStats([avgRhythm], 'beta'),
            gamma: computeRhythmStats([avgRhythm], 'gamma'),
            overall: this.describe(Object.values(avgRhythm).map(Number).filter(v => v > 0))
          };
        }
      } catch (e) {
        console.warn(`Averaging failed for ${scopeMode}:`, e);
      }
    });

    return allScopes ? scopes : scopes.global.Global || {};
  },

  calculateRhythmStats(rhythms, key) {
    const values = rhythms.map(r => Number(r?.[key] || 0));
    return this.describe(values);
  },

  median(values) {
    const arr = [...values].sort((a, b) => a - b);
    const mid = Math.floor(arr.length / 2);
    return arr.length === 0 ? 0 : arr.length % 2 === 0 ? (arr[mid-1] + arr[mid]) / 2 : arr[mid];
  },

  describe(values) {
    const arr = (values || []).map(Number).filter(v => Number.isFinite(v));
    const n = arr.length;
    if (!n) {
      return {
        mean: NaN, stdDev: 0, min: NaN, max: NaN, skewness: 0, kurtosis: 0, cv: 0,
        q25: NaN, q50: NaN, q75: NaN, iqr: 0, normality: "no-data"
      };
    }

    const sorted = [...arr].sort((a, b) => a - b);
    const mean = arr.reduce((a, b) => a + b, 0) / n;
    const min = sorted[0];
    const max = sorted[n - 1];

    let m2 = 0, m3 = 0, m4 = 0;
    for (const x of arr) {
      const d = x - mean;
      const d2 = d * d;
      m2 += d2;
      m3 += d2 * d;
      m4 += d2 * d2;
    }

    const variance = n > 1 ? m2 / (n - 1) : 0;
    const stdDev = Math.sqrt(Math.max(0, variance));
    const skewness = stdDev > 0 ? (m3 / n) / Math.pow(stdDev, 3) : 0;
    const kurtosis = stdDev > 0 ? (m4 / n) / Math.pow(stdDev, 4) - 3 : 0;
    const cv = mean !== 0 ? (stdDev / Math.abs(mean)) * 100 : 0;

    const q25 = this.percentile(sorted, 0.25);
    const q50 = this.percentile(sorted, 0.50);
    const q75 = this.percentile(sorted, 0.75);
    const iqr = q75 - q25;

    const normality = Math.abs(skewness) < 1 && Math.abs(kurtosis) < 1.5 ? "likely-normal" : "non-normal";

    return { mean, stdDev, min, max, skewness, kurtosis, cv, q25, q50, q75, iqr, normality };
  },

  percentile(sorted, p) {
    if (!sorted.length) return 0;
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  },

  calculateDynamicMarkers(rhythms) {
    if (!Array.isArray(rhythms) || rhythms.length < 6) {
      return { tar: 0, br: 0, faFrontal: 0, faT: 0, faCortical: 0 };
    }
    const map = {
      O1: rhythms[0] || {},
      T3: rhythms[1] || {},
      Fp1: rhythms[2] || {},
      Fp2: rhythms[3] || {},
      T4: rhythms[4] || {},
      O2: rhythms[5] || {}
    };
    const globalTheta = Number(map.O1.theta || 0) + Number(map.T3.theta || 0) + Number(map.Fp1.theta || 0) + 
                        Number(map.Fp2.theta || 0) + Number(map.T4.theta || 0) + Number(map.O2.theta || 0);
    const globalAlpha = Number(map.O1.alpha || 0) + Number(map.T3.alpha || 0) + Number(map.Fp1.alpha || 0) + 
                        Number(map.Fp2.alpha || 0) + Number(map.T4.alpha || 0) + Number(map.O2.alpha || 0);
    const globalBeta = Number(map.O1.beta || 0) + Number(map.T3.beta || 0) + Number(map.Fp1.beta || 0) + 
                       Number(map.Fp2.beta || 0) + Number(map.T4.beta || 0) + Number(map.O2.beta || 0);
    const tar = (globalTheta / 6) / Math.max(1e-6, globalAlpha / 6);
    const br = (globalBeta / 6) / Math.max(1e-6, globalAlpha / 6);
    const faFrontal = Number(map.Fp2.alpha || 0) - Number(map.Fp1.alpha || 0);
    const faT = Number(map.T4.alpha || 0) - Number(map.T3.alpha || 0);
    const faCortical = Number(map.O2.alpha || 0) - Number(map.O1.alpha || 0);
    return { tar, br, faFrontal, faT, faCortical };
  }
};
