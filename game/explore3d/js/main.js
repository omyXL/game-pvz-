/**
 * Modo experimental "Explorar mapa 3D".
 * Une el mundo, el jugador, las plantas, los zombis, la interacción, el audio y la interfaz.
 *
 * Es independiente del juego 2D: no modifica ningún sistema existente, solo lee
 * los recursos originales (imágenes, GIF y sonidos) desde la carpeta game/.
 */
import * as THREE from "three";
import { PLANTS, ZOMBIES, FX, PLAYER } from "./config.js";
import { loadAnimation, preload } from "./assets.js";
import { buildWorld, BOUNDS } from "./world.js";
import { Player } from "./player.js";
import { Input } from "./input.js";
import { Interaction } from "./interact.js";
import { UI } from "./ui.js";
import { Audio3D } from "./audio.js";
import { EffectPool } from "./entities/effects.js";
import { ProjectilePool } from "./entities/projectiles.js";
import { Zombie, loadZombieAnims } from "./entities/zombie.js";
import { Plant, loadPlantAnims } from "./entities/plant.js";
import { AnimatedSprite3D } from "./sprite.js";

const MAX_ZOMBIES = 7;

/** Distribución de plantas en el jardín: [tipo, columna, fila] (filas 0-4, la 2 es de losas) */
const LAYOUT = [
	["sunflower", 0, 0],
	["peashooter", 2, 0],
	["repeater", 4, 0],
	["plantern", 1, 1],
	["snowpea", 3, 1],
	["chomper", 6, 1],
	["puffshroom", 5, 2],
	["sunflower", 0, 3],
	["peashooter", 3, 3],
	["chomper", 7, 3],
	["repeater", 2, 4],
	["plantern", 5, 4],
	["puffshroom", 7, 4],
];

/** Tipo de zombi según un número aleatorio: común < a ≤ cono < b ≤ cubo */
function randomZombieType(r, a, b) {
	if (r < a) {
		return "zombie";
	}
	return r < b ? "conehead" : "buckethead";
}

