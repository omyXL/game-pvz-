/**
 * Configuración del modo "Explorar mapa 3D".
 *
 * Todas las rutas apuntan a recursos que YA existen en el proyecto (game/images/...).
 * Los personajes son GIF animados 2D (el proyecto no tiene modelos 3D ni esqueletos);
 * aquí se declaran qué GIF corresponde a cada estado (esperar, caminar, atacar...).
 */

/** Ruta base hacia la carpeta game/ desde explore3d/index.html */
export const BASE = "../";

/**
 * Los 12 mapas del juego 2D. El modo 3D se construyó para el que salió en el
 * sorteo aleatorio (el nº 10, "Aldea de tumbas"). La lista se conserva para
 * mostrar el origen y para futuras conversiones.
 */
export const MAPS = [
	{ id: 1, name: "Jardín de día", bg: "images/interface/background1.jpg" },
	{ id: 2, name: "Jardín de noche", bg: "images/interface/background2.jpg" },
	{ id: 3, name: "Piscina de día", bg: "images/interface/background3.webp" },
	{ id: 4, name: "Piscina de noche", bg: "images/interface/background4.jpg" },
	{ id: 5, name: "Fondo marino", bg: "images/interface/backgroundLG.jpg" },
	{ id: 6, name: "Lago / todo agua", bg: "images/interface/background5.jpg" },
	{ id: 7, name: "Muralla nevada", bg: "images/interface/backgroundwall.jpg" },
	{ id: 8, name: "Muralla nevada (noche)", bg: "images/interface/backgroundwall2.jpg" },
	{ id: 9, name: "Aldea acuática antigua", bg: "images/interface/backgroundX1.jpg" },
	{ id: 10, name: "Aldea de tumbas", bg: "images/interface/backgroundX2.jpg" },
	{ id: 11, name: "Pie del volcán", bg: "images/interface/backgroundX3.jpg" },
	{ id: 12, name: "Palacio del Diablo", bg: "images/interface/backgroundX4.jpg" },
];

/** Mapa convertido a 3D (elegido al azar entre los 12). */
export const SELECTED_MAP = MAPS[9];

/** Escala: metros por píxel de sprite. Un zombi (≈142 px) mide ≈2,3 m. */
export const PX = 0.016;

/** Tamaño de una casilla del césped en metros y dimensiones del jardín (9×5 como en el 2D). */
export const TILE = 2.4;
export const LAWN_COLS = 9;
export const LAWN_ROWS = 5;
/** Tipo de carril por fila, igual que LF:[0,1,1,3,1,1,0] del nivel "Grave village": 1 = césped, 3 = losas de piedra. */
export const LANE_TYPES = [1, 1, 3, 1, 1];

/** Física del jugador */
export const PLAYER = {
	eyeHeight: 1.7,
	radius: 0.35,
	walkSpeed: 4.2,
	runSpeed: 7.5,
	jumpSpeed: 5.6,
	gravity: 15,
	stepHeight: 0.45,
	maxHp: 100,
};

const Z = "images/Zombies/wall/";

/**
 * Zombis disponibles en la Aldea de tumbas (los mismos que usa el nivel 106 "Grave village":
 * oCZombie, oCConeheadZombie, oCBucketheadZombie). Cada animación es un GIF original.
 * anchor = píxel del sprite que toca el suelo (centro de los pies).
 */
