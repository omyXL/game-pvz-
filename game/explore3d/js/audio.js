/**
 * Audio del modo 3D: usa los sonidos originales de game/audio/.
 * Los efectos se cargan bajo demanda (no se descargan todos al inicio)
 * y su volumen baja con la distancia al jugador.
 */
import { BASE } from "./config.js";

const SOUNDS = {
	groan: ["groan1", "groan2", "groan3", "groan4", "groan5", "groan6"],
	chomp: ["chomp", "chomp2", "chompsoft"],
	splat: ["splat1", "splat2", "splat3"],
	throw: ["throw", "throw2"],
	puff: ["puff"],
	frozen: ["frozen"],
	gulp: ["gulp"],
	bigchomp: ["bigchomp"],
	cone: ["plastichit", "plastichit2"],
	bucket: ["shieldhit", "shieldhit2"],
	limbs: ["limbs_pop"],
	rise: ["dirt_rise"],
	rumble: ["gravestone_rumble"],
	sun: ["points"],
	plant: ["plant", "plant2"],
	door: ["hatchback_open"],
	doorClose: ["hatchback_close"],
	scream: ["scream"],
	lose: ["losemusic"],
	click: ["buttonclick"],
	tap: ["tap"],
	step: ["grassstep"],
	gravebuster: ["gravebusterchomp"],
	laugh: ["evillaugh"],
	grow: ["plantgrow"],
	gust: ["blover"],
	boing: ["boing"],
	vanish: ["shoop"],
};

export class Audio3D {
	constructor() {
		this.ctx = null;
		this.buffers = new Map();
		this.enabled = true;
		this.master = null;
		this.music = null;
		this.listener = { x: 0, z: 0 };
	}

	/** Debe llamarse desde un gesto del usuario (clic / toque). */
	unlock() {
		if (this.ctx) {
			if (this.ctx.state === "suspended") {
				this.ctx.resume();
			}
			return;
		}
		const AC = window.AudioContext || window.webkitAudioContext;
		if (!AC) {
			return;
		}
		this.ctx = new AC();
		this.master = this.ctx.createGain();
		this.master.gain.value = 0.8;
		this.master.connect(this.ctx.destination);
	}

	async _buffer(name) {
		if (!this.buffers.has(name)) {
			this.buffers.set(
				name,
				fetch(BASE + "audio/" + encodeURIComponent(name) + ".mp3")
					.then((r) => r.arrayBuffer())
					.then((a) => this.ctx.decodeAudioData(a))
					.catch(() => null)
			);
		}
		return this.buffers.get(name);
	}

	/**
	 * Reproduce un efecto. Si se da una posición, el volumen depende de la distancia.
	 * @param {keyof SOUNDS} key
	 * @param {{x:number,z:number}} [pos]
	 * @param {number} [vol]
	 */
	async play(key, pos, vol = 1) {
		if (!this.ctx || !this.enabled) {
			return;
		}
		const list = SOUNDS[key];
		if (!list) {
			return;
		}
		let v = vol;
		if (pos) {
			const d = Math.hypot(pos.x - this.listener.x, pos.z - this.listener.z);
			v *= Math.max(0, 1 - d / 28);
			if (v < 0.03) {
				return;
			}
		}
		const buf = await this._buffer(list[Math.floor(Math.random() * list.length)]);
		if (!buf) {
			return;
		}
		const src = this.ctx.createBufferSource();
		src.buffer = buf;
		const g = this.ctx.createGain();
		g.gain.value = v;
		src.connect(g).connect(this.master);
		src.start();
	}

	/** Música de fondo en bucle (la del nivel "Grave village" del juego 2D). */
	async startMusic(name) {
		if (!this.ctx || this.music) {
			return;
		}
		const buf = await this._buffer(name);
		if (!buf || this.music) {
			return;
		}
		const src = this.ctx.createBufferSource();
		src.buffer = buf;
		src.loop = true;
		const g = this.ctx.createGain();
		g.gain.value = 0.35;
		src.connect(g).connect(this.master);
		src.start();
		this.music = { src, g };
	}

	setMuted(m) {
		this.enabled = !m;
		if (this.master) {
			this.master.gain.value = m ? 0 : 0.8;
		}
	}

	setListener(x, z) {
		this.listener.x = x;
		this.listener.z = z;
	}
}
