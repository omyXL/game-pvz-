/**
 * Hoja Gruñona (Grumpy Leafling): planta 3D aportada por el usuario
 * (modelo Meshy AI convertido a models/grumpy_leafling.glb).
 *
 * Funcionamiento:
 *  - En el jardín hay un brote mágico. Al pulsar E sobre él, la Hoja Gruñona brota de la tierra.
 *  - Permanece solo 6 segundos.
 *  - Mientras está, lanza ondas de viento que EMPUJAN HACIA ATRÁS al jugador y a los zombis
 *    que estén cerca (alejándolos de ella).
 *  - Después se encoge, vuelve a la tierra y el brote necesita unos segundos para recargarse.
 *
 * El modelo no trae animaciones: la aparición, el balanceo, el "soplido" y la desaparición
 * se animan por código (escala, inclinación y rotación).
 */
import * as THREE from "three";
import { GLTFLoader } from "../../vendor/GLTFLoader.js";

export const LEAFLING = {
	name: "Hoja Gruñona",
	model: "models/grumpy_leafling.glb",
	height: 1.5, // metros
	life: 6, // segundos visible
	cooldown: 4, // segundos de recarga del brote después de irse
	pulseEvery: 1.2, // cada cuánto lanza una onda
	radius: 4.2, // alcance de la onda
	zombieForce: 9, // m/s
	playerForce: 8, // m/s
};

let modelPromise = null;
/** Carga el modelo una sola vez (809 KB, textura WebP 1024²). */
export function loadLeaflingModel() {
	if (!modelPromise) {
		modelPromise = new GLTFLoader().loadAsync(LEAFLING.model).then((gltf) => {
			const root = gltf.scene;
			// normalizar: base en y = 0 y altura LEAFLING.height
			const box = new THREE.Box3().setFromObject(root);
			const size = box.getSize(new THREE.Vector3());
			const s = LEAFLING.height / size.y;
			root.scale.setScalar(s);
			root.position.set(-((box.min.x + box.max.x) / 2) * s, -box.min.y * s, -((box.min.z + box.max.z) / 2) * s);
			root.traverse((o) => {
				if (o.isMesh) {
					o.castShadow = true;
					o.receiveShadow = true;
					// un poco de luz propia para que se vea de noche
					o.material.emissive = new THREE.Color(0x0c2a08);
				}
			});
			return root;
		});
	}
	return modelPromise;
}

