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
