/**
 * Sistema de interacción: busca el objeto más cercano que esté delante del jugador,
 * muestra la indicación "[E] ..." y ejecuta su acción al pulsar E (o el botón USAR en móvil).
 *
 * Fuentes de objetos: los interactivos del mapa (puerta, farol, lápidas, almanaque…),
 * las plantas, los zombis y los soles del suelo.
 */
import * as THREE from "three";

const _f = new THREE.Vector3();
const _d = new THREE.Vector3();

export class Interaction {
	constructor(game) {
		this.game = game;
		this.current = null;
	}

	/** Lista de candidatos con {name, position, radius, prompt(), use(game)} */
	_candidates() {
		const g = this.game;
		const list = [];
		for (const it of g.world.interactables) {
			if (!it.enabled || it.enabled()) {
				list.push(it);
			}
		}
		for (const p of g.plants) {
			list.push(p.interaction);
		}
		for (const z of g.zombies) {
			if (z.alive && z.state !== "rise") {
				list.push(z.interaction || (z.interaction = zombieInteraction(z)));
			}
		}
		for (const s of g.suns) {
			if (!s.collected) {
				list.push(s.interaction);
			}
		}
		for (const l of g.leaflings) {
			list.push(l.interaction);
		}
		return list;
	}

	update(useKey) {
		const g = this.game;
		const cam = g.camera;
		g.player.forward(_f);
		let best = null;
		let bestScore = -Infinity;
		for (const it of this._candidates()) {
			const p = typeof it.position === "function" ? it.position() : it.position;
			_d.subVectors(p, cam.position);
			const dist = _d.length();
			if (dist > it.radius + 0.6) {
				continue;
			}
			_d.normalize();
			const dot = _d.dot(_f);
			if (dot < 0.72) {
				continue;
			} // tiene que estar delante
			const score = dot * 2 - dist / it.radius;
			if (score > bestScore) {
				bestScore = score;
				best = it;
			}
		}
		this.current = best;
		g.ui.prompt(best ? best.prompt() : null);
		if (useKey && best) {
			g.audio.play("tap");
			best.use(g);
		}
	}
}

function zombieInteraction(z) {
	return {
		name: z.name,
		radius: 3.6,
		position: () => z.root.position.clone().setY(z.pos.y + 1.4),
		prompt: () => "Examinar: " + z.name,
		use: (game) => {
			const estado = { idle: "esperando", wander: "deambulando", chase: "te persigue", attack: "atacando" }[z.state] || z.state;
			const blindaje = z.armor > 0 ? ` · Blindaje: ${Math.ceil(z.armor)}` : "";
			game.ui.examine(
				z.name,
				`${z.def.desc}<br><br>Vida: ${Math.max(0, Math.ceil(z.hp))}/${z.maxHp}${blindaje} · Estado: ${estado}`,
				Object.values(z.def.anims)
			);
		},
	};
}
