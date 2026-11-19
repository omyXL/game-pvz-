/**
 * Jugador en primera persona: cámara a la altura de los ojos, movimiento con aceleración,
 * correr, salto, gravedad, colisiones con el escenario y balanceo de cámara al caminar.
 */
import * as THREE from "three";
import { PLAYER } from "./config.js";

export class Player {
	/** @param {THREE.PerspectiveCamera} camera */
	constructor(game, camera) {
		this.game = game;
		this.camera = camera;
		this.pos = new THREE.Vector3();
		this.vel = new THREE.Vector3();
		this.yaw = 0;
		this.pitch = 0;
		this.onGround = false;
		this.hp = PLAYER.maxHp;
		this.alive = true;
		this.bob = 0;
		this.stepT = 0;
		this.shake = 0;
		this.hurtT = 0;
		this.push = new THREE.Vector3(); // empujón recibido (p. ej. de la Hoja Gruñona)
		this.speedMul = 1;
		camera.rotation.order = "YXZ";
	}

	spawn(pos, yaw) {
		this.pos.copy(pos);
		this.pos.y = this.game.physics.groundAt(pos.x, pos.z, 50);
		this.vel.set(0, 0, 0);
		this.push.set(0, 0, 0);
		this.yaw = yaw;
		this.pitch = -0.08;
		this.hp = PLAYER.maxHp;
		this.alive = true;
		this._applyCamera(0);
	}

	hurt(amount) {
		if (!this.alive) {
			return;
		}
		this.hp = Math.max(0, this.hp - amount);
		this.shake = 0.35;
		this.hurtT = 0.5;
		this.game.ui.hurt(this.hp / PLAYER.maxHp);
		if (this.hp <= 0) {
			this.alive = false;
			this.game.onPlayerDied();
		}
	}

	/**
	 * Empuja al jugador en la dirección (dx, dz) con una fuerza en m/s y un pequeño salto.
	 * El empujón se suma al movimiento y se frena poco a poco; respeta las colisiones.
	 */
	knockback(dx, dz, strength, up = 3) {
		const len = Math.hypot(dx, dz) || 1;
		this.push.x += (dx / len) * strength;
		this.push.z += (dz / len) * strength;
		this.vel.y = Math.max(this.vel.y, up);
		this.onGround = false;
		this.shake = 0.3;
	}

	update(dt, inp) {
		// mirar
		this.yaw -= inp.lookX;
		this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - inp.lookY));

		if (this.alive) {
			const speed = (inp.run ? PLAYER.runSpeed : PLAYER.walkSpeed) * this.speedMul;
			const fx = -Math.sin(this.yaw);
			const fz = -Math.cos(this.yaw);
			const rx = Math.cos(this.yaw);
			const rz = -Math.sin(this.yaw);
			const wx = (fx * inp.y + rx * inp.x) * speed;
			const wz = (fz * inp.y + rz * inp.x) * speed;
			const accel = this.onGround ? 14 : 4; // menos control en el aire
			this.vel.x += (wx - this.vel.x) * Math.min(1, accel * dt);
			this.vel.z += (wz - this.vel.z) * Math.min(1, accel * dt);
			if (inp.jump && this.onGround) {
				this.vel.y = PLAYER.jumpSpeed;
				this.onGround = false;
			}
		} else {
			this.vel.x *= 0.9;
			this.vel.z *= 0.9;
		}

		// gravedad
		this.vel.y -= PLAYER.gravity * dt;
		const ph = this.game.physics;
		// moverse en pasos pequeños para no atravesar muros delgados
		const mx = this.vel.x + this.push.x;
		const mz = this.vel.z + this.push.z;
		const steps = Math.max(1, Math.ceil((Math.hypot(mx, mz) * dt) / 0.2));
		for (let i = 0; i < steps; i++) {
			this.pos.x += (mx * dt) / steps;
			this.pos.z += (mz * dt) / steps;
			ph.resolve(this.pos, PLAYER.radius, this.pos.y, 1.8, PLAYER.stepHeight);
		}
		// el empujón se frena rápido (más en el suelo que en el aire)
		this.push.multiplyScalar(Math.exp(-(this.onGround ? 5 : 1.5) * dt));
		this.pos.y += this.vel.y * dt;
		const ground = ph.groundAt(this.pos.x, this.pos.z, this.pos.y, PLAYER.radius, PLAYER.stepHeight);
		if (this.pos.y <= ground) {
			// subir escalones suavemente
			const diff = ground - this.pos.y;
			this.pos.y = diff < 0.5 ? ground : this.pos.y + diff;
			if (this.vel.y < -6) {
				this.shake = Math.min(0.2, -this.vel.y * 0.015);
			}
			this.vel.y = 0;
			this.onGround = true;
		} else if (this.pos.y - ground < 0.08 && this.vel.y <= 0) {
			this.pos.y = ground;
			this.vel.y = 0;
			this.onGround = true;
		} else {
			this.onGround = false;
		}
		// techo de la casa / vigas
		this.vel.y = Math.min(this.vel.y, 20);

		// balanceo al caminar + pasos
		const hs = Math.hypot(this.vel.x, this.vel.z);
		if (this.onGround && hs > 0.5) {
			this.bob += dt * hs * 2.2;
			this.stepT -= dt * hs;
			if (this.stepT <= 0) {
				this.stepT = 3.2;
				this.game.audio.play("step", null, 0.25);
			}
		} else {
			this.bob *= 0.9;
		}
		this.shake = Math.max(0, this.shake - dt);
		this.hurtT = Math.max(0, this.hurtT - dt);
		this._applyCamera(dt);
	}

	_applyCamera() {
		const c = this.camera;
		const deadDrop = this.alive ? 0 : -1.2;
		c.position.set(this.pos.x, this.pos.y + PLAYER.eyeHeight + Math.sin(this.bob) * 0.045 + deadDrop, this.pos.z);
		const sh = this.shake;
		c.rotation.set(
			this.pitch + (Math.random() - 0.5) * sh * 0.1,
			this.yaw + (Math.random() - 0.5) * sh * 0.1,
			this.alive ? Math.sin(this.bob * 0.5) * 0.008 : 0.5
		);
	}

	/** Dirección hacia la que mira (normalizada, en 3D) */
	forward(out = new THREE.Vector3()) {
		return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
	}
}
