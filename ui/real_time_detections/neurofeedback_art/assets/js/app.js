'use strict';

/* ════════════════════════════════════════════════════════════════
   Neurofeedback Art — Generative Orb
   ════════════════════════════════════════════════════════════════
   A luminous orb whose shape, color, particles and aura respond
   in real-time to multimodal cognitive metrics (EEG + PPG + facial).
   Focus (attention) is the primary visual driver:

     Attention  → orb size, brightness, glow, particle count, surface smoothness
     Arousal    → pulse rate, particle trail length
     Stress     → color temperature (cyan/violet → amber/red)
     Cognitive  → secondary fractal detail
   ════════════════════════════════════════════════════════════════ */

// ── Simplex Noise (compact 2D/3D) ──────────────────────────────
const SimplexNoise = (() => {
    const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
    const F3 = 1 / 3, G3 = 1 / 6;
    const grad3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
    const p = [];
    for (let i = 0; i < 256; i++) p[i] = (Math.random() * 256) | 0;
    const perm = new Array(512), permMod12 = new Array(512);
    for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; permMod12[i] = perm[i] % 12; }

    function dot2(g, x, y) { return g[0]*x + g[1]*y; }
    function dot3(g, x, y, z) { return g[0]*x + g[1]*y + g[2]*z; }

    return {
        noise2D(x, y) {
            const s = (x + y) * F2;
            const i = Math.floor(x + s), j = Math.floor(y + s);
            const t = (i + j) * G2;
            const X0 = i - t, Y0 = j - t;
            const x0 = x - X0, y0 = y - Y0;
            const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
            const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
            const x2 = x0 - 1 + 2*G2, y2 = y0 - 1 + 2*G2;
            const ii = i & 255, jj = j & 255;
            let n0 = 0, n1 = 0, n2 = 0;
            let t0 = 0.5 - x0*x0 - y0*y0;
            if (t0 >= 0) { t0 *= t0; n0 = t0 * t0 * dot2(grad3[permMod12[ii + perm[jj]]], x0, y0); }
            let t1 = 0.5 - x1*x1 - y1*y1;
            if (t1 >= 0) { t1 *= t1; n1 = t1 * t1 * dot2(grad3[permMod12[ii + i1 + perm[jj + j1]]], x1, y1); }
            let t2 = 0.5 - x2*x2 - y2*y2;
            if (t2 >= 0) { t2 *= t2; n2 = t2 * t2 * dot2(grad3[permMod12[ii + 1 + perm[jj + 1]]], x2, y2); }
            return 70 * (n0 + n1 + n2);
        },
        noise3D(x, y, z) {
            const s = (x + y + z) * F3;
            const i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
            const t = (i + j + k) * G3;
            const x0 = x - (i - t), y0 = y - (j - t), z0 = z - (k - t);
            let i1, j1, k1, i2, j2, k2;
            if (x0 >= y0) {
                if (y0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=1;k2=0; }
                else if (x0 >= z0) { i1=1;j1=0;k1=0;i2=1;j2=0;k2=1; }
                else { i1=0;j1=0;k1=1;i2=1;j2=0;k2=1; }
            } else {
                if (y0 < z0) { i1=0;j1=0;k1=1;i2=0;j2=1;k2=1; }
                else if (x0 < z0) { i1=0;j1=1;k1=0;i2=0;j2=1;k2=1; }
                else { i1=0;j1=1;k1=0;i2=1;j2=1;k2=0; }
            }
            const x1=x0-i1+G3, y1=y0-j1+G3, z1=z0-k1+G3;
            const x2=x0-i2+2*G3, y2=y0-j2+2*G3, z2=z0-k2+2*G3;
            const x3=x0-1+3*G3, y3=y0-1+3*G3, z3=z0-1+3*G3;
            const ii=i&255, jj=j&255, kk=k&255;
            let n0=0,n1=0,n2=0,n3=0;
            let tt;
            tt=0.6-x0*x0-y0*y0-z0*z0; if(tt>0){tt*=tt;n0=tt*tt*dot3(grad3[permMod12[ii+perm[jj+perm[kk]]]],x0,y0,z0);}
            tt=0.6-x1*x1-y1*y1-z1*z1; if(tt>0){tt*=tt;n1=tt*tt*dot3(grad3[permMod12[ii+i1+perm[jj+j1+perm[kk+k1]]]],x1,y1,z1);}
            tt=0.6-x2*x2-y2*y2-z2*z2; if(tt>0){tt*=tt;n2=tt*tt*dot3(grad3[permMod12[ii+i2+perm[jj+j2+perm[kk+k2]]]],x2,y2,z2);}
            tt=0.6-x3*x3-y3*y3-z3*z3; if(tt>0){tt*=tt;n3=tt*tt*dot3(grad3[permMod12[ii+1+perm[jj+1+perm[kk+1]]]],x3,y3,z3);}
            return 32*(n0+n1+n2+n3);
        }
    };
})();

