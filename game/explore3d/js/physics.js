/**
 * Colisiones sencillas y rápidas para un mundo a pie:
 *  - cajas alineadas a los ejes (muros, valla, lápidas, mesa...) con altura mínima/máxima;
 *  - cilindros verticales (troncos, rocas, plantas).
 * Un objeto bajo (por debajo de stepHeight respecto a los pies) se puede pisar:
 * su parte superior pasa a ser suelo. Así se puede saltar encima de lápidas, bancos, etc.
 */

export class Physics {
	/** @param {(x:number,z:number)=>number} terrainHeight */
	constructor(terrainHeight) {
		this.terrainHeight = terrainHeight;
		/** @type {{minX:number,maxX:number,minZ:number,maxZ:number,minY:number,maxY:number,enabled:boolean,tag?:string}[]} */
		this.boxes = [];
		/** @type {{x:number,z:number,r:number,minY:number,maxY:number,enabled:boolean,tag?:string}[]} */
		this.cylinders = [];
	}

	addBox(minX, maxX, minZ, maxZ, minY, maxY, tag) {
		const b = { minX, maxX, minZ, maxZ, minY, maxY, enabled: true, tag };
		this.boxes.push(b);
		return b;
	}

	/** Caja centrada (cx, cz) de tamaño (w, d), desde y0 hasta y1 */
	addBoxCentered(cx, cz, w, d, y0, y1, tag) {
		return this.addBox(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, y0, y1, tag);
	}

	addCylinder(x, z, r, minY, maxY, tag) {
		const c = { x, z, r, minY, maxY, enabled: true, tag };
		this.cylinders.push(c);
		return c;
	}

	remove(c) {
		c.enabled = false;
	}

	/**
	 * Altura del suelo bajo (x,z) para alguien cuyos pies están en feetY.
	 * Incluye la parte superior de objetos que se pueden pisar.
	 */
	groundAt(x, z, feetY, radius = 0.3, step = 0.45) {
		let g = this.terrainHeight(x, z);
		const r = radius * 0.6;
		for (const b of this.boxes) {
			if (!b.enabled) {
				continue;
			}
			if (x + r < b.minX || x - r > b.maxX || z + r < b.minZ || z - r > b.maxZ) {
				continue;
			}
			if (b.maxY <= feetY + step && b.maxY > g) {
				g = b.maxY;
			}
		}
		for (const c of this.cylinders) {
			if (!c.enabled) {
				continue;
			}
			const dx = x - c.x;
			const dz = z - c.z;
			if (dx * dx + dz * dz > (c.r + r * 0.5) ** 2) {
				continue;
			}
			if (c.maxY <= feetY + step && c.maxY > g) {
				g = c.maxY;
			}
		}
		return g;
	}

	/**
	 * Empuja un círculo (pos.x, pos.z, radio) fuera de los obstáculos que lo bloquean
	 * a la altura de su cuerpo [feetY, feetY+height].
	 * @returns {boolean} true si hubo colisión
	 */
	resolve(pos, radius, feetY, height, step = 0.45) {
		let hit = false;
		const top = feetY + height;
		for (const b of this.boxes) {
			if (!b.enabled) {
				continue;
			}
			if (b.maxY <= feetY + step || b.minY >= top) {
				continue;
			} // se puede pisar o pasar por debajo
			const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
			const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
			let dx = pos.x - cx;
			let dz = pos.z - cz;
			const d2 = dx * dx + dz * dz;
			if (d2 >= radius * radius) {
				continue;
			}
			hit = true;
			if (d2 > 1e-8) {
				const d = Math.sqrt(d2);
				pos.x = cx + (dx / d) * radius;
				pos.z = cz + (dz / d) * radius;
			} else {
				// centro dentro de la caja: salir por el lado más cercano
				const pen = [pos.x - b.minX, b.maxX - pos.x, pos.z - b.minZ, b.maxZ - pos.z];
				const i = pen.indexOf(Math.min(...pen));
				if (i === 0) {
					pos.x = b.minX - radius;
				} else if (i === 1) {
					pos.x = b.maxX + radius;
				} else if (i === 2) {
					pos.z = b.minZ - radius;
				} else {
					pos.z = b.maxZ + radius;
				}
			}
		}
		for (const c of this.cylinders) {
			if (!c.enabled) {
				continue;
			}
			if (c.maxY <= feetY + step || c.minY >= top) {
				continue;
			}
			const dx = pos.x - c.x;
			const dz = pos.z - c.z;
			const rr = radius + c.r;
			const d2 = dx * dx + dz * dz;
			if (d2 >= rr * rr) {
				continue;
			}
			hit = true;
			const d = Math.sqrt(d2) || 1e-4;
			pos.x = c.x + (dx / d) * rr;
			pos.z = c.z + (dz / d) * rr;
		}
		return hit;
	}

	/** ¿Hay un obstáculo sólido entre dos puntos a la altura y? (línea de visión aproximada) */
	blocked(x0, z0, x1, z1, y) {
		const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.5);
		for (let i = 1; i < steps; i++) {
			const t = i / steps;
			const x = x0 + (x1 - x0) * t;
			const z = z0 + (z1 - z0) * t;
			for (const b of this.boxes) {
				if (b.enabled && b.minY < y && b.maxY > y && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) {
					return true;
				}
			}
		}
		return false;
	}
}
