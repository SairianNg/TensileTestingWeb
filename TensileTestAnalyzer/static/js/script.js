/* =====================================================
   Tensile Test Analyzer — Frontend Logic
   ===================================================== */

// ---------- DOM refs ----------
const form = document.getElementById('upload-form');
const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const fileNameEl = document.getElementById('file-name');
const analyzeBtn = document.getElementById('analyze-btn');
const errorToast = document.getElementById('error-toast');
const metricsRow = document.getElementById('metrics-section');
const chartsRow = document.getElementById('charts-section');

// Store data globally for tooltip access
let globalData = null;

let loadChart = null;
let stressChart = null;

// ---------- Drag & Drop ----------
['dragenter', 'dragover'].forEach(evt =>
    dropZone.addEventListener(evt, e => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    })
);
['dragleave', 'drop'].forEach(evt =>
    dropZone.addEventListener(evt, e => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
    })
);
dropZone.addEventListener('drop', e => {
    const files = e.dataTransfer.files;
    if (files.length) {
        fileInput.files = files;
        showFileName(files[0].name);
    }
});
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
    if (fileInput.files.length) showFileName(fileInput.files[0].name);
});

function showFileName(name) {
    fileNameEl.textContent = `📄 ${name}`;
}

// ---------- Form submit ----------
form.addEventListener('submit', async e => {
    e.preventDefault();
    hideError();

    if (!fileInput.files.length) {
        showError('Please select a CSV file first.');
        return;
    }

    analyzeBtn.classList.add('loading');
    analyzeBtn.disabled = true;

    const fd = new FormData(form);

    try {
        const res = await fetch('/analyze', { method: 'POST', body: fd });
        const data = await res.json();

        if (!res.ok || data.error) {
            showError(data.error || 'Unknown server error.');
            return;
        }

        renderMetrics(data.metrics);

        // Save for tooltips
        globalData = data;

        renderCharts(data);

    } catch (err) {
        showError('Network error — is the server running?');
    } finally {
        analyzeBtn.classList.remove('loading');
        analyzeBtn.disabled = false;
    }
});

// ---------- Error helpers ----------
function showError(msg) {
    errorToast.textContent = msg;
    errorToast.classList.add('visible');
}
function hideError() {
    errorToast.classList.remove('visible');
}

// ---------- Metrics ----------
function renderMetrics(m) {
    document.getElementById('metric-stress').textContent = m.max_stress_mpa;
    document.getElementById('metric-strain').textContent = m.max_strain;
    document.getElementById('metric-load').textContent = m.max_load_n;
    metricsRow.classList.remove('hidden');
}

// ---------- Chart defaults ----------
const gridColor = 'rgba(255,255,255,0.06)';
const tickColor = '#9aa0ab';

function chartDefaults(xLabel, yLabel) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(15,17,30,0.92)',
                titleColor: '#e8eaed',
                bodyColor: '#c4c9d2',
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                cornerRadius: 8,
                padding: 12,
            }
        },
        scales: {
            x: {
                title: { display: true, text: xLabel, color: tickColor, font: { family: "'Inter'", weight: 500 } },
                grid: { color: gridColor },
                ticks: { color: tickColor, font: { size: 11 } },
                border: { color: 'rgba(255,255,255,0.1)' }
            },
            y: {
                title: { display: true, text: yLabel, color: tickColor, font: { family: "'Inter'", weight: 500 } },
                grid: { color: gridColor },
                ticks: { color: tickColor, font: { size: 11 } },
                border: { color: 'rgba(255,255,255,0.1)' }
            }
        },
        elements: {
            point: { radius: 1.5, hoverRadius: 5, backgroundColor: '#818cf8' },
            line: { borderWidth: 2.5 }
        }
    };
}