const ease = (t) => 1 - Math.pow(1 - t, 3);
const back = (t) => {
	const c = 1.9;
	return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

export class LeaflingSpot {
	/**
	 * @param {object} game
	 * @param {THREE.Object3D} model plantilla del modelo ya cargado
	 * @param {THREE.Vector3} pos posición del brote
	 */
	constructor(game, model, pos) {
		this.game = game;
		this.pos = pos.clone();
		this.state = "ready"; // ready | grow | active | shrink | cooldown
		this.t = 0;
		this.pulseT = 0;
		this.readyAt = 0;

		// brote mágico (indica dónde se puede invocar)
		this.sprout = new THREE.Group();
		const dirt = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 8), new THREE.MeshLambertMaterial({ color: 0x4a3352 }));
		dirt.scale.set(1, 0.22, 1);
		const leafMat = new THREE.MeshStandardMaterial({ color: 0x5fd04a, emissive: 0x1d5a10, roughness: 0.6 });
		for (let i = 0; i < 3; i++) {
			const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), leafMat);
			leaf.scale.set(1, 0.35, 1.7);
			const a = (i / 3) * Math.PI * 2;
			leaf.position.set(Math.cos(a) * 0.13, 0.2, Math.sin(a) * 0.13);
			leaf.rotation.y = -a;
			leaf.rotation.z = 0.5;
			this.sprout.add(leaf);
		}
		const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.22, 6), leafMat);
		stem.position.y = 0.1;
		this.sprout.add(dirt, stem);
		this.glow = new THREE.PointLight(0x8cff6a, 4, 4, 1.6);
		this.glow.position.y = 0.5;
		this.sprout.add(this.glow);
		this.sprout.position.copy(this.pos);
		game.scene.add(this.sprout);

		// la Hoja Gruñona
		this.body = new THREE.Group(); // posición, giro hacia el objetivo
		this.tilt = new THREE.Group(); // inclinación al soplar
		this.mesh = model.clone(true);
		this.tilt.add(this.mesh);
		this.body.add(this.tilt);
		this.body.position.copy(this.pos);
		this.body.visible = false;
		game.scene.add(this.body);

		// onda de viento (anillo que se expande); se reutiliza siempre la misma malla
		this.ring = new THREE.Mesh(
			new THREE.RingGeometry(0.85, 1, 48),
			new THREE.MeshBasicMaterial({
				color: 0xb8ff9a,
				transparent: true,
				opacity: 0,
				side: THREE.DoubleSide,
				depthWrite: false,
				blending: THREE.AdditiveBlending,
			})
		);
		this.ring.rotation.x = -Math.PI / 2;
		this.ring.position.copy(this.pos).setY(this.pos.y + 0.12);
		this.ring.visible = false;
		game.scene.add(this.ring);
		this.ringT = 1;

		this.collider = game.physics.addCylinder(this.pos.x, this.pos.z, 0.5, this.pos.y - 0.2, this.pos.y + 1.4, "leafling");
		this.collider.enabled = false;

		this.interaction = {
			name: LEAFLING.name,
			radius: 3,
			position: () => this.pos.clone().setY(this.pos.y + (this.state === "ready" || this.state === "cooldown" ? 0.3 : 1)),
			prompt: () => this._prompt(),
			use: (g) => this._use(g),
		};
	}

	_prompt() {
		if (this.state === "ready") {
			return "Invocar a la Hoja Gruñona (6 s)";
		}
		if (this.state === "cooldown") {
			return `El brote se está recargando… ${Math.ceil(this.readyAt - this.game.time)} s`;
		}
		return `Examinar: ${LEAFLING.name} (${Math.max(0, Math.ceil(LEAFLING.life - this.t))} s)`;
	}

	_use(g) {
		if (this.state === "ready") {
			this.summon();
		} else if (this.state === "cooldown") {
			g.ui.toast("Al brote todavía le faltan fuerzas.");
		} else {
			g.ui.examine(
				LEAFLING.name,
				"Una planta malhumorada que no soporta que nadie se le acerque. Aparece solo 6 segundos y lanza ráfagas de viento que empujan hacia atrás a zombis… y también a ti.<br><br>Modelo 3D aportado para este modo (no forma parte del juego original)."
			);
		}
	}

	/** Hace brotar a la Hoja Gruñona. */
	summon() {
		this.state = "grow";
		this.t = 0;
		this.pulseT = 0.6; // primera onda poco después de salir
		this.body.visible = true;
		this.body.scale.setScalar(0.01);
		this.sprout.visible = false;
		this.collider.enabled = true;
		this.game.audio.play("grow", this.pos, 1);
		this.game.ui.toast("¡La Hoja Gruñona ha brotado! Aléjate…");
		this._faceNearest();
	}

	_faceNearest() {
		const g = this.game;
		let best = null;
		let bd = Infinity;
		const cands = [g.player.pos, ...g.zombies.filter((z) => z.alive && z.state !== "rise").map((z) => z.pos)];
		for (const p of cands) {
			const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
			if (d < bd) {
				bd = d;
				best = p;
			}
		}
		if (best) {
			const target = Math.atan2(best.x - this.pos.x, best.z - this.pos.z); // el modelo mira a +Z
			let diff = target - this.body.rotation.y;
			diff = Math.atan2(Math.sin(diff), Math.cos(diff));
			this.body.rotation.y += diff * 0.15;
		}
	}

	/** Onda de viento: empuja hacia atrás a todo lo que esté dentro del radio. */
	pulse() {
		const g = this.game;
		const R = LEAFLING.radius;
		let hits = 0;
		for (const z of g.zombies) {
			if (!z.alive || z.state === "rise") {
				continue;
			}
			const dx = z.pos.x - this.pos.x;
			const dz = z.pos.z - this.pos.z;
			const d = Math.hypot(dx, dz);
			if (d < R) {
				z.knockback(dx, dz, LEAFLING.zombieForce * (1 - (d / R) * 0.5));
				hits++;
			}
		}
		const p = g.player;
		const dx = p.pos.x - this.pos.x;
		const dz = p.pos.z - this.pos.z;
		const d = Math.hypot(dx, dz);
		if (p.alive && d < R) {
			p.knockback(dx, dz, LEAFLING.playerForce * (1 - (d / R) * 0.5), 3.2);
			g.ui.toast("¡La Hoja Gruñona te ha empujado!", 1400);
			hits++;
		}
		this.ringT = 0;
		this.ring.visible = true;
		this.puffT = 0;
		g.audio.play("gust", this.pos, 0.9);
		if (hits) {
			g.audio.play("boing", this.pos, 0.6);
		}
		return hits;
	}

	update(dt) {
		const g = this.game;
		this.t += dt;
		// brote: pulsa suavemente cuando está listo
		if (this.state === "ready") {
			const k = 1 + Math.sin(g.time * 3) * 0.08;
			this.sprout.scale.setScalar(k);
			this.glow.intensity = 3 + Math.sin(g.time * 3) * 1.5;
		}
		if (this.state === "cooldown" && g.time >= this.readyAt) {
			this.state = "ready";
			this.sprout.visible = true;
		}

		if (this.state === "grow") {
			const k = Math.min(1, this.t / 0.45);
			this.body.scale.setScalar(Math.max(0.01, back(k)));
			if (k >= 1) {
				this.state = "active";
			}
		}
		if (this.state === "grow" || this.state === "active") {
			this._faceNearest();
			this.pulseT -= dt;
			if (this.pulseT <= 0 && this.state === "active") {
				this.pulseT = LEAFLING.pulseEvery;
				this.pulse();
			}
			// balanceo y "soplido" (inclinación hacia delante al lanzar la onda)
			this.puffT = (this.puffT ?? 1) + dt;
			const puff = this.puffT < 0.35 ? Math.sin((this.puffT / 0.35) * Math.PI) : 0;
			this.tilt.rotation.x = puff * 0.35 + Math.sin(this.t * 4) * 0.04;
			this.tilt.rotation.z = Math.sin(this.t * 2.5) * 0.06;
			const sq = 1 + puff * 0.12;
			this.tilt.scale.set(sq, 1 / sq, sq);
			if (this.t >= LEAFLING.life) {
				this.state = "shrink";
				this.t = 0;
				g.audio.play("vanish", this.pos, 0.8);
			}
		}
		if (this.state === "shrink") {
			const k = Math.min(1, this.t / 0.5);
			this.body.scale.setScalar(Math.max(0.01, 1 - ease(k)));
			this.body.rotation.y += dt * 8;
			if (k >= 1) {
				this.body.visible = false;
				this.collider.enabled = false;
				this.state = "cooldown";
				this.readyAt = g.time + LEAFLING.cooldown;
				g.ui.toast("La Hoja Gruñona ha vuelto a la tierra.");
			}
		}
		// anillo de la onda
		if (this.ring.visible) {
			this.ringT += dt / 0.55;
			const r = 0.4 + ease(Math.min(1, this.ringT)) * LEAFLING.radius;
			this.ring.scale.setScalar(r);
			this.ring.material.opacity = Math.max(0, 0.75 * (1 - this.ringT));
			if (this.ringT >= 1) {
				this.ring.visible = false;
			}
		}
	}
}
