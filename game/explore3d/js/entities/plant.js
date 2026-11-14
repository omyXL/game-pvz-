/**
 * Planta del modo 3D con su animación GIF original.
 *  - Las que disparan (lanzaguisantes, repetidora, hielo, hongo) apuntan al zombi vivo
 *    más cercano dentro de su alcance y le lanzan proyectiles 3D.
 *  - La planta carnívora engulle a un zombi cercano (animación de ataque y de digestión originales).
 *  - El girasol suelta un sol al pulsar E.
 *  - La planterna emite luz real.
 */
import * as THREE from "three";
import { PLANTS, PX } from "../config.js";
import { AnimatedSprite3D } from "../sprite.js";

export async function loadPlantAnims(type, loadAnim) {
	const out = {};
	await Promise.all(Object.entries(PLANTS[type].anims).map(async ([k, v]) => (out[k] = await loadAnim(v))));
	return out;
}

export class Plant {
	constructor(game, type, anims, pos) {
		this.game = game;
		this.type = type;
		this.def = PLANTS[type];
		this.sprite = new AnimatedSprite3D(anims, this.def.anchor, { facesRight: true, thickness: 0.18 });
		this.sprite.facingRight = true; // miran hacia el cementerio (+X)
		this.root = this.sprite.root;
		this.pos = pos.clone();
		this.root.position.copy(pos);
		this.cooldown = Math.random() * 1.2;
		this.burst = 0;
		this.state = "idle";
		this.digestT = 0;
		this.sprite.play("idle");
		this.sprite.frame = Math.floor(Math.random() * this.sprite.current.frames);
		const h = anims.idle.height * PX;
		this.height = h;
		this.collider = game.physics.addCylinder(pos.x, pos.z, 0.42, pos.y - 0.2, pos.y + Math.min(h, 1.2), "plant");
		const blob = new THREE.Mesh(game.blobGeo, game.blobMat);
		blob.rotation.x = -Math.PI / 2;
		blob.scale.setScalar(0.8);
		blob.position.set(pos.x, pos.y + 0.02, pos.z);
		game.scene.add(this.root, blob);
		if (this.def.light) {
			this.light = new THREE.PointLight(0xfff0a0, 22, 13, 1.5);
			this.light.position.set(pos.x, pos.y + 1.4, pos.z);
			game.scene.add(this.light);
		}
	}

	get name() {
		return this.def.name;
	}

	_nearestZombie(range) {
		let best = null;
		let bd = range * range;
		for (const z of this.game.zombies) {
			if (!z.alive || z.state === "rise") {
				continue;
			}
			const dx = z.pos.x - this.pos.x;
			const dz = z.pos.z - this.pos.z;
			const d2 = dx * dx + dz * dz;
			if (d2 < bd && !this.game.physics.blocked(this.pos.x, this.pos.z, z.pos.x, z.pos.z, this.pos.y + 0.6)) {
				bd = d2;
				best = z;
			}
		}
		return best;
	}

	update(dt, camera) {
		const s = this.def.shoot;
		if (s) {
			this.cooldown -= dt;
			const target = this._nearestZombie(s.range);
			if (target) {
				this.sprite.faceDirection(target.pos.x - this.pos.x, target.pos.z - this.pos.z, camera);
				if (this.cooldown <= 0) {
					this.cooldown = s.interval;
					this.burst = s.count;
					this.burstT = 0;
					this.target = target;
				}
			}
			if (this.burst > 0) {
				this.burstT -= dt;
				if (this.burstT <= 0 && this.target) {
					this.burst--;
					this.burstT = 0.18;
					const muzzle = new THREE.Vector3(this.pos.x, this.pos.y + (this.def.anchor[1] - s.muzzle[1]) * PX, this.pos.z);
					const dir = new THREE.Vector3(this.target.pos.x - this.pos.x, 0, this.target.pos.z - this.pos.z).normalize();
					muzzle.addScaledVector(dir, (s.muzzle[0] - this.def.anchor[0]) * PX);
					if (this.game.projectiles.fire(s.kind, muzzle, this.target, s.damage)) {
						this.game.audio.play(s.kind === "spore" ? "puff" : "throw", this.pos, 0.35);
					}
				}
			}
		}
		if (this.def.chomp) {
			this._chomper(dt, camera);
		}
		if (this.light) {
			this.light.intensity = 22 + Math.sin(performance.now() / 300) * 2;
		}
		this.sprite.update(dt, camera);
	}

	_chomper(dt, camera) {
		const c = this.def.chomp;
		if (this.state === "idle") {
			const z = this._nearestZombie(c.range);
			if (z) {
				this.state = "attack";
				this.sprite.faceDirection(z.pos.x - this.pos.x, z.pos.z - this.pos.z, camera);
				this.sprite.play("attack", { loop: false, restart: true, onEnd: () => this._startDigest() });
				// el bocado se produce a mitad de la animación
				this.prey = z;
				this.biteT = 0.55;
			}
		} else if (this.state === "attack") {
			if (this.prey) {
				this.biteT -= dt;
				if (this.biteT <= 0) {
					if (this.prey.alive) {
						this.prey.eaten();
						this.game.audio.play("bigchomp", this.pos, 1);
					}
					this.prey = null;
				}
			}
		} else if (this.state === "digest") {
			this.digestT -= dt;
			if (this.digestT <= 0) {
				this.state = "idle";
				this.game.audio.play("gulp", this.pos, 0.8);
				this.sprite.play("idle");
			}
		}
	}

	_startDigest() {
		this.state = "digest";
		this.digestT = this.def.chomp.digest;
		this.sprite.play("digest");
	}
}
