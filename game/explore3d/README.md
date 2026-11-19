# Explorar mapa 3D (modo experimental)

Modo independiente del juego 2D. Permite recorrer en primera persona uno de los 12 mapas del juego, reconstruido en 3D. El mapa salió por sorteo aleatorio: el **nº 10, Aldea de tumbas** (`images/interface/backgroundX2.jpg`, nivel "Grave village").

- **Entrada:** botón **EXPLORAR MAPA 3D** del menú principal del juego 2D, o directamente `game/explore3d/index.html`.
- **Salida:** botón **2D ↩** del HUD, o **Volver al juego 2D** en el menú de inicio, de pausa y de muerte.

## Cómo probarlo localmente

Los módulos ES necesitan un servidor; no funciona abriendo el archivo con `file://`.

```bash
# desde la raíz del repositorio
python3 -m http.server 8000
# abrir http://localhost:8000/game/explore3d/
```

No necesita compilación ni internet: three.js y el decodificador de GIF están copiados en `vendor/`.

## Controles

| Acción | Computadora | Móvil / táctil |
|---|---|---|
| Caminar | W A S D / flechas | joystick virtual (mitad izquierda) |
| Mirar | ratón (se bloquea el puntero al entrar) | arrastrar en la mitad derecha |
| Saltar | Espacio | botón SALTAR |
| Correr | Shift | botón CORRER (alterna) |
| Velocidad de movimiento | + / − (×0,5 a ×2) | — |
| Interactuar | E | botón USAR |
| Pausa | Esc / P | botón ❚❚ |

## Qué se reutiliza y qué se reconstruye

| Elemento | Origen |
|---|---|
| Disposición del mapa: casa a la izquierda, camino, jardín de 9×5 con carril central de losas, valla, montículo con calavera, rocas y terreno a la derecha, luna | fondo original `backgroundX2.jpg` y `LF:[0,1,1,3,1,1,0]` del nivel 106 |
| Texturas de césped, losas, tierra, roca y tablas de valla | recortadas del fondo original |
| Lápidas | `images/interface/Tombstones.png`, extruidas con grosor |
| Zombis | GIF originales de `images/Zombies/wall/` (los mismos que usa el nivel): esperar, caminar, atacar, sin cabeza, cabeza cayendo, morir |
| Plantas | GIF originales de `images/Plants/` (lanzaguisantes, repetidora, hielo, hongo lanzaesporas, carnívora con ataque y digestión, girasol, planterna, destructumbas) |
| Sol, impactos de guisante | `images/interface/Sun.gif`, `images/Plants/PeaBulletHit.gif`… |
| Sonidos y música | `game/audio/` (gemidos, mordiscos, salpicaduras, tumba, música "The Great Wall1" del nivel) |
| Terreno con relieve, hierba 3D, casa con techo de paja, puerta, interior, farol, valla, rocas, árboles secos, cielo, estrellas, luciérnagas, luces y sombras | **reconstruido en 3D** (geometría procedural) |

### Limitación importante: personajes

El proyecto **no tiene modelos 3D ni esqueletos**: cada personaje es un GIF dibujado de perfil. Por eso no se pueden hacer modelos 3D "reales" sin crear arte nuevo. Lo que hace este modo:

- reproduce **las animaciones originales** fotograma a fotograma, con sus tiempos;
- da **volumen** al personaje con varias capas apiladas (se nota al mirarlo desde arriba o en diagonal);
- lo hace **girar hacia la cámara** y voltearse según hacia dónde camina o apunta;
- le aplica la **iluminación** de la escena y una **sombra real** con su silueta.

Tampoco existe una animación de "recibir daño": igual que en el juego 2D, el zombi parpadea en blanco al ser golpeado (y se tiñe de azul si lo congela un guisante de hielo).

## Interacción (tecla E / botón USAR)

- **Puerta de la casa:** abre y cierra (con colisión) y se puede entrar.
- **Almanaque** sobre la mesa del interior: muestra las plantas y los zombis del mapa.
- **Farol:** encender y apagar (luz real).
- **Lápidas:** evento de prueba; despierta un zombi que sale de la tierra.
- **Girasol:** suelta un sol que se recoge (contador de soles).
- **Plantas y zombis:** panel con descripción, estado y sus animaciones GIF originales.
- **Montículo y carretilla:** examinar.