// ── Metrics State ──────────────────────────────────────────────
const metrics = {
    attention: 0.5,
    arousal:   0.35,
    stress:    0.2,
    cognitive: 0.4,
};
// Smoothed values (for fluid transitions)
const smooth = { ...metrics };
const LERP_SPEED = 0.015;

function lerp(a, b, t) { return a + (b - a) * t; }

// ── Color Palettes ─────────────────────────────────────────────
// Calm → Stressed interpolation
const palettes = {
    calm:    { r: 34,  g: 211, b: 238 },  // cyan
    mid:     { r: 167, g: 139, b: 250 },  // violet
    stress:  { r: 245, g: 158, b: 11  },  // amber
    high:    { r: 239, g: 68,  b: 68  },  // red
};

function getOrbColor(stress) {
    let r, g, b;
    if (stress < 0.33) {
        const t = stress / 0.33;
        r = lerp(palettes.calm.r, palettes.mid.r, t);
        g = lerp(palettes.calm.g, palettes.mid.g, t);
        b = lerp(palettes.calm.b, palettes.mid.b, t);
    } else if (stress < 0.66) {
        const t = (stress - 0.33) / 0.33;
        r = lerp(palettes.mid.r, palettes.stress.r, t);
        g = lerp(palettes.mid.g, palettes.stress.g, t);
        b = lerp(palettes.mid.b, palettes.stress.b, t);
    } else {
        const t = (stress - 0.66) / 0.34;
        r = lerp(palettes.stress.r, palettes.high.r, t);
        g = lerp(palettes.stress.g, palettes.high.g, t);
        b = lerp(palettes.stress.b, palettes.high.b, t);
    }
    return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

// ── Particles ──────────────────────────────────────────────────
const MAX_PARTICLES = 200;
const particles = [];

function createParticle(cx, cy, baseRadius) {
    const angle = Math.random() * Math.PI * 2;
    const dist = baseRadius * (0.6 + Math.random() * 1.2);
    return {
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        angle,
        dist,
        speed: 0.002 + Math.random() * 0.008,
        size: 1 + Math.random() * 2.5,
        alpha: 0.3 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
        trail: [],
    };
}

// ── Canvas Setup ───────────────────────────────────────────────
const canvas = document.getElementById('nfbCanvas');
const ctx = canvas.getContext('2d');
let W, H, cx, cy, baseRadius;
let dpr = 1;

function resize() {
    dpr = window.devicePixelRatio || 1;
    W = canvas.parentElement.clientWidth;
    H = canvas.parentElement.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = W / 2;
    cy = H / 2;
    baseRadius = Math.min(W, H) * 0.18;

    // Re-seed particles
    particles.length = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
        particles.push(createParticle(cx, cy, baseRadius));
    }
}

window.addEventListener('resize', resize);
resize();

// ── Render Loop ────────────────────────────────────────────────
let time = 0;