export const ZOMBIES = {
	zombie: {
		name: "Zombi del pueblo",
		desc: "Comedor de cerebros común. Resistencia: baja. Viene del cementerio que hay detrás de la aldea.",
		hp: 10,
		speed: 1.0,
		damage: 12,
		anchor: [86, 140],
		anims: {
			idle: Z + "Zombie/1.gif",
			walk: Z + "Zombie/Zombie.gif",
			walk2: Z + "Zombie/Zombie2.gif",
			attack: Z + "Zombie/ZombieAttack.gif",
			lostHead: Z + "Zombie/ZombieLostHead.gif",
			lostHeadAttack: Z + "Zombie/ZombieLostHeadAttack.gif",
			head: Z + "Zombie/ZombieHead.gif",
			die: Z + "Zombie/ZombieDie.gif",
			boomDie: "images/Zombies/BoomDie.gif",
		},
	},
	conehead: {
		name: "Zombi con cono",
		desc: "Lleva un cono que absorbe daño. Cuando lo pierde se comporta como un zombi normal.",
		hp: 10,
		armor: 18,
		speed: 1.0,
		damage: 12,
		anchor: [86, 140],
		anims: {
			idle: Z + "ConeheadZombie/1.gif",
			walk: Z + "ConeheadZombie/ConeheadZombie.gif",
			attack: Z + "ConeheadZombie/ConeheadZombieAttack.gif",
		},
		/** al perder la armadura usa las animaciones del zombi normal */
		fallback: "zombie",
	},
	buckethead: {
		name: "Zombi con cubo",
		desc: "Su cubo de metal lo hace muy resistente. Resistencia: alta.",
		hp: 10,
		armor: 45,
		speed: 0.9,
		damage: 14,
		anchor: [86, 140],
		anims: {
			idle: Z + "BucketheadZombie/1.gif",
			walk: Z + "BucketheadZombie/BucketheadZombie.gif",
			attack: Z + "BucketheadZombie/BucketheadZombieAttack.gif",
		},
		fallback: "zombie",
	},
};

const P = "images/Plants/";

/**
 * Plantas colocadas en el jardín. shoot = tipo de proyectil (null si no dispara).
 * anchor = píxel del sprite que toca el suelo.
 */
export const PLANTS = {
	peashooter: {
		name: "Lanzaguisantes",
		desc: "Dispara guisantes a los zombis que se acercan. Alcance: 16 m.",
		anims: { idle: P + "Peashooter/Peashooter.gif" },
		anchor: [36, 68],
		shoot: { kind: "pea", interval: 1.4, range: 16, damage: 1, count: 1, muzzle: [62, 22] },
	},
	repeater: {
		name: "Repetidora",
		desc: "Dispara dos guisantes seguidos.",
		anims: { idle: P + "Repeater/Repeater.gif" },
		anchor: [36, 68],
		shoot: { kind: "pea", interval: 1.4, range: 16, damage: 1, count: 2, muzzle: [64, 22] },
	},
	snowpea: {
		name: "Lanzaguisantes de hielo",
		desc: "Sus guisantes congelados hacen daño y ralentizan a los zombis.",
		anims: { idle: P + "SnowPea/SnowPea.gif" },
		anchor: [36, 68],
		shoot: { kind: "snow", interval: 1.5, range: 16, damage: 1, count: 1, muzzle: [62, 22] },
	},
	puffshroom: {
		name: "Hongo lanzaesporas",
		desc: "Hongo nocturno: lanza esporas a corta distancia.",
		anims: { idle: P + "PuffShroom/PuffShroom.gif" },
		anchor: [20, 64],
		shoot: { kind: "spore", interval: 1.4, range: 7, damage: 1, count: 1, muzzle: [34, 44] },
	},
	chomper: {
		name: "Planta carnívora",
		desc: "Se traga de un bocado a un zombi cercano y luego tarda en digerirlo.",
		anims: { idle: P + "Chomper/Chomper.gif", attack: P + "Chomper/ChomperAttack.gif", digest: P + "Chomper/ChomperDigest.gif" },
		anchor: [40, 110],
		chomp: { range: 2.4, digest: 12 },
	},
	sunflower: {
		name: "Girasol",
		desc: "Produce soles. Pulsa E sobre él para que suelte un sol.",
		anims: { idle: P + "SunFlower/SunFlower1.gif" },
		anchor: [36, 68],
		sun: true,
	},
	plantern: {
		name: "Planterna",
		desc: "Ilumina la aldea en la noche. Emite luz real en la escena.",
		anims: { idle: P + "Plantern/Plantern.gif" },
		anchor: [125, 160],
		light: true,
	},
	gravebuster: {
		name: "Destructumbas",
		desc: "Se come las tumbas. Pulsa E sobre una tumba para plantarla encima.",
		anims: { idle: P + "GraveBuster/GraveBuster.gif" },
		anchor: [49, 74],
	},
};

/** Recursos sueltos (proyectiles, efectos, objetos) */
export const FX = {
	peaHit: P + "PeaBulletHit.gif",
	sporeHit: P + "ShroomBulletHit.gif",
	sun: "images/interface/Sun.gif",
	tombstones: "images/interface/Tombstones.png",
};
