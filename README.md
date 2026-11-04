# Visto en

**Creators' Instagram posts, turned into pages that AI answer engines can cite.** Built for the Meta Global AI Developer Hackathon 2026 (Indie developer · Build for Your World), with the help of AI coding assistants.

Shoppers now ask ChatGPT, Perplexity and Google what to buy, and those engines almost never cite Instagram. Visto en takes the posts where a shop is tagged or mentioned, enriches them with Meta models (Muse Spark writes the summary and FAQ, Muse Image draws a synthetic preview, Muse Voice Transcribe turns reel audio into text), and publishes a schema.org page per post, plus `sitemap.xml` and `llms.txt`, only after the creator approves. Quotes are checked to be literal substrings of the caption or transcript.

**What runs today:** the full pipeline over fictional fixtures (a made-up shop, "Tienda Demo", and creators `@artista_demo_1`…`7`), the approval gate, the paid-partnership label, JSON-LD validation and the Meta model calls (`make demo-muse`, needs `META_MODEL_API_KEY` in `.env`). **Simulated and labeled as such:** Instagram ingestion (the app is in development mode) and the before/after citation measurement.

```bash
make demo        # offline, deterministic template, no keys
make demo-muse   # Muse Spark + Muse Image + Muse Voice Transcribe (key in .env)
make serve       # http://127.0.0.1:4321/
npm test
```

Node 22, no dependencies. MIT license. The rest of this README is in Spanish (the pilot market is Chile).

---

Posts de creadores, convertidos en páginas que una IA puede citar. El piloto de esta demo es **Tienda Demo**, una tienda ficticia de arte y graffiti. Los creadores (`@artista_demo_1` … `@artista_demo_7`) y los posts también son ficticios.

Esta versión corre en modo mock de punta a punta, en local, sin red y sin llaves. `make demo` no llama a ningún modelo. `make demo-meta` llama a Muse Spark sobre los fixtures. `make demo-muse` además pide las imágenes que falten a Muse Image y, si falta, la transcripción del reel a Muse Voice Transcribe. Esta copia no ha ejecutado esas llamadas contra la API viva.

## Arquitectura

```
fixtures/*.json ──► ingest ──► enrich ──► site ──► out/
                      │            │         ├── /visto-en/{creador}/{post}/
                      │            │         ├── index.html
                      │            │         ├── sitemap.xml
                      │            │         ├── llms.txt
                      │            │         └── indexnow.json   (no se envía)
                      │            ▼
                      │         consent ──► out/consent/*.json   (no se envía)
                      ▼
                    data/visto.sqlite
                      ▲
                   measure ──► out/dashboard/index.html
                   prompts.yaml
```

| Módulo | Qué hace en `make demo` | Qué queda escrito y no se ha ejecutado contra servicios vivos |
|---|---|---|
| `ingest/` | Lee `tags`, `mentioned_media` y `business_discovery` desde `fixtures/` | Cliente de Graph API. oEmbed sin token, que esta ficha no inserta |
| `enrich/` | Plantilla determinista. En el mock completa el largo con frases fijas | `LLM_PROVIDER=meta` (Muse Spark) u `ollama`. La cita puede salir del caption o de la transcripción |
| `media/` | Si el manifest y el archivo ya están, la ficha muestra la imagen. Si no, el recuadro vacío | `make imagenes` (Muse Image) y `make transcribir` (Muse Voice Transcribe), con llave |
| `site/` | HTML, JSON-LD, sitemap, `llms.txt` y el payload de IndexNow | El ping a IndexNow no corre con `MOCK=1` |
| `consent/` | El fixture trae `approved` o `pending`. Solo `approved` entra al índice, al sitemap y a `llms.txt` | El POST de WhatsApp no se ejecuta. No hay webhook ni plantilla aprobada |
| `measure/` | Simula con valores escritos a mano en `fixtures/prompts.yaml` | Perplexity y OpenAI, detrás de `MEASURE_LIVE=1` y `MOCK=0`. Una sola pasada, sin antes/después |

