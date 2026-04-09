/**
 * Overlay for hemisphere asymmetry visualization
 */
class AsynchronyOverlay {
    constructor(headMap) {
        this.headMap = headMap;
        this.leftChannels = ['Fp1', 'T3', 'O1'];
        this.rightChannels = ['Fp2', 'T4', 'O2'];
        this.aiHistory = [];
        this.maxHistory = 60;
    }

    /**
     * Расчёт индекса асимметрии
     * AI = (R - L) / (R + L) ∈ [-1, +1]
     */
    calculateAsymmetryIndex(rhythmsData, rhythm = 'alpha') {
        // API order: O1(0), T3(1), Fp1(2), Fp2(3), T4(4), O2(5)
        const left = this.leftChannels.map(ch => {
            const idx = ['O1', 'T3', 'Fp1', 'Fp2', 'T4', 'O2'].indexOf(ch);
            return rhythmsData[idx]?.[rhythm] || 0;
        });

        const right = this.rightChannels.map(ch => {
            const idx = ['O1', 'T3', 'Fp1', 'Fp2', 'T4', 'O2'].indexOf(ch);
            return rhythmsData[idx]?.[rhythm] || 0;
        });

        const L = left.reduce((a, b) => a + b, 0) / left.length;
        const R = right.reduce((a, b) => a + b, 0) / right.length;

        const sum = R + L;
        if (sum === 0) return { ai: 0, left: L, right: R };

        const ai = (R - L) / sum;

        // Сохраняем историю
        this.aiHistory.push({
            t: Date.now(),
            value: ai,
            rhythm
        });

        if (this.aiHistory.length > this.maxHistory) {
            this.aiHistory.shift();
        }

        return { ai, left: L, right: R };
    }

    /**
     * Обновление визуализации
     */
    update(asymmetryData) {
        // Подсветка электродов по полушариям
        this.leftChannels.forEach(ch => {
            const circle = document.getElementById(`ch-${ch}`);
            if (circle) {
                const intensity = Math.min(1, Math.abs(asymmetryData.ai) * 2);
                circle.setAttribute('stroke', asymmetryData.ai < 0 ? 
                    `rgba(59, 130, 246, ${0.5 + intensity * 0.5})` : 
                    'var(--primary)');
            }
        });

        this.rightChannels.forEach(ch => {
            const circle = document.getElementById(`ch-${ch}`);
            if (circle) {
                const intensity = Math.min(1, Math.abs(asymmetryData.ai) * 2);
                circle.setAttribute('stroke', asymmetryData.ai > 0 ? 
                    `rgba(239, 68, 68, ${0.5 + intensity * 0.5})` : 
                    'var(--primary)');
            }
        });

        // Обновление панели асимметрии
        this.updatePanel(asymmetryData);
    }

    updatePanel(data) {
        const panel = document.getElementById('asynchrony-panel');
        if (!panel) return;

        const arrow = data.ai > 0 ? '→' : '←';
        const direction = data.ai > 0 ? 'Правое' : 'Левое';
        const abs = Math.abs(data.ai);

        let interpretation = 'Симметричная активность';
        if (abs >= 0.5) interpretation = `Выраженное доминирование ${direction.toLowerCase()}`;
        else if (abs >= 0.3) interpretation = `Умеренное доминирование ${direction.toLowerCase()}`;
        else if (abs >= 0.1) interpretation = `Слабое доминирование ${direction.toLowerCase()}`;

        panel.innerHTML = `
            <h3>🧩 Асимметрия полушарий</h3>
            <div class="asymmetry-display">
                <div class="asymmetry-value">${abs.toFixed(2)}</div>
                <div class="asymmetry-arrow">${arrow}</div>
                <div class="asymmetry-label">${direction} полушарие</div>
                <div class="asymmetry-desc">${interpretation}</div>
                <div class="asymmetry-details">
                    <span>L: ${data.left.toFixed(2)}</span>
                    <span>R: ${data.right.toFixed(2)}</span>
                </div>
            </div>
            <canvas class="asymmetry-chart" id="chart-asynchrony" width="100%" height="80"></canvas>
            <div class="asymmetry-by-rhythm">
                <div class="rhythm-item">
                    <span class="rhythm-label" style="color: var(--delta)">Δ Delta</span>
                    <span class="rhythm-value" id="ai-delta">--</span>
                </div>
                <div class="rhythm-item">
                    <span class="rhythm-label" style="color: var(--theta)">Θ Theta</span>
                    <span class="rhythm-value" id="ai-theta">--</span>
                </div>
                <div class="rhythm-item">
                    <span class="rhythm-label" style="color: var(--alpha)">α Alpha</span>
                    <span class="rhythm-value" id="ai-alpha">--</span>
                </div>
                <div class="rhythm-item">
                    <span class="rhythm-label" style="color: var(--beta)">β Beta</span>
                    <span class="rhythm-value" id="ai-beta">--</span>
                </div>
                <div class="rhythm-item">
                    <span class="rhythm-label" style="color: var(--gamma)">γ Gamma</span>
                    <span class="rhythm-value" id="ai-gamma">--</span>
                </div>
            </div>
        `;
    }

    getHistory() {
        return this.aiHistory;
    }
}

