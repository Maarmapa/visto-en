# Hackathon submission draft

Status: draft only. Nothing in this repository has been sent to the hackathon.

Track: Indie developer.

Theme: Build for Your World.

## Name

Visto en

## One line

Turn a fictional creator's Instagram caption into a page on a fictional shop's site, keep it out of the index until a simulated approval says yes, and show a handwritten before/after of AI citations. `make demo` fills the page with a deterministic template and does not call a model. `make demo-muse` is written to call Muse Spark, Muse Image, and Muse Voice Transcribe on those same fixtures; that live call has not been executed in this build.

## Problem

Instagram posts are a weak source for answer engines, so a creator's claim about a product never becomes a quotable page.

Sources, with the date each figure belongs to:

- OtterlyAI's 2026 study of social citations found Instagram at 2.2% and TikTok at 0.7%. <https://otterly.ai/blog/youtube-ai-citation-study-2026/>
- cloro.dev, week of 26 Oct 2026: ChatGPT cited Instagram in 0.0% of answers, and Google AI Overview in 9.2%. Perplexity's 0.4% is from the week of 28 Sep 2026. cloro did not measure Perplexity between 5 Oct and 26 Oct 2026. <https://cloro.dev/research/social-platforms-in-ai-search/>
- Promptwatch, 28 Sep–4 Oct 2026: social networks were 0.46% of ChatGPT citations, against 12.2% in AI Overviews. <https://promptwatch.com/data/social-media-citations-by-ai-model-october-2026>

Google can index some public professional posts. The other engines still need ordinary text on the open web, with structure and a stable URL.

## What runs today

`make demo` runs locally, with fixtures, with no network and no key:

1. Seven fictional posts are read from `fixtures/`. Two captions carry `#publi` and are labeled as paid. The others say "No consta como colaboración pagada." The label is not a claim that the post is certainly organic.
2. A deterministic template builds the summary, a quote taken from the caption, three questions, and schema.org (`SocialMediaPosting` or `VideoObject`, `Person`, `Product` in `mentions`, `FAQPage`). In the mock, fixed sentences pad the summary to 80–120 words. Each card says "Plantilla determinista, sin modelo". Under that, and on each index card, a second line lists the Meta models whose output is actually on that card. With no generated image and no transcript fed to a model, the line is "Ningún modelo de Meta tocó esta ficha."
3. The card shows a simulated embed box and a link to a fictional `https://www.instagram.com/...` permalink. The oEmbed client is not used to fill the page. If `fixtures/media/manifest.json` points at an image file that exists, the box shows that file, with a visible label naming the model from the manifest and a descriptive `alt`. This build has not generated those files, so the box still says there is no real photo.
4. A card is written into the index, the sitemap, and `llms.txt` only when its fixture status is `approved`. Six are simulated approvals. One stays `pending` and is left out. WhatsApp is not sent.
5. The dashboard reads numbers written by hand in `fixtures/prompts.yaml`. The cards say "simulado" and "36 consultas simuladas". Google AI Overview is shown as "sin API oficial: no se mide". It is not presented as the engine that cites the most. ChatGPT and Perplexity numbers are simulated too. Before is 0 because the file says so, not because anyone measured it.

## What is written and has not been executed against live services

This is not a claim that those calls work. Tests use a fake `fetch` or assert that the call is refused. Nobody has run them against the live services in this build.

