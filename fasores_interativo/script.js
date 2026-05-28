// Elementos do DOM
const inputs = {
    voltage: document.getElementById('voltage'),
    frequency: document.getElementById('frequency'),
    resistance: document.getElementById('resistance'),
    inductance: document.getElementById('inductance'),
    capacitance: document.getElementById('capacitance')
};

const toggles = {
    r: document.getElementById('toggle-r'),
    l: document.getElementById('toggle-l'),
    c: document.getElementById('toggle-c')
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

const legendItems = document.querySelectorAll('.leg-item');

// Canvas e Contexto
const canvas = document.getElementById('phasorCanvas');
const ctx = canvas.getContext('2d');
const size = 400;
canvas.width = size * 2;
canvas.height = size * 2;
canvas.style.width = `${size}px`;
canvas.style.height = `${size}px`;
ctx.scale(2, 2);

// Variáveis de Estado Físico
let state = {
    V0: 10,
    f: 1000,
    omega: 2 * Math.PI * 1000,
    R: 1000,
    L: 1,
    C: 1e-6,
    activeR: true,
    activeL: true,
    activeC: true
};

// Cores
const colors = {
    vg: '#ffffff',
    vr: '#ef4444',
    vl: '#3b82f6',
    vc: '#10b981'
};

// Chart.js Instância
let waveChart = null;
let visibleWaves = [true, true, true, true]; // Vg, VR, VL, VC

// Funções Auxiliares
function logScale(val, minVal, maxVal) {
    if (val <= 0) return minVal;
    if (val >= 100) return maxVal;
    const minV = Math.log(minVal);
    const maxV = Math.log(maxVal);
    return Math.exp(minV + ((maxV - minV) / 100) * val);
}

function formatFreq(f) {
    return f >= 1000 ? `${(f / 1000).toFixed(1)} kHz` : `${f.toFixed(1)} Hz`;
}
function formatRes(r) {
    return r >= 1000 ? `${(r / 1000).toFixed(2)} kΩ` : `${r.toFixed(0)} Ω`;
}
function formatInd(l) {
    return l < 1 ? `${(l * 1000).toFixed(0)} mH` : `${l.toFixed(2)} H`;
}
function formatCap(c) {
    return c < 1e-6 ? `${(c * 1e9).toFixed(1)} nF` : `${(c * 1e6).toFixed(2)} µF`;
}
function formatTime(t) {
    if (t < 1e-3) return `${(t * 1e6).toFixed(1)} µs`;
    if (t < 1) return `${(t * 1e3).toFixed(1)} ms`;
    return `${t.toFixed(2)} s`;
}

// Inicialização
function init() {
    // Escutar sliders
    for (let key in inputs) {
        inputs[key].addEventListener('input', updateAll);
    }
    // Escutar toggles
    for (let key in toggles) {
        toggles[key].addEventListener('change', updateAll);
    }
    // Escutar Legenda
    legendItems.forEach(item => {
        item.addEventListener('click', () => {
            const index = parseInt(item.getAttribute('data-index'));
            visibleWaves[index] = !visibleWaves[index];
            if (visibleWaves[index]) {
                item.classList.remove('hidden');
                waveChart.setDatasetVisibility(index, true);
            } else {
                item.classList.add('hidden');
                waveChart.setDatasetVisibility(index, false);
            }
            waveChart.update();
        });
    });
    
    initChart();
    updateAll();
    requestAnimationFrame(animationLoop);
}

let physics = {};

function updateAll() {
    // 1. Ler Toggles
    state.activeR = toggles.r.checked;
    state.activeL = toggles.l.checked;
    state.activeC = toggles.c.checked;

    inputs.resistance.disabled = !state.activeR;
    inputs.inductance.disabled = !state.activeL;
    inputs.capacitance.disabled = !state.activeC;

    // 2. Ler e Mapear Sliders
    state.V0 = parseFloat(inputs.voltage.value); // Linear 0-10
    const val_f = parseFloat(inputs.frequency.value); // 0-100
    const val_r = parseFloat(inputs.resistance.value); // 0-100
    const val_l = parseFloat(inputs.inductance.value); // 0-100
    const val_c = parseFloat(inputs.capacitance.value); // 0-100

    state.f = logScale(val_f, 1, 100000); // 1 Hz a 100 kHz
    state.omega = 2 * Math.PI * state.f;
    state.R = logScale(val_r, 150, 5000); // 150 a 5k
    state.L = logScale(val_l, 0.1, 20); // 100mH a 20H
    state.C = logScale(val_c, 4.7e-9, 4.7e-6); // 4.7nF a 4.7µF

    // 3. Atualizar Displays
    displays.voltage.innerText = `${state.V0.toFixed(1)} V`;
    displays.frequency.innerText = formatFreq(state.f);
    displays.resistance.innerText = state.activeR ? formatRes(state.R) : "Desligado";
    displays.inductance.innerText = state.activeL ? formatInd(state.L) : "Desligado";
    displays.capacitance.innerText = state.activeC ? formatCap(state.C) : "Desligado";

    // 4. Física do Circuito
    const ZR = state.activeR ? state.R : 0;
    const ZL = state.activeL ? state.omega * state.L : 0;
    // Se capacitância estiver desligada (fio), a impedância é 0.
    const ZC = state.activeC ? 1 / (state.omega * state.C) : 0; 
    
    const Z_real = ZR;
    const Z_imag = ZL - ZC;
    const Z_mag = Math.sqrt(Z_real*Z_real + Z_imag*Z_imag);
    const Z_phase = Math.atan2(Z_imag, Z_real);

    // Como VR é a referência, a corrente I tem fase 0.
    const I_mag = Z_mag === 0 ? 0 : state.V0 / Z_mag;
    
    physics = {
        // VR está em fase com I (fase = 0)
        vr: { mag: I_mag * ZR, phase: 0 },
        // VL adianta a corrente em 90 graus
        vl: { mag: I_mag * ZL, phase: Math.PI/2 },
        // VC atrasa a corrente em 90 graus
        vc: { mag: I_mag * ZC, phase: -Math.PI/2 },
        // Vg (fonte) = I * Z. Portanto a fase de Vg é Z_phase.
        vg: { mag: state.V0, phase: Z_phase }
    };

    // 5. Textos de Saída
    outputs.zr.innerText = `${formatRes(ZR)}`;
    outputs.zl.innerText = `${formatRes(ZL)}`;
    outputs.zc.innerText = `-${formatRes(ZC)}`;
    outputs.z.innerText = `${formatRes(Z_mag)}`;
    // Se Z_mag = 0, a corrente teoricamente é infinita. Tratar.
    if (Z_mag === 0) {
        outputs.i.innerText = `Curto!`;
    } else {
        const i_ma = I_mag * 1000;
        outputs.i.innerText = i_ma >= 1000 ? `${I_mag.toFixed(2)} A` : `${i_ma.toFixed(1)} mA`;
    }

    updateChart();
}

function drawArrow(ctx, fromX, fromY, toX, toY, color) {
    const headlen = 10; 
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

let startTime = Date.now();
function animationLoop() {
    const now = Date.now();
    const t_anim = (now - startTime) / 1000; 
    const currentPhaseOffset = t_anim * 1.0; 

    ctx.clearRect(0, 0, size, size);
    
    const cx = size / 2;
    const cy = size / 2;

    // Eixos
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, size);
    ctx.moveTo(0, cy);
    ctx.lineTo(size, cy);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Círculo de V0
    const maxVoltage = 10; 
    const pixelPerV = (size / 2 - 20) / maxVoltage;

    ctx.beginPath();
    ctx.arc(cx, cy, state.V0 * pixelPerV, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.stroke();

    const drawPhasor = (mag, phase, color, scale) => {
        if (mag < 0.01) return; // Não desenhar setas de tamanho 0
        const displayAngle = -(phase + currentPhaseOffset);
        const px = cx + mag * scale * Math.cos(displayAngle);
        const py = cy + mag * scale * Math.sin(displayAngle);
        drawArrow(ctx, cx, cy, px, py, color);
    };

    if (physics.vg) {
        if (state.activeR) drawPhasor(physics.vr.mag, physics.vr.phase, colors.vr, pixelPerV);
        if (state.activeL) drawPhasor(physics.vl.mag, physics.vl.phase, colors.vl, pixelPerV);
        if (state.activeC) drawPhasor(physics.vc.mag, physics.vc.phase, colors.vc, pixelPerV);
        drawPhasor(physics.vg.mag, physics.vg.phase, colors.vg, pixelPerV);
    }

    requestAnimationFrame(animationLoop);
}

function initChart() {
    const ctxChart = document.getElementById('waveChart').getContext('2d');
    
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Inter', sans-serif";

    waveChart = new Chart(ctxChart, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: 'Vg', borderColor: colors.vg, data: [], tension: 0.4, pointRadius: 0, borderWidth: 2 },
                { label: 'VR', borderColor: colors.vr, data: [], tension: 0.4, pointRadius: 0, borderWidth: 2 },
                { label: 'VL', borderColor: colors.vl, data: [], tension: 0.4, pointRadius: 0, borderWidth: 2 },
                { label: 'VC', borderColor: colors.vc, data: [], tension: 0.4, pointRadius: 0, borderWidth: 2 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: {
                    title: { display: true, text: 'Tempo' },
                    grid: { color: 'rgba(255,255,255,0.1)' }
                },
                y: {
                    type: 'linear',
                    display: true,
                    title: { display: true, text: 'Tensão (V)' },
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    suggestedMin: -10,
                    suggestedMax: 10
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.parsed.y.toFixed(2)} V`;
                        }
                    }
                }
            }
        }
    });
}

function updateChart() {
    if (!waveChart) return;

    // Gerar pontos para 3 períodos
    const T = 1 / state.f;
    const numPoints = 200;
    const maxTime = 3 * T;
    const dt = maxTime / numPoints;

    const labels = [];
    const dVg = [], dVr = [], dVl = [], dVc = [];

    for (let i = 0; i <= numPoints; i++) {
        const t = i * dt;
        labels.push(formatTime(t));

        const omega_t = state.omega * t;
        
        dVg.push(physics.vg.mag * Math.cos(omega_t + physics.vg.phase));
        
        // Se desligado, a tensão é 0
        dVr.push(state.activeR ? physics.vr.mag * Math.cos(omega_t + physics.vr.phase) : 0);
        dVl.push(state.activeL ? physics.vl.mag * Math.cos(omega_t + physics.vl.phase) : 0);
        dVc.push(state.activeC ? physics.vc.mag * Math.cos(omega_t + physics.vc.phase) : 0);
    }

    waveChart.data.labels = labels;
    waveChart.data.datasets[0].data = dVg;
    waveChart.data.datasets[1].data = dVr;
    waveChart.data.datasets[2].data = dVl;
    waveChart.data.datasets[3].data = dVc;

    waveChart.update();
}

window.onload = init;
