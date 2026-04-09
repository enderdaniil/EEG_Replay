const Normalization = {
  minMax(values) {
    const arr = values.map(Number);
    const min = Math.min(...arr), max = Math.max(...arr);
    if (max === min) return arr.map(() => 0);
    return arr.map(v => (v - min) / (max - min));
  },

  zScore(values) {
    const arr = values.map(Number);
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, arr.length - 1);
    const std = Math.sqrt(variance) || 1;
    return arr.map(v => (v - mean) / std);
  },

  byBandPower(channelRhythm) {
    const keys = ["delta", "theta", "alpha", "beta", "gamma"];
    const sum = keys.reduce((s, k) => s + Number(channelRhythm[k] || 0), 0) || 1;
    const out = {};
    for (const k of keys) out[k] = Number(channelRhythm[k] || 0) / sum;
    return out;
  },

  baselineSubtract(current, baseline) {
    return current.map((v, i) => Number(v) - Number((baseline || [])[i] || 0));
  },

  relativePercent(current, baseline) {
    return current.map((v, i) => {
      const b = Number((baseline || [])[i] || 0);
      if (b === 0) return 0;
      return ((Number(v) - b) / b) * 100;
    });
  }
};
