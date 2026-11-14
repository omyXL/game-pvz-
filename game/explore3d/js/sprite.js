/**
 * AnimatedSprite3D: muestra una animación GIF original del proyecto dentro del mundo 3D.
 *
 * El proyecto NO contiene modelos 3D ni esqueletos: cada personaje es un GIF dibujado de perfil.
 * Para que no sea un papel plano:
 *  - el sprite se construye con varias capas apiladas en profundidad (las interiores más oscuras),
 *    lo que le da grosor visible al mirarlo desde arriba o en diagonal;
 *  - gira sobre su eje vertical hacia la cámara (como en los juegos 2.5D) y se voltea
 *    según hacia dónde se mueve o mira el personaje;
 *  - recibe la iluminación de la escena y proyecta una sombra real con su silueta.
 */
import * as THREE from "three";
import { PX } from "./config.js";

const LAYERS = 6; // capas de volumen
const _v = new THREE.Vector3();

export class AnimatedSprite3D {
	/**
	 * @param {Record<string, import('./assets.js').Animation>} anims animaciones ya cargadas
	 * @param {[number,number]} anchor píxel del sprite que toca el suelo
	 * @param {{thickness?:number, scale?:number}} opt
	 */
	constructor(anims, anchor, opt = {}) {
		this.anims = anims;
		this.anchor = anchor;
		this.scale = (opt.scale || 1) * PX;
		this.thickness = opt.thickness ?? 0.16;
		this.root = new THREE.Group(); // posición en el mundo
		this.pivot = new THREE.Group(); // gira hacia la cámara
		this.flipper = new THREE.Group(); // se voltea en X
		this.root.add(this.pivot);
		this.pivot.add(this.flipper);
		this.facingRight = false; // los sprites de zombis miran a la izquierda
		this.spriteFacesRight = !!opt.facesRight;
		this.flash = 0;
		this.opacity = 1;
		this.current = null;
		this.time = 0;
		this.frame = 0;
		this.loop = true;
		this.onEnd = null;
		this.speed = 1;
		this.tint = new THREE.Color(1, 1, 1);
		this.meshes = [];
		this._build(Object.values(anims)[0]);
	}

