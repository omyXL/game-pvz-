/**
 * Efectos de un solo uso (salpicaduras de guisante, cabeza que cae, explosión...)
 * con animaciones originales. Se reutilizan desde un pool para no crear objetos
 * nuevos en cada impacto.
 */
import { AnimatedSprite3D } from "../sprite.js";

export class EffectPool {
	/** @param {import('three').Scene} scene */
	constructor(scene, loadAnim) {
		this.scene = scene;
		this.loadAnim = loadAnim;
		this.free = new Map(); // path -> sprites libres
		this.active = [];
	}

	/**
	 * Lanza un efecto en una posición.
	 * @param {string} path GIF original
	 * @param {import('three').Vector3} pos
	 * @param {{anchor?:[number,number], scale?:number, fade?:number, hold?:number, facingRight?:boolean}} opt
	 */
	async spawn(path, pos, opt = {}) {
		const anim = await this.loadAnim(path);
		let list = this.free.get(path);
		if (!list) {
			this.free.set(path, (list = []));
		}
		let s = list.pop();
		if (!s) {
			s = new AnimatedSprite3D({ fx: anim }, opt.anchor || [anim.width / 2, anim.height - 2], { scale: opt.scale || 1, thickness: 0.05 });
			s.path = path;
		}
		s.root.position.copy(pos);
		s.facingRight = !!opt.facingRight;
		s.setOpacity(1);
		s.life = 0;
		s.hold = opt.hold ?? 0;
		s.fade = opt.fade ?? 0.3;
		s.ended = false;
		s.play("fx", { loop: false, restart: true, onEnd: () => (s.ended = true) });
		if (anim.frames === 1) {
			s.ended = true;
		}
		this.scene.add(s.root);
		this.active.push(s);
		return s;
	}

	update(dt, camera) {
		for (let i = this.active.length - 1; i >= 0; i--) {
			const s = this.active[i];
			s.update(dt, camera);
			if (s.ended) {
				s.life += dt;
				if (s.life > s.hold) {
					const k = 1 - (s.life - s.hold) / s.fade;
					if (k <= 0) {
						s.root.removeFromParent();
						this.active.splice(i, 1);
						this.free.get(s.path).push(s);
					} else {
						s.setOpacity(k);
					}
				}
			}
		}
	}
}