`INGEST_MOCK` vale `1` si no está (o si `MOCK` no es `0`). `LLM_PROVIDER` vale `template` si no está. `MOCK=1` sigue significando fixtures y plantilla, pero no apaga el modelo cuando `LLM_PROVIDER` es `meta` u `ollama`. Graph API, oEmbed, WhatsApp, IndexNow y la medición en vivo siguen apagados mientras `MOCK` no sea `0`.

Node 22, sin dependencias y sin `npm install`. Solo módulos nativos: `node:test`, `node:sqlite`, `node:fs`, `node:http` y `fetch`. `make demo` no usa `fetch`. Si `node:sqlite` falla, el almacén cae a JSON.

## Cómo correr

```bash
make demo
make serve
```

`make demo` regenera `out/` y `data/` solo si esas carpetas están dentro del repo, y solo las reemplaza cuando la corrida termina bien. `make serve` sirve `out/` en [http://127.0.0.1:4321/](http://127.0.0.1:4321/) y carga `.env` si existe (`node --env-file-if-exists=.env`). No hace falta un `.env` para `make demo`.

Para llamar a Muse Spark sobre los fixtures, con la llave en `.env` y sin leer Instagram:

```bash
make demo-meta
```

Ese comando fija `INGEST_MOCK=1` y `LLM_PROVIDER=meta`, y usa `POST https://api.meta.ai/v1/chat/completions` con el modelo `muse-spark-1.3` (o `META_MODEL_NAME`). Sin `META_MODEL_API_KEY` no llama a la red. Esta copia del repo no ha corrido ese comando contra la API viva.

Para la demo con los tres modelos, la misma llave y los mismos fixtures:

```bash
make imagenes
make transcribir
make demo-muse
```

`make demo-muse` genera las imágenes que falten (`muse-image-1.0`, `POST https://api.meta.ai/v1/images/generations`), transcribe el reel si falta el JSON (`muse-voice-transcribe-1.0`, `POST https://api.meta.ai/v1/asr/transcribe`) y después corre la demo con `LLM_PROVIDER=meta`. Sin llave termina con `falta META_MODEL_API_KEY` y no modifica `out/`. Los endpoints se pueden cambiar con `META_IMAGE_ENDPOINT` y `META_TRANSCRIBE_ENDPOINT`. Esta copia no ha corrido esos comandos contra la API viva.

Tests:

```bash
npm test
```

También vale `make test`.

Páginas útiles de la demo:

- Índice: [http://127.0.0.1:4321/](http://127.0.0.1:4321/)
- Ficha con publicidad: [http://127.0.0.1:4321/visto-en/artista_demo_1/demo0001/](http://127.0.0.1:4321/visto-en/artista_demo_1/demo0001/)
- Ficha orgánica: [http://127.0.0.1:4321/visto-en/artista_demo_2/demo0002/](http://127.0.0.1:4321/visto-en/artista_demo_2/demo0002/)
- Reel: [http://127.0.0.1:4321/visto-en/artista_demo_6/demo0006/](http://127.0.0.1:4321/visto-en/artista_demo_6/demo0006/)
- Medición simulada: [http://127.0.0.1:4321/dashboard/](http://127.0.0.1:4321/dashboard/)
- `sitemap.xml`, `llms.txt` y `out/consent/`

`@artista_demo_7` queda en `out/consent/` con estado `pending` y no entra al índice, al sitemap ni a `llms.txt`.

Las variables están nombradas en `.env.example`, sin valores.

## Guion de 3 minutos

El guion con escenas, URLs y segundos está en `docs/VIDEO-SCRIPT.md`. Los números del dashboard son una simulación escrita a mano. No se consultó ChatGPT, Perplexity ni Google. Google AI Overview se muestra como «sin API oficial: no se mide». El orden entre ChatGPT y Perplexity lo fijamos a mano para que se parezca al estudio de cloro; no es un resultado.

En la ficha de `make demo`, si todavía no hay imágenes ni transcripción guardadas, se leen dos líneas: «Plantilla determinista, sin modelo» y «Ningún modelo de Meta tocó esta ficha». El recuadro sigue sin foto. Si `make demo-muse` respondió, la segunda línea nombra solo los modelos cuya salida está en esa ficha: Muse Spark para el texto, Muse Image para la imagen y Muse Voice Transcribe para el audio del reel.

## Riesgos

- **Meta Platform Terms e Instagram 6.2.** Solo APIs oficiales. Este mock no scrapea Instagram. La política 6.2 prohíbe usar la plataforma solo para mostrar o importar contenido de usuarios sin permiso previo de Meta. El valor que agrega la ficha es el texto citable, el enlace al original y la compuerta de consentimiento. En producción hacen falta los permisos y la revisión de la app. Business Discovery, en este diseño, sirve para descubrir; no se publica una ficha sin estado `approved`.
- **App Review.** En modo desarrollo la app solo ve cuentas con rol. Para leer menciones de cuentas ajenas hace falta Advanced Access. El cliente de oEmbed existe y no se usa para llenar la ficha de esta demo.
- **Consentimiento del creador.** En esta demo el estado sale del fixture. Una ficha entra al índice, al sitemap y a `llms.txt` solo si está `approved`. El envío de WhatsApp, la plantilla aprobada en el administrador y el webhook de los botones no están implementados. Antes de un envío real el creador tendría que entregar su número y aceptar el opt-in. Aquí ningún payload se envía.
- **Etiqueta de publicidad.** Se marca si el caption trae `#publi`, `#ad`, `#publicidad`, `#colaboracion`, `#colaboración` o «paid partnership», o si ya viene un dato de Partnership Ads. La Graph API de IG Media no tiene un campo de colaboración pagada y el cliente no lo pide. Una ficha orgánica dice «No consta como colaboración pagada», no que el post sea orgánico con certeza. En Chile rige el criterio del SERNAC sobre publicidad encubierta. En Estados Unidos, las guías de la FTC piden que la relación material sea clara.
- **Medir citas de IA es ruidoso.** El dashboard de esta demo no es una medición. La medición en vivo, escrita y no ejecutada, cubre una pasada de Perplexity y OpenAI, sin fase «antes». Google AI Overview no tiene API oficial de citas aquí.
- **Audio del reel.** El reel ficticio trae `fixtures/media/demo0006.m4a` (voz sintética local) y el texto exacto en `fixtures/media/demo0006-guion.txt`. La API de transcripción solo acepta WAV PCM mono a 16 o 24 kHz, así que un `.m4a` se convierte con ffmpeg antes de subirlo. `make demo` no transcribe: la plantilla sigue usando el caption. La transcripción, si se guardó, entra en el enriquecimiento con modelo.
- **Contenido delgado.** En el mock, más de la mitad del resumen son frases fijas para llegar a 80–120 palabras. El resumen que depende del texto de verdad es el del modelo, y solo si pasa la validación. La cita tiene que ser una subcadena literal del caption o, si el modelo recibió transcripción, de ese texto. Los productos siguen saliendo del catálogo o del caption.

## Qué corre hoy y qué está escrito

Corre hoy, con `make demo`: páginas, JSON-LD, sitemap, `llms.txt`, SQLite, la plantilla, los payloads de consentimiento sin enviar, y el dashboard simulado. El 0 de «antes» y las citas de «después» de ChatGPT y Perplexity están escritos a mano. El enlace de cada ficha apunta a un permalink ficticio de `https://www.instagram.com/...`.

Escrito, y no ejecutado contra servicios vivos: el cliente de Graph API, el de oEmbed, Muse Spark, Muse Image, Muse Voice Transcribe, el de Ollama, el envío de WhatsApp, IndexNow y la medición de Perplexity y OpenAI. Los tests cubren la forma del request con `fetch` falso y que esas llamadas no salen sin llave. No prueban que los servicios respondan.
