/**
 * Zombi del modo 3D.
 *
 * Usa las animaciones GIF originales de cada tipo:
 *   idle (1.gif), walk, attack, lostHead, lostHeadAttack, head (cabeza cayendo), die.
 * El proyecto no tiene animación de "recibir daño": igual que en el juego 2D, el zombi
 * parpadea en blanco al ser golpeado (y se tiñe de azul si lo congela un guisante de hielo).
 *
 * Estados: rise → idle/wander → chase → attack → (lostHead) → dying → dead
 */
import * as THREE from "three";
import { ZOMBIES } from "../config.js";
import { AnimatedSprite3D } from "../sprite.js";

const CHASE_RANGE = 17;
const LOSE_RANGE = 24;
const BITE_RANGE = 1.15;
const RADIUS = 0.42;
const _dir = new THREE.Vector3();

/** Carga todas las animaciones de un tipo de zombi (incluidas las del zombi base si pierde la armadura). */
export async function loadZombieAnims(type, loadAnim) {
	const def = ZOMBIES[type];
	const out = {};
	const entries = Object.entries(def.anims);
	if (def.fallback) {
		for (const [k, v] of Object.entries(ZOMBIES[def.fallback].anims)) {
			entries.push(["base_" + k, v]);
		}
	}
	await Promise.all(entries.map(async ([k, v]) => (out[k] = await loadAnim(v))));
	return out;
}

let nextId = 1;

export class Zombie {
	/**
	 * @param {object} game  referencia al juego (física, jugador, efectos, audio)
	 * @param {string} type  clave de ZOMBIES
	 * @param {Record<string,any>} anims animaciones ya cargadas
	 * @param {THREE.Vector3} pos
	 * @param {{rise?:boolean}} opt
	 */
	constructor(game, type, anims, pos, opt = {}) {
		this.id = nextId++;
		this.game = game;
		this.type = type;
		this.def = ZOMBIES[type];
		// los sprites de zombi se reutilizan (pool) en lugar de crearse y destruirse
		this.sprite = game.takeZombieSprite(type) || new AnimatedSprite3D(anims, this.def.anchor, { thickness: 0.22 });
		this.sprite.reset();
		this.root = this.sprite.root;
		this.pos = pos.clone();
		this.home = pos.clone();
		this.hp = this.def.hp;
		this.maxHp = this.def.hp;
		this.armor = this.def.armor || 0;
		this.hasHead = true;
		this.slow = 0;
		this.biteTimer = 0;
		this.groanTimer = 3 + Math.random() * 8;
		this.wanderTimer = 0;
		this.target = null;
		this.vel = new THREE.Vector3();
		this.alive = true;
		this.removed = false;
		this.state = opt.rise ? "rise" : "idle";
		this.riseT = 0;
		this.yOffset = opt.rise ? -2.3 : 0;
		this.deathT = 0;
		this.walkAnim = Math.random() < 0.5 || !anims.walk2 ? "walk" : "walk2";
		this.useBase = false; // true cuando pierde el cono/cubo

		// sombra de contacto
		this.blob = new THREE.Mesh(game.blobGeo, game.blobMat);
		this.blob.rotation.x = -Math.PI / 2;
		this.blob.scale.set(1.2, 0.7, 1);
		game.scene.add(this.root, this.blob);
		this._anim(opt.rise ? "walk" : "idle", { speed: opt.rise ? 0.4 : 1 });
		this._place();
	}

	/** nombre de la animación según si tiene armadura o cabeza */
	_key(name) {
		if (!this.hasHead) {
			if (name === "attack") {
				return "lostHeadAttack";
			}
			if (name === "walk" || name === "idle") {
				return "lostHead";
			}
		}
		if (this.useBase && this.sprite.anims["base_" + name]) {
			return "base_" + name;
		}
		if (name === "walk" && this.walkAnim === "walk2" && this.sprite.anims.walk2) {
			return "walk2";
		}
		return name;
	}
	_anim(name, opt) {
		const key = this._key(name);
		const realKey = this.useBase && !this.hasHead ? "base_" + key : key;
		if (!this.sprite.play(realKey, opt)) {
			this.sprite.play(key, opt);
		}
	}

