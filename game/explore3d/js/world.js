/**
 * Reconstrucción 3D del mapa "Aldea de tumbas" (images/interface/backgroundX2.jpg).
 *
 * Disposición tomada del fondo 2D original (vista cenital):
 *   - izquierda: casa con techo de paja, farol amarillo, ventanas iluminadas y puerta;
 *   - camino de piedra pálida entre la casa y el jardín;
 *   - jardín de 9×5 casillas: 4 carriles de césped y 1 carril central de losas de piedra;
 *   - arriba: valla de tablas irregulares, montículo con calavera y árboles secos;
 *   - derecha: borde de rocas y un terreno de tierra violácea (aquí: el cementerio);
 *   - noche con luna creciente.
 *
 * Ejes: X = a lo largo de los carriles (casa → cementerio), Z = filas (valla → frente), Y = arriba.
 * Las texturas de césped, losas, tierra, roca y madera se recortan del fondo original.
 */
import * as THREE from "three";
import { mergeGeometries } from "../vendor/BufferGeometryUtils.js";
import { cropTexture, cropCanvas, loadImage } from "./assets.js";
import { TILE, LAWN_COLS, LAWN_ROWS, LANE_TYPES, SELECTED_MAP, FX } from "./config.js";
import { Physics } from "./physics.js";

/* ---------- utilidades ---------- */
function rng(seed) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
function hash2(x, y) {
	const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
	return s - Math.floor(s);
}
function vnoise(x, y) {
	const xi = Math.floor(x);
	const yi = Math.floor(y);
	const xf = x - xi;
	const yf = y - yi;
	const u = xf * xf * (3 - 2 * xf);
	const v = yf * yf * (3 - 2 * yf);
	const a = hash2(xi, yi);
	const b = hash2(xi + 1, yi);
	const c = hash2(xi, yi + 1);
	const d = hash2(xi + 1, yi + 1);
	return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) {
	let s = 0;
	let a = 0.5;
	for (let i = 0; i < 4; i++) {
		s += a * vnoise(x, y);
		x *= 2.03;
		y *= 2.03;
		a *= 0.5;
	}
	return s;
}
const smoothstep = (a, b, x) => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

/* Límites del jardín */
export const LAWN = { x0: 0, x1: LAWN_COLS * TILE, z0: 0, z1: LAWN_ROWS * TILE };
export const GRASS_TOP = 0.15;
export const STONE_TOP = 0.32;
const HOUSE = { x0: -11, x1: -3.5, z0: -2.5, z1: 14.5, h: 4 };
const FENCE_Z = -2.2;
export const BOUNDS = { x0: -13.5, x1: 47, z0: -9, z1: 21 };

/** Altura del terreno natural (sin contar objetos). */
export function terrainHeight(x, z) {
	// zona tranquila alrededor de la casa y el jardín (casi plana como en el mapa original)
	const dx = Math.max(HOUSE.x0 - 1 - x, 0, x - (LAWN.x1 + 1));
	const dz = Math.max(FENCE_Z - 1 - z, 0, z - (LAWN.z1 + 2.5));
	const calm = smoothstep(0, 5, Math.hypot(dx, dz));
	let h = (fbm(x * 0.07, z * 0.07) - 0.45) * 1.6 * calm + fbm(x * 0.4, z * 0.4) * 0.12 * calm;
	// colinas que cierran el escenario
	const ox = Math.max(BOUNDS.x0 - x, 0, x - BOUNDS.x1);
	const oz = Math.max(BOUNDS.z0 - z, 0, z - BOUNDS.z1);
	const o = Math.hypot(ox, oz);
	h += o * o * 0.05 + o * fbm(x * 0.1, z * 0.1) * 0.6;
	// el jardín está ligeramente elevado: aquí queda a ras
	if (x > LAWN.x0 - 0.05 && x < LAWN.x1 + 0.05 && z > LAWN.z0 - 0.05 && z < LAWN.z1 + 0.05) {
		h = Math.min(h, 0);
	}
	return h;
}

/** Suelo "caminable" incluyendo el césped y las losas (sin objetos). */
export function walkHeight(x, z) {
	if (x >= LAWN.x0 && x <= LAWN.x1 && z >= LAWN.z0 && z <= LAWN.z1) {
		const row = Math.floor((z - LAWN.z0) / TILE);
		return LANE_TYPES[Math.min(row, LAWN_ROWS - 1)] === 3 ? STONE_TOP : GRASS_TOP;
	}
	return terrainHeight(x, z);
}