## Hoja Gruñona (planta 3D añadida)

Es un modelo 3D aportado por el usuario y generado con Meshy AI. No forma parte del juego original.

- **Archivo:** `models/grumpy_leafling.glb`. El OBJ original (53 MB, 531.000 triángulos, textura PNG de 2048²) se convirtió con `obj2gltf` y `gltf-transform` (weld, simplify, resize, webp, quantize). Quedó en **809 KB**, con 31.882 triángulos y una textura WebP de 1024².
- **Dónde está:** un brote brillante al final del carril de losas, entre el jardín y el cementerio.
- **Cómo se usa:** pulsa **E** sobre el brote y la Hoja Gruñona sale de la tierra. Está **6 segundos**. Cada 1,2 s lanza una onda de viento (anillo verde) que **empuja hacia atrás** al jugador y a los zombis que estén a menos de 4,2 m. Los zombis salen despedidos con un pequeño salto y quedan aturdidos un momento.
- Mientras está fuera gira hacia el jugador o el zombi más cercano. Después se encoge y vuelve a la tierra, y el brote tarda **4 s** en recargarse.
- El modelo no trae animaciones: la aparición, el balanceo, el soplido y la desaparición se animan por código.
- Los valores se ajustan en `LEAFLING`, en `js/entities/leafling.js`: duración, recarga, alcance y fuerza.

## Comportamiento

- **Zombis:** deambulan junto a su tumba. Si ven al jugador (unos 17 m) lo persiguen y lo muerden. Pierden la cabeza a media vida y mueren con su animación. El cono y el cubo absorben daño. Reaparecen desde las tumbas o desde los bordes del mapa, así que pueden llegar desde varias direcciones.
- **Plantas:** las que disparan apuntan al zombi más cercano dentro de su alcance si nada se interpone. La carnívora se traga a los zombis cercanos y luego digiere.
- **Jugador:** tiene vida y se regenera lentamente. Si los zombis se lo comen aparece una pantalla para volver a intentarlo.

## Estructura

```
explore3d/
  index.html          página y HUD
  css/style.css       interfaz adaptable (escritorio y móvil)
  js/config.js        mapa, escala, personajes y rutas de sus GIF
  js/assets.js        carga de imágenes y decodificación de GIF a atlas (con caché)
  js/sprite.js        sprite animado con volumen, luz y sombra
  js/world.js         reconstrucción 3D del mapa, luces, objetos interactivos
  js/physics.js       colisiones (cajas y cilindros), suelo y escalones
  js/player.js        cámara en primera persona, gravedad, salto
  js/input.js         teclado, ratón (pointer lock) y controles táctiles
  js/interact.js      detección de objetos cercanos y tecla E
  js/ui.js            HUD, paneles, pausa, muerte
  js/audio.js         sonidos originales con volumen por distancia
  js/entities/        zombie.js, plant.js, projectiles.js (pool), effects.js (pool)
  vendor/             three.js r180 (MIT) y gifuct-js (MIT)
```

## Rendimiento

- Cada GIF se decodifica una sola vez en un atlas que se sube una sola vez a la GPU; cada personaje solo cambia sus coordenadas de textura.
- Proyectiles, efectos y sprites de zombi se reutilizan (pools); no se crean ni destruyen objetos durante el juego.
- La hierba es una sola malla instanciada; la valla y los árboles son geometrías fusionadas.
- En móvil se reduce la resolución interna y se desactiva el antialiasing.
- Las animaciones se cargan solo al entrar en este modo y no afectan al juego 2D.

## Licencias

El código de este modo es una obra derivada del proyecto Plants vs. Zombies: MODDED (PolyForm Noncommercial 1.0.0), así que solo puede usarse **sin fines comerciales** y debe mantener el aviso de autoría, que aparece en el pie de la página. Las imágenes, animaciones y sonidos son propiedad de PopCap Games / Electronic Arts. three.js y gifuct-js tienen licencia MIT (ver `vendor/`).
