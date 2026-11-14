/**
 * Carga de recursos originales del proyecto.
 *
 * - loadImage(): imágenes estáticas (fondo del mapa, lápidas...).
 * - loadAnimation(): decodifica un GIF animado original fotograma a fotograma
 *   (con su tiempo por fotograma) y lo empaqueta en un atlas para la GPU.
 *   Así la animación original se reproduce dentro de la escena 3D.
 * - cropTexture(): recorta una zona del fondo 2D original y la convierte en
 *   textura repetible para la geometría 3D (césped, losas, tierra, roca, madera).
 *
 * Todo se cachea: cada GIF se descarga y decodifica una sola vez.
 */
import * as THREE from "three";
import { parseGIF, decompressFrames } from "../vendor/gifuct.esm.js";
import { BASE } from "./config.js";

const imageCache = new Map();
const animCache = new Map();

/** Carga una imagen del proyecto. */
export function loadImage(path) {
	if (!imageCache.has(path)) {
		imageCache.set(
			path,
			new Promise((resolve, reject) => {
				const img = new Image();
				img.onload = () => resolve(img);
				img.onerror = () => reject(new Error("No se pudo cargar " + path));
				img.src = BASE + path;
			})
		);
	}
	return imageCache.get(path);
}

/**
 * Animación decodificada.
 * @typedef {Object} Animation
 * @property {THREE.Texture} texture  atlas con todos los fotogramas
 * @property {number} frames          nº de fotogramas
 * @property {number} cols            columnas del atlas
 * @property {number} rows            filas del atlas
 * @property {number} width           ancho de un fotograma (px)
 * @property {number} height          alto de un fotograma (px)
 * @property {number[]} delays        duración de cada fotograma (s)
 * @property {number} duration        duración total (s)
 */

/** Decodifica un GIF (o carga una imagen estática) y devuelve un atlas. */
export function loadAnimation(path) {
	if (!animCache.has(path)) {
		animCache.set(path, decode(path));
	}
	return animCache.get(path);
}

async function decode(path) {
	const isGif = /\.gif$/i.test(path);
	if (!isGif) {
		const img = await loadImage(path);
		return buildAtlas([img], [1], img.naturalWidth, img.naturalHeight);
	}
	const res = await fetch(BASE + path);
	if (!res.ok) {
		throw new Error("No se pudo cargar " + path);
	}
	const buf = await res.arrayBuffer();
	// Algunos ".gif" del proyecto son en realidad PNG: se detecta por la firma del archivo.
	const sig = String.fromCharCode(...new Uint8Array(buf, 0, 4));
	if (sig !== "GIF8") {
		const img = await loadImage(path);
		return buildAtlas([img], [1], img.naturalWidth, img.naturalHeight);
	}
	const gif = parseGIF(buf);
	const raw = decompressFrames(gif, true);
	if (!raw.length) {
		const img = await loadImage(path);
		return buildAtlas([img], [1], img.naturalWidth, img.naturalHeight);
	}
	const W = gif.lsd.width;
	const H = gif.lsd.height;

	// Composición respetando el "disposal" de cada fotograma GIF.
	const comp = document.createElement("canvas");
	comp.width = W;
	comp.height = H;
	const cctx = comp.getContext("2d", { willReadFrequently: true });
	const patch = document.createElement("canvas");
	const pctx = patch.getContext("2d");
	const frames = [];
	const delays = [];
	let prevDims = null;
	let prevDisposal = 0;
	let restore = null;
	for (const f of raw) {
		if (prevDims && prevDisposal === 2) {
			cctx.clearRect(prevDims.left, prevDims.top, prevDims.width, prevDims.height);
		}
		if (prevDisposal === 3 && restore) {
			cctx.putImageData(restore, 0, 0);
		}
		if (f.disposalType === 3) {
			restore = cctx.getImageData(0, 0, W, H);
		}
		const d = f.dims;
		patch.width = d.width;
		patch.height = d.height;
		pctx.putImageData(new ImageData(f.patch, d.width, d.height), 0, 0);
		cctx.drawImage(patch, d.left, d.top);
		const snap = document.createElement("canvas");
		snap.width = W;
		snap.height = H;
		snap.getContext("2d").drawImage(comp, 0, 0);
		frames.push(snap);
		// Los GIF con retardo 0 o 10 ms se reproducen a ~100 ms en los navegadores.
		const ms = f.delay && f.delay > 10 ? f.delay : 100;
		delays.push(ms / 1000);
		prevDims = d;
		prevDisposal = f.disposalType;
	}
	return buildAtlas(frames, delays, W, H);
}

function buildAtlas(frames, delays, W, H) {
	const n = frames.length;
	const cols = Math.ceil(Math.sqrt(n));
	const rows = Math.ceil(n / cols);
	const pad = 2;
	const cw = W + pad * 2;
	const ch = H + pad * 2;
	const atlas = document.createElement("canvas");
	atlas.width = cols * cw;
	atlas.height = rows * ch;
	const ctx = atlas.getContext("2d");
	frames.forEach((fr, i) => {
		const x = (i % cols) * cw + pad;
		const y = Math.floor(i / cols) * ch + pad;
		ctx.drawImage(fr, x, y);
	});
	const texture = new THREE.CanvasTexture(atlas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.generateMipmaps = false;
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	return {
		texture,
		frames: n,
		cols,
		rows,
		width: W,
		height: H,
		pad,
		cellW: cw,
		cellH: ch,
		delays,
		duration: delays.reduce((a, b) => a + b, 0),
	};
}

/**
 * Recorta una región de una imagen y la devuelve como textura repetible.
 * @param {HTMLImageElement} img
 * @param {[number,number,number,number]} rect x, y, ancho, alto
 * @param {{repeat?:[number,number], brighten?:number, mirror?:boolean}} opt
 */
export function cropTexture(img, rect, opt = {}) {
	const [x, y, w, h] = rect;
	const c = document.createElement("canvas");
	c.width = w;
	c.height = h;
	const ctx = c.getContext("2d");
	ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
	if (opt.brighten) {
		ctx.globalCompositeOperation = "screen";
		ctx.fillStyle = `rgba(255,255,255,${opt.brighten})`;
		ctx.fillRect(0, 0, w, h);
	}
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	const wrap = opt.mirror === false ? THREE.RepeatWrapping : THREE.MirroredRepeatWrapping;
	t.wrapS = t.wrapT = wrap;
	if (opt.repeat) {
		t.repeat.set(opt.repeat[0], opt.repeat[1]);
	}
	t.anisotropy = 4;
	return t;
}

/** Recorta una región como canvas (para texturas de un solo uso, p. ej. la cara de una lápida). */
export function cropCanvas(img, rect) {
	const [x, y, w, h] = rect;
	const c = document.createElement("canvas");
	c.width = w;
	c.height = h;
	c.getContext("2d").drawImage(img, x, y, w, h, 0, 0, w, h);
	return c;
}

/** Precarga varias animaciones en paralelo informando el progreso. */
export async function preload(paths, onProgress) {
	let done = 0;
	const unique = [...new Set(paths)];
	await Promise.all(
		unique.map((p) =>
			(/\.(gif|webp)$/i.test(p) ? loadAnimation(p) : loadImage(p)).then(() => {
				done++;
				onProgress && onProgress(done / unique.length, p);
			})
		)
	);
}
