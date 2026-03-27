/**
 * brain3d.js — 3D cortex visualizer for Prometheus BCI
 *
 * Projects live EEG bandpower onto a 3D brain (TRIBE v2 GLB meshes).
 * Each EEG channel maps to its cortical region. The dominant frequency
 * band sets the color, and total power sets the intensity.
 *
 * Band colors (like Emotiv BrainViz):
 *   delta = dark blue, theta = cyan, alpha = green,
 *   beta = orange-red, gamma = yellow
 *
 * Dependencies: Three.js + GLTFLoader + OrbitControls (CDN)
 */

'use strict';

var Brain3D = (function () {

    // ─── Band color palette ──────────────────────────────────────────
    var BAND_COLORS = {
        delta: [0.20, 0.30, 0.75],   // dark blue
        theta: [0.20, 0.65, 0.80],   // cyan
        alpha: [0.25, 0.75, 0.35],   // green
        beta:  [0.85, 0.35, 0.20],   // orange-red
        gamma: [0.90, 0.80, 0.15]    // yellow
    };
    var BAND_NAMES = ['delta', 'theta', 'alpha', 'beta', 'gamma'];

    // Cortex base color — warm gray
    var BASE_COLOR = [0.55, 0.50, 0.48];

    // ─── EEG channel → cortical region mapping (10-20 system) ────────
    // Each channel maps to a region name used for vertex classification.
    var CHANNEL_REGION = {
        // Prefrontal
        'Fp1': 'prefrontal', 'Fp2': 'prefrontal', 'AF3': 'prefrontal',
        'AF4': 'prefrontal', 'AF7': 'prefrontal', 'AF8': 'prefrontal',
        // Frontal
        'F3': 'frontal_left', 'F4': 'frontal_right', 'Fz': 'frontal_mid',
        'F7': 'frontal_left', 'F8': 'frontal_right',
        'FC5': 'frontal_left', 'FC6': 'frontal_right',
        // Motor / Central
        'C1': 'motor_left', 'C2': 'motor_right', 'C3': 'motor_left',
        'C4': 'motor_right', 'Cz': 'motor_mid',
        // Parietal
        'P3': 'parietal_left', 'P4': 'parietal_right', 'Pz': 'parietal_mid',
        'P7': 'parietal_left', 'P8': 'parietal_right',
        // Temporal
        'T7': 'temporal_left', 'T8': 'temporal_right',
        'TP9': 'temporal_left', 'TP10': 'temporal_right',
        // Occipital
        'O1': 'occipital_left', 'O2': 'occipital_right', 'Oz': 'occipital_mid'
    };

    // Map fine regions to coarse cortical zones for vertex classification
    var ZONE_LABELS = {
        'prefrontal':    'prefrontal',
        'frontal_left':  'frontal', 'frontal_right': 'frontal', 'frontal_mid': 'frontal',
        'motor_left':    'motor',   'motor_right':   'motor',   'motor_mid':   'motor',
        'parietal_left': 'parietal','parietal_right': 'parietal','parietal_mid':'parietal',
        'temporal_left': 'temporal','temporal_right': 'temporal',
        'occipital_left':'occipital','occipital_right':'occipital','occipital_mid':'occipital'
    };

    var COARSE_ZONES = ['prefrontal', 'frontal', 'motor', 'parietal', 'temporal', 'occipital'];

    // ─── Classify vertex into coarse zone ────────────────────────────
    function classifyVertex(x, y, z, center, scale) {
        var nx = (x - center.x) / scale;
        var ny = (y - center.y) / scale;
        var nz = (z - center.z) / scale;
        var r = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (r < 0.01) return 'frontal';

        var fwd = ny / r;
        var up  = nz / r;
        var lat = Math.abs(nx) / r;

        if (up > 0.45 && Math.abs(fwd) < 0.35) return 'motor';
        if (fwd > 0.55 && up > -0.1) return 'prefrontal';
        if (fwd > 0.2 && up > 0.05) return 'frontal';
        if (fwd < -0.5) return 'occipital';
        if (up > 0.15 && fwd <= 0.2) return 'parietal';
        if (lat > 0.4 && up < 0.25) return 'temporal';
        return fwd > 0 ? 'frontal' : 'parietal';
    }

    // ─── Apply vertex colors to a brain mesh ─────────────────────────
    function colorizeBrainMesh(mesh) {
        var geo = mesh.geometry;
        geo.computeVertexNormals();
        geo.computeBoundingBox();
        var bb = geo.boundingBox;
        var center = new THREE.Vector3();
        bb.getCenter(center);
        var size = new THREE.Vector3();
        bb.getSize(size);
        var scale = Math.max(size.x, size.y, size.z) / 2;

        var pos = geo.attributes.position;
        var count = pos.count;
        var colors = new Float32Array(count * 3);
        var zoneMap = new Uint8Array(count);

        for (var i = 0; i < count; i++) {
            var zone = classifyVertex(
                pos.getX(i), pos.getY(i), pos.getZ(i),
                center, scale
            );
            var idx = COARSE_ZONES.indexOf(zone);
            zoneMap[i] = idx >= 0 ? idx : 1;
            colors[i * 3]     = BASE_COLOR[0];
            colors[i * 3 + 1] = BASE_COLOR[1];
            colors[i * 3 + 2] = BASE_COLOR[2];
        }

        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.userData = { zoneMap: zoneMap };

        mesh.material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.6,
            metalness: 0.05,
            emissive: new THREE.Color(0x3a3530),
            emissiveIntensity: 0.6,
            side: THREE.DoubleSide
        });
    }

    // ─── Main class ──────────────────────────────────────────────────
    function Brain3DViewer(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) throw new Error('Container not found: ' + containerId);

        // Per-zone bandpower: { prefrontal: {delta:0, theta:0, ...}, ... }
        this.zonePower = {};
        COARSE_ZONES.forEach(function (z) {
            this.zonePower[z] = { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 };
        }.bind(this));

        this.tribeData = null;
        this.tribeBlend = 0.0;
        this._hoveredZone = null;
        this.brainMeshes = [];
        this._ready = false;
        this._activeBand = 'all'; // 'all', 'delta', 'theta', 'alpha', 'beta', 'gamma'

        this._initScene();
        this._initControls();
        this._initTooltip();
        this._loadModels();
        this._animate();
    }

    Brain3DViewer.prototype._initScene = function () {
        var w = this.container.clientWidth;
        var h = this.container.clientHeight || 380;

        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(30, w / h, 1, 2000);
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(0, -350, 30);
        this.camera.lookAt(0, 0, 15);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.container.appendChild(this.renderer.domElement);

        this.scene.add(new THREE.AmbientLight(0x8888aa, 1.2));

        var key = new THREE.DirectionalLight(0xddeeff, 0.8);
        key.position.set(100, -200, 300);
        this.scene.add(key);

        var fill = new THREE.DirectionalLight(0x8899aa, 0.4);
        fill.position.set(-200, 100, 100);
        this.scene.add(fill);

        var rim = new THREE.DirectionalLight(0x556677, 0.3);
        rim.position.set(0, 200, -100);
        this.scene.add(rim);

        var self = this;
        this._resizeObserver = new ResizeObserver(function () {
            var w2 = self.container.clientWidth;
            var h2 = self.container.clientHeight || 380;
            self.camera.aspect = w2 / h2;
            self.camera.updateProjectionMatrix();
            self.renderer.setSize(w2, h2);
        });
        this._resizeObserver.observe(this.container);
    };

    Brain3DViewer.prototype._loadModels = function () {
        var self = this;
        var loader = new THREE.GLTFLoader();
        var loaded = 0;
        var total = 2;

        var loadingEl = document.createElement('div');
        loadingEl.className = 'brain3d-loading';
        loadingEl.textContent = 'Loading brain...';
        this.container.appendChild(loadingEl);

        function onDone() {
            loaded++;
            if (loaded === total) {
                loadingEl.remove();
                self._ready = true;
                console.log('[Brain3D] Brain meshes loaded');
            }
        }

        function onError(err) {
            loadingEl.textContent = 'Failed to load brain';
            console.error('[Brain3D] GLB load error:', err);
        }

        loader.load('assets/brain-left-hemisphere-1b9f386f.glb', function (gltf) {
            gltf.scene.traverse(function (c) {
                if (c.isMesh) { colorizeBrainMesh(c); self.brainMeshes.push(c); }
            });
            self.scene.add(gltf.scene);
            onDone();
        }, null, onError);

        loader.load('assets/brain-right-hemisphere-f0dea562.glb', function (gltf) {
            gltf.scene.traverse(function (c) {
                if (c.isMesh) { colorizeBrainMesh(c); self.brainMeshes.push(c); }
            });
            self.scene.add(gltf.scene);
            onDone();
        }, null, onError);
    };

    Brain3DViewer.prototype._initControls = function () {
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.enablePan = false;
        this.controls.minDistance = 150;
        this.controls.maxDistance = 800;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 0.4;
        this.controls.target.set(0, 0, 15);
        this.controls.minPolarAngle = Math.PI / 2;
        this.controls.maxPolarAngle = Math.PI / 2;
    };

    Brain3DViewer.prototype._initTooltip = function () {
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'brain3d-tooltip';
        this.tooltip.style.display = 'none';
        this.container.appendChild(this.tooltip);

        this._raycaster = new THREE.Raycaster();
        this._mouse = new THREE.Vector2();

        var self = this;
        this.renderer.domElement.addEventListener('mousemove', function (e) {
            if (!self._ready) return;
            var rect = self.renderer.domElement.getBoundingClientRect();
            self._mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            self._mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            self._raycaster.setFromCamera(self._mouse, self.camera);
            var hits = self._raycaster.intersectObjects(self.brainMeshes);

            if (hits.length > 0) {
                var geo = hits[0].object.geometry;
                var zoneMap = geo.userData.zoneMap;
                if (!zoneMap) return;
                var zoneIdx = zoneMap[hits[0].face.a];
                var zoneName = COARSE_ZONES[zoneIdx];
                var zp = self.zonePower[zoneName];

                // Find dominant band
                var maxBand = 'alpha', maxVal = 0;
                for (var b in zp) {
                    if (zp[b] > maxVal) { maxVal = zp[b]; maxBand = b; }
                }

                var totalPow = 0;
                for (var b2 in zp) totalPow += zp[b2];

                var label = zoneName.charAt(0).toUpperCase() + zoneName.slice(1);
                label += ' — ' + maxBand + ' dominant';
                if (totalPow > 0) label += ' (' + totalPow.toFixed(2) + ')';

                self.tooltip.textContent = label;
                self.tooltip.style.display = 'block';
                self.tooltip.style.left = (e.clientX - rect.left + 12) + 'px';
                self.tooltip.style.top = (e.clientY - rect.top - 28) + 'px';
                self._hoveredZone = zoneName;
            } else {
                self.tooltip.style.display = 'none';
                self._hoveredZone = null;
            }
        });

        this.renderer.domElement.addEventListener('mouseleave', function () {
            self.tooltip.style.display = 'none';
            self._hoveredZone = null;
        });
    };

    // ─── Update from eeg_bandpower stream ────────────────────────────
    // bandpowerData: { channelName: { delta: v, theta: v, alpha: v, beta: v, gamma: v } }
    Brain3DViewer.prototype.updateBandpower = function (bandpowerData) {
        // Reset zone accumulators
        var zoneCounts = {};
        COARSE_ZONES.forEach(function (z) {
            this.zonePower[z] = { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 };
            zoneCounts[z] = 0;
        }.bind(this));

        // Accumulate per channel
        for (var ch in bandpowerData) {
            var fineRegion = CHANNEL_REGION[ch];
            if (!fineRegion) continue;
            var zone = ZONE_LABELS[fineRegion] || 'frontal';
            var chData = bandpowerData[ch];
            for (var band in chData) {
                if (this.zonePower[zone][band] !== undefined) {
                    this.zonePower[zone][band] += chData[band];
                }
            }
            zoneCounts[zone]++;
        }

        // Average
        for (var z in zoneCounts) {
            if (zoneCounts[z] > 0) {
                for (var b in this.zonePower[z]) {
                    this.zonePower[z][b] /= zoneCounts[z];
                }
            }
        }

        if (this._ready) this._updateColors();
    };

    // ─── Set which band to visualize ─────────────────────────────────
    Brain3DViewer.prototype.setActiveBand = function (band) {
        this._activeBand = band; // 'all', 'delta', 'theta', 'alpha', 'beta', 'gamma'
        if (this._ready) this._updateColors();
    };

    // ─── TRIBE overlay (kept for compatibility) ──────────────────────
    Brain3DViewer.prototype.loadTribeData = function (jsonUrl) {
        var self = this;
        fetch(jsonUrl)
            .then(function (r) { return r.json(); })
            .then(function (data) {
                self.tribeData = data.regions || data;
                self.tribeBlend = 0.5;
                if (self._ready) self._updateColors();
            })
            .catch(function (err) { console.warn('[Brain3D] TRIBE load error:', err); });
    };

    Brain3DViewer.prototype.setTribeBlend = function (blend) {
        this.tribeBlend = Math.max(0, Math.min(1, blend));
        if (this._ready) this._updateColors();
    };

    // ─── Update vertex colors from bandpower ─────────────────────────
    Brain3DViewer.prototype._updateColors = function () {
        // Find global max power for normalization
        var globalMax = 0.001;
        for (var z in this.zonePower) {
            for (var b in this.zonePower[z]) {
                if (this.zonePower[z][b] > globalMax) globalMax = this.zonePower[z][b];
            }
        }

        for (var m = 0; m < this.brainMeshes.length; m++) {
            var geo = this.brainMeshes[m].geometry;
            var colors = geo.attributes.color;
            var zoneMap = geo.userData.zoneMap;
            if (!colors || !zoneMap) continue;

            for (var i = 0; i < colors.count; i++) {
                var zoneName = COARSE_ZONES[zoneMap[i]];
                var zp = this.zonePower[zoneName];
                if (!zp) continue;

                // Compute color from bandpower
                var r = 0, g = 0, bl = 0, totalPow = 0;

                if (this._activeBand === 'all') {
                    // Mix all bands — each band contributes its color weighted by power
                    for (var bi = 0; bi < BAND_NAMES.length; bi++) {
                        var bName = BAND_NAMES[bi];
                        var pow = zp[bName] || 0;
                        var bc = BAND_COLORS[bName];
                        r  += bc[0] * pow;
                        g  += bc[1] * pow;
                        bl += bc[2] * pow;
                        totalPow += pow;
                    }
                    if (totalPow > 0) {
                        r /= totalPow;
                        g /= totalPow;
                        bl /= totalPow;
                    } else {
                        // No data yet — neutral cortex gray
                        r = BASE_COLOR[0]; g = BASE_COLOR[1]; bl = BASE_COLOR[2];
                    }
                } else {
                    // Single band mode
                    var bc2 = BAND_COLORS[this._activeBand] || BAND_COLORS.alpha;
                    r = bc2[0]; g = bc2[1]; bl = bc2[2];
                    totalPow = zp[this._activeBand] || 0;
                }

                // Intensity from normalized power
                var intensity;
                if (totalPow <= 0) {
                    // No data — show neutral cortex
                    intensity = 1.0;
                } else {
                    intensity = 0.3 + (totalPow / globalMax) * 0.7;
                    intensity = Math.min(1, intensity);
                }

                // Hover boost
                if (zoneName === this._hoveredZone) {
                    intensity = Math.min(1, intensity + 0.1);
                }

                // Blend with base color
                colors.setXYZ(i,
                    BASE_COLOR[0] + (r - BASE_COLOR[0]) * intensity,
                    BASE_COLOR[1] + (g - BASE_COLOR[1]) * intensity,
                    BASE_COLOR[2] + (bl - BASE_COLOR[2]) * intensity
                );
            }
            colors.needsUpdate = true;
        }
    };

    // ─── Render loop ─────────────────────────────────────────────────
    Brain3DViewer.prototype._animate = function () {
        var self = this;
        (function loop() {
            requestAnimationFrame(loop);
            self.controls.update();
            self.renderer.render(self.scene, self.camera);
        })();
    };

    Brain3DViewer.prototype.dispose = function () {
        if (this._resizeObserver) this._resizeObserver.disconnect();
        if (this.renderer) { this.renderer.dispose(); this.renderer.domElement.remove(); }
    };

    return Brain3DViewer;
})();