function frame() {
    requestAnimationFrame(frame);
    time += 0.006;

    // Smooth metrics
    smooth.attention = lerp(smooth.attention, metrics.attention, LERP_SPEED);
    smooth.arousal   = lerp(smooth.arousal,   metrics.arousal,   LERP_SPEED);
    smooth.stress    = lerp(smooth.stress,    metrics.stress,    LERP_SPEED);
    smooth.cognitive = lerp(smooth.cognitive,  metrics.cognitive, LERP_SPEED);

    const color = getOrbColor(smooth.stress);
    const a = smooth.attention;  // primary driver
    const orbRadius = baseRadius * (0.7 + a * 0.55);                   // focus grows the orb significantly
    const noiseAmp = 25 - a * 18 + smooth.cognitive * 12;              // high focus = smoother surface
    const noiseFreq = 2.5 - a * 1.2 + smooth.cognitive * 1.0;         // high focus = less chaotic
    const pulseRate = 0.5 + a * 1.5 + smooth.arousal * 1.0;           // focus accelerates breathing
    const particleSpeed = 0.3 + a * 1.2 + smooth.arousal * 0.8;

    // Clear with subtle trail fade
    ctx.fillStyle = 'rgba(6, 6, 10, 0.18)';
    ctx.fillRect(0, 0, W, H);

    // ── Background glow ────────────────────────────────────────
    const glowRadius = orbRadius * (1.8 + a * 0.8 + smooth.arousal * 0.3);
    const bgGrad = ctx.createRadialGradient(cx, cy, orbRadius * 0.3, cx, cy, glowRadius);
    bgGrad.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${0.04 + a * 0.08})`);
    bgGrad.addColorStop(0.5, `rgba(${color.r}, ${color.g}, ${color.b}, 0.015)`);
    bgGrad.addColorStop(1, 'rgba(6, 6, 10, 0)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // ── Outer aura rings ───────────────────────────────────────
    for (let ring = 0; ring < 3; ring++) {
        const ringPhase = time * pulseRate * 0.4 + ring * 0.7;
        const ringPulse = 0.5 + 0.5 * Math.sin(ringPhase);
        const ringR = orbRadius * (1.3 + ring * 0.25 + ringPulse * 0.15);
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${0.03 - ring * 0.008})`;
        ctx.lineWidth = 1.5 - ring * 0.3;
        ctx.stroke();
    }

    // ── Particles ──────────────────────────────────────────────
    const activeCount = Math.floor(20 + a * 140 + smooth.arousal * 40);
    for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = particles[i];
        if (i >= activeCount) { p.trail.length = 0; continue; }

        p.angle += p.speed * particleSpeed;
        const noiseVal = SimplexNoise.noise3D(
            Math.cos(p.angle) * 0.5,
            Math.sin(p.angle) * 0.5,
            time * 0.5 + p.phase
        );
        const dynamicDist = p.dist + noiseVal * noiseAmp * 0.8;
        p.x = cx + Math.cos(p.angle) * dynamicDist;
        p.y = cy + Math.sin(p.angle) * dynamicDist;

        // Trail
        p.trail.push({ x: p.x, y: p.y });
        const maxTrail = Math.floor(6 + smooth.arousal * 18);
        while (p.trail.length > maxTrail) p.trail.shift();

        if (p.trail.length > 1) {
            ctx.beginPath();
            ctx.moveTo(p.trail[0].x, p.trail[0].y);
            for (let j = 1; j < p.trail.length; j++) {
                ctx.lineTo(p.trail[j].x, p.trail[j].y);
            }
            ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${p.alpha * 0.15})`;
            ctx.lineWidth = p.size * 0.5;
            ctx.stroke();
        }

        // Particle dot
        const flicker = 0.7 + 0.3 * Math.sin(time * 3 + p.phase);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * flicker, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${p.alpha * 0.6})`;
        ctx.fill();
    }

    // ── Main orb (noise-distorted sphere) ──────────────────────
    const pulse = 1 + 0.03 * Math.sin(time * pulseRate);
    const segments = 180;

    // Inner glow fill
    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const n1 = SimplexNoise.noise3D(
            Math.cos(a) * noiseFreq,
            Math.sin(a) * noiseFreq,
            time * 0.7
        );
        const n2 = SimplexNoise.noise3D(
            Math.cos(a) * noiseFreq * 2.2,
            Math.sin(a) * noiseFreq * 2.2,
            time * 0.5 + 100
        );
        const distortion = n1 * noiseAmp + n2 * noiseAmp * 0.3 * smooth.cognitive;
        const r = orbRadius * pulse + distortion;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();

    // Gradient fill
    const orbGrad = ctx.createRadialGradient(
        cx - orbRadius * 0.15, cy - orbRadius * 0.15, orbRadius * 0.05,
        cx, cy, orbRadius * 1.1
    );
    orbGrad.addColorStop(0, `rgba(255, 255, 255, ${0.05 + a * 0.12})`);
    orbGrad.addColorStop(0.3, `rgba(${color.r}, ${color.g}, ${color.b}, ${0.1 + a * 0.2})`);
    orbGrad.addColorStop(0.7, `rgba(${color.r}, ${color.g}, ${color.b}, ${0.03 + a * 0.05})`);
    orbGrad.addColorStop(1, 'rgba(6, 6, 10, 0)');
    ctx.fillStyle = orbGrad;
    ctx.fill();

    // Edge glow — focus drives intensity
    ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${0.15 + a * 0.45})`;
    ctx.lineWidth = 1 + a * 2;
    ctx.shadowColor = `rgba(${color.r}, ${color.g}, ${color.b}, ${0.2 + a * 0.4})`;
    ctx.shadowBlur = 10 + a * 25;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ── Inner detail layer (second noise octave) ───────────────
    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const n = SimplexNoise.noise3D(
            Math.cos(a) * noiseFreq * 1.6,
            Math.sin(a) * noiseFreq * 1.6,
            time * 0.9 + 50
        );
        const r = orbRadius * 0.7 * pulse + n * noiseAmp * 0.5;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.08)`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // ── Highlight specular ─────────────────────────────────────
    const specGrad = ctx.createRadialGradient(
        cx - orbRadius * 0.25, cy - orbRadius * 0.3, 0,
        cx - orbRadius * 0.25, cy - orbRadius * 0.3, orbRadius * 0.5
    );
    specGrad.addColorStop(0, `rgba(255, 255, 255, ${0.03 + a * 0.12})`);
    specGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = specGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, orbRadius * 1.1, 0, Math.PI * 2);
    ctx.fill();

    // ── Update UI ──────────────────────────────────────────────
    updateRing('attention', smooth.attention);
    updateRing('arousal',   smooth.arousal);
    updateRing('stress',    smooth.stress);
    updateRing('cognitive',  smooth.cognitive);

    updateBrainState();
}

