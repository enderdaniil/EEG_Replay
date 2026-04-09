class RealtimeChart {
    constructor(canvasId, options = {}) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        this.options = {
            width: options.width || 200,
            height: options.height || 80,
            bufferLength: options.bufferLength || 60,
            updateInterval: options.updateInterval || 100,
            minY: options.minY ?? 0,
            maxY: options.maxY ?? 100,
            color: options.color || '#3b82f6',
            fillColor: options.fillColor || 'rgba(59, 130, 246, 0.1)',
            showGrid: options.showGrid ?? true,
            showValue: options.showValue ?? true,
            ...options
        };

        this.data = [];
        this.labels = [];
        this.running = false;

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

    addPoint(value, label = null) {
        this.data.push(value);
        this.labels.push(label || new Date().toLocaleTimeString());

        if (this.data.length > this.options.bufferLength) {
            this.data.shift();
            this.labels.shift();
        }
    }

    render() {
        const { width, height, minY, maxY, color, fillColor, showGrid, showValue } = this.options;
        const ctx = this.ctx;
        const dpr = window.devicePixelRatio || 1;

        ctx.clearRect(0, 0, width, height);

        // Сетка
        if (showGrid) {
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 0.5;
            ctx.setLineDash([4, 4]);

            for (let i = 0; i <= 4; i++) {
                const y = height * (1 - i / 4);
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }
            ctx.setLineDash([]);
        }

        if (this.data.length < 2) return;

        // Масштабирование
        const range = maxY - minY || 1;
        const xStep = width / (this.options.bufferLength - 1);

        // Заполнение
        ctx.beginPath();
        ctx.moveTo(0, height);

        this.data.forEach((value, i) => {
            const x = i * xStep;
            const y = height - ((value - minY) / range) * height;
            ctx.lineTo(x, y);
        });

        ctx.lineTo((this.data.length - 1) * xStep, height);
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();

        // Линия
        ctx.beginPath();
        this.data.forEach((value, i) => {
            const x = i * xStep;
            const y = height - ((value - minY) / range) * height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Текущее значение
        if (showValue) {
            const lastValue = this.data[this.data.length - 1];
            ctx.fillStyle = color;
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(lastValue.toFixed(2), width - 8, 18);
        }
    }

    start() {
        this.running = true;
        this.renderLoop();
    }

    renderLoop() {
        if (!this.running) return;
        this.render();
        requestAnimationFrame(() => this.renderLoop());
    }

    stop() {
        this.running = false;
    }
}