// ---------- Render Charts ----------
function renderCharts(data) {
    chartsRow.classList.remove('hidden');

    // Displacement vs Load
    const loadCtx = document.getElementById('chart-load').getContext('2d');
    if (loadChart) loadChart.destroy();

    loadChart = new Chart(loadCtx, {
        type: 'line',
        data: {
            labels: data.displacement.map(d => +d.toFixed(4)),
            datasets: [
                {
                    label: 'Load (N)',
                    data: data.load,
                    borderColor: '#6366f1',
                    backgroundColor: createGradient(loadCtx, '#6366f1'),
                    fill: true,
                    tension: 0.3,
                    order: 2
                },
                // Elastic Region (Blue)
                (data.yield_index !== null && data.yield_index !== undefined) ? {
                    label: 'Elastic Region',
                    data: data.load.slice(0, data.yield_index + 1),
                    borderColor: '#3b82f6', // blue-500
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHitRadius: 0,
                    order: 1
                } : null
            ].filter(Boolean)
        },
        options: chartDefaults('Displacement (mm)', 'Load (N)')
    });

    // Stress vs Strain + Young's Modulus line
    const stressCtx = document.getElementById('chart-stress').getContext('2d');
    if (stressChart) stressChart.destroy();

    const stressStrainOpts = chartDefaults('Strain (mm/mm)', 'Stress (MPa)');
    // Add secondary Y-axis for Young's Modulus
    stressStrainOpts.scales.y1 = {
        position: 'right',
        title: { display: true, text: "Young's Modulus (MPa)", color: tickColor, font: { family: "'Inter'", weight: 500 } },
        grid: { drawOnChartArea: false },
        ticks: { color: '#fb923c', font: { size: 11 } },
        border: { color: 'rgba(255,255,255,0.1)' }
    };
    stressStrainOpts.plugins.legend = {
        display: true,
        labels: { color: '#9aa0ab', font: { family: "'Inter'", size: 12 }, boxWidth: 14, padding: 16 }
    };

    // Customize tooltip to show Slope Angle for YM dataset
    stressStrainOpts.plugins.tooltip = {
        callbacks: {
            label: function (context) {
                let label = context.dataset.label || '';
                if (label) {
                    label += ': ';
                }
                if (context.parsed.y !== null) {
                    label += context.parsed.y;
                }

                // If this is the Young's Modulus dataset (index 1), add slope angle
                if (context.datasetIndex === 1 && globalData && globalData.slope_angles) {
                    const angle = globalData.slope_angles[context.dataIndex];
                    if (angle !== undefined) {
                        label += ` (Angle: ${angle.toFixed(1)}°)`;
                    }
                }
                return label;
            }
        },
        backgroundColor: 'rgba(15,17,30,0.92)',
        titleColor: '#e8eaed',
        bodyColor: '#c4c9d2',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12
    };

    stressChart = new Chart(stressCtx, {
        type: 'line',
        data: {
            labels: data.strain.map(s => +s.toFixed(6)),
            datasets: [
                {
                    label: 'Stress (MPa)',
                    data: data.stress,
                    borderColor: '#a855f7',
                    backgroundColor: createGradient(stressCtx, '#a855f7'),
                    fill: true,
                    tension: 0.3,
                    yAxisID: 'y',
                    order: 2
                },
                {
                    label: "Young's Modulus (MPa)",
                    data: data.youngs_modulus,
                    borderColor: '#fb923c',
                    backgroundColor: 'transparent',
                    borderDash: [6, 3],
                    borderWidth: 2,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 0, // Show points on hover only
                    hitRadius: 10,
                    yAxisID: 'y1',
                    order: 3
                },
                {
                    label: 'Fracture Point',
                    data: data.fracture_point ? [{ x: data.fracture_point.strain, y: data.fracture_point.stress }] : [],
                    borderColor: '#ef4444', // Red
                    backgroundColor: '#ef4444',
                    pointStyle: 'crossRot',
                    pointRadius: 8,
                    pointHoverRadius: 10,
                    showLine: false,
                    yAxisID: 'y',
                    order: 1
                }
            ]
        },
        options: stressStrainOpts
    });
}

// ---------- Gradient helper ----------
function createGradient(ctx, color) {
    const g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
    g.addColorStop(0, hexToRGBA(color, 0.25));
    g.addColorStop(1, hexToRGBA(color, 0.0));
    return g;
}

function hexToRGBA(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}