// ── UI Helpers ─────────────────────────────────────────────────
function updateRing(name, value) {
    const pct = Math.round(value * 100);
    const offset = 100 - value * 100;
    const ring = document.getElementById('ring-' + name);
    const val = document.getElementById('val-' + name);
    if (ring) ring.style.strokeDashoffset = offset;
    if (val) val.textContent = pct;
}

function updateBrainState() {
    const el = document.getElementById('brainState');
    if (!el) return;

    const a = smooth.attention, s = smooth.stress, ar = smooth.arousal, c = smooth.cognitive;

    let state = '';
    if (a > 0.7 && s < 0.3)       state = 'Deep Focus';
    else if (a > 0.6 && s < 0.4)  state = 'Focused';
    else if (s > 0.7)             state = 'High Tension';
    else if (s > 0.5 && c > 0.5)  state = 'Mental Effort';
    else if (ar < 0.25 && a < 0.4) state = 'Drowsy';
    else if (ar > 0.7)            state = 'Alert';
    else if (c > 0.65)            state = 'Processing';
    else if (s < 0.25 && a > 0.4) state = 'Flow State';
    else                          state = 'Neutral';

    el.textContent = state;
}

// ── Timeflux Connection ────────────────────────────────────────
let io;

function initTimeflux() {
    io = new IO();

    io.on('connect', function () {
        updateConnectionStatus('connected');
        const status = document.getElementById('streamStatus');
        if (status) {
            status.textContent = 'Streaming';
            status.closest('.header-badge').classList.add('recording');
        }
    });

    io.on('disconnect', function () {
        updateConnectionStatus('disconnected');
        const status = document.getElementById('streamStatus');
        if (status) {
            status.textContent = 'Offline';
            status.closest('.header-badge').classList.remove('recording');
        }
    });

    // Subscribe to multimodal cognitive metrics (EEG + PPG + facial fusion)
    io.subscribe('multimodal_stress');
    io.subscribe('multimodal_attention');
    io.subscribe('multimodal_cognitive_load');
    io.subscribe('multimodal_arousal');

    io.on('multimodal_stress', function (data) {
        const keys = Object.keys(data);
        if (keys.length) metrics.stress = clamp(data[keys[keys.length - 1]].multimodal_stress);
    });

    io.on('multimodal_attention', function (data) {
        const keys = Object.keys(data);
        if (keys.length) metrics.attention = clamp(data[keys[keys.length - 1]].multimodal_attention);
    });

    io.on('multimodal_cognitive_load', function (data) {
        const keys = Object.keys(data);
        if (keys.length) metrics.cognitive = clamp(data[keys[keys.length - 1]].multimodal_cognitive_load);
    });

    io.on('multimodal_arousal', function (data) {
        const keys = Object.keys(data);
        if (keys.length) metrics.arousal = clamp(data[keys[keys.length - 1]].multimodal_arousal);
    });
}

function clamp(v) { return Math.max(0, Math.min(1, v || 0)); }

// ── Boot ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
    frame();
    // IO class is loaded via defer, wait for it
    if (typeof IO !== 'undefined') {
        initTimeflux();
    } else {
        const check = setInterval(() => {
            if (typeof IO !== 'undefined') {
                clearInterval(check);
                initTimeflux();
            }
        }, 200);
    }
});