- Graph API client for `/{ig-user-id}/tags`, mentioned media, and business discovery. It does not request a paid-partnership field, because IG Media does not provide one.
- Tokenless oEmbed client. The rendered card does not insert that HTML.
- Meta text client: `POST https://api.meta.ai/v1/chat/completions`, OpenAI-compatible, default model `muse-spark-1.3` (`META_MODEL_NAME` overrides it), key in `META_MODEL_API_KEY`. `make demo-meta` sets `INGEST_MOCK=1` and `LLM_PROVIDER=meta` and loads `.env` with `node --env-file-if-exists=.env`. It has not been executed against the live API here.
- Meta image client: `POST https://api.meta.ai/v1/images/generations`, model `muse-image-1.0`. Confirmed in the docs at <https://dev.meta.ai/docs/api-reference/images/create-image> and <https://dev.meta.ai/docs/image-generation>. The request asks for one PNG as base64 and turns off the built-in web and image search. `META_IMAGE_ENDPOINT` and `META_IMAGE_MODEL` override the defaults. `make imagenes` writes `fixtures/media/{post_id}.png` (or the format the response names) and `fixtures/media/manifest.json` with model, prompt, and date. It has not been executed against the live API here, so no synthetic image is in the tree yet.
- Meta speech client: `POST https://api.meta.ai/v1/asr/transcribe`, model `muse-voice-transcribe-1.0`, multipart with a JSON `request` part and a WAV `audio` part. Confirmed at <https://dev.meta.ai/docs/speech-to-text>. This is not OpenAI's `/audio/transcriptions`. The file endpoint accepts mono 16-bit PCM WAV at 16 or 24 kHz, so an `.m4a` is converted with ffmpeg before upload. `META_TRANSCRIBE_ENDPOINT` and `META_TRANSCRIBE_MODEL` override the defaults. The reel fixture points at `fixtures/media/demo0006.m4a`; the exact words are in `fixtures/media/demo0006-guion.txt`. The transcript is saved next to that file as `demo0006-transcript.json`. It has not been executed against the live API here.
- `make demo-muse` runs image generation for missing files, transcription for a missing transcript, then the demo with `LLM_PROVIDER=meta`. Without `META_MODEL_API_KEY` it exits with `falta META_MODEL_API_KEY` and does not modify `out/`. It has not been executed against the live API here.
- Ollama client for a local open-weight model, same validation.
- WhatsApp Business template payload. The send function is not called. There is no approved template, no webhook for the buttons, and no opt-in step where the creator gives a phone number.
- IndexNow payload. The ping is not sent. In mock the key is not copied into `out/`.
- Perplexity and OpenAI web-search clients. The live path, if turned on later, is a single pass over those two engines. It does not record a before phase. Google AI Overview is refused in code because there is no official citation API in this MVP.

## How a Meta model is used when the key is present

`make demo` does not call a model.

`make demo-meta` calls Muse Spark on the fictional captions. `make demo-muse` also calls Muse Image once per fixture that has an `image_prompt` and no file yet, and Muse Voice Transcribe for the reel when `demo0006-transcript.json` is missing. The text prompt asks for products, an 80–120 word summary in Spanish, three FAQs, and a verbatim quote. If a transcript was loaded, the prompt includes the caption and the transcript. The code then checks the reply before publishing it:

- The quote must be a literal substring of the caption or, when a transcript was passed in, of that transcript. If it is not, the template quote is used.
- A product is kept only when it is a catalog item the caption mentions, or when its name appears in the caption.
- The summary must be 80–120 words. If it is not, the client retries once and then uses the template summary.
- The card says "Texto generado con muse-spark-1.3 a partir del caption" only when the summary came from the model. If that call also received a transcript, the line says the text came from the caption and the transcript. Otherwise the card says "Plantilla determinista, sin modelo".
- A separate line, on the card and on the index, names the Meta models that produced something on that card: Spark when the summary was kept, Image when the manifest's image is shown, Voice Transcribe when the transcript was passed to the model. The names come from the run metadata. They are not a fixed string.

`MOCK` still blocks Graph, oEmbed, WhatsApp, IndexNow, and live measurement. It does not block the model when `LLM_PROVIDER` is `meta` or `ollama`.

## Solution the demo is a sketch of

Visto en is meant to run on the brand's own site: read posts that tag or mention the brand through official Meta APIs, turn the caption into a citable page, publish that page only after the creator's approval, and then watch whether answer engines cite it. The pilot in this demo is a fictional art-and-graffiti shop, Tienda Demo, and seven fictional creators. No real accounts, no prices, no customer data.

The approval gate in this build is the fixture status. The WhatsApp round trip is not implemented. The comparison the dashboard draws is scripted. The Meta model calls are implemented and unrun against the live API.

## Next steps

1. Decide whether to submit this draft, on the Indie developer track, under Build for Your World.
2. Run `make demo-muse` once a Meta Model API key is available. Commit the synthetic images and `fixtures/media/manifest.json`, and the transcript JSON if it should ship with the demo. Record the models line on a card.
3. Record the three-minute video from `docs/VIDEO-SCRIPT.md` and say out loud that the dashboard is simulated.
4. Publish a clean public repository from `scripts/exportar-publico.sh` only when that export is reviewed. This private repository is not the public one.
5. Someone with access creates a Meta app in development mode. Keys stay in an untracked `.env`.
6. App Review before any account outside the app roles is queried. Keep Business Discovery as a way to find posts, and publish only with an `approved` status.
7. Add the creator opt-in before any WhatsApp template, then the webhook that reads approve and reject.
8. Turn on live measurement only after pages are actually public. Report trends. Do not treat Google AI Overview as measured.
