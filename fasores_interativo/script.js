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

const radioSource = document.querySelectorAll('input[name="sourceType"]');

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
const phasorOverlay = document.getElementById('phasor-overlay');

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
    activeC: true,
    sourceType: 'sine'
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
    for (let key in inputs) {
        inputs[key].addEventListener('input', updateAll);
    }
    for (let key in toggles) {
        toggles[key].addEventListener('change', updateAll);
    }
    radioSource.forEach(radio => {
        radio.addEventListener('change', updateAll);
    });
    
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
    // 1. Ler Inputs
    state.activeR = toggles.r.checked;
    state.activeL = toggles.l.checked;
    state.activeC = toggles.c.checked;

    inputs.resistance.disabled = !state.activeR;
    inputs.inductance.disabled = !state.activeL;
    inputs.capacitance.disabled = !state.activeC;
    
    radioSource.forEach(radio => {
        if (radio.checked) state.sourceType = radio.value;
    });

    state.V0 = parseFloat(inputs.voltage.value); 
    const val_f = parseFloat(inputs.frequency.value); 
    const val_r = parseFloat(inputs.resistance.value); 
    const val_l = parseFloat(inputs.inductance.value); 
    const val_c = parseFloat(inputs.capacitance.value); 

    state.f = logScale(val_f, 1, 100000); 
    state.omega = 2 * Math.PI * state.f;
    state.R = logScale(val_r, 150, 5000); 
    state.L = logScale(val_l, 0.1, 20); 
    state.C = logScale(val_c, 4.7e-9, 4.7e-6); 

    // 2. Atualizar Displays
    displays.voltage.innerText = `${state.V0.toFixed(1)} V`;
    displays.frequency.innerText = formatFreq(state.f);
    displays.resistance.innerText = state.activeR ? formatRes(state.R) : "Desligado";
    displays.inductance.innerText = state.activeL ? formatInd(state.L) : "Desligado";
    displays.capacitance.innerText = state.activeC ? formatCap(state.C) : "Desligado";

    // 3. Física de Regime Permanente (para Fasores e UI)
    const ZR = state.activeR ? state.R : 0;
    const ZL = state.activeL ? state.omega * state.L : 0;
    const ZC = state.activeC ? 1 / (state.omega * state.C) : 0; 
    
    const Z_real = ZR;
    const Z_imag = ZL - ZC;
    const Z_mag = Math.sqrt(Z_real*Z_real + Z_imag*Z_imag);
    const Z_phase = Math.atan2(Z_imag, Z_real);

    const I_mag = Z_mag === 0 ? 0 : state.V0 / Z_mag;
    
    physics = {
        vr: { mag: I_mag * ZR, phase: 0 },
        vl: { mag: I_mag * ZL, phase: Math.PI/2 },
        vc: { mag: I_mag * ZC, phase: -Math.PI/2 },
        vg: { mag: state.V0, phase: Z_phase }
    };

    outputs.zr.innerText = `${formatRes(ZR)}`;
    outputs.zl.innerText = `${formatRes(ZL)}`;
    outputs.zc.innerText = `-${formatRes(ZC)}`;
    outputs.z.innerText = `${formatRes(Z_mag)}`;
    if (Z_mag === 0) {
        outputs.i.innerText = `Curto!`;
    } else {
        const i_ma = I_mag * 1000;
        outputs.i.innerText = i_ma >= 1000 ? `${I_mag.toFixed(2)} A` : `${i_ma.toFixed(1)} mA`;
    }

    if (state.sourceType === 'square') {
        phasorOverlay.style.display = 'flex';
    } else {
        phasorOverlay.style.display = 'none';
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

// Loop de animação (Apenas para desenhar os fasores)
function animationLoop() {
    ctx.clearRect(0, 0, size, size);
    
    const cx = size / 2;
    const cy = size / 2;

    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, size);
    ctx.moveTo(0, cy);
    ctx.lineTo(size, cy);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const maxVoltage = 10; 
    const pixelPerV = (size / 2 - 20) / maxVoltage;

    ctx.beginPath();
    ctx.arc(cx, cy, state.V0 * pixelPerV, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.stroke();

    const drawPhasor = (mag, phase, color, scale) => {
        if (mag < 0.01) return;
        // Removido a rotação (currentPhaseOffset = 0)
        const displayAngle = -phase;
        const px = cx + mag * scale * Math.cos(displayAngle);
        const py = cy + mag * scale * Math.sin(displayAngle);
        drawArrow(ctx, cx, cy, px, py, color);
    };

    if (physics.vg && state.sourceType === 'sine') {
        if (state.activeR) drawPhasor(physics.vr.mag, physics.vr.phase, colors.vr, pixelPerV);
        if (state.activeL) drawPhasor(physics.vl.mag, physics.vl.phase, colors.vl, pixelPerV);
        if (state.activeC) drawPhasor(physics.vc.mag, physics.vc.phase, colors.vc, pixelPerV);
        drawPhasor(physics.vg.mag, physics.vg.phase, colors.vg, pixelPerV);
    }

    requestAnimationFrame(animationLoop);
}

// Função para calcular a resposta transiente a um degrau de tensão
function getStepResponse(t, V_step, i0, Vc0) {
    const R = state.activeR ? state.R : 0.001; // Evita divisão por zero
    const L = state.L;
    const C = state.C;
    
    let i = 0, Vc = 0, Vr = 0, Vl = 0;

    if (!state.activeL && !state.activeC) { // Só Resistor
        i = V_step / R;
        Vr = V_step;
        Vc = 0;
        Vl = 0;
    } 
    else if (!state.activeL && state.activeC) { // RC
        const tau = R * C;
        Vc = V_step + (Vc0 - V_step) * Math.exp(-t / tau);
        i = ((V_step - Vc0) / R) * Math.exp(-t / tau);
        Vr = i * R;
        Vl = 0;
    } 
    else if (state.activeL && !state.activeC) { // RL
        const tau = L / R;
        i = (V_step / R) + (i0 - (V_step / R)) * Math.exp(-t / tau);
        Vr = i * R;
        Vc = 0;
        Vl = V_step - Vr;
    } 
    else { // RLC
        const alpha = R / (2 * L);
        const w0 = 1 / Math.sqrt(L * C);
        const y0 = Vc0 - V_step;
        const dy0 = i0 / C;

        if (alpha > w0) { // Superamortecido
            const s1 = -alpha + Math.sqrt(alpha*alpha - w0*w0);
            const s2 = -alpha - Math.sqrt(alpha*alpha - w0*w0);
            const A1 = (dy0 - s2 * y0) / (s1 - s2);
            const A2 = y0 - A1;
            Vc = V_step + A1 * Math.exp(s1 * t) + A2 * Math.exp(s2 * t);
            i = C * (A1 * s1 * Math.exp(s1 * t) + A2 * s2 * Math.exp(s2 * t));
        } 
        else if (Math.abs(alpha - w0) < 1e-6) { // Criticamente amortecido
            const A1 = y0;
            const A2 = dy0 + alpha * y0;
            Vc = V_step + (A1 + A2 * t) * Math.exp(-alpha * t);
            i = C * (A2 * Math.exp(-alpha * t) - alpha * (A1 + A2 * t) * Math.exp(-alpha * t));
        } 
        else { // Subamortecido
            const wd = Math.sqrt(w0*w0 - alpha*alpha);
            const B1 = y0;
            const B2 = (dy0 + alpha * B1) / wd;
            Vc = V_step + Math.exp(-alpha * t) * (B1 * Math.cos(wd * t) + B2 * Math.sin(wd * t));
            i = C * Math.exp(-alpha * t) * ((-alpha * B1 + wd * B2) * Math.cos(wd * t) - (alpha * B2 + wd * B1) * Math.sin(wd * t));
        }
        Vr = i * R;
        Vl = V_step - Vr - Vc;
    }
    
    return { i, Vc, Vr, Vl };
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

    const T = 1 / state.f;
    const numPoints = 200;
    const maxTime = 3 * T;
    const dt = maxTime / numPoints;

    const labels = [];
    const dVg = [], dVr = [], dVl = [], dVc = [];

    if (state.sourceType === 'sine') {
        for (let j = 0; j <= numPoints; j++) {
            const t = j * dt;
            labels.push(formatTime(t));
            const omega_t = state.omega * t;
            dVg.push(physics.vg.mag * Math.cos(omega_t + physics.vg.phase));
            dVr.push(state.activeR ? physics.vr.mag * Math.cos(omega_t + physics.vr.phase) : 0);
            dVl.push(state.activeL ? physics.vl.mag * Math.cos(omega_t + physics.vl.phase) : 0);
            dVc.push(state.activeC ? physics.vc.mag * Math.cos(omega_t + physics.vc.phase) : 0);
        }
        waveChart.data.datasets.forEach(ds => ds.stepped = false);
    } else {
        // Lógica de Onda Quadrada
        const T_half = T / 2;
        let boundaries = [];
        let current_i0 = 0;
        let current_Vc0 = 0;
        let v_current = state.V0; // Inicia ligado

        // Pre-calcular os limites de cada meio-ciclo para condições iniciais
        for(let k = 0; k <= 6; k++) {
            boundaries.push({
                t_start: k * T_half,
                i0: current_i0,
                Vc0: current_Vc0,
                V_step: v_current
            });
            let res = getStepResponse(T_half, v_current, current_i0, current_Vc0);
            current_i0 = res.i;
            current_Vc0 = res.Vc;
            v_current = v_current === state.V0 ? 0 : state.V0;
        }

        for (let j = 0; j <= numPoints; j++) {
            const t = j * dt;
            labels.push(formatTime(t));

            let k = Math.floor(t / T_half);
            if (k > 6) k = 6;
            
            let local_t = t - boundaries[k].t_start;
            let res = getStepResponse(local_t, boundaries[k].V_step, boundaries[k].i0, boundaries[k].Vc0);
            
            dVg.push(boundaries[k].V_step);
            dVr.push(state.activeR ? res.Vr : 0);
            dVl.push(state.activeL ? res.Vl : 0);
            dVc.push(state.activeC ? res.Vc : 0);
        }
        // Desligar interpolação suave na fonte para a onda quadrada ficar reta
        waveChart.data.datasets[0].stepped = true;
    }

    waveChart.data.labels = labels;
    waveChart.data.datasets[0].data = dVg;
    waveChart.data.datasets[1].data = dVr;
    waveChart.data.datasets[2].data = dVl;
    waveChart.data.datasets[3].data = dVc;

    waveChart.update();
}

window.onload = init;
