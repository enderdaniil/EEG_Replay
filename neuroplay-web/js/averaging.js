const Averaging = {
  // input: rhythms array ordered by API channels6 => [O1,T3,Fp1,Fp2,T4,O2]
  // output map by visualization node names
  apply(rhythms, mode = "individual") {
    if (!Array.isArray(rhythms) || rhythms.length < 6) return {};

    const map = {
      O1: rhythms[0], T3: rhythms[1], Fp1: rhythms[2],
      Fp2: rhythms[3], T4: rhythms[4], O2: rhythms[5]
    };

    if (mode === "individual") {
      return map;
    }

    if (mode === "pair") {
      return {
        "Fp1-Fp2": this.avg([map.Fp1, map.Fp2]),
        "T3-T4": this.avg([map.T3, map.T4]),
        "O1-O2": this.avg([map.O1, map.O2])
      };
    }

    if (mode === "hemisphere") {
      return {
        Left: this.avg([map.Fp1, map.T3, map.O1]),
        Right: this.avg([map.Fp2, map.T4, map.O2])
      };
    }

    if (mode === "global") {
      return { Global: this.avg([map.Fp1, map.Fp2, map.T3, map.T4, map.O1, map.O2]) };
    }

    return map;
  },

  avg(items) {
    const keys = ["alpha", "beta", "theta", "delta", "gamma"];
    const out = { alpha: 0, beta: 0, theta: 0, delta: 0, gamma: 0 };
    let n = 0;
    for (const it of items) {
      if (!it) continue;
      n++;
      for (const k of keys) out[k] += Number(it[k] || 0);
    }
    if (!n) return out;
    for (const k of keys) out[k] /= n;
    return out;
  }
};
