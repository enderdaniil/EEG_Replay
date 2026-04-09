const MetricsCharts = {
    charts: {},

    init() {
        // Графики ритмов
        const rhythms = [
            { name: 'delta', color: 'var(--delta)', min: 0, max: 50 },
            { name: 'theta', color: 'var(--theta)', min: 0, max: 50 },
            { name: 'alpha', color: 'var(--alpha)', min: 0, max: 50 },
            { name: 'beta', color: 'var(--beta)', min: 0, max: 100 },
            { name: 'gamma', color: 'var(--gamma)', min: 0, max: 100 }
        ];

        rhythms.forEach(r => {
            const canvas = document.getElementById(`chart-${r.name}`);
            if (!canvas) {
                console.warn(`Canvas chart-${r.name} not found, skip`);
                return;
            }
            this.charts[r.name] = new RealtimeChart(`chart-${r.name}`, {
                width: 200,
                height: 80,
                bufferLength: 60,
                minY: r.min,
                maxY: r.max,
                color: r.color,
                fillColor: `${r.color.replace('var(--', 'rgba(').replace(')', ', 0.15)')}`
            });
            this.charts[r.name].start();
        });

        // Статистические метрики
        const kurtCanvas = document.getElementById('chart-kurtosis');
        if (kurtCanvas) {
            this.charts.kurtosis = new RealtimeChart('chart-kurtosis', {
                width: 200, height: 80, bufferLength: 60,
                minY: -3, maxY: 10, color: 'var(--kurtosis)'
            });
            this.charts.kurtosis.start();
        }

        this.charts.cv = new RealtimeChart('chart-cv', {
            width: 200, height: 80, bufferLength: 60,
            minY: 0, maxY: 100, color: 'var(--cv)'
        });

        this.charts.iqr = new RealtimeChart('chart-iqr', {
            width: 200, height: 80, bufferLength: 60,
            minY: 0, maxY: 50, color: 'var(--iqr)'
        });

        this.charts.entropy = new RealtimeChart('chart-entropy', {
            width: 200, height: 80, bufferLength: 60,
            minY: 0, maxY: 8, color: 'var(--entropy)'
        });

        this.charts.asynchrony = new RealtimeChart('chart-asynchrony', {
            width: 200, height: 80, bufferLength: 60,
            minY: -1, maxY: 1, color: '#8b5cf6'
        });

        // Запуск всех
        Object.values(this.charts).forEach(chart => chart.start());
    },

    update(scopeStats, entropy, asynchrony) {
        if (!scopeStats || typeof scopeStats !== 'object') return;
        
        // Handle both single stats object and scope with subgroups
        const stats = Array.isArray(scopeStats) || typeof scopeStats === 'object' && !scopeStats.delta 
            ? Object.values(scopeStats)[0] || {}  // First subgroup or avg later
            : scopeStats;
        
        // Ритмы
        ['delta', 'theta', 'alpha', 'beta', 'gamma'].forEach(rhythm => {
            if (this.charts[rhythm] && stats[rhythm]?.mean !== undefined) {
                this.charts[rhythm].addPoint(stats[rhythm].mean);
            }
        });

        // Статистики from overall
        if (this.charts.kurtosis && stats.overall?.kurtosis !== undefined) {
            this.charts.kurtosis.addPoint(stats.overall.kurtosis);
        }
        if (this.charts.cv && stats.overall?.cv !== undefined) {
            this.charts.cv.addPoint(stats.overall.cv);
        }
        if (this.charts.iqr && stats.overall?.iqr !== undefined) {
            this.charts.iqr.addPoint(stats.overall.iqr);
        }

        // Энтропия (средняя SampEn)
        if (this.charts.entropy && entropy) {
            // Prefer avgSampEn if available, fallback to old format
            let avgEntropy;
            if (entropy.avgSampEn) {
                avgEntropy = Object.values(entropy.avgSampEn).reduce((a, b) => a + b, 0) / Object.keys(entropy.avgSampEn).length || 0;
            } else {
                avgEntropy = Object.values(entropy).reduce((a, b) => a + b, 0) / Object.keys(entropy).length || 0;
            }
            this.charts.entropy.addPoint(avgEntropy);
        }

        // Асимметрия
        if (this.charts.asynchrony && asynchrony) {
            this.charts.asynchrony.addPoint(asynchrony.ai);
        }
    },

    destroy() {
        Object.values(this.charts).forEach(chart => chart.stop());
    }
};

