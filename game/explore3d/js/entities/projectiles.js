/**
 * Proyectiles de las plantas (guisante, guisante de hielo, espora).
 * Son esferas 3D reales con brillo. Se reutilizan con un pool: nunca se crean
 * ni destruyen mallas durante la partida.
 */
import * as THREE from "three";
import { FX } from "../config.js";

const KINDS = {
	pea: { color: 0x6fe04a, emissive: 0x1f6a10, radius: 0.13, speed: 15, hit: FX.peaHit },
	snow: { color: 0x9fe8ff, emissive: 0x3a7aa8, radius: 0.13, speed: 15, hit: FX.peaHit },
	spore: { color: 0xd28bff, emissive: 0x5a2a80, radius: 0.09, speed: 11, hit: FX.sporeHit },
};

export class ProjectilePool {
	constructor(game, size = 60) {
		this.game = game;
		this.items = [];
		const geo = new THREE.SphereGeometry(1, 12, 10);
		this.mats = {};
		for (const [k, v] of Object.entries(KINDS)) {
			this.mats[k] = new THREE.MeshStandardMaterial({ color: v.color, emissive: v.emissive, roughness: 0.4 });
		}
		for (let i = 0; i < size; i++) {
			const m = new THREE.Mesh(geo, this.mats.pea);
			m.visible = false;
			m.castShadow = true;
			game.scene.add(m);
			this.items.push({ mesh: m, active: false, vel: new THREE.Vector3(), life: 0, kind: "pea", damage: 1 });
		}
	}

	/**
	 * Dispara desde `from` hacia `target` (un zombi).
	 * @returns {boolean} false si el pool está lleno
	 */
	fire(kind, from, target, damage) {
		const p = this.items.find((i) => !i.active);
		if (!p) {
			return false;
		}
		const k = KINDS[kind];
		p.active = true;
		p.kind = kind;
		p.damage = damage;
		p.life = 0;
		p.mesh.material = this.mats[kind];
		p.mesh.scale.setScalar(k.radius);
		p.mesh.position.copy(from);
		const aim = target.root.position.clone();
		aim.y += 1.1;
		p.vel.subVectors(aim, from).normalize().multiplyScalar(k.speed);
		p.mesh.visible = true;
		return true;
	}

	update(dt) {
		const zs = this.game.zombies;
		for (const p of this.items) {
			if (!p.active) {
				continue;
			}
			p.life += dt;
			p.mesh.position.addScaledVector(p.vel, dt);
			const pos = p.mesh.position;
			let hit = null;
			for (const z of zs) {
				if (!z.alive || z.state === "rise") {
					continue;
				}
				const dx = pos.x - z.pos.x;
				const dz = pos.z - z.pos.z;
				if (dx * dx + dz * dz < 0.36 && pos.y > z.pos.y && pos.y < z.pos.y + z.height) {
					hit = z;
					break;
				}
			}
			const ground = this.game.physics.groundAt(pos.x, pos.z, pos.y, 0.05, 0);
			if (hit || p.life > 2.2 || pos.y < ground) {
				if (hit) {
					hit.damage(p.damage, p.kind);
					this.game.effects.spawn(KINDS[p.kind].hit, pos.clone().setY(pos.y - 0.35), { scale: 0.9, fade: 0.25 });
				}
				p.active = false;
				p.mesh.visible = false;
			}
		}
	}
}
