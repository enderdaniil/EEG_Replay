class BoxPlot {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.options = {
            width: options.width || 300,
            height: options.height || 150,
            bufferLength: options.bufferLength || 100,
            ...options
        };

        this.data = [];
        this.setupCanvas();
    }

    setupCanvas() {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = this.options.width * dpr;
        this.canvas.height = this.options.height * dpr;
        this.canvas.style.width = `${this.options.width}px`;
        this.canvas.style.height = `${this.options.height}px`;
        this.ctx.scale(dpr, dpr);
    }

    quartiles(values) {
        const sorted = [...values].sort((a, b) => a - b);
        const n = sorted.length;

        const q = (p) => {
            const pos = (n - 1) * p;
            const base = Math.floor(pos);
            const rest = pos - base;
            if (base + 1 < n) {
                return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
            }
            return sorted[base];
        };

        return {
            q25: q(0.25),
            q50: q(0.50),
            q75: q(0.75),
            iqr: q(0.75) - q(0.25),
            min: sorted[0],
            max: sorted[sorted.length - 1]
        };
    }

    update(newValues) {
        this.data.push(...newValues);
        if (this.data.length > this.options.bufferLength) {
            this.data = this.data.slice(-this.options.bufferLength);
        }
        this.render();
    }

    render() {
        const { width, height } = this.options;
        const ctx = this.ctx;
        const stats = this.quartiles(this.data);

        ctx.clearRect(0, 0, width, height);

        if (this.data.length < 4) {
            ctx.fillStyle = '#64748b';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Недостаточно данных', width/2, height/2);
            return;
        }

        // Масштабирование
        const padding = 40;
        const plotWidth = width - padding * 2;
        const range = stats.max - stats.min || 1;

        const scale = (val) => padding + ((val - stats.min) / range) * plotWidth;

        // Box plot
        const y = height / 2;
        const boxHeight = 30;

        // Усы
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1;

        // Левый ус
        ctx.beginPath();
        ctx.moveTo(scale(stats.min), y);
        ctx.lineTo(scale(stats.q25), y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(scale(stats.min), y - 10);
        ctx.lineTo(scale(stats.min), y + 10);
        ctx.stroke();

        // Правый ус
        ctx.beginPath();
        ctx.moveTo(scale(stats.q75), y);
        ctx.lineTo(scale(stats.max), y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(scale(stats.max), y - 10);
        ctx.lineTo(scale(stats.max), y + 10);
        ctx.stroke();

        // Коробка
        ctx.fillStyle = 'rgba(59, 130, 246, 0.3)';
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;

        ctx.fillRect(
            scale(stats.q25), y - boxHeight/2,
            scale(stats.q75) - scale(stats.q25), boxHeight
        );
        ctx.strokeRect(
            scale(stats.q25), y - boxHeight/2,
            scale(stats.q75) - scale(stats.q25), boxHeight
        );

        // Медиана
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(scale(stats.q50), y - boxHeight/2);
        ctx.lineTo(scale(stats.q50), y + boxHeight/2);
        ctx.stroke();

        // Подписи
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';

        [
            { val: stats.q25, label: 'Q25' },
            { val: stats.q50, label: 'Q50' },
            { val: stats.q75, label: 'Q75' },
            { val: stats.iqr, label: `IQR: ${stats.iqr.toFixed(1)}` }
        ].forEach(item => {
            const x = item.val === stats.iqr ? width - 30 : scale(item.val);
            ctx.fillText(item.label, x, y + boxHeight/2 + 15);
        });
    }
}

