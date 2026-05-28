// Elementos do DOM
const inputs = {
    voltage: document.getElementById('voltage'),
    frequency: document.getElementById('frequency'),
    resistance: document.getElementById('resistance'),
    inductance: document.getElementById('inductance'),
    capacitance: document.getElementById('capacitance')
};

const displays = {
    voltage: document.getElementById('val-voltage'),
    frequency: document.getElementById('val-frequency'),
    resistance: document.getElementById('val-resistance'),
    inductance: document.getElementById('val-inductance'),
    capacitance: document.getElementById('val-capacitance')
};

const outputs = {
    zr: document.getElementById('out-zr'),
    zl: document.getElementById('out-zl'),
    zc: document.getElementById('out-zc'),
    z: document.getElementById('out-z'),
    i: document.getElementById('out-i')
};

// Canvas e Contexto
const canvas = document.getElementById('phasorCanvas');
const ctx = canvas.getContext('2d');
// Fixar tamanho do canvas em alta resolução para telas retina
const size = 400;
canvas.width = size * 2;
canvas.height = size * 2;
canvas.style.width = `${size}px`;
canvas.style.height = `${size}px`;
ctx.scale(2, 2);

// Variáveis de Estado
let state = {
    V0: 10,
    omega: 100,
    R: 50,
    L: 500e-3,
    C: 100e-6
};

// Cores
const colors = {
    vg: '#ffffff',
    vr: '#ef4444',
    vl: '#3b82f6',
    vc: '#10b981',
    i: '#f59e0b'
};

// Chart.js Instância
let waveChart = null;

// Inicialização
function init() {
    // Adicionar listeners
    for (let key in inputs) {
        inputs[key].addEventListener('input', (e) => {
            updateDisplays();
            updatePhysics();
        });
    }
    
    initChart();
    updateDisplays();
    updatePhysics();
    
    // Iniciar loop de animação
    requestAnimationFrame(animationLoop);
}

function updateDisplays() {
    displays.voltage.innerText = inputs.voltage.value;
    displays.frequency.innerText = inputs.frequency.value;
    displays.resistance.innerText = inputs.resistance.value;
    displays.inductance.innerText = inputs.inductance.value;
    displays.capacitance.innerText = inputs.capacitance.value;
}

let physics = {};

function updatePhysics() {
    // Ler valores
    state.V0 = parseFloat(inputs.voltage.value);
    state.omega = parseFloat(inputs.frequency.value);
    state.R = parseFloat(inputs.resistance.value);
    state.L = parseFloat(inputs.inductance.value) * 1e-3; // mH to H
    state.C = parseFloat(inputs.capacitance.value) * 1e-6; // µF to F

    // Impedâncias
    const ZR = state.R;
    const ZL = state.omega * state.L;
    const ZC = 1 / (state.omega * state.C); // magnitude
    
    const Z_real = ZR;
    const Z_imag = ZL - ZC;
    const Z_mag = Math.sqrt(Z_real*Z_real + Z_imag*Z_imag);
    const Z_phase = Math.atan2(Z_imag, Z_real);

    // Corrente
    const I_mag = state.V0 / Z_mag;
    const I_phase = -Z_phase;

    // Tensões (Magnitudes e Fases)
    physics = {
        vg: { mag: state.V0, phase: 0 },
        i:  { mag: I_mag, phase: I_phase },
        vr: { mag: I_mag * ZR, phase: I_phase },
        vl: { mag: I_mag * ZL, phase: I_phase + Math.PI/2 },
        vc: { mag: I_mag * ZC, phase: I_phase - Math.PI/2 }
    };

    // Atualizar textos na UI
    outputs.zr.innerText = `${ZR.toFixed(1)} Ω`;
    outputs.zl.innerText = `${ZL.toFixed(1)} Ω`;
    outputs.zc.innerText = `-${ZC.toFixed(1)} Ω`;
    outputs.z.innerText = `${Z_mag.toFixed(1)} Ω`;
    outputs.i.innerText = `${I_mag.toFixed(2)} A`;

    updateChart();
}

// Draw Phasor (Seta)
function drawArrow(ctx, fromX, fromY, toX, toY, color) {
    const headlen = 10; // length of head in pixels
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);
    
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
    ctx.lineTo(toX, toY);
    ctx.fillStyle = color;
    ctx.fill();
}