	_build(anim) {
		const w = anim.width * this.scale;
		const h = anim.height * this.scale;
		const geo = new THREE.PlaneGeometry(w, h);
		// el origen del plano queda en el píxel "anchor" (pies)
		const ax = (this.anchor[0] / anim.width - 0.5) * w;
		const ay = (0.5 - this.anchor[1] / anim.height) * h;
		geo.translate(-ax, -ay, 0);
		this.geo = geo;
		// comparte la imagen (se sube a la GPU una sola vez) pero con UV propios
		this.texture = anim.texture.clone();
		this.texture.version++;
		this.front = new THREE.MeshLambertMaterial({
			map: this.texture,
			alphaTest: 0.5,
			side: THREE.DoubleSide,
			transparent: false,
		});
		this.inner = this.front.clone();
		this.inner.color.setScalar(0.62);
		this.depthMat = new THREE.MeshDepthMaterial({ map: this.texture, alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
		for (let i = 0; i < LAYERS; i++) {
			const m = new THREE.Mesh(geo, i === 0 ? this.front : this.inner);
			m.position.z = -(i / (LAYERS - 1)) * this.thickness;
			m.castShadow = i === 0;
			m.receiveShadow = false;
			if (i === 0) {
				m.customDepthMaterial = this.depthMat;
			}
			this.flipper.add(m);
			this.meshes.push(m);
		}
		this.currentGeoKey = anim.width + "x" + anim.height;
	}

	/** Cambia de animación (nombre de la clave en anims). */
	play(name, { loop = true, onEnd = null, restart = false, speed = 1 } = {}) {
		const anim = this.anims[name];
		if (!anim) {
			return false;
		}
		this.speed = speed;
		if (this.current === anim && !restart) {
			return true;
		}
		this.current = anim;
		this.currentName = name;
		this.time = 0;
		this.frame = 0;
		this.loop = loop;
		this.onEnd = onEnd;
		const key = anim.width + "x" + anim.height;
		if (key !== this.currentGeoKey) {
			this._resize(anim);
		}
		// cambiar de atlas sin volver a subir la imagen (no se toca source.version)
		this.texture.source = anim.texture.source;
		this.texture.repeat.set(anim.width / (anim.cols * anim.cellW), anim.height / (anim.rows * anim.cellH));
		this.texture.version++;
		this._applyFrame();
		return true;
	}

	_resize(anim) {
		const w = anim.width * this.scale;
		const h = anim.height * this.scale;
		const geo = new THREE.PlaneGeometry(w, h);
		// el ancla se escala proporcionalmente para animaciones de otro tamaño (p. ej. la cabeza)
		const ax = (anim.anchorPx ? anim.anchorPx[0] : (this.anchor[0] * anim.width) / Object.values(this.anims)[0].width) / anim.width;
		const ay = (anim.anchorPx ? anim.anchorPx[1] : anim.height - 4) / anim.height;
		geo.translate(-(ax - 0.5) * w, -(0.5 - ay) * h, 0);
		this.geo.dispose();
		this.geo = geo;
		for (const m of this.meshes) {
			m.geometry = geo;
		}
		this.currentGeoKey = anim.width + "x" + anim.height;
	}

	_applyFrame() {
		const a = this.current;
		const col = this.frame % a.cols;
		const row = Math.floor(this.frame / a.cols);
		const W = a.cols * a.cellW;
		const H = a.rows * a.cellH;
		// CanvasTexture tiene flipY: la fila 0 está arriba
		this.texture.offset.set((col * a.cellW + a.pad) / W, 1 - (row * a.cellH + a.pad + a.height) / H);
	}

	/**
	 * Avanza la animación y orienta el sprite hacia la cámara.
	 * @param {number} dt
	 * @param {THREE.Camera} camera
	 */
	update(dt, camera) {
		const a = this.current;
		if (a && a.frames > 1) {
			this.time += dt * this.speed;
			let d = a.delays[this.frame];
			while (this.time >= d) {
				this.time -= d;
				this.frame++;
				if (this.frame >= a.frames) {
					if (this.loop) {
						this.frame = 0;
					} else {
						this.frame = a.frames - 1;
						const cb = this.onEnd;
						this.onEnd = null;
						this.time = 0;
						if (cb) {
							cb();
						}
						break;
					}
				}
				d = a.delays[this.frame];
			}
			this._applyFrame();
		}
		// Billboard cilíndrico: solo gira en el eje Y
		this.root.getWorldPosition(_v);
		const dx = camera.position.x - _v.x;
		const dz = camera.position.z - _v.z;
		this.pivot.rotation.y = Math.atan2(dx, dz);
		const wantRight = this.facingRight;
		this.flipper.scale.x = wantRight === this.spriteFacesRight ? 1 : -1;

		// destello al recibir daño (el juego original también hace parpadear al zombi)
		if (this.flash > 0) {
			this.flash = Math.max(0, this.flash - dt * 4);
		}
		const f = this.flash;
		this.front.emissive.setRGB(f * 0.9, f * 0.9, f * 0.9);
		this.front.color.copy(this.tint);
		this.inner.color.copy(this.tint).multiplyScalar(0.62);
	}

	/** Calcula hacia qué lado de la pantalla apunta una dirección del mundo. */
	faceDirection(dirX, dirZ, camera) {
		// vector "derecha" de la cámara en el plano XZ
		const yaw = Math.atan2(camera.position.x - this.root.position.x, camera.position.z - this.root.position.z);
		const rx = Math.cos(yaw);
		const rz = -Math.sin(yaw);
		const d = dirX * rx + dirZ * rz;
		if (Math.abs(d) > 0.05) {
			this.facingRight = d > 0;
		}
	}

	setOpacity(o) {
		this.opacity = o;
		const transp = o < 1;
		for (const mat of [this.front, this.inner]) {
			mat.transparent = transp;
			mat.opacity = o;
			mat.alphaTest = transp ? 0.05 : 0.5;
			mat.depthWrite = !transp;
		}
	}

	/** Deja el sprite listo para reutilizarlo (pool). */
	reset() {
		this.setOpacity(1);
		this.flash = 0;
		this.tint.setRGB(1, 1, 1);
		this.root.visible = true;
		this.current = null;
	}

	dispose() {
		this.root.removeFromParent();
		// la geometría y las texturas propias se liberan; los materiales los recoge el GC
		// (liberarlos a mano en mitad de un fotograma puede romper la caché de programas WebGL)
		this.geo.dispose();
	}
}