class Game {
	constructor() {
		const canvas = document.getElementById("view");
		this.canvas = canvas;
		this.mobile = matchMedia("(pointer: coarse)").matches;
		this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.mobile, powerPreference: "high-performance" });
		this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.mobile ? 1.25 : 1.75));
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 1.15;
		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera(72, 1, 0.08, 900);
		this.clock = new THREE.Clock();
		this.time = 0;
		this.running = false; // dentro del mapa
		this.paused = true;
		this.panelPaused = false;
		this.zombies = [];
		this.plants = [];
		this.suns = [];
		this.sunCount = 50;
		this.respawnQueue = [];
		this.zombiePool = {}; // sprites de zombi libres por tipo (object pooling)
		this.blobGeo = new THREE.CircleGeometry(0.5, 20);
		this.blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });
		this.audio = new Audio3D();
		this.ui = new UI(this);
		this.input = new Input(canvas);
		this.input.onPause = (fromLock) => this.togglePause(fromLock);
		this.input.onSpeed = (m) => {
			this.player.speedMul = m;
			this.ui.speed(m);
			this.ui.toast("Velocidad de movimiento ×" + m);
		};
		this.player = new Player(this, this.camera);
		this.interaction = new Interaction(this);
		this.effects = new EffectPool(this.scene, loadAnimation);
		this.events = { wakeZombie: (t) => this.wakeZombie(t) };
		addEventListener("resize", () => this.resize());
		this.resize();
		window.__game = this; // útil para pruebas automáticas
	}

	resize() {
		const w = innerWidth;
		const h = innerHeight;
		this.renderer.setSize(w, h, false);
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
	}

	async load() {
		const paths = [];
		for (const d of Object.values(ZOMBIES)) {
			paths.push(...Object.values(d.anims));
		}
		for (const d of Object.values(PLANTS)) {
			paths.push(...Object.values(d.anims));
		}
		paths.push(FX.peaHit, FX.sporeHit, FX.sun);
		this.ui.loading(0.02, "Reconstruyendo la Aldea de tumbas en 3D…");
		this.world = await buildWorld(this.scene);
		this.physics = this.world.physics;
		await preload(paths, (p, path) => this.ui.loading(0.1 + p * 0.85, "Animaciones originales: " + path.split("/").slice(-2).join("/")));
		this.zombieAnims = {};
		for (const t of Object.keys(ZOMBIES)) {
			this.zombieAnims[t] = await loadZombieAnims(t, loadAnimation);
		}
		this.projectiles = new ProjectilePool(this, 70);
		await this.placePlants();
		this.spawnInitialZombies();
		this.player.spawn(this.world.playerStart, this.world.playerYaw);
		// primer render para compilar shaders antes de entrar
		this.renderer.compile(this.scene, this.camera);
		this.renderer.render(this.scene, this.camera);
		this.ui.loading(1, "Listo");
		this.ui.ready();
		this.ui.hp(1);
		this.ui.sun(this.sunCount);
		this.ui.speed(1);
		this.loop();
	}

	async placePlants() {
		for (const [type, col, row] of LAYOUT) {
			const anims = await loadPlantAnims(type, loadAnimation);
			const p = new Plant(this, type, anims, this.world.cell(col, row));
			p.interaction = this.plantInteraction(p);
			this.plants.push(p);
		}
		// destructumbas sobre una lápida del cementerio
		const t = this.world.tombstones[3];
		const gb = new Plant(this, "gravebuster", await loadPlantAnims("gravebuster", loadAnimation), t.spawn.clone().setX(t.x - 0.9));
		gb.interaction = this.plantInteraction(gb);
		this.plants.push(gb);
	}

	plantInteraction(p) {
		return {
			name: p.name,
			radius: 2.8,
			position: () => p.root.position.clone().setY(p.pos.y + Math.min(p.height, 1.4) * 0.6),
			prompt: () => (p.def.sun ? "Pedir un sol al girasol" : "Examinar: " + p.name),
			use: (game) => {
				if (p.def.sun) {
					return game.dropSun(p);
				}
				const extra = p.state === "digest" ? "<br><br>Ahora mismo está digiriendo un zombi…" : "";
				game.ui.examine(p.name, p.def.desc + extra, Object.values(p.def.anims));
			},
		};
	}

	/** Un sol original (Sun.gif) cae junto al girasol; se recoge con E o al pasar por encima. */
	async dropSun(plant) {
		if (plant.sunCooldown && this.time < plant.sunCooldown) {
			this.ui.toast("El girasol está recargando su sol…");
			return;
		}
		plant.sunCooldown = this.time + 3;
		const anim = await loadAnimation(FX.sun);
		const s = new AnimatedSprite3D({ sun: anim }, [40, 78], { thickness: 0.05, scale: 0.9 });
		s.play("sun");
		const a = Math.random() * Math.PI * 2;
		const target = plant.pos.clone().add(new THREE.Vector3(Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9));
		s.root.position.copy(plant.pos).setY(plant.pos.y + 1.2);
		this.scene.add(s.root);
		const sun = { sprite: s, t: 0, target, collected: false };
		sun.interaction = {
			name: "Sol",
			radius: 2.5,
			position: () => s.root.position.clone().setY(s.root.position.y + 0.5),
			prompt: () => "Recoger el sol (+25)",
			use: () => this.collectSun(sun),
		};
		this.suns.push(sun);
		this.audio.play("plant", plant.pos, 0.5);
	}

	collectSun(sun) {
		if (sun.collected) {
			return;
		}
		sun.collected = true;
		this.sunCount += 25;
		this.ui.sun(this.sunCount);
		this.audio.play("sun");
		sun.flyT = 0;
	}

	spawnInitialZombies() {
		const types = ["zombie", "conehead", "zombie", "buckethead", "zombie", "conehead"];
		const tombs = this.world.tombstones;
		types.forEach((t, i) => this.spawnZombie(t, tombs[(i * 2 + 1) % tombs.length].spawn, false));
		// uno que llega por el sur
		this.spawnZombie("zombie", this.world.extraSpawns[0], false);
	}

	takeZombieSprite(type) {
		const list = this.zombiePool[type];
		return list && list.length ? list.pop() : null;
	}

	releaseZombieSprite(type, sprite) {
		(this.zombiePool[type] ||= []).push(sprite);
	}

	spawnZombie(type, pos, rise = true) {
		const p = pos.clone();
		p.x += (Math.random() - 0.5) * 0.6;
		p.z += (Math.random() - 0.5) * 0.6;
		const z = new Zombie(this, type, this.zombieAnims[type], p, { rise });
		this.zombies.push(z);
		if (rise) {
			this.audio.play("rise", p, 1);
		}
		return z;
	}

	/** Evento de prueba: golpear una lápida despierta a un zombi que sale de la tierra. */
	wakeZombie(tomb) {
		if (tomb.cool && this.time < tomb.cool) {
			this.ui.toast("La tierra todavía se está moviendo…");
			return;
		}
		tomb.cool = this.time + 4;
		this.audio.play("rumble", tomb.spawn, 1);
		tomb.shakeT = 0.8;
		const r = Math.random();
		this.spawnZombie(randomZombieType(r, 0.55, 0.85), tomb.spawn, true);
		this.ui.toast("¡Algo sale de la tumba!");
	}

	onZombieKilled() {
		this.respawnQueue.push(this.time + 9 + Math.random() * 6);
	}

	onPlayerDied() {
		this.audio.play("scream");
		this.audio.play("lose", null, 0.6);
		setTimeout(() => {
			this.ui.showDeath(true);
			this.input.releaseLock();
		}, 1200);
	}

	respawnPlayer() {
		this.ui.showDeath(false);
		this.player.spawn(this.world.playerStart, this.world.playerYaw);
		this.ui.hp(1);
		// los zombis que estaban comiendo vuelven a su tumba
		for (const z of this.zombies) {
			if (z.alive && (z.state === "chase" || z.state === "attack")) {
				z.state = "idle";
			}
		}
		this.resume();
	}

	/** Reinicia la exploración: recarga la página del modo 3D (no afecta al juego 2D). */
	restart() {
		location.reload();
	}

	enter() {
		this.audio.unlock();
		this.audio.startMusic("The Great Wall1");
		this.ui.showStart(false);
		this.ui.showHud(true);
		this.running = true;
		this.resume();
		this.ui.toast(
			this.input.touch ? "Joystick para caminar · arrastra a la derecha para mirar" : "WASD para caminar · ratón para mirar · E para interactuar",
			4500
		);
	}

	resume() {
		this.paused = false;
		this.input.enabled = true;
		this.ui.showPause(false);
		this.input.requestLock();
		this.clock.getDelta();
	}

	togglePause(fromLock) {
		if (!this.running) {
			return;
		}
		if (this.ui.panelOpen) {
			// al abrir un panel se libera el ratón a propósito: no es una pausa
			if (!fromLock) {
				this.ui.closePanel();
			}
			return;
		}
		if (!this.player.alive) {
			return;
		}
		if (this.paused && !fromLock) {
			this.resume();
		} else if (!this.paused) {
			this.paused = true;
			this.ui.showPause(true);
			this.input.releaseLock();
		}
	}

	setPanelPause(open) {
		this.panelPaused = open;
		if (open) {
			this.input.releaseLock();
		} else if (this.running && !this.paused) {
			this.input.requestLock();
		}
	}

	loop = () => {
		requestAnimationFrame(this.loop);
		const dt = Math.min(0.05, this.clock.getDelta());
		const active = this.running && !this.paused && !this.panelPaused;
		if (active) {
			this.step(dt);
		} else if (!this.running) {
			// vista previa: la cámara gira lentamente detrás del menú de inicio
			this.time += dt;
			this.camera.position.set(-1.5 + Math.sin(this.time * 0.1) * 2, 2.4, 6 + Math.cos(this.time * 0.1) * 2);
			this.camera.rotation.set(-0.1, -Math.PI / 2 + Math.sin(this.time * 0.15) * 0.4, 0);
			this.world.update(dt, this.time, this.camera);
			for (const p of this.plants) {
				p.sprite.update(dt, this.camera);
			}
			for (const z of this.zombies) {
				z.sprite.update(dt, this.camera);
			}
		}
		this.renderer.render(this.scene, this.camera);
	};

	step(dt) {
		this.time += dt;
		const inp = this.input.read();
		this.player.update(dt, inp);
		this.audio.setListener(this.player.pos.x, this.player.pos.z);
		this.world.update(dt, this.time, this.camera);
		for (const p of this.plants) {
			p.update(dt, this.camera);
		}
		for (const z of this.zombies) {
			z.update(dt, this.camera);
		}
		this.zombies = this.zombies.filter((z) => !z.removed);
		this.projectiles.update(dt);
		this.effects.update(dt, this.camera);
		this._updateSuns(dt);
		this._updateTombs(dt);
		// reaparición de zombis
		const alive = this.zombies.filter((z) => z.alive).length;
		this.respawnQueue = this.respawnQueue.filter((t) => {
			if (this.time >= t && alive < MAX_ZOMBIES) {
				const all = [...this.world.tombstones.map((x) => x.spawn), ...this.world.extraSpawns];
				// que no aparezca pegado al jugador
				const far = all.filter((p) => Math.hypot(p.x - this.player.pos.x, p.z - this.player.pos.z) > 9);
				const pos = far[Math.floor(Math.random() * far.length)] || all[0];
				const r = Math.random();
				this.spawnZombie(randomZombieType(r, 0.6, 0.88), pos, true);
				return false;
			}
			return true;
		});
		this.ui.zombies(this.zombies.filter((z) => z.alive).length);
		this.interaction.update(inp.use);
		// fuera de los límites (por si acaso)
		const p = this.player.pos;
		if (p.y < -10 || p.x < BOUNDS.x0 - 5 || p.x > BOUNDS.x1 + 5) {
			this.player.spawn(this.world.playerStart, this.world.playerYaw);
		}
		if (this.player.alive && this.player.hp < PLAYER.maxHp && this.player.hurtT <= 0) {
			// regeneración lenta fuera de combate
			this.player.hp = Math.min(PLAYER.maxHp, this.player.hp + dt * 2);
			this.ui.hp(this.player.hp / PLAYER.maxHp);
		}
	}

	_updateSuns(dt) {
		for (let i = this.suns.length - 1; i >= 0; i--) {
			const s = this.suns[i];
			s.t += dt;
			const r = s.sprite.root;
			if (!s.collected) {
				// arco de caída hasta el suelo y flotación suave
				const k = Math.min(1, s.t / 0.8);
				const base = this.physics.groundAt(s.target.x, s.target.z, 5) + 0.15;
				r.position.x += (s.target.x - r.position.x) * Math.min(1, dt * 4);
				r.position.z += (s.target.z - r.position.z) * Math.min(1, dt * 4);
				r.position.y = base + (1 - k) * 1.2 + Math.sin(k * Math.PI) * 0.8 + Math.sin(s.t * 2) * 0.05;
				const d = Math.hypot(this.player.pos.x - r.position.x, this.player.pos.z - r.position.z);
				if (d < 0.8) {
					this.collectSun(s);
				}
				if (s.t > 25) {
					this.collectSun(s);
				}
			} else {
				s.flyT += dt;
				r.position.lerp(this.camera.position, Math.min(1, dt * 6));
				s.sprite.setOpacity(Math.max(0, 1 - s.flyT * 2));
				if (s.flyT > 0.5) {
					s.sprite.dispose();
					this.suns.splice(i, 1);
					continue;
				}
			}
			s.sprite.update(dt, this.camera);
		}
	}

	_updateTombs(dt) {
		for (const t of this.world.tombstones) {
			if (t.shakeT > 0) {
				t.shakeT -= dt;
				t.group.position.x = t.x + Math.sin(this.time * 60) * 0.05 * t.shakeT;
			}
		}
	}
}

/* ---------- arranque ---------- */
const game = new Game();
const $ = (id) => document.getElementById(id);
$("btnEnter").onclick = () => game.enter();
$("btnResume").onclick = () => game.resume();
$("btnRestart").onclick = () => game.restart();
$("btnRespawn").onclick = () => game.respawnPlayer();
$("btnMute").onclick = (e) => {
	game.audio.enabled = !game.audio.enabled;
	game.audio.setMuted(!game.audio.enabled);
	e.target.textContent = game.audio.enabled ? "🔊 Sonido: sí" : "🔇 Sonido: no";
};
// E o Esc cierran el panel de examen / almanaque
addEventListener("keydown", (e) => {
	if (game.ui.panelOpen && (e.code === "KeyE" || e.code === "Escape")) {
		game.ui.closePanel();
		game.input.usePressed = false;
	}
});
for (const el of document.querySelectorAll("[data-back2d]")) {
	el.onclick = () => (location.href = "../index.html");
}
game.load().catch((err) => {
	console.error(err);
	$("loadText").textContent = "Error al cargar: " + err.message;
});
