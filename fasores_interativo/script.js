// Elementos do DOM
const inputs = {
    voltage: { range: document.getElementById('voltage'), num: document.getElementById('num-voltage') },
    frequency: { range: document.getElementById('frequency'), num: document.getElementById('num-frequency') },
    resistance: { range: document.getElementById('resistance'), num: document.getElementById('num-resistance') },
    inductance: { range: document.getElementById('inductance'), num: document.getElementById('num-inductance') },
    capacitance: { range: document.getElementById('capacitance'), num: document.getElementById('num-capacitance') }
};

const toggles = {
    r: document.getElementById('toggle-r'),
    l: document.getElementById('toggle-l'),
    c: document.getElementById('toggle-c')
};

const dutyInput = document.getElementById('dutyCycle');
const dutyDisplay = document.getElementById('val-duty');
const dutyContainer = document.getElementById('duty-cycle-container');

const radioSource = document.querySelectorAll('input[name="sourceType"]');
const unitButtons = document.querySelectorAll('.unit-btn');

const outputs = {
    zr: document.getElementById('out-zr'),
    zl: document.getElementById('out-zl'),
    zc: document.getElementById('out-zc'),
    z: document.getElementById('out-z'),
    i: document.getElementById('out-i'),
    fc: document.getElementById('out-fc')
};

const legendItems = document.querySelectorAll('.leg-item');
const phasorOverlay = document.getElementById('phasor-overlay');
const themeToggle = document.getElementById('theme-toggle');

const canvas = document.getElementById('phasorCanvas');
const ctx = canvas.getContext('2d');
const size = 400;
canvas.width = size * 2;
canvas.height = size * 2;
canvas.style.width = `${size}px`;
canvas.style.height = `${size}px`;
ctx.scale(2, 2);

// Limites Globais
const bounds = {
    voltage: { min: 0, max: 50, log: false },
    frequency: { min: 1, max: 1e6, log: true },
    resistance: { min: 1, max: 10e6, log: true },
    inductance: { min: 1e-3, max: 20, log: true },
    capacitance: { min: 1e-9, max: 100e-6, log: true }
};

// Variáveis de Estado Físico
let state = {
    V0: 10,
    f: 1000,
    omega: 2 * Math.PI * 1000,
    R: 1000,
    L: 0.1,
    C: 1e-6,
    activeR: true,
    activeL: true,
    activeC: true,
    sourceType: 'sine',
    duty: 50
};

const colors = { vg: '#0f172a', vr: '#dc2626', vl: '#2563eb', vc: '#16a34a' };
let waveChart = null;
let visibleWaves = [true, true, true, true];

// Funções Matemáticas para Escalas
function logScale(sliderPos, minVal, maxVal) {
    if (sliderPos <= 0) return minVal;
    if (sliderPos >= 100) return maxVal;
    const minV = Math.log(minVal);
    const maxV = Math.log(maxVal);
    return Math.exp(minV + ((maxV - minV) / 100) * sliderPos);
}

function reverseLogScale(val, minVal, maxVal) {
    if (val <= minVal) return 0;
    if (val >= maxVal) return 100;
    const minV = Math.log(minVal);
    const maxV = Math.log(maxVal);
    return 100 * (Math.log(val) - minV) / (maxV - minV);
}

// Funções de formatação de exibição
function formatFreq(f) {
    if (f >= 1e6) return `${(f / 1e6).toFixed(2)} MHz`;
    if (f >= 1e3) return `${(f / 1e3).toFixed(1)} kHz`;
    return `${f.toFixed(1)} Hz`;
}
function formatRes(r) {
    if (r >= 1e6) return `${(r / 1e6).toFixed(2)} MΩ`;
    if (r >= 1e3) return `${(r / 1e3).toFixed(2)} kΩ`;
    return `${r.toFixed(1)} Ω`;
}
function formatInd(l) {
    return l < 1 ? `${(l * 1000).toFixed(1)} mH` : `${l.toFixed(2)} H`;
}
function formatCap(c) {
    return c < 1e-6 ? `${(c * 1e9).toFixed(1)} nF` : `${(c * 1e6).toFixed(2)} µF`;
}
function formatTime(t) {
    if (t < 1e-3) return `${(t * 1e6).toFixed(1)} µs`;
    if (t < 1) return `${(t * 1e3).toFixed(1)} ms`;
    return `${t.toFixed(2)} s`;
}

