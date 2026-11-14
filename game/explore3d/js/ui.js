/**
 * Interfaz HTML superpuesta: pantalla de inicio y carga, HUD (vida, soles, velocidad,
 * zombis), indicación de interacción, avisos, panel de examen, almanaque, pausa y muerte.
 */
import { BASE, PLANTS, ZOMBIES, SELECTED_MAP, MAPS } from "./config.js";

const $ = (id) => document.getElementById(id);

export class UI {
	constructor(game) {
		this.game = game;
		this.toastTimer = null;
		this.panelOpen = false;
		$("mapName").textContent = SELECTED_MAP.name;
		$("mapPick").textContent = `Mapa nº ${SELECTED_MAP.id} de ${MAPS.length}, elegido al azar`;
		$("mapThumb").src = BASE + SELECTED_MAP.bg;
		$("panelClose").onclick = () => this.closePanel();
	}

	loading(p, label) {
		$("loadBar").style.width = Math.round(p * 100) + "%";
		$("loadText").textContent = label || "Cargando…";
	}

	ready() {
		$("loading").hidden = true;
		$("btnEnter").disabled = false;
		$("btnEnter").textContent = "ENTRAR AL MAPA 3D";
	}

	showStart(v) {
		$("start").hidden = !v;
	}

	showHud(v) {
		$("hud").hidden = !v;
		document.body.classList.toggle("playing", v);
	}

	showPause(v) {
		$("pause").hidden = !v;
	}

	showDeath(v) {
		$("death").hidden = !v;
	}

	hp(frac) {
		$("hpFill").style.width = Math.max(0, frac * 100) + "%";
		let color = "#e04b3b";
		if (frac > 0.5) {
			color = "#62d14b";
		} else if (frac > 0.25) {
			color = "#e3c13b";
		}
		$("hpFill").style.background = color;
	}

	hurt(frac) {
		this.hp(frac);
		const v = $("vignette");
		v.classList.remove("hit");
		void v.offsetWidth;
		v.classList.add("hit");
	}

	sun(n) {
		$("sunCount").textContent = n;
	}

	speed(m) {
		$("speedVal").textContent = "×" + m.toFixed(2).replace(/0$/, "");
	}

	zombies(n) {
		$("zCount").textContent = n;
	}

	prompt(text) {
		const p = $("prompt");
		if (!text || this.panelOpen) {
			p.hidden = true;
			return;
		}
		p.hidden = false;
		$("promptText").textContent = text;
	}

	toast(text, ms = 2600) {
		const t = $("toast");
		t.textContent = text;
		t.classList.add("show");
		clearTimeout(this.toastTimer);
		this.toastTimer = setTimeout(() => t.classList.remove("show"), ms);
	}

	/**
	 * Panel de examen: título, texto y (opcional) las animaciones GIF originales del personaje.
	 * @param {string} title
	 * @param {string} html
	 * @param {string[]} [gifs]
	 */
	examine(title, html, gifs) {
		$("panelTitle").textContent = title;
		$("panelBody").innerHTML = `<p>${html}</p>` + (gifs && gifs.length ? `<div class="gifs">${gifs.map((g) => gifCard(g)).join("")}</div>` : "");
		this._openPanel();
	}

	showAlmanac() {
		const cards = (defs) =>
			Object.values(defs)
				.map(
					(d) =>
						`<div class="alm"><img src="${BASE + Object.values(d.anims)[Object.values(d.anims).length > 1 ? 1 : 0]}" alt=""><b>${d.name}</b><small>${d.desc}</small></div>`
				)
				.join("");
		$("panelTitle").textContent = "Almanaque Suburbano – Aldea de tumbas";
		$("panelBody").innerHTML =
			`<h3>Plantas de este mapa</h3><div class="almgrid">${cards(PLANTS)}</div><h3>Zombis de este mapa</h3><div class="almgrid">${cards(ZOMBIES)}</div>`;
		this._openPanel();
	}

	_openPanel() {
		this.panelOpen = true;
		$("panel").hidden = false;
		this.prompt(null);
		this.game.setPanelPause(true);
	}

	closePanel() {
		if (!this.panelOpen) {
			return;
		}
		this.panelOpen = false;
		$("panel").hidden = true;
		this.game.setPanelPause(false);
	}
}

function gifCard(path) {
	const file = path.split("/").pop();
	const label =
		{
			"1.gif": "Esperar",
			"Zombie.gif": "Caminar",
			"Zombie2.gif": "Caminar (2)",
			"ZombieAttack.gif": "Atacar",
			"ZombieLostHead.gif": "Sin cabeza",
			"ZombieLostHeadAttack.gif": "Sin cabeza atacando",
			"ZombieHead.gif": "Cabeza cayendo",
			"ZombieDie.gif": "Morir",
			"BoomDie.gif": "Morir por explosión",
			"ConeheadZombie.gif": "Caminar",
			"ConeheadZombieAttack.gif": "Atacar",
			"BucketheadZombie.gif": "Caminar",
			"BucketheadZombieAttack.gif": "Atacar",
			"ChomperAttack.gif": "Morder",
			"ChomperDigest.gif": "Digerir",
		}[file] || "Animación";
	return `<figure><img src="${BASE + path}" alt=""><figcaption>${label}<br><code>${file}</code></figcaption></figure>`;
}