// Loop de animação
let startTime = Date.now();
function animationLoop() {
    const now = Date.now();
    // Tempo simulado para a animação não girar absurdamente rápido (1 rev a cada ~6s)
    const t_anim = (now - startTime) / 1000; 
    const currentPhaseOffset = t_anim * 1.0; // 1 rad/s na visualização

    ctx.clearRect(0, 0, size, size);
    
    const cx = size / 2;
    const cy = size / 2;

    // Desenhar eixos
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, size);
    ctx.moveTo(0, cy);
    ctx.lineTo(size, cy);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Desenhar círculo de V0 (referência visual)
    const maxVoltage = 50; // max slider
    const pixelPerV = (size / 2 - 20) / maxVoltage;

    ctx.beginPath();
    ctx.arc(cx, cy, state.V0 * pixelPerV, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.stroke();

    // Função auxiliar para desenhar um fasor
    const drawPhasor = (mag, phase, color, scale) => {
        // Angulo real desenhado (subtraimos porque no canvas Y cresce para baixo)
        const displayAngle = -(phase + currentPhaseOffset);
        const px = cx + mag * scale * Math.cos(displayAngle);
        const py = cy + mag * scale * Math.sin(displayAngle);
        drawArrow(ctx, cx, cy, px, py, color);
    };

    if (physics.vg) {
        // Escala para corrente para que seja visível
        // Se Vmax = 50, e Imax ~ 5, multiplicamos I por 10 visualmente
        const currentScale = pixelPerV * 10;
        
        // Desenha Fasores de Tensão
        drawPhasor(physics.vr.mag, physics.vr.phase, colors.vr, pixelPerV);
        drawPhasor(physics.vl.mag, physics.vl.phase, colors.vl, pixelPerV);
        drawPhasor(physics.vc.mag, physics.vc.phase, colors.vc, pixelPerV);
        drawPhasor(physics.vg.mag, physics.vg.phase, colors.vg, pixelPerV);
        
        // Desenha Fasor de Corrente
        drawPhasor(physics.i.mag, physics.i.phase, colors.i, currentScale);
    }

    requestAnimationFrame(animationLoop);
}

// Chart.js
function initChart() {
    const ctxChart = document.getElementById('waveChart').getContext('2d');
    
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Inter', sans-serif";

    waveChart = new Chart(ctxChart, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'Vg (V)', borderColor: colors.vg, data: [], yAxisID: 'y', tension: 0.4, pointRadius: 0, borderWidth: 2 },
                { label: 'VR (V)', borderColor: colors.vr, data: [], yAxisID: 'y', tension: 0.4, pointRadius: 0, borderWidth: 2 },
                { label: 'VL (V)', borderColor: colors.vl, data: [], yAxisID: 'y', tension: 0.4, pointRadius: 0, borderWidth: 2 },
                { label: 'VC (V)', borderColor: colors.vc, data: [], yAxisID: 'y', tension: 0.4, pointRadius: 0, borderWidth: 2 },
                { label: 'I (A)', borderColor: colors.i, data: [], yAxisID: 'y1', tension: 0.4, pointRadius: 0, borderWidth: 2, borderDash: [5, 5] }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: {
                    title: { display: true, text: 'Tempo (ms)' },
                    grid: { color: 'rgba(255,255,255,0.1)' }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'Tensão (V)' },
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    suggestedMin: -50,
                    suggestedMax: 50
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: 'Corrente (A)' },
                    grid: { drawOnChartArea: false },
                }
            },
            plugins: {
                legend: { display: false } // Custom legend is in HTML
            }
        }
    });
}

function updateChart() {
    if (!waveChart) return;

    // Gerar 200 pontos para 3 períodos
    const T = (2 * Math.PI) / state.omega;
    const numPoints = 200;
    const maxTime = 3 * T;
    const dt = maxTime / numPoints;

    const labels = [];
    const dVg = [], dVr = [], dVl = [], dVc = [], dI = [];

    for (let i = 0; i <= numPoints; i++) {
        const t = i * dt;
        labels.push((t * 1000).toFixed(1)); // em ms

        // v(t) = mag * cos(omega * t + phase)
        const omega_t = state.omega * t;
        
        dVg.push(physics.vg.mag * Math.cos(omega_t + physics.vg.phase));
        dVr.push(physics.vr.mag * Math.cos(omega_t + physics.vr.phase));
        dVl.push(physics.vl.mag * Math.cos(omega_t + physics.vl.phase));
        dVc.push(physics.vc.mag * Math.cos(omega_t + physics.vc.phase));
        dI.push(physics.i.mag * Math.cos(omega_t + physics.i.phase));
    }

    waveChart.data.labels = labels;
    waveChart.data.datasets[0].data = dVg;
    waveChart.data.datasets[1].data = dVr;
    waveChart.data.datasets[2].data = dVl;
    waveChart.data.datasets[3].data = dVc;
    waveChart.data.datasets[4].data = dI;

    waveChart.update();
}

// Iniciar a aplicação
window.onload = init;