function getBestUnit(key, absVal) {
    if (key === 'voltage') return 1;
    if (key === 'frequency' || key === 'resistance') {
        if (absVal >= 1e6) return 1e6;
        if (absVal >= 1e3) return 1e3;
        return 1;
    }
    if (key === 'inductance') {
        if (absVal < 1) return 1e-3;
        return 1;
    }
    if (key === 'capacitance') {
        if (absVal < 1e-6) return 1e-9;
        return 1e-6;
    }
}

function getCSSColor(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function updateThemeColors() {
    colors.vg = getCSSColor('--color-vg') || '#000000';
    if (waveChart) {
        Chart.defaults.color = getCSSColor('--text-muted') || '#475569';
        const gridColor = getCSSColor('--color-grid') || '#e2e8f0';
        waveChart.options.scales.x.grid.color = gridColor;
        waveChart.options.scales.y.grid.color = gridColor;
        waveChart.data.datasets[0].borderColor = colors.vg;
        waveChart.update();
    }
}

// Inicialização
function init() {
    // Eventos de Sliders (Range)
    for (let key in inputs) {
        inputs[key].range.addEventListener('input', () => handleSlider(key));
        inputs[key].num.addEventListener('input', () => handleNumberOrUnit(key));
    }
    
    // Eventos de Toggles (R,L,C)
    for (let key in toggles) {
        toggles[key].addEventListener('change', updatePhysics);
    }

    dutyInput.addEventListener('input', updatePhysics);
    
    // Eventos de Rádio (Sine/Square)
    radioSource.forEach(radio => {
        radio.addEventListener('change', updatePhysics);
    });

    // Eventos de Unidades (Botões)
    unitButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = btn.getAttribute('data-target');
            // Remove 'active' de todos os botões do mesmo grupo
            document.querySelectorAll(`.unit-btn[data-target="${target}"]`).forEach(b => b.classList.remove('active'));
            // Adiciona 'active' no clicado
            btn.classList.add('active');
            handleNumberOrUnit(target);
        });
    });
    
    // Eventos de Legenda
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

    themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
            document.documentElement.removeAttribute('data-theme');
            themeToggle.innerText = '🌙 Modo Noturno';
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeToggle.innerText = '☀️ Modo Claro';
        }
        updateThemeColors();
    });
    
    initChart();
    updateThemeColors();
    // Inicializar os sliders com base nos inputs atuais (que vieram no HTML)
    for (let key in inputs) {
        handleNumberOrUnit(key);
    }
    updatePhysics();
    requestAnimationFrame(animationLoop);
}

// Lógica de Sincronização 2-way
function handleSlider(key) {
    const sliderPos = parseFloat(inputs[key].range.value);
    const b = bounds[key];
    
    // 1. Calcula o valor absoluto
    let absVal = 0;
    if (b.log) {
        absVal = logScale(sliderPos, b.min, b.max);
    } else {
        absVal = b.min + (sliderPos / 100) * (b.max - b.min);
    }
    
    // 2. Acha a melhor unidade
    const mult = getBestUnit(key, absVal);
    const displayVal = absVal / mult;
    
    // 3. Atualiza os campos UI
    inputs[key].num.value = displayVal.toPrecision(3).replace(/(?:\.0+|(\.\d+?)0+)$/, "$1");
    
    // Atualiza botões
    document.querySelectorAll(`.unit-btn[data-target="${key}"]`).forEach(b => {
        b.classList.remove('active');
        if (parseFloat(b.getAttribute('data-val')) === mult) {
            b.classList.add('active');
        }
    });

    // 4. Salva estado
    updateStateValue(key, absVal);
}