/* ---------- texturas procedurales (inspiradas en los colores del fondo) ---------- */
function canvasTex(w, h, draw, repeat) {
	const c = document.createElement("canvas");
	c.width = w;
	c.height = h;
	draw(c.getContext("2d"), w, h);
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	if (repeat) {
		t.repeat.set(repeat[0], repeat[1]);
	}
	t.anisotropy = 4;
	return t;
}
function plasterTex() {
	const r = rng(7);
	return canvasTex(512, 512, (g, w, h) => {
		g.fillStyle = "#a8a2de";
		g.fillRect(0, 0, w, h);
		for (let i = 0; i < 3000; i++) {
			g.fillStyle = `rgba(${r() < 0.5 ? "255,255,255" : "40,30,90"},${r() * 0.07})`;
			g.fillRect(r() * w, r() * h, 2 + r() * 10, 2 + r() * 10);
		}
		// grietas
		g.strokeStyle = "rgba(50,40,110,0.55)";
		g.lineWidth = 2;
		for (let i = 0; i < 6; i++) {
			let x = r() * w;
			let y = r() * h;
			g.beginPath();
			g.moveTo(x, y);
			for (let k = 0; k < 6; k++) {
				x += (r() - 0.5) * 40;
				y += r() * 30;
				g.lineTo(x, y);
			}
			g.stroke();
		}
		// ladrillos a la vista (como en la esquina inferior izquierda del fondo)
		for (let p = 0; p < 3; p++) {
			const bx = r() * (w - 140);
			const by = r() * (h - 90);
			for (let yy = 0; yy < 4; yy++) {
				for (let xx = 0; xx < 4; xx++) {
					g.fillStyle = "#6c6098";
					g.fillRect(bx + xx * 34 + (yy % 2) * 17, by + yy * 20, 31, 17);
				}
			}
		}
	});
}
function woodTex(base = "#6b4a3a", dark = "#3d2a24") {
	const r = rng(11);
	return canvasTex(256, 256, (g, w, h) => {
		g.fillStyle = base;
		g.fillRect(0, 0, w, h);
		for (let i = 0; i < 70; i++) {
			g.strokeStyle = `rgba(30,15,10,${0.1 + r() * 0.25})`;
			g.lineWidth = 1 + r() * 2;
			const x = r() * w;
			g.beginPath();
			g.moveTo(x, 0);
			g.bezierCurveTo(x + (r() - 0.5) * 20, h * 0.3, x + (r() - 0.5) * 20, h * 0.6, x + (r() - 0.5) * 10, h);
			g.stroke();
		}
		g.fillStyle = dark;
		g.fillRect(0, 0, 4, h);
		g.fillRect(w - 4, 0, 4, h);
	});
}
function thatchTex() {
	const r = rng(3);
	return canvasTex(512, 512, (g, w, h) => {
		g.fillStyle = "#5e5a3a";
		g.fillRect(0, 0, w, h);
		for (let i = 0; i < 4500; i++) {
			const x = r() * w;
			const y = r() * h;
			const l = 20 + r() * 50;
			const c = 70 + r() * 70;
			g.strokeStyle = `rgba(${c + 40},${c + 30},${c * 0.55},${0.35 + r() * 0.5})`;
			g.lineWidth = 1 + r() * 1.5;
			g.beginPath();
			g.moveTo(x, y);
			g.lineTo(x + (r() - 0.5) * 6, y + l);
			g.stroke();
		}
		// hileras de paja
		for (let y = 0; y < h; y += 64) {
			g.fillStyle = "rgba(30,25,10,0.35)";
			g.fillRect(0, y, w, 5);
		}
	});
}

/* ---------- construcción ---------- */

/**
 * Crea el mundo. Devuelve escena, física, objetos interactivos y puntos de interés.
 * @param {THREE.Scene} scene
 */
