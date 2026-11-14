/**
 * Controles.
 *  Computadora: W A S D / flechas para caminar, ratón para mirar (Pointer Lock),
 *               Espacio saltar, Shift correr, E interactuar, + / − velocidad, Esc / P pausa.
 *  Móvil/táctil: joystick virtual (izquierda), arrastrar en la mitad derecha para girar
 *               la cámara, botones de saltar, correr, usar (E) y pausa.
 */
export class Input {
	/** @param {HTMLElement} canvas */
	constructor(canvas) {
		this.canvas = canvas;
		this.keys = new Set();
		this.lookX = 0;
		this.lookY = 0;
		this.move = { x: 0, y: 0 }; // x: derecha, y: adelante
		this.jumpPressed = false;
		this.usePressed = false;
		this.runToggle = false;
		this.speedMul = 1;
		this.touch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
		this.locked = false;
		this.enabled = false;
		this.onPause = null;
		this.onSpeed = null;
		this.sensitivity = 0.0022;
		this.touchSensitivity = 0.006;
		this._bindKeyboard();
		this._bindMouse();
		this._bindTouch();
	}

	_bindKeyboard() {
		addEventListener("keydown", (e) => {
			if (!this.enabled) {
				return;
			}
			const k = e.code;
			if (k === "Space") {
				if (!this.keys.has(k)) {
					this.jumpPressed = true;
				}
				e.preventDefault();
			}
			if (k === "KeyE" && !this.keys.has(k)) {
				this.usePressed = true;
			}
			if (k === "KeyP") {
				this.onPause && this.onPause();
			}
			if (k === "Equal" || k === "NumpadAdd") {
				this.changeSpeed(0.25);
			}
			if (k === "Minus" || k === "NumpadSubtract") {
				this.changeSpeed(-0.25);
			}
			this.keys.add(k);
		});
		addEventListener("keyup", (e) => this.keys.delete(e.code));
		addEventListener("blur", () => this.keys.clear());
	}

	changeSpeed(d) {
		this.speedMul = Math.min(2, Math.max(0.5, Math.round((this.speedMul + d) * 100) / 100));
		this.onSpeed && this.onSpeed(this.speedMul);
	}

	_bindMouse() {
		document.addEventListener("pointerlockchange", () => {
			const was = this.locked;
			this.locked = document.pointerLockElement === this.canvas;
			// al salir del bloqueo del ratón (tecla Esc) se abre la pausa
			if (was && !this.locked && this.enabled && !this.touch) {
				this.onPause && this.onPause(true);
			}
		});
		document.addEventListener("mousemove", (e) => {
			if (!this.locked) {
				return;
			}
			this.lookX += e.movementX * this.sensitivity;
			this.lookY += e.movementY * this.sensitivity;
		});
	}

	requestLock() {
		if (this.touch) {
			return;
		}
		try {
			const p = this.canvas.requestPointerLock();
			if (p && p.catch) {
				p.catch(() => {});
			}
		} catch {
			/* sin pointer lock (iframe sin permiso): se usa arrastrar con el ratón */
		}
	}

	releaseLock() {
		if (document.pointerLockElement) {
			document.exitPointerLock();
		}
	}

	_bindTouch() {
		const stick = document.getElementById("joystick");
		const knob = document.getElementById("joyKnob");
		let stickId = null;
		let lookId = null;
		let sx = 0;
		let sy = 0;
		let lx = 0;
		let ly = 0;
		const R = 50;
		const area = document.getElementById("touchLook");
		const onStart = (e) => {
			for (const t of e.changedTouches) {
				if (t.target.closest && t.target.closest(".tbtn")) {
					continue;
				}
				if (t.clientX < innerWidth * 0.45 && stickId === null) {
					stickId = t.identifier;
					sx = t.clientX;
					sy = t.clientY;
					stick.style.left = sx - 60 + "px";
					stick.style.top = sy - 60 + "px";
					stick.classList.add("active");
				} else if (lookId === null) {
					lookId = t.identifier;
					lx = t.clientX;
					ly = t.clientY;
				}
			}
			e.preventDefault();
		};
		const onMove = (e) => {
			for (const t of e.changedTouches) {
				if (t.identifier === stickId) {
					let dx = t.clientX - sx;
					let dy = t.clientY - sy;
					const d = Math.hypot(dx, dy);
					if (d > R) {
						dx = (dx / d) * R;
						dy = (dy / d) * R;
					}
					knob.style.transform = `translate(${dx}px,${dy}px)`;
					this.move.x = dx / R;
					this.move.y = -dy / R;
				} else if (t.identifier === lookId) {
					this.lookX += (t.clientX - lx) * this.touchSensitivity;
					this.lookY += (t.clientY - ly) * this.touchSensitivity;
					lx = t.clientX;
					ly = t.clientY;
				}
			}
			e.preventDefault();
		};
		const onEnd = (e) => {
			for (const t of e.changedTouches) {
				if (t.identifier === stickId) {
					stickId = null;
					this.move.x = this.move.y = 0;
					knob.style.transform = "";
					stick.classList.remove("active");
				} else if (t.identifier === lookId) {
					lookId = null;
				}
			}
		};
		area.addEventListener("touchstart", onStart, { passive: false });
		area.addEventListener("touchmove", onMove, { passive: false });
		area.addEventListener("touchend", onEnd);
		area.addEventListener("touchcancel", onEnd);

		const btn = (id, fn) => {
			const el = document.getElementById(id);
			el.addEventListener("touchstart", (e) => {
				e.preventDefault();
				e.stopPropagation();
				fn(el);
			});
			el.addEventListener("click", (e) => {
				e.preventDefault();
				fn(el);
			});
		};
		btn("btnJump", () => (this.jumpPressed = true));
		btn("btnUse", () => (this.usePressed = true));
		btn("btnRun", (el) => {
			this.runToggle = !this.runToggle;
			el.classList.toggle("on", this.runToggle);
		});
		btn("btnPause", () => this.onPause && this.onPause());

		// arrastrar con el ratón si no hay pointer lock disponible
		let drag = false;
		this.canvas.addEventListener("mousedown", () => (drag = !this.locked && !this.touch && this.enabled));
		addEventListener("mouseup", () => (drag = false));
		addEventListener("mousemove", (e) => {
			if (drag && !this.locked) {
				this.lookX += e.movementX * this.sensitivity * 1.5;
				this.lookY += e.movementY * this.sensitivity * 1.5;
			}
		});
	}

	/** Lee el estado de movimiento combinando teclado y joystick. */
	read() {
		const k = this.keys;
		let x = this.move.x;
		let y = this.move.y;
		if (k.has("KeyW") || k.has("ArrowUp")) {
			y += 1;
		}
		if (k.has("KeyS") || k.has("ArrowDown")) {
			y -= 1;
		}
		if (k.has("KeyD") || k.has("ArrowRight")) {
			x += 1;
		}
		if (k.has("KeyA") || k.has("ArrowLeft")) {
			x -= 1;
		}
		const len = Math.hypot(x, y);
		if (len > 1) {
			x /= len;
			y /= len;
		}
		const run = k.has("ShiftLeft") || k.has("ShiftRight") || this.runToggle;
		const out = { x, y, run, jump: this.jumpPressed, use: this.usePressed, lookX: this.lookX, lookY: this.lookY };
		this.jumpPressed = false;
		this.usePressed = false;
		this.lookX = 0;
		this.lookY = 0;
		return out;
	}
}