function handleNumberOrUnit(key) {
    const numVal = parseFloat(inputs[key].num.value) || 0;
    let mult = 1;
    document.querySelectorAll(`.unit-btn[data-target="${key}"]`).forEach(b => {
        if (b.classList.contains('active')) {
            mult = parseFloat(b.getAttribute('data-val'));
        }
    });
    
    let absVal = numVal * mult;
    const b = bounds[key];
    
    // Prende o valor nos limites globais para não dar NaN
    if (absVal < b.min) absVal = b.min;
    if (absVal > b.max) absVal = b.max;
    
    // Atualiza o Slider
    let sliderPos = 0;
    if (b.log) {
        sliderPos = reverseLogScale(absVal, b.min, b.max);
    } else {
        sliderPos = 100 * (absVal - b.min) / (b.max - b.min);
    }
    inputs[key].range.value = sliderPos;
    
    // Salva estado
    updateStateValue(key, absVal);
}

function updateStateValue(key, absVal) {
    if (key === 'voltage') state.V0 = absVal;
    if (key === 'frequency') {
        state.f = absVal;
        state.omega = 2 * Math.PI * state.f;
    }
    if (key === 'resistance') state.R = absVal;
    if (key === 'inductance') state.L = absVal;
    if (key === 'capacitance') state.C = absVal;
    
    updatePhysics();
}

let physics = {};

function updatePhysics() {
    state.activeR = toggles.r.checked;
    state.activeL = toggles.l.checked;
    state.activeC = toggles.c.checked;

    inputs.resistance.range.disabled = !state.activeR;
    inputs.resistance.num.disabled = !state.activeR;
    inputs.inductance.range.disabled = !state.activeL;
    inputs.inductance.num.disabled = !state.activeL;
    inputs.capacitance.range.disabled = !state.activeC;
    inputs.capacitance.num.disabled = !state.activeC;
    
    radioSource.forEach(radio => {
        if (radio.checked) state.sourceType = radio.value;
    });

    state.duty = parseFloat(dutyInput.value) || 50;
    dutyDisplay.innerText = `${state.duty}%`;

    // Física
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

    outputs.zr.innerText = state.activeR ? `${formatRes(ZR)}` : "0 Ω";
    outputs.zl.innerText = state.activeL ? `${formatRes(ZL)}` : "0 Ω";
    outputs.zc.innerText = state.activeC ? `-${formatRes(ZC)}` : "0 Ω";
    outputs.z.innerText = `${formatRes(Z_mag)}`;
    if (Z_mag === 0) {
        outputs.i.innerText = `Curto!`;
    } else {
        const i_ma = I_mag * 1000;
        outputs.i.innerText = i_ma >= 1000 ? `${I_mag.toFixed(2)} A` : `${i_ma.toFixed(1)} mA`;
    }

    let fc_text = "-";
    if (state.activeL && state.activeC) {
        const f0 = 1 / (2 * Math.PI * Math.sqrt(state.L * state.C));
        fc_text = `f0 = ${formatFreq(f0)}`;
    } else if (state.activeR && !state.activeL && state.activeC) {
        const fc = 1 / (2 * Math.PI * state.R * state.C);
        fc_text = formatFreq(fc);
    } else if (state.activeR && state.activeL && !state.activeC) {
        const fc = state.R / (2 * Math.PI * state.L);
        fc_text = formatFreq(fc);
    } else {
        fc_text = "N/A";
    }
    outputs.fc.innerText = fc_text;

    if (state.sourceType === 'square') {
        phasorOverlay.style.display = 'flex';
        dutyContainer.style.display = 'block';
    } else {
        phasorOverlay.style.display = 'none';
        dutyContainer.style.display = 'none';
    }

    updateChart();
}