export async function buildWorld(scene) {
	const bg = await loadImage(SELECTED_MAP.bg);
	const physics = new Physics(walkHeight);
	const interactables = [];
	const updaters = [];
	const R = rng(42);

	/* Texturas recortadas del fondo original */
	const T = {
		grass: cropTexture(bg, [300, 100, 200, 160], { repeat: [LAWN_COLS * 1.2, 1.2], brighten: 0.08 }),
		stone: cropTexture(bg, [252, 290, 168, 100], { mirror: false, brighten: 0.12 }),
		dirt: cropTexture(bg, [1120, 260, 240, 200], { repeat: [30, 18], brighten: 0.1 }),
		rock: cropTexture(bg, [1015, 300, 80, 120], { brighten: 0.12 }),
		fence: cropTexture(bg, [385, 2, 90, 55], { mirror: false, brighten: 0.12 }),
		path: cropTexture(bg, [252, 300, 80, 80], { repeat: [2, 8], brighten: 0.3 }),
		plaster: plasterTex(),
		wood: woodTex(),
		darkWood: woodTex("#4a3446", "#2a1c2a"),
		thatch: thatchTex(),
	};

	/* ===== Cielo nocturno ===== */
	const skyMat = new THREE.ShaderMaterial({
		side: THREE.BackSide,
		depthWrite: false,
		fog: false,
		uniforms: { top: { value: new THREE.Color("#0b0b35") }, mid: { value: new THREE.Color("#262672") }, bottom: { value: new THREE.Color("#2c2a6e") } },
		vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ",
		fragmentShader:
			"uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP; void main(){ float h=vP.y; vec3 c = h>0.15? mix(mid,top,smoothstep(0.15,0.8,h)) : mix(bottom,mid,smoothstep(-0.1,0.15,h)); gl_FragColor=vec4(c,1.0);} ",
	});
	const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat);
	scene.add(sky);
	updaters.push((dt, t, cam) => sky.position.copy(cam.position));

	// estrellas
	{
		const n = 1600;
		const pos = new Float32Array(n * 3);
		for (let i = 0; i < n; i++) {
			const th = R() * Math.PI * 2;
			const ph = Math.acos(0.05 + R() * 0.95);
			pos.set([Math.sin(ph) * Math.cos(th) * 380, Math.cos(ph) * 380, Math.sin(ph) * Math.sin(th) * 380], i * 3);
		}
		const g = new THREE.BufferGeometry();
		g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
		const stars = new THREE.Points(
			g,
			new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 })
		);
		sky.add(stars);
	}

	// luna creciente (arriba a la derecha en el fondo original → noreste)
	const moonDir = new THREE.Vector3(0.55, 0.62, -0.56).normalize();
	{
		const tex = canvasTex(256, 256, (g) => {
			const grd = g.createRadialGradient(128, 128, 40, 128, 128, 128);
			grd.addColorStop(0, "rgba(255,250,220,0.45)");
			grd.addColorStop(1, "rgba(255,250,220,0)");
			g.fillStyle = grd;
			g.fillRect(0, 0, 256, 256);
			g.fillStyle = "#fffbe6";
			g.beginPath();
			g.arc(128, 128, 48, 0, Math.PI * 2);
			g.fill();
			g.globalCompositeOperation = "destination-out";
			g.beginPath();
			g.arc(150, 112, 44, 0, Math.PI * 2);
			g.fill();
		});
		const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: false }));
		moon.scale.setScalar(55);
		moon.position.copy(moonDir).multiplyScalar(330);
		sky.add(moon);
	}
	scene.fog = new THREE.FogExp2(0x2c2a6e, 0.024);

	/* ===== Luces ===== */
	const hemi = new THREE.HemisphereLight(0x9a9cff, 0x3a2a55, 1.35);
	scene.add(hemi);
	const moonLight = new THREE.DirectionalLight(0xc8ccff, 1.9);
	moonLight.position
		.copy(moonDir)
		.multiplyScalar(60)
		.add(new THREE.Vector3(14, 0, 6));
	moonLight.target.position.set(14, 0, 6);
	moonLight.castShadow = true;
	moonLight.shadow.mapSize.set(2048, 2048);
	const sc = moonLight.shadow.camera;
	sc.left = -40;
	sc.right = 40;
	sc.top = 30;
	sc.bottom = -30;
	sc.near = 1;
	sc.far = 160;
	moonLight.shadow.bias = -0.0008;
	moonLight.shadow.normalBias = 0.03;
	scene.add(moonLight, moonLight.target);

	/* ===== Terreno ===== */
	{
		const W = BOUNDS.x1 - BOUNDS.x0 + 60;
		const D = BOUNDS.z1 - BOUNDS.z0 + 60;
		const g = new THREE.PlaneGeometry(W, D, 220, 140);
		g.rotateX(-Math.PI / 2);
		g.translate((BOUNDS.x0 + BOUNDS.x1) / 2, 0, (BOUNDS.z0 + BOUNDS.z1) / 2);
		const p = g.attributes.position;
		for (let i = 0; i < p.count; i++) {
			p.setY(i, terrainHeight(p.getX(i), p.getZ(i)) - 0.02);
		}
		g.computeVertexNormals();
		const uv = g.attributes.uv;
		for (let i = 0; i < uv.count; i++) {
			uv.setXY(i, p.getX(i) / 4, p.getZ(i) / 4);
		}
		T.dirt.repeat.set(1, 1);
		const ground = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: T.dirt }));
		ground.receiveShadow = true;
		scene.add(ground);
	}

	/* ===== Jardín: 4 carriles de césped + 1 de losas ===== */
	const lawnMat = new THREE.MeshLambertMaterial({ map: T.grass });
	for (let row = 0; row < LAWN_ROWS; row++) {
		const z = LAWN.z0 + (row + 0.5) * TILE;
		if (LANE_TYPES[row] === 3) {
			// carril de losas de piedra: 9 losas, cada una con su trozo de textura original
			const base = new THREE.Mesh(new THREE.BoxGeometry(LAWN.x1, 0.2, TILE), new THREE.MeshLambertMaterial({ color: 0x3b3260 }));
			base.position.set(LAWN.x1 / 2, 0.1, z);
			base.receiveShadow = true;
			scene.add(base);
			for (let c = 0; c < LAWN_COLS; c++) {
				const t = T.stone.clone();
				t.needsUpdate = true;
				t.repeat.set(0.5, 1);
				t.offset.set((c % 2) * 0.5, 0);
				const h = 0.12 + R() * 0.04;
				const slab = new THREE.Mesh(new THREE.BoxGeometry(TILE - 0.12, h, TILE - 0.16), new THREE.MeshLambertMaterial({ map: t }));
				slab.position.set((c + 0.5) * TILE, STONE_TOP - h / 2, z + (R() - 0.5) * 0.05);
				slab.rotation.y = (R() - 0.5) * 0.04;
				slab.receiveShadow = true;
				slab.castShadow = true;
				scene.add(slab);
			}
		} else {
			const lane = new THREE.Mesh(new THREE.BoxGeometry(LAWN.x1, GRASS_TOP + 0.05, TILE), lawnMat);
			lane.position.set(LAWN.x1 / 2, (GRASS_TOP - 0.05) / 2, z);
			lane.receiveShadow = true;
			scene.add(lane);
		}
	}
	// hojas de hierba en 3D (instancias)
	{
		const blade = new THREE.BufferGeometry();
		blade.setAttribute(
			"position",
			new THREE.Float32BufferAttribute([-0.03, 0, 0, 0.03, 0, 0, 0.0, 0.28, 0.02, -0.03, 0, 0, 0.0, 0.28, 0.02, -0.005, 0.18, 0.0], 3)
		);
		blade.computeVertexNormals();
		const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
		mat.onBeforeCompile = (sh) => {
			sh.uniforms.uTime = { value: 0 };
			mat.userData.shader = sh;
			sh.vertexShader =
				"uniform float uTime;\n" +
				sh.vertexShader.replace(
					"#include <begin_vertex>",
					"#include <begin_vertex>\n vec4 wp = instanceMatrix * vec4(0.0,0.0,0.0,1.0); transformed.x += sin(uTime*1.7 + wp.x*0.7 + wp.z*0.5) * 0.05 * position.y * 3.0;"
				);
		};
		const spots = [];
		for (let row = 0; row < LAWN_ROWS; row++) {
			if (LANE_TYPES[row] !== 3) {
				spots.push(row);
			}
		}
		const N = 16000;
		const inst = new THREE.InstancedMesh(blade, mat, N);
		const m = new THREE.Matrix4();
		const q = new THREE.Quaternion();
		const col = new THREE.Color();
		for (let i = 0; i < N; i++) {
			let x;
			let z;
			if (i < N * 0.85) {
				const row = spots[Math.floor(R() * spots.length)];
				x = LAWN.x0 + R() * LAWN.x1;
				z = LAWN.z0 + (row + R()) * TILE;
			} else {
				// matas fuera del jardín (bordes, cementerio)
				x = BOUNDS.x0 + R() * (BOUNDS.x1 - BOUNDS.x0);
				z = BOUNDS.z0 + R() * (BOUNDS.z1 - BOUNDS.z0);
				if (x > LAWN.x0 && x < LAWN.x1 && z > LAWN.z0 && z < LAWN.z1) {
					continue;
				}
				if (x > HOUSE.x0 && x < HOUSE.x1 && z > HOUSE.z0 && z < HOUSE.z1) {
					continue;
				}
			}
			const s = 0.6 + R() * 0.9;
			q.setFromEuler(new THREE.Euler((R() - 0.5) * 0.4, R() * Math.PI, (R() - 0.5) * 0.4));
			m.compose(new THREE.Vector3(x, walkHeight(x, z) - 0.01, z), q, new THREE.Vector3(s, s, s));
			inst.setMatrixAt(i, m);
			col.setHSL(0.33 + R() * 0.07, 0.55, 0.16 + R() * 0.14);
			inst.setColorAt(i, col);
		}
		inst.receiveShadow = true;
		scene.add(inst);
		updaters.push((dt, t) => {
			if (mat.userData.shader) {
				mat.userData.shader.uniforms.uTime.value = t;
			}
		});
	}

	/* ===== Camino pálido entre la casa y el jardín ===== */
	{
		const g = new THREE.BoxGeometry(3.4, 0.1, HOUSE.z1 - HOUSE.z0 + 2);
		const path = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: T.path, color: 0xd8d0ff }));
		path.position.set(-1.75, 0.03, (HOUSE.z0 + HOUSE.z1) / 2);
		path.receiveShadow = true;
		scene.add(path);
	}

	/* ===== Casa ===== */
	const plasterMat = new THREE.MeshLambertMaterial({ map: T.plaster });
	const woodMat = new THREE.MeshLambertMaterial({ map: T.wood });
	const darkWoodMat = new THREE.MeshLambertMaterial({ map: T.darkWood });
	function block(w, h, d, mat, x, y, z, collide = true, tag) {
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
		mesh.position.set(x, y, z);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		scene.add(mesh);
		if (collide) {
			physics.addBoxCentered(x, z, w, d, y - h / 2, y + h / 2, tag);
		}
		return mesh;
	}
	const wt = 0.3; // grosor muros
	const doorZ = 6;
	const doorW = 1.6;
	const doorH = 2.6;
	const fx = HOUSE.x1 - wt / 2; // muro frontal
	// muro frontal con hueco de puerta
	{
		const zA0 = HOUSE.z0;
		const zA1 = doorZ - doorW / 2;
		const zB0 = doorZ + doorW / 2;
		const zB1 = HOUSE.z1;
		block(wt, HOUSE.h, zA1 - zA0, plasterMat, fx, HOUSE.h / 2, (zA0 + zA1) / 2);
		block(wt, HOUSE.h, zB1 - zB0, plasterMat, fx, HOUSE.h / 2, (zB0 + zB1) / 2);
		block(wt, HOUSE.h - doorH, doorW, plasterMat, fx, doorH + (HOUSE.h - doorH) / 2, doorZ);
	}
	block(wt, HOUSE.h, HOUSE.z1 - HOUSE.z0, plasterMat, HOUSE.x0 + wt / 2, HOUSE.h / 2, (HOUSE.z0 + HOUSE.z1) / 2);
	block(HOUSE.x1 - HOUSE.x0, HOUSE.h, wt, plasterMat, (HOUSE.x0 + HOUSE.x1) / 2, HOUSE.h / 2, HOUSE.z0 + wt / 2);
	block(HOUSE.x1 - HOUSE.x0, HOUSE.h, wt, plasterMat, (HOUSE.x0 + HOUSE.x1) / 2, HOUSE.h / 2, HOUSE.z1 - wt / 2);
	// suelo y techo interior
	{
		const floor = new THREE.Mesh(new THREE.BoxGeometry(HOUSE.x1 - HOUSE.x0 - 0.1, 0.1, HOUSE.z1 - HOUSE.z0 - 0.1), woodMat);
		floor.position.set((HOUSE.x0 + HOUSE.x1) / 2, 0.05, (HOUSE.z0 + HOUSE.z1) / 2);
		floor.receiveShadow = true;
		scene.add(floor);
		const ceil = new THREE.Mesh(new THREE.BoxGeometry(HOUSE.x1 - HOUSE.x0, 0.12, HOUSE.z1 - HOUSE.z0), darkWoodMat);
		ceil.position.set((HOUSE.x0 + HOUSE.x1) / 2, HOUSE.h + 0.06, (HOUSE.z0 + HOUSE.z1) / 2);
		ceil.castShadow = true;
		scene.add(ceil);
	}
	// vigas de madera en esquinas y arriba
	for (const z of [HOUSE.z0 + 0.15, HOUSE.z1 - 0.15]) {
		block(0.4, HOUSE.h + 0.1, 0.4, darkWoodMat, HOUSE.x1 - 0.1, HOUSE.h / 2, z, false);
	}
	block(0.35, 0.35, HOUSE.z1 - HOUSE.z0 + 0.4, darkWoodMat, HOUSE.x1 + 0.02, HOUSE.h - 0.1, (HOUSE.z0 + HOUSE.z1) / 2, false);
	block(0.25, 0.25, HOUSE.z1 - HOUSE.z0, darkWoodMat, HOUSE.x1 + 0.02, 0.15, (HOUSE.z0 + HOUSE.z1) / 2, false);

	// techo de paja a dos aguas
	{
		const cx = (HOUSE.x0 + HOUSE.x1) / 2;
		const half = (HOUSE.x1 - HOUSE.x0) / 2 + 1.0;
		const rise = 3.2;
		const len = Math.hypot(half, rise);
		const ang = Math.atan2(rise, half);
		const roofLen = HOUSE.z1 - HOUSE.z0 + 1.6;
		T.thatch.repeat.set(3, 2);
		const roofMat = new THREE.MeshLambertMaterial({ map: T.thatch });
		for (const side of [-1, 1]) {
			const slab = new THREE.Mesh(new THREE.BoxGeometry(len, 0.45, roofLen), roofMat);
			slab.position.set(cx + (side * half) / 2, HOUSE.h + rise / 2 - 0.05, (HOUSE.z0 + HOUSE.z1) / 2);
			slab.rotation.z = -side * ang;
			slab.castShadow = true;
			slab.receiveShadow = true;
			scene.add(slab);
		}
		// hastiales triangulares
		const tri = new THREE.Shape();
		tri.moveTo(-half + 1, 0);
		tri.lineTo(half - 1, 0);
		tri.lineTo(0, rise - 0.3);
		tri.closePath();
		const tg = new THREE.ExtrudeGeometry(tri, { depth: wt, bevelEnabled: false });
		for (const z of [HOUSE.z0, HOUSE.z1 - wt]) {
			const m = new THREE.Mesh(tg, plasterMat);
			m.rotation.y = 0;
			m.position.set(cx, HOUSE.h, z);
			m.castShadow = true;
			scene.add(m);
		}
		// cumbrera
		const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, roofLen + 0.2, 8), new THREE.MeshLambertMaterial({ color: 0x4b4628 }));
		ridge.rotation.x = Math.PI / 2;
		ridge.position.set(cx, HOUSE.h + rise + 0.1, (HOUSE.z0 + HOUSE.z1) / 2);
		ridge.castShadow = true;
		scene.add(ridge);
	}

	// ventanas iluminadas con celosía (como en el fondo original)
	const windowGlow = new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffc94a, emissiveIntensity: 1.4 });
	function windowAt(z) {
		const g = new THREE.Group();
		const frame = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.5, 1.3), darkWoodMat);
		g.add(frame);
		const pane = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.2, 1.0), windowGlow);
		g.add(pane);
		for (let i = -1; i <= 1; i++) {
			const bar = new THREE.Mesh(new THREE.BoxGeometry(0.26, 1.2, 0.07), darkWoodMat);
			bar.position.z = i * 0.25;
			g.add(bar);
		}
		const sill = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 1.5), woodMat);
		sill.position.y = -0.8;
		g.add(sill);
		g.position.set(HOUSE.x1 + 0.02, 2.0, z);
		scene.add(g);
		const l = new THREE.PointLight(0xffb84a, 6, 7, 1.6);
		l.position.set(HOUSE.x1 + 0.8, 2.0, z);
		scene.add(l);
	}
	windowAt(2.2);
	windowAt(10.8);

	// puerta funcional (bisagra)
	const door = { open: false, angle: 0 };
	{
		const hinge = new THREE.Group();
		hinge.position.set(HOUSE.x1 - wt / 2, 0, doorZ - doorW / 2);
		const panel = new THREE.Mesh(
			new THREE.BoxGeometry(0.12, doorH - 0.05, doorW - 0.05),
			new THREE.MeshLambertMaterial({ map: woodTex("#7a4f3c", "#3c241c") })
		);
		panel.position.set(0, doorH / 2, doorW / 2);
		panel.castShadow = true;
		const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd8b04a, metalness: 0.7, roughness: 0.3 }));
		knob.position.set(0.12, doorH / 2, doorW - 0.25);
		hinge.add(panel, knob);
		scene.add(hinge);
		const col = physics.addBoxCentered(HOUSE.x1 - wt / 2, doorZ, wt, doorW, 0, doorH, "door");
		door.hinge = hinge;
		door.collider = col;
		updaters.push((dt) => {
			const target = door.open ? -1.75 : 0;
			door.angle += (target - door.angle) * Math.min(1, dt * 6);
			hinge.rotation.y = door.angle;
		});
		interactables.push({
			name: "Puerta de la casa",
			position: new THREE.Vector3(HOUSE.x1, 1.3, doorZ),
			radius: 2.4,
			prompt: () => (door.open ? "Cerrar la puerta" : "Abrir la puerta"),
			use: (game) => {
				door.open = !door.open;
				col.enabled = !door.open;
				game.ui.toast(door.open ? "La puerta se abre con un crujido…" : "Puerta cerrada.");
				game.audio.play(door.open ? "door" : "doorClose");
			},
		});
	}

	// farol amarillo (se puede apagar/encender)
	{
		const g = new THREE.Group();
		const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff2a0, emissive: 0xffd040, emissiveIntensity: 2 });
		const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 14), lampMat);
		body.scale.y = 0.8;
		const capMat = new THREE.MeshLambertMaterial({ color: 0x8a5a2a });
		const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.14, 12), capMat);
		cap.position.y = 0.36;
		const bottom = cap.clone();
		bottom.position.y = -0.36;
		bottom.rotation.x = Math.PI;
		const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), darkWoodMat);
		arm.position.set(-0.45, 0.62, 0);
		const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2), darkWoodMat);
		rope.position.y = 0.52;
		g.add(body, cap, bottom, arm, rope);
		g.position.set(HOUSE.x1 + 0.95, 2.75, 8.4);
		scene.add(g);
		const light = new THREE.PointLight(0xffc860, 30, 16, 1.5);
		light.position.copy(g.position).add(new THREE.Vector3(0.1, -0.1, 0));
		scene.add(light);
		let on = true;
		updaters.push((dt, t) => {
			g.rotation.z = Math.sin(t * 1.3) * 0.04;
			if (on) {
				light.intensity = 30 + Math.sin(t * 9) * 1.2 + Math.sin(t * 23) * 0.8;
			}
		});
		interactables.push({
			name: "Farol",
			position: g.position.clone(),
			radius: 2.8,
			prompt: () => (on ? "Apagar el farol" : "Encender el farol"),
			use: (game) => {
				on = !on;
				light.intensity = on ? 30 : 0;
				lampMat.emissiveIntensity = on ? 2 : 0.05;
				game.ui.toast(on ? "El farol vuelve a brillar." : "Has apagado el farol. Qué oscuro…");
			},
		});
	}

	// cajón de madera bajo el farol (se puede subir encima)
	block(0.9, 0.8, 1.7, woodMat, HOUSE.x1 + 0.6, 0.4, 10.0);

	// interior: mesa, taburetes, estantería y lámpara
	{
		const tx = -7.2;
		const tz = 6;
		block(1.8, 0.1, 1.1, woodMat, tx, 0.85, tz, false);
		physics.addBoxCentered(tx, tz, 1.8, 1.1, 0, 0.9, "table");
		for (const [dx, dz] of [
			[-0.8, -0.45],
			[0.8, -0.45],
			[-0.8, 0.45],
			[0.8, 0.45],
		]) {
			block(0.08, 0.8, 0.08, darkWoodMat, tx + dx, 0.4, tz + dz, false);
		}
		block(0.5, 0.45, 0.5, woodMat, tx - 1.4, 0.225, tz, true);
		block(0.5, 0.45, 0.5, woodMat, tx + 1.4, 0.225, tz, true);
		block(0.5, 2.2, 3, darkWoodMat, HOUSE.x0 + 0.6, 1.1, 2.5, true);
		const potMat = new THREE.MeshLambertMaterial({ color: 0xa0603a });
		for (let i = 0; i < 4; i++) {
			const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.11, 0.3, 10), potMat);
			pot.position.set(HOUSE.x0 + 0.6, 2.35, 1.5 + i * 0.65);
			scene.add(pot);
		}
		const candle = new THREE.Mesh(
			new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8),
			new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xffd070, emissiveIntensity: 2 })
		);
		candle.position.set(tx, 1.0, tz);
		scene.add(candle);
		const inLight = new THREE.PointLight(0xffb060, 14, 9, 1.4);
		inLight.position.set(tx, 2.2, tz);
		scene.add(inLight);
		// libro sobre la mesa: almanaque
		const book = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.07, 0.3), new THREE.MeshLambertMaterial({ color: 0x8b5a2b }));
		book.position.set(tx + 0.4, 0.94, tz + 0.1);
		book.rotation.y = 0.3;
		scene.add(book);
		interactables.push({
			name: "Almanaque Suburbano",
			position: book.position.clone(),
			radius: 2,
			prompt: () => "Leer el almanaque",
			use: (game) => game.ui.showAlmanac(),
		});
	}

	// escalera apoyada en la esquina (detalle del fondo original)
	{
		const g = new THREE.Group();
		for (const s of [-0.3, 0.3]) {
			const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 4.2, 0.08), woodMat);
			rail.position.set(0, 2.1, s);
			g.add(rail);
		}
		for (let i = 0; i < 10; i++) {
			const rung = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.6), woodMat);
			rung.position.set(0, 0.3 + i * 0.4, 0);
			g.add(rung);
		}
		g.rotation.z = -0.25;
		g.position.set(HOUSE.x1 + 0.6, 0, HOUSE.z0 + 0.6);
		g.traverse((o) => (o.castShadow = true));
		scene.add(g);
	}

	// carretilla con saco (abajo a la izquierda en el fondo)
	{
		const g = new THREE.Group();
		const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.9), woodMat);
		body.position.y = 0.65;
		const sack = new THREE.Mesh(new THREE.SphereGeometry(0.45, 14, 10), new THREE.MeshLambertMaterial({ color: 0x8a4a8a }));
		sack.scale.set(1, 0.7, 0.8);
		sack.position.y = 1.05;
		const wheelMat = new THREE.MeshLambertMaterial({ color: 0x3a2a2a });
		for (const s of [-0.5, 0.5]) {
			const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 16), wheelMat);
			wheel.rotation.x = Math.PI / 2;
			wheel.position.set(0.35, 0.35, s);
			g.add(wheel);
		}
		for (const s of [-0.35, 0.35]) {
			const h = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.07, 0.07), darkWoodMat);
			h.position.set(-1.1, 0.75, s);
			h.rotation.z = 0.25;
			g.add(h);
		}
		g.add(body, sack);
		g.position.set(-1.6, 0, 15.2);
		g.rotation.y = 0.4;
		g.traverse((o) => (o.castShadow = true));
		scene.add(g);
		physics.addCylinder(-1.6, 15.2, 0.85, 0, 1.3, "cart");
		interactables.push({
			name: "Carretilla",
			position: new THREE.Vector3(-1.6, 1, 15.2),
			radius: 2.4,
			prompt: () => "Examinar la carretilla",
			use: (game) => game.ui.examine("Carretilla", "Un saco de semillas violetas. Los vecinos de la aldea las usan para plantar en el jardín."),
		});
		// macetas de barro
		const potMat = new THREE.MeshLambertMaterial({ color: 0x9a5a7a });
		for (const [x, z] of [
			[-2.9, 13.6],
			[-2.6, 12.9],
		]) {
			const pot = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), potMat);
			pot.scale.y = 0.8;
			pot.position.set(x, 0.26, z);
			pot.castShadow = true;
			scene.add(pot);
			physics.addCylinder(x, z, 0.32, 0, 0.5);
		}
	}

	/* ===== Valla de tablas irregulares ===== */
	{
		const geos = [];
		let x = HOUSE.x1 - 0.2;
		const x1 = LAWN.x1 + 2.2;
		while (x < x1) {
			const w = 0.5 + R() * 0.2;
			const h = 1.5 + R() * 1.2;
			const g = new THREE.BoxGeometry(w, h, 0.12);
			// punta rota
			const p = g.attributes.position;
			for (let i = 0; i < p.count; i++) {
				if (p.getY(i) > 0) {
					p.setY(i, p.getY(i) + (p.getX(i) > 0 ? R() * 0.25 : -R() * 0.15));
				}
			}
			g.rotateZ((R() - 0.5) * 0.12);
			g.rotateY((R() - 0.5) * 0.1);
			g.translate(x + w / 2, h / 2, FENCE_Z + (R() - 0.5) * 0.1);
			geos.push(g);
			x += w + 0.04;
		}
		// travesaños
		for (const y of [0.5, 1.3]) {
			const g = new THREE.BoxGeometry(x1 - HOUSE.x1, 0.14, 0.1);
			g.translate((x1 + HOUSE.x1) / 2, y, FENCE_Z + 0.12);
			geos.push(g);
		}
		const fence = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ map: T.fence, color: 0xe0dcff }));
		fence.castShadow = true;
		fence.receiveShadow = true;
		scene.add(fence);
		physics.addBox(HOUSE.x1 - 0.3, x1, FENCE_Z - 0.15, FENCE_Z + 0.2, 0, 2.6, "fence");
	}

	/* ===== Rocas del borde derecho ===== */
	function rockGeo(r, seed) {
		const g = new THREE.IcosahedronGeometry(r, 2);
		const p = g.attributes.position;
		for (let i = 0; i < p.count; i++) {
			const x = p.getX(i);
			const y = p.getY(i);
			const z = p.getZ(i);
			const k = 0.75 + fbm(x * 1.3 + seed, z * 1.3 + y * 0.7) * 0.55;
			p.setXYZ(i, x * k, y * k * 0.75, z * k);
		}
		g.computeVertexNormals();
		return g;
	}
	const rockMat = new THREE.MeshLambertMaterial({ map: T.rock, color: 0x9a98b8 });
	function rock(x, z, r, collide = true) {
		const m = new THREE.Mesh(rockGeo(r, R() * 100), rockMat);
		m.position.set(x, terrainHeight(x, z) + r * 0.3, z);
		m.rotation.y = R() * 6;
		m.castShadow = true;
		m.receiveShadow = true;
		scene.add(m);
		if (collide) {
			physics.addCylinder(x, z, r * 0.85, -1, m.position.y + r * 0.6);
		}
		return m;
	}
	for (let z = FENCE_Z + 0.5; z < LAWN.z1 + 1; z += 1.5 + R() * 0.6) {
		rock(LAWN.x1 + 0.9 + R() * 0.8, z, 0.7 + R() * 0.55);
	}
	for (let i = 0; i < 14; i++) {
		rock(BOUNDS.x0 + R() * (BOUNDS.x1 - BOUNDS.x0), BOUNDS.z1 - 1 - R() * 3, 0.5 + R() * 1.2);
	}
	for (let i = 0; i < 6; i++) {
		rock(26 + R() * 18, FENCE_Z - 3 - R() * 4, 0.5 + R() * 1);
	}

	/* ===== Montículo con calavera (arriba del jardín) ===== */
	{
		const g = new THREE.Group();
		const mound = new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 12), new THREE.MeshLambertMaterial({ color: 0x5a3a55 }));
		mound.scale.set(1.3, 0.35, 0.6);
		g.add(mound);
		const boneMat = new THREE.MeshLambertMaterial({ color: 0xe6e2f2 });
		const skull = new THREE.Mesh(new THREE.SphereGeometry(0.38, 18, 14), boneMat);
		skull.position.set(0.3, 0.55, 0.2);
		const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.28), boneMat);
		jaw.position.set(0.3, 0.28, 0.32);
		const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1030 });
		for (const s of [-0.12, 0.12]) {
			const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), eyeMat);
			eye.position.set(0.3 + s, 0.6, 0.53);
			g.add(eye);
		}
		const flower = new THREE.Group();
		for (let i = 0; i < 5; i++) {
			const pet = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffffff }));
			pet.position.set(Math.cos((i / 5) * 6.28) * 0.1, 0, Math.sin((i / 5) * 6.28) * 0.1);
			flower.add(pet);
		}
		const cen = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshLambertMaterial({ color: 0xf0d040 }));
		flower.add(cen);
		flower.position.set(-0.4, 0.75, 0.1);
		g.add(skull, jaw, flower);
		g.position.set(15.3, 0, FENCE_Z + 0.9);
		g.traverse((o) => (o.castShadow = true));
		scene.add(g);
		physics.addCylinder(15.3, FENCE_Z + 0.9, 0.9, 0, 0.6);
		interactables.push({
			name: "Montículo con calavera",
			position: new THREE.Vector3(15.3, 0.6, FENCE_Z + 1.1),
			radius: 2.5,
			prompt: () => "Examinar el montículo",
			use: (game) => game.ui.examine("Montículo con calavera", "Alguien enterró aquí a un zombi impaciente. Una florecilla blanca ha crecido encima."),
		});
	}

	/* ===== Árboles secos ===== */
	const barkMat = new THREE.MeshLambertMaterial({ color: 0x3e2d4f });
	function treeGeo(seed) {
		const r = rng(seed);
		const geos = [];
		function branch(base, dir, len, rad, depth) {
			const end = base.clone().addScaledVector(dir, len);
			const g = new THREE.CylinderGeometry(rad * 0.65, rad, len, 7, 1);
			g.translate(0, len / 2, 0);
			const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
			g.applyQuaternion(q);
			g.translate(base.x, base.y, base.z);
			geos.push(g);
			if (depth <= 0) {
				return;
			}
			const n = 2 + Math.floor(r() * 2);
			for (let i = 0; i < n; i++) {
				const nd = dir
					.clone()
					.add(new THREE.Vector3((r() - 0.5) * 1.6, r() * 0.5, (r() - 0.5) * 1.6))
					.normalize();
				branch(end, nd, len * (0.55 + r() * 0.25), rad * 0.62, depth - 1);
			}
		}
		branch(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3((r() - 0.5) * 0.2, 1, (r() - 0.5) * 0.2).normalize(), 3.2 + r() * 1.5, 0.35 + r() * 0.15, 3);
		return mergeGeometries(geos);
	}
	function tree(x, z, s, seed) {
		const m = new THREE.Mesh(treeGeo(seed), barkMat);
		m.position.set(x, terrainHeight(x, z), z);
		m.scale.setScalar(s);
		m.castShadow = true;
		scene.add(m);
		physics.addCylinder(x, z, 0.4 * s, -1, 6 * s);
	}
	tree(3, FENCE_Z - 2.5, 1.2, 1);
	tree(11, FENCE_Z - 4, 1.4, 2);
	tree(21, FENCE_Z - 3, 1.1, 3);
	tree(40, -4, 1.8, 4); // gran árbol arriba a la derecha
	tree(33, 16, 1.3, 5);
	tree(44, 9, 1.2, 6);
	tree(-12, 17.5, 1.1, 7);
	tree(6, 19, 1.0, 8);
	tree(-8, -6.5, 1.3, 9);

	/* ===== Cementerio: lápidas originales (Tombstones.png) con volumen ===== */
	const tombImg = await loadImage(FX.tombstones);
	const tombstones = [];
	{
		const cw = 86;
		const ch = 121;
		const spots = [
			[28, 1.5],
			[31, 5.5],
			[28.5, 9.8],
			[34, 2.2],
			[35.5, 8],
			[39, 4.5],
			[38.5, 11.5],
			[31.5, 13.5],
			[42.5, 1.5],
			[43, 8.5],
		];
		spots.forEach(([x, z], i) => {
			const canvas = cropCanvas(tombImg, [(i % 5) * cw, 0, cw, ch]);
			const tex = new THREE.CanvasTexture(canvas);
			tex.colorSpace = THREE.SRGBColorSpace;
			const w = 1.3;
			const h = (w * ch) / cw;
			const geo = new THREE.PlaneGeometry(w, h);
			geo.translate(0, h / 2 - 0.12, 0);
			const front = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, color: 0xe8e8ff });
			const inner = front.clone();
			inner.color.setRGB(0.35, 0.35, 0.45);
			const g = new THREE.Group();
			const L = 10;
			const depth = 0.32;
			for (let k = 0; k < L; k++) {
				const m = new THREE.Mesh(geo, k === 0 || k === L - 1 ? front : inner);
				m.position.z = -(k / (L - 1)) * depth;
				m.castShadow = k === 0;
				if (k === 0) {
					m.customDepthMaterial = new THREE.MeshDepthMaterial({ map: tex, alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking });
				}
				g.add(m);
			}
			const y = terrainHeight(x, z);
			g.position.set(x, y, z);
			g.rotation.y = -Math.PI / 2 + (R() - 0.5) * 0.3; // mirando hacia la aldea
			g.rotation.z = (R() - 0.5) * 0.08;
			scene.add(g);
			// tierra removida delante
			const dirt = new THREE.Mesh(new THREE.SphereGeometry(0.8, 14, 8), new THREE.MeshLambertMaterial({ color: 0x4a3352 }));
			dirt.scale.set(0.7, 0.18, 1.1);
			dirt.position.set(x - 1.1, y, z);
			dirt.receiveShadow = true;
			scene.add(dirt);
			const col = physics.addBoxCentered(x + 0.15, z, depth + 0.15, w * 0.9, y - 0.5, y + h - 0.2, "tomb");
			const t = { group: g, collider: col, x, z, y, alive: true, spawn: new THREE.Vector3(x - 1.2, y, z) };
			tombstones.push(t);
			interactables.push({
				name: "Lápida",
				position: new THREE.Vector3(x, y + 1, z),
				radius: 2.6,
				enabled: () => t.alive,
				prompt: () => "Golpear la lápida (despierta un zombi)",
				use: (game) => game.events.wakeZombie(t),
			});
		});
	}

	/* ===== Luciérnagas ===== */
	{
		const n = 90;
		const pos = new Float32Array(n * 3);
		const seeds = [];
		for (let i = 0; i < n; i++) {
			const x = -4 + R() * 46;
			const z = -1 + R() * 18;
			seeds.push([x, z, 0.6 + R() * 2, R() * 10]);
		}
		const g = new THREE.BufferGeometry();
		g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
		const tex = canvasTex(32, 32, (c) => {
			const grd = c.createRadialGradient(16, 16, 0, 16, 16, 16);
			grd.addColorStop(0, "rgba(255,255,180,1)");
			grd.addColorStop(1, "rgba(255,255,120,0)");
			c.fillStyle = grd;
			c.fillRect(0, 0, 32, 32);
		});
		const pts = new THREE.Points(
			g,
			new THREE.PointsMaterial({ map: tex, size: 0.25, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff6a0 })
		);
		pts.frustumCulled = false;
		scene.add(pts);
		updaters.push((dt, t) => {
			for (let i = 0; i < n; i++) {
				const [x, z, h, s] = seeds[i];
				pos[i * 3] = x + Math.sin(t * 0.3 + s) * 1.5;
				pos[i * 3 + 1] = walkHeight(x, z) + h + Math.sin(t * 0.8 + s * 2) * 0.3;
				pos[i * 3 + 2] = z + Math.cos(t * 0.25 + s) * 1.5;
			}
			g.attributes.position.needsUpdate = true;
		});
	}

	/* ===== Límites invisibles ===== */
	physics.addBox(BOUNDS.x0 - 1, BOUNDS.x0, BOUNDS.z0 - 1, BOUNDS.z1 + 1, -5, 50);
	physics.addBox(BOUNDS.x1, BOUNDS.x1 + 1, BOUNDS.z0 - 1, BOUNDS.z1 + 1, -5, 50);
	physics.addBox(BOUNDS.x0 - 1, BOUNDS.x1 + 1, BOUNDS.z0 - 1, BOUNDS.z0, -5, 50);
	physics.addBox(BOUNDS.x0 - 1, BOUNDS.x1 + 1, BOUNDS.z1, BOUNDS.z1 + 1, -5, 50);

	/** centro de una casilla del jardín */
	const cell = (col, row) => new THREE.Vector3((col + 0.5) * TILE, LANE_TYPES[row] === 3 ? STONE_TOP : GRASS_TOP, (row + 0.5) * TILE);

	return {
		physics,
		interactables,
		tombstones,
		door,
		cell,
		playerStart: new THREE.Vector3(-1.6, 0, 6.2),
		playerYaw: -Math.PI / 2, // mirando hacia el jardín (+X)
		/** puntos desde donde pueden llegar zombis además de las tumbas */
		extraSpawns: [
			new THREE.Vector3(12, 0, 19.5),
			new THREE.Vector3(30, 0, -6),
			new THREE.Vector3(45, 0, 16),
			new THREE.Vector3(-11, 0, 19.5),
			new THREE.Vector3(26, 0, 19),
		],
		update(dt, t, cam) {
			for (const u of updaters) {
				u(dt, t, cam);
			}
		},
	};
}
