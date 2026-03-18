/**
 * Robot3D — Standalone MuJoCo + Three.js Franka Panda Viewer
 * Ported from robotics-pick-and-place for integration in Prometheus BCI pages.
 * Provides a 3D robot arm controllable via simple up/down/stop commands.
 *
 * @license Apache-2.0
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import loadMujoco from 'mujoco_wasm';

// ─── String Utils ───────────────────────────────────────────────────────────
function getName(mjModel, address) {
    let name = '';
    let idx = address;
    let safety = 0;
    while (mjModel.names[idx] !== 0 && safety < 100) {
        name += String.fromCharCode(mjModel.names[idx++]);
        safety++;
    }
    return name;
}

// ─── Capsule Geometry ───────────────────────────────────────────────────────
class CapsuleGeometry extends THREE.BufferGeometry {
    constructor(radius = 1, length = 1, capSegments = 4, radialSegments = 8) {
        super();
        this.type = 'CapsuleGeometry';
        const path = new THREE.Path();
        path.absarc(0, -length / 2, radius, Math.PI * 1.5, 0, false);
        path.absarc(0, length / 2, radius, 0, Math.PI * 0.5, false);
        const lathe = new THREE.LatheGeometry(path.getPoints(capSegments), radialSegments);
        this.setIndex(lathe.getIndex());
        this.setAttribute('position', lathe.getAttribute('position'));
        this.setAttribute('normal', lathe.getAttribute('normal'));
        this.setAttribute('uv', lathe.getAttribute('uv'));
    }
}

// ─── Geometry Builder ───────────────────────────────────────────────────────
class GeomBuilder {
    constructor(mujoco) {
        this.mujoco = mujoco;
    }

    create(mjModel, g) {
        if (mjModel.geom_group[g] === 3) return null;

        const type = mjModel.geom_type[g];
        const size = mjModel.geom_size.subarray(g * 3, g * 3 + 3);
        const pos = mjModel.geom_pos.subarray(g * 3, g * 3 + 3);
        const quat = mjModel.geom_quat.subarray(g * 4, g * 4 + 4);

        const matId = mjModel.geom_matid[g];
        const color = new THREE.Color(0xffffff);
        let opacity = 1.0;

        if (matId >= 0) {
            const rgba = mjModel.mat_rgba.subarray(matId * 4, matId * 4 + 4);
            color.setRGB(rgba[0], rgba[1], rgba[2]);
            opacity = rgba[3];
        } else {
            const rgba = mjModel.geom_rgba.subarray(g * 4, g * 4 + 4);
            color.setRGB(rgba[0], rgba[1], rgba[2]);
            opacity = rgba[3];
        }

        const MG = this.mujoco.mjtGeom;
        const getVal = (v) => v?.value ?? v;
        let geo = null;

        if (type === getVal(MG.mjGEOM_PLANE)) {
            geo = new THREE.PlaneGeometry(size[0] * 2 || 5, size[1] * 2 || 5);
        } else if (type === getVal(MG.mjGEOM_SPHERE)) {
            geo = new THREE.SphereGeometry(size[0], 24, 24);
        } else if (type === getVal(MG.mjGEOM_CAPSULE)) {
            geo = new CapsuleGeometry(size[0], size[1] * 2, 24, 12);
            geo.rotateX(Math.PI / 2);
        } else if (type === getVal(MG.mjGEOM_BOX)) {
            geo = new THREE.BoxGeometry(size[0] * 2, size[1] * 2, size[2] * 2);
        } else if (type === getVal(MG.mjGEOM_CYLINDER)) {
            geo = new THREE.CylinderGeometry(size[0], size[0], size[1] * 2, 24);
            geo.rotateX(Math.PI / 2);
        } else if (type === getVal(MG.mjGEOM_MESH)) {
            const mId = mjModel.geom_dataid[g];
            const vAdr = mjModel.mesh_vertadr[mId];
            const vNum = mjModel.mesh_vertnum[mId];
            const fAdr = mjModel.mesh_faceadr[mId];
            const fNum = mjModel.mesh_facenum[mId];
            geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(mjModel.mesh_vert.subarray(vAdr * 3, (vAdr + vNum) * 3), 3));
            geo.setIndex(Array.from(mjModel.mesh_face.subarray(fAdr * 3, (fAdr + fNum) * 3)));
            geo.computeVertexNormals();
        }

        if (geo) {
            let mesh;
            if (type === getVal(MG.mjGEOM_PLANE)) {
                // Dark floor instead of reflector for simplicity
                mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
                    color: 0x0a0a0f,
                    roughness: 0.8,
                    metalness: 0.1
                }));
                mesh.receiveShadow = true;
            } else {
                mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
                    color,
                    transparent: opacity < 1,
                    opacity,
                    roughness: 0.6,
                    metalness: 0.2
                }));
                mesh.castShadow = true;
                mesh.receiveShadow = true;
            }

            mesh.position.set(pos[0], pos[1], pos[2]);
            mesh.quaternion.set(quat[1], quat[2], quat[3], quat[0]);
            mesh.userData.bodyID = mjModel.geom_bodyid[g];
            return mesh;
        }
        return null;
    }
}

// ─── Robot Loader ───────────────────────────────────────────────────────────
class RobotLoader {
    constructor(mujoco) {
        this.mujoco = mujoco;
    }

    async load(robotId, sceneFile, onProgress) {
        try { this.mujoco.FS.unmount('/working'); } catch (e) { /* ignore */ }
        try { this.mujoco.FS.mkdir('/working'); } catch (e) { /* ignore */ }

        const isStacking = robotId === 'franka_panda_stack';
        const currentRobotId = isStacking ? 'franka_emika_panda' : robotId;
        const baseUrl = `https://raw.githubusercontent.com/google-deepmind/mujoco_menagerie/main/${currentRobotId}/`;

        const downloaded = new Set();
        const queue = [sceneFile];
        const parser = new DOMParser();

        while (queue.length > 0) {
            const fname = queue.shift();
            if (downloaded.has(fname)) continue;
            downloaded.add(fname);
            if (onProgress) onProgress(`Downloading ${fname}...`);

            const res = await fetch(baseUrl + fname);
            if (!res.ok) { console.warn(`Failed to fetch ${fname}`); continue; }

            const dirParts = fname.split('/');
            dirParts.pop();
            let currentPath = '/working';
            for (const part of dirParts) {
                currentPath += '/' + part;
                try { this.mujoco.FS.mkdir(currentPath); } catch (e) { /* ignore */ }
            }

            if (fname.endsWith('.xml')) {
                let text = await res.text();
                text = this._patchXML(fname, sceneFile, isStacking, text);
                this.mujoco.FS.writeFile(`/working/${fname}`, text);
                this._scanDeps(text, fname, parser, downloaded, queue);
            } else {
                const buffer = new Uint8Array(await res.arrayBuffer());
                this.mujoco.FS.writeFile(`/working/${fname}`, buffer);
            }
        }
        return { isStacking };
    }

    _patchXML(fname, sceneFile, isStacking, text) {
        if (fname === sceneFile) {
            // Inject a single cube and tray for demonstration
            const injection = `<body name="cube" pos="0.4 -0.1 0.04"><freejoint/><geom type="box" size="0.02 0.02 0.02" rgba="0.13 0.83 0.93 1" mass="0.05" friction="2 0.3 0.1" solref="0.01 1" solimp="0.95 0.99 0.001 0.5 2" condim="4"/></body><body name="tray" pos="0.4 0.2 0.0"><geom type="box" size="0.16 0.16 0.005" pos="0 0 0.005" rgba="0.15 0.15 0.2 1"/><geom type="box" size="0.16 0.005 0.02" pos="0 0.16 0.02" rgba="0.15 0.15 0.2 1"/><geom type="box" size="0.005 0.16 0.02" pos="-0.16 0 0.02" rgba="0.15 0.15 0.2 1"/></body>`;
            text = text.replace('</worldbody>', injection + '</worldbody>');
        }
        if (fname.endsWith('panda.xml')) {
            text = text
                .replace(/(<body[^>]*name=["']hand["'][^>]*>)/, '$1<site name="tcp" pos="0 0 0.1" size="0.01" rgba="1 0 0 0.5" group="1"/>')
                .replace(/name=["']actuator8["']/, 'name="gripper"');
        }
        return text;
    }

    _scanDeps(xmlString, currentFile, parser, downloaded, queue) {
        const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
        const compiler = xmlDoc.querySelector('compiler');
        const meshDir = compiler?.getAttribute('meshdir') || '';
        const textureDir = compiler?.getAttribute('texturedir') || '';
        const currentDir = currentFile.includes('/') ? currentFile.substring(0, currentFile.lastIndexOf('/') + 1) : '';

        xmlDoc.querySelectorAll('[file]').forEach(el => {
            const fileAttr = el.getAttribute('file');
            if (!fileAttr) return;
            let prefix = '';
            const tag = el.tagName.toLowerCase();
            if (tag === 'mesh') prefix = meshDir ? meshDir + '/' : '';
            else if (['texture', 'hfield'].includes(tag)) prefix = textureDir ? textureDir + '/' : '';

            let fullPath = (currentDir + prefix + fileAttr).replace(/\/\//g, '/');
            const parts = fullPath.split('/');
            const norm = [];
            for (const p of parts) { if (p === '..') norm.pop(); else if (p !== '.') norm.push(p); }
            fullPath = norm.join('/');
            if (!downloaded.has(fullPath)) queue.push(fullPath);
        });
    }
}

// ─── Analytical IK Solver (Franka Panda) ────────────────────────────────────
const d1 = 0.333, d3 = 0.316, d5 = 0.384, dF = 0.107;
const a4 = 0.0825, a5 = -0.0825, a7 = 0.088, dEE = 0.10;
const LL24 = Math.sqrt(d3 * d3 + a4 * a4);
const LL46 = Math.sqrt(d5 * d5 + a5 * a5);
const Q_MIN = [-2.8973, -1.7628, -2.8973, -3.0718, -2.8973, -0.0175, -2.8973];
const Q_MAX = [2.8973, 1.7628, 2.8973, -0.0698, 2.8973, 3.7525, 2.8973];

function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
}

function calculateAnalyticalIK(transform, q7) {
    const validSolutions = [];
    const pEE = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    transform.decompose(pEE, quat, scale);
    const R = new THREE.Matrix4().makeRotationFromQuaternion(quat);
    const xEE = new THREE.Vector3(), yEE = new THREE.Vector3(), zEE = new THREE.Vector3();
    R.extractBasis(xEE, yEE, zEE);

    const p7 = pEE.clone().sub(zEE.clone().multiplyScalar(dF + dEE));
    const alpha = Math.PI / 4 - q7;
    const x6_EE = new THREE.Vector3(Math.cos(alpha), Math.sin(alpha), 0);
    const x6 = x6_EE.clone().applyMatrix4(R);
    const p6 = p7.clone().sub(x6.clone().multiplyScalar(a7));
    const p2 = new THREE.Vector3(0, 0, d1);
    const p2p6 = p6.clone().sub(p2);
    const L26 = p2p6.length();

    if (L26 > LL24 + LL46 || L26 < Math.abs(LL24 - LL46)) return [];

    const cosGamma = (LL24 * LL24 + LL46 * LL46 - L26 * L26) / (2 * LL24 * LL46);
    const gamma = Math.acos(Math.max(-1, Math.min(1, cosGamma)));
    const angle1 = Math.atan2(d3, a4);
    const angle2 = Math.atan2(d5, Math.abs(a5));
    const q4 = angle1 + angle2 + gamma - 2 * Math.PI;
    if (q4 < Q_MIN[3] || q4 > Q_MAX[3]) return [];

    const y6 = zEE.clone().negate();
    const z6 = new THREE.Vector3().crossVectors(x6, y6);
    const cosAlpha2 = (L26 * L26 + LL46 * LL46 - LL24 * LL24) / (2 * L26 * LL46);
    const ang_O2O6O4 = Math.acos(Math.max(-1, Math.min(1, cosAlpha2)));
    const ang_HO6O4 = Math.PI / 2 - angle2;
    const ang_O2O6H = ang_O2O6O4 + ang_HO6O4;

    const vec_O2O6 = p6.clone().sub(p2);
    const x_inv = x6.dot(vec_O2O6);
    const y_inv = y6.dot(vec_O2O6);
    const LHS_amp = Math.sqrt(x_inv * x_inv + y_inv * y_inv);
    const RHS = L26 * Math.cos(ang_O2O6H);
    if (Math.abs(RHS) > LHS_amp) return [];

    const phi = Math.atan2(y_inv, x_inv);
    const psi = Math.asin(Math.max(-1, Math.min(1, RHS / LHS_amp)));
    const q6_candidates = [Math.PI - psi - phi, psi - phi];

    for (let q6 of q6_candidates) {
        q6 = normalizeAngle(q6);
        if (q6 < Q_MIN[5] || q6 > Q_MAX[5]) continue;

        const z5_6 = new THREE.Vector3(Math.sin(q6), Math.cos(q6), 0);
        const z5 = x6.clone().multiplyScalar(z5_6.x).add(y6.clone().multiplyScalar(z5_6.y)).add(z6.clone().multiplyScalar(z5_6.z));

        const ang_O2O4O6 = gamma;
        const ang_O2O4O3 = angle1;
        const ang_O2O6P = ang_O2O6H;
        const ang_O2PO6 = ang_O2O6O4 + ang_O2O4O6 + ang_O2O4O3 - ang_O2O6P - Math.PI / 2;
        const ang_PO2O6 = Math.PI - ang_O2PO6 - ang_O2O6P;
        const len_PO6 = L26 * Math.sin(ang_PO2O6) / Math.sin(ang_O2PO6);
        const vec_O2P = vec_O2O6.clone().sub(z5.clone().multiplyScalar(len_PO6));

        const q1_1 = Math.atan2(vec_O2P.y, vec_O2P.x);
        const q2_1 = Math.acos(Math.max(-1, Math.min(1, vec_O2P.z / vec_O2P.length())));
        const q1_2 = Math.atan2(-vec_O2P.y, -vec_O2P.x);
        const q2_2 = -Math.acos(Math.max(-1, Math.min(1, vec_O2P.z / vec_O2P.length())));
        const pairs = [[q1_1, q2_1], [q1_2, q2_2]];

        for (const [rawQ1, rawQ2] of pairs) {
            const q1 = normalizeAngle(rawQ1);
            const q2 = normalizeAngle(rawQ2);
            if (q1 < Q_MIN[0] || q1 > Q_MAX[0]) continue;
            if (q2 < Q_MIN[1] || q2 > Q_MAX[1]) continue;

            const y3 = new THREE.Vector3().crossVectors(vec_O2P, vec_O2O6).normalize();
            const z3 = vec_O2P.clone().normalize();
            const x3 = new THREE.Vector3().crossVectors(y3, z3);
            const m1 = new THREE.Matrix4().makeRotationZ(q1);
            const m2 = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
            const m3 = new THREE.Matrix4().makeRotationZ(q2);
            const R2 = m1.multiply(m2).multiply(m3);
            const R2_inv = R2.clone().invert();
            const x3_in_2 = x3.clone().applyMatrix4(R2_inv);
            let q3 = Math.atan2(x3_in_2.z, x3_in_2.x);
            q3 = normalizeAngle(q3);
            if (q3 < Q_MIN[2] || q3 > Q_MAX[2]) continue;

            const pH = p6.clone().sub(z5.clone().multiplyScalar(d5));
            const p4 = p2.clone().add(z3.clone().multiplyScalar(d3)).add(x3.clone().multiplyScalar(a4));
            const HO4 = p4.clone().sub(pH);
            const R6 = new THREE.Matrix4().makeBasis(x6, y6, z6);
            const HO4_6 = HO4.clone().applyMatrix4(R6.clone().invert());
            const c6 = Math.cos(q6), s6 = Math.sin(q6);
            const x5s = c6 * HO4_6.x - s6 * HO4_6.y;
            const y5s = -HO4_6.z;
            let q5 = -Math.atan2(y5s, x5s);
            q5 = normalizeAngle(q5);
            if (q5 < Q_MIN[4] || q5 > Q_MAX[4]) continue;

            validSolutions.push([q1, q2, q3, q4, q5, q6, q7]);
        }
    }
    return validSolutions;
}

// ─── IK System ──────────────────────────────────────────────────────────────
function squaredDistance(arr1, arr2) {
    let sum = 0;
    for (let i = 0; i < arr1.length; i++) sum += (arr1[i] - arr2[i]) ** 2;
    return sum;
}

class IkSystem {
    constructor() {
        this.target = new THREE.Group();
        this.target.name = 'IK Target';
        this.target.add(new THREE.AxesHelper(0.15));
        this.calculating = false;
        this.gripperSiteId = -1;
        this.qNeutral = [0, -0.785, 0, -2.356, 0, 1.571, 0.785];
        this.q7Min = -2.8973;
        this.q7Max = 2.8973;
        this.q7Step = 0.1;
    }

    syncToSite(mjData) {
        if (this.gripperSiteId === -1) return;
        const sitePos = mjData.site_xpos.subarray(this.gripperSiteId * 3, this.gripperSiteId * 3 + 3);
        const siteMat = mjData.site_xmat.subarray(this.gripperSiteId * 9, this.gripperSiteId * 9 + 9);
        this.target.position.set(sitePos[0], sitePos[1], sitePos[2]);
        const m = new THREE.Matrix4().set(
            siteMat[0], siteMat[1], siteMat[2], 0,
            siteMat[3], siteMat[4], siteMat[5], 0,
            siteMat[6], siteMat[7], siteMat[8], 0,
            0, 0, 0, 1
        );
        this.target.quaternion.setFromRotationMatrix(m);
    }

    solve(pos, quat, currentQ) {
        this.target.position.copy(pos);
        this.target.quaternion.copy(quat);
        this.target.updateMatrixWorld();
        const transform = this.target.matrixWorld;

        let bestSolution = null;
        let minCost = Infinity;

        const processCandidateQ7 = (q7) => {
            const solutions = calculateAnalyticalIK(transform, q7);
            for (const sol of solutions) {
                const cost = squaredDistance(sol, currentQ) + 0.05 * squaredDistance(sol, this.qNeutral);
                if (cost < minCost) { minCost = cost; bestSolution = sol; }
            }
        };

        const currentQ7 = currentQ[6];
        processCandidateQ7(currentQ7);
        for (let q7 = Math.max(this.q7Min, currentQ7 - 0.5); q7 <= Math.min(this.q7Max, currentQ7 + 0.5); q7 += this.q7Step) {
            processCandidateQ7(q7);
        }
        if (!bestSolution) {
            for (let q7 = this.q7Min; q7 <= this.q7Max; q7 += this.q7Step * 2) {
                processCandidateQ7(q7);
            }
        }
        return bestSolution;
    }

    update(mjModel, mjData) {
        if (!this.calculating) return;
        const currentQ = [];
        for (let i = 0; i < 7; i++) currentQ.push(mjData.qpos[i]);
        const solution = this.solve(this.target.position, this.target.quaternion, currentQ);
        if (solution) {
            for (let i = 0; i < 7; i++) mjData.ctrl[i] = solution[i];
        }
    }
}

// ─── Render System (Simplified) ─────────────────────────────────────────────
class RenderSystem {
    constructor(container, mujoco) {
        this.container = container;
        this.geomBuilder = new GeomBuilder(mujoco);
        this.bodies = [];

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x09090b);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(this.renderer.domElement);

        this.camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(1.6, -1.2, 1.4);
        this.camera.lookAt(0, 0, 0.3);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.1;
        this.controls.target.set(0, 0, 0.3);
        this.controls.minDistance = 0.5;
        this.controls.maxDistance = 5;

        this.simGroup = new THREE.Group();
        this.scene.add(this.simGroup);

        // Grid
        const grid = new THREE.GridHelper(4, 40, 0x1a1a22, 0x111116);
        grid.rotation.x = Math.PI / 2;
        grid.position.z = -0.001;
        this.scene.add(grid);

        // Lights
        const main = new THREE.DirectionalLight(0xffffff, 1.2);
        main.position.set(1, 2, 5);
        main.castShadow = true;
        main.shadow.mapSize.set(2048, 2048);
        main.shadow.bias = -0.0001;
        this.simGroup.add(main);

        const fill = new THREE.DirectionalLight(0xffffff, 0.6);
        fill.position.set(-1, -1, 3);
        this.simGroup.add(fill);

        this.simGroup.add(new THREE.AmbientLight(0xffffff, 0.5));

        this._onResize = () => {
            this.camera.aspect = container.clientWidth / container.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(container.clientWidth, container.clientHeight);
        };
        window.addEventListener('resize', this._onResize);
    }

    initScene(mjModel) {
        this.bodies.forEach(b => this.simGroup.remove(b));
        this.bodies = [];
        for (let i = 0; i < mjModel.nbody; i++) {
            const grp = new THREE.Group();
            grp.userData.bodyID = i;
            this.bodies.push(grp);
            this.simGroup.add(grp);
        }
        for (let g = 0; g < mjModel.ngeom; g++) {
            const mesh = this.geomBuilder.create(mjModel, g);
            if (mesh) this.bodies[mjModel.geom_bodyid[g]].add(mesh);
        }
    }

    update(mjData) {
        this.controls.update();
        for (let i = 0; i < this.bodies.length; i++) {
            if (this.bodies[i]) {
                this.bodies[i].position.set(mjData.xpos[i * 3], mjData.xpos[i * 3 + 1], mjData.xpos[i * 3 + 2]);
                this.bodies[i].quaternion.set(mjData.xquat[i * 4 + 1], mjData.xquat[i * 4 + 2], mjData.xquat[i * 4 + 3], mjData.xquat[i * 4]);
                this.bodies[i].updateMatrixWorld();
            }
        }
        this.renderer.render(this.scene, this.camera);
    }

    dispose() {
        window.removeEventListener('resize', this._onResize);
        this.renderer.dispose();
        this.controls.dispose();
    }
}

// ─── Robot Viewer (Main API) ────────────────────────────────────────────────
// Motion bounds for the IK target
const Z_MIN = 0.08;
const Z_MAX = 0.65;
const MOVE_SPEED = 0.003; // meters per frame

/**
 * RobotViewer — Public API for the 3D robot arm.
 *
 * Usage:
 *   const viewer = new RobotViewer();
 *   await viewer.init(containerElement, (msg) => console.log(msg));
 *   viewer.moveUp();     // Start moving up
 *   viewer.moveDown();   // Start moving down
 *   viewer.stop();       // Stop movement
 *   viewer.dispose();    // Cleanup
 */
export class RobotViewer {
    constructor() {
        this.mujoco = null;
        this.mjModel = null;
        this.mjData = null;
        this.renderSys = null;
        this.ikSys = null;
        this.frameId = null;
        this.paused = false;
        this.gripperActuatorId = -1;

        // Command state: 'up', 'down', or 'idle'
        this._command = 'idle';
        this._targetPos = new THREE.Vector3(0.3, 0, 0.35);
        this._targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0));
        this._ikEnabled = false;

        // Status callback
        this._onStatusChange = null;
    }

    /**
     * Initialize the robot viewer.
     * @param {HTMLElement} container - DOM element to render into
     * @param {Function} onProgress - Progress callback (msg: string)
     * @param {Function} onStatusChange - Status callback ('loading'|'ready'|'error', msg)
     */
    async init(container, onProgress, onStatusChange) {
        this._onStatusChange = onStatusChange;
        if (onStatusChange) onStatusChange('loading', 'Initializing physics engine...');

        // Load MuJoCo WASM
        this.mujoco = await loadMujoco({
            locateFile: (path) => path.endsWith('.wasm')
                ? 'https://unpkg.com/mujoco-js@0.0.7/dist/mujoco_wasm.wasm'
                : path,
        });

        // Init render system
        this.renderSys = new RenderSystem(container, this.mujoco);
        this.ikSys = new IkSystem();
        this.renderSys.simGroup.add(this.ikSys.target);

        // Load robot model
        const loader = new RobotLoader(this.mujoco);
        await loader.load('franka_emika_panda', 'scene.xml', onProgress);

        if (onProgress) onProgress('Building simulation...');

        this.mjModel = this.mujoco.MjModel.loadFromXML('/working/scene.xml');
        this.mjData = new this.mujoco.MjData(this.mjModel);

        // Find gripper site and actuator
        for (let i = 0; i < this.mjModel.nsite; i++) {
            if (getName(this.mjModel, this.mjModel.name_siteadr[i]).includes('tcp')) {
                this.ikSys.gripperSiteId = i;
                break;
            }
        }
        for (let i = 0; i < this.mjModel.nu; i++) {
            if (getName(this.mjModel, this.mjModel.name_actuatoradr[i]).includes('gripper')) {
                this.gripperActuatorId = i;
                break;
            }
        }

        // Set initial pose
        const initVals = [1.707, -1.754, 0.003, -2.702, 0.003, 0.951, 2.490, 0.000];
        for (let i = 0; i < Math.min(initVals.length, this.mjModel.nu); i++) {
            this.mjData.ctrl[i] = initVals[i];
            if (this.mjModel.actuator_trnid[2 * i + 1] === 1) {
                const jointId = this.mjModel.actuator_trnid[2 * i];
                if (jointId >= 0 && jointId < this.mjModel.njnt) {
                    this.mjData.qpos[this.mjModel.jnt_qposadr[jointId]] = initVals[i];
                }
            }
        }

        this.mujoco.mj_forward(this.mjModel, this.mjData);
        this.renderSys.initScene(this.mjModel);
        this.ikSys.syncToSite(this.mjData);

        // Set initial IK target position
        this._targetPos.set(0.3, 0, 0.35);
        this.ikSys.target.position.copy(this._targetPos);
        this.ikSys.target.quaternion.copy(this._targetQuat);

        this._startLoop();

        if (onStatusChange) onStatusChange('ready', 'Robot ready');
    }

    /** Start continuous upward movement */
    moveUp() {
        this._command = 'up';
        this._enableIk();
    }

    /** Start continuous downward movement */
    moveDown() {
        this._command = 'down';
        this._enableIk();
    }

    /** Stop movement (hold current position) */
    stop() {
        this._command = 'idle';
    }

    /** Get current end-effector Z position (0-1 normalized) */
    getPosition() {
        const z = this._targetPos.z;
        return Math.max(0, Math.min(1, (z - Z_MIN) / (Z_MAX - Z_MIN)));
    }

    /** Get current command state */
    getCommand() {
        return this._command;
    }

    _enableIk() {
        if (!this._ikEnabled && this.mjData) {
            this._ikEnabled = true;
            this.ikSys.calculating = true;
            this.ikSys.syncToSite(this.mjData);
            this._targetPos.copy(this.ikSys.target.position);
        }
    }

    _startLoop() {
        if (this.frameId) cancelAnimationFrame(this.frameId);

        const loop = () => {
            if (!this.mjModel || !this.mjData) {
                this.frameId = requestAnimationFrame(loop);
                return;
            }

            // Update IK target based on command
            if (this._command === 'up') {
                this._targetPos.z = Math.min(Z_MAX, this._targetPos.z + MOVE_SPEED);
            } else if (this._command === 'down') {
                this._targetPos.z = Math.max(Z_MIN, this._targetPos.z - MOVE_SPEED);
            }

            // Apply IK
            if (this._ikEnabled) {
                this.ikSys.target.position.copy(this._targetPos);
                this.ikSys.target.quaternion.copy(this._targetQuat);
                this.ikSys.update(this.mjModel, this.mjData);
            }

            // Step simulation
            if (!this.paused) {
                const startTime = this.mjData.time;
                while (this.mjData.time - startTime < 1.0 / 60.0) {
                    this.mujoco.mj_step(this.mjModel, this.mjData);
                }
            }

            // Render
            this.renderSys.update(this.mjData);
            this.frameId = requestAnimationFrame(loop);
        };
        this.frameId = requestAnimationFrame(loop);
    }

    dispose() {
        if (this.frameId) cancelAnimationFrame(this.frameId);
        if (this.renderSys) this.renderSys.dispose();
        if (this.mjModel) this.mjModel.delete();
        if (this.mjData) this.mjData.delete();
        try { this.mujoco?.FS.unmount('/working'); } catch (e) { /* ignore */ }
    }

}