function drawArrow(ctx, fromX, fromY, toX, toY, color) {
    const headlen = 10; 
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return; // muito pequeno
    
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

function animationLoop() {
    ctx.clearRect(0, 0, size, size);
    
    const cx = size / 2;
    const cy = size / 2;

    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, size);
    ctx.moveTo(0, cy);
    ctx.lineTo(size, cy);
    ctx.strokeStyle = getCSSColor('--color-grid') || '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.stroke();

    const maxVoltage = Math.max(state.V0, 1); // evita divisão por zero
    const pixelPerV = (size / 2 - 20) / maxVoltage;

    ctx.beginPath();
    ctx.arc(cx, cy, state.V0 * pixelPerV, 0, 2 * Math.PI);
    ctx.strokeStyle = getCSSColor('--color-grid') || '#e2e8f0';
    ctx.stroke();

    const drawPhasor = (mag, phase, color, scale) => {
        if (mag < 0.05) return;
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

function getStepResponse(t, V_step, i0, Vc0) {
    const R = state.activeR ? state.R : 0.001; 
    const L = state.L;
    const C = state.C;
    
    let i = 0, Vc = 0, Vr = 0, Vl = 0;

    if (!state.activeL && !state.activeC) {
        i = V_step / R;
        Vr = V_step;
        Vc = 0;
        Vl = 0;
    } else if (!state.activeL && state.activeC) {
        const tau = R * C;
        Vc = V_step + (Vc0 - V_step) * Math.exp(-t / tau);
        i = ((V_step - Vc0) / R) * Math.exp(-t / tau);
        Vr = i * R;
        Vl = 0;
    } else if (state.activeL && !state.activeC) {
        const tau = L / R;
        i = (V_step / R) + (i0 - (V_step / R)) * Math.exp(-t / tau);
        Vr = i * R;
        Vc = 0;
        Vl = V_step - Vr;
    } else {
        const alpha = R / (2 * L);
        const w0 = 1 / Math.sqrt(L * C);
        const y0 = Vc0 - V_step;
        const dy0 = i0 / C;

        if (alpha > w0) { 
            const s1 = -alpha + Math.sqrt(alpha*alpha - w0*w0);
            const s2 = -alpha - Math.sqrt(alpha*alpha - w0*w0);
            const A1 = (dy0 - s2 * y0) / (s1 - s2);
            const A2 = y0 - A1;
            Vc = V_step + A1 * Math.exp(s1 * t) + A2 * Math.exp(s2 * t);
            i = C * (A1 * s1 * Math.exp(s1 * t) + A2 * s2 * Math.exp(s2 * t));
        } else if (Math.abs(alpha - w0) < 1e-6) {
            const A1 = y0;
            const A2 = dy0 + alpha * y0;
            Vc = V_step + (A1 + A2 * t) * Math.exp(-alpha * t);
            i = C * (A2 * Math.exp(-alpha * t) - alpha * (A1 + A2 * t) * Math.exp(-alpha * t));
        } else {
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
    Chart.defaults.color = '#475569';
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";

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
                x: { title: { display: true, text: 'Tempo' }, grid: { color: '#e2e8f0' } },
                y: { type: 'linear', display: true, title: { display: true, text: 'Tensão (V)' }, grid: { color: '#e2e8f0' } }
            },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: function(context) { return `${context.dataset.label}: ${context.parsed.y.toFixed(2)} V`; } } }
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

    // Ajustar escala Y baseada na tensão V0
    waveChart.options.scales.y.suggestedMin = -state.V0;
    waveChart.options.scales.y.suggestedMax = state.V0;

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
        const T_on = T * (state.duty / 100);
        const T_off = T * (1 - state.duty / 100);
        let boundaries = [];
        let current_i0 = 0;
        let current_Vc0 = 0;
        let v_current = state.V0;
        let t_accum = 0;

        for(let k = 0; k <= 6; k++) {
            boundaries.push({ t_start: t_accum, i0: current_i0, Vc0: current_Vc0, V_step: v_current });
            let t_interval = (v_current === state.V0) ? T_on : T_off;
            let res = getStepResponse(t_interval, v_current, current_i0, current_Vc0);
            current_i0 = res.i;
            current_Vc0 = res.Vc;
            v_current = v_current === state.V0 ? 0 : state.V0;
            t_accum += t_interval;
        }

        for (let j = 0; j <= numPoints; j++) {
            const t = j * dt;
            labels.push(formatTime(t));
            
            let k = 0;
            for (let b = 1; b < boundaries.length; b++) {
                if (t >= boundaries[b].t_start) {
                    k = b;
                } else {
                    break;
                }
            }
            if (k > 6) k = 6;
            
            let local_t = t - boundaries[k].t_start;
            let res = getStepResponse(local_t, boundaries[k].V_step, boundaries[k].i0, boundaries[k].Vc0);
            
            dVg.push(boundaries[k].V_step);
            dVr.push(state.activeR ? res.Vr : 0);
            dVl.push(state.activeL ? res.Vl : 0);
            dVc.push(state.activeC ? res.Vc : 0);
        }
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