	_place() {
		const g = this.game.physics.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5, RADIUS);
		this.pos.y = g;
		this.root.position.set(this.pos.x, g + this.yOffset, this.pos.z);
		this.blob.position.set(this.pos.x, g + 0.03, this.pos.z);
		this.blob.visible = this.yOffset > -0.5;
	}

	get name() {
		return this.def.name;
	}
	get height() {
		return 2.1;
	}

	/** Recibe daño de un proyectil o de una planta. */
	damage(amount, kind) {
		if (!this.alive || this.state === "rise") {
			return;
		}
		this.sprite.flash = 1;
		if (kind === "snow") {
			this.slow = 4;
			this.game.audio.play("frozen", this.pos, 0.5);
		}
		if (this.armor > 0) {
			this.armor -= amount;
			this.game.audio.play(this.type === "buckethead" ? "bucket" : "cone", this.pos, 0.7);
			if (this.armor <= 0) {
				// pierde el cono/cubo: pasa a usar las animaciones del zombi común
				this.useBase = true;
				this._anim(this.state === "attack" ? "attack" : "walk", { restart: true });
			}
			return;
		}
		this.hp -= amount;
		this.game.audio.play("splat", this.pos, 0.6);
		if (this.hasHead && this.hp <= this.maxHp * 0.5) {
			this._loseHead();
		}
		if (this.hp <= 0) {
			this.die();
		}
	}

	_loseHead() {
		this.hasHead = false;
		this.game.audio.play("limbs", this.pos, 0.8);
		const headPath = this.useBase || !this.def.fallback ? ZOMBIES[this.def.fallback || this.type].anims.head : null;
		if (headPath) {
			this.game.effects.spawn(headPath, this.root.position.clone().add(new THREE.Vector3(0, 0, 0)), {
				anchor: [62, 178],
				hold: 1.2,
				fade: 0.6,
				facingRight: this.sprite.facingRight,
			});
		}
		this._anim(this.state === "attack" ? "attack" : "walk", { restart: true });
	}

	/** Muerte con su animación original (o "BoomDie" si explota). */
	die(boom = false) {
		if (!this.alive) {
			return;
		}
		this.alive = false;
		this.state = "dying";
		this.deathT = 0;
		const base = ZOMBIES[this.def.fallback || this.type].anims;
		const key = boom ? "boomDie" : "die";
		const anims = this.sprite.anims;
		let k = null;
		if (anims[key]) {
			k = key;
		} else if (anims["base_" + key]) {
			k = "base_" + key;
		}
		if (k) {
			this.sprite.play(k, { loop: false, onEnd: () => (this.state = "dead") });
		} else {
			this.state = "dead";
		}
		this.game.onZombieKilled(this);
		void base;
	}

	/** Lo engulle una planta carnívora: desaparece sin animación de muerte. */
	eaten() {
		if (!this.alive) {
			return;
		}
		this.alive = false;
		this.state = "dead";
		this.deathT = 1.5;
		this.root.visible = false;
		this.blob.visible = false;
		this.game.onZombieKilled(this);
	}

	update(dt, camera) {
		const game = this.game;
		this.groanTimer -= dt;
		if (this.alive && this.groanTimer <= 0) {
			this.groanTimer = 6 + Math.random() * 10;
			game.audio.play("groan", this.pos, 0.6);
		}
		if (this.slow > 0) {
			this.slow -= dt;
			this.sprite.tint.setRGB(0.55, 0.75, 1.3);
		} else {
			this.sprite.tint.setRGB(1, 1, 1);
		}
		const speedMul = this.slow > 0 ? 0.5 : 1;
		this.sprite.speed = speedMul;

		switch (this.state) {
			case "rise":
				this.riseT += dt;
				this.yOffset = Math.min(0, -2.3 + this.riseT * 1.5);
				if (this.yOffset >= 0) {
					this.state = "idle";
					this.wanderTimer = 0.5;
				}
				break;
			case "idle":
			case "wander":
			case "chase":
			case "attack":
				this._think(dt, speedMul, camera);
				break;
			case "dying":
				this.deathT += dt;
				if (this.deathT > 5) {
					this.state = "dead";
				}
				break;
			case "dead":
				this.deathT += dt;
				if (this.deathT < 1.5) {
					this.sprite.setOpacity(1 - this.deathT / 1.5);
				} else if (!this.removed) {
					this.remove();
				}
				break;
		}
		this._place();
		this.sprite.update(dt, camera);
	}

	_think(dt, speedMul, camera) {
		const game = this.game;
		const player = game.player;
		const dx = player.pos.x - this.pos.x;
		const dz = player.pos.z - this.pos.z;
		const dist = Math.hypot(dx, dz);
		const canSee = player.alive && Math.abs(player.pos.y - this.pos.y) < 3.5;

		if (canSee && (dist < CHASE_RANGE || (this.state === "chase" && dist < LOSE_RANGE) || this.state === "attack")) {
			if (dist < BITE_RANGE) {
				if (this.state !== "attack") {
					this.state = "attack";
					this.biteTimer = 0.45;
					this._anim("attack");
				}
				this.biteTimer -= dt * speedMul;
				if (this.biteTimer <= 0) {
					this.biteTimer = 0.9;
					game.audio.play("chomp", this.pos, 0.9);
					player.hurt(this.def.damage, this);
				}
				this.sprite.faceDirection(dx, dz, camera);
				return;
			}
			if (this.state !== "chase") {
				if (this.state !== "attack") {
					game.audio.play("groan", this.pos, 0.8);
				}
				this.state = "chase";
				this._anim("walk");
			}
			this._move(dx / dist, dz / dist, this.def.speed * 1.35 * speedMul, dt, camera);
			return;
		}

		// deambular cerca de su tumba
		if (this.state === "chase" || this.state === "attack") {
			this.state = "idle";
			this.wanderTimer = 1 + Math.random() * 2;
			this._anim("idle");
		}
		this.wanderTimer -= dt;
		if (this.state === "idle") {
			if (this.wanderTimer <= 0) {
				const a = Math.random() * Math.PI * 2;
				const r = 1.5 + Math.random() * 5;
				this.target = new THREE.Vector3(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
				this.state = "wander";
				this._anim("walk");
				this.wanderTimer = 6;
			}
		} else if (this.state === "wander") {
			const tx = this.target.x - this.pos.x;
			const tz = this.target.z - this.pos.z;
			const d = Math.hypot(tx, tz);
			if (d < 0.4 || this.wanderTimer <= 0) {
				this.state = "idle";
				this.wanderTimer = 2 + Math.random() * 4;
				this._anim("idle");
			} else {
				this._move(tx / d, tz / d, this.def.speed * 0.6 * speedMul, dt, camera);
			}
		}
	}

	_move(nx, nz, speed, dt, camera) {
		// separación entre zombis para que no se amontonen
		let sx = 0;
		let sz = 0;
		for (const o of this.game.zombies) {
			if (o === this || !o.alive) {
				continue;
			}
			const ox = this.pos.x - o.pos.x;
			const oz = this.pos.z - o.pos.z;
			const d2 = ox * ox + oz * oz;
			if (d2 < 1.2 && d2 > 1e-4) {
				const d = Math.sqrt(d2);
				sx += (ox / d) * (1.1 - d);
				sz += (oz / d) * (1.1 - d);
			}
		}
		_dir.set(nx + sx * 1.5, 0, nz + sz * 1.5).normalize();
		const before = this.pos.clone();
		this.pos.x += _dir.x * speed * dt;
		this.pos.z += _dir.z * speed * dt;
		const hit = this.game.physics.resolve(this.pos, RADIUS, this.pos.y, 1.9);
		if (hit) {
			// si choca, intenta rodear el obstáculo deslizándose de lado
			const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
			if (moved < speed * dt * 0.3) {
				this.pos.x += -_dir.z * speed * dt * 0.8;
				this.pos.z += _dir.x * speed * dt * 0.8;
				this.game.physics.resolve(this.pos, RADIUS, this.pos.y, 1.9);
			}
		}
		this.sprite.faceDirection(_dir.x, _dir.z, camera);
	}

	remove() {
		this.removed = true;
		this.root.removeFromParent();
		this.blob.removeFromParent();
		this.game.releaseZombieSprite(this.type, this.sprite);
	}
}
