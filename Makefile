.PHONY: demo demo-meta demo-muse imagenes transcribir serve test

NODE = node --disable-warning=ExperimentalWarning
NODE_ENVFILE = node --disable-warning=ExperimentalWarning --env-file-if-exists=.env

demo:
	MOCK=1 INGEST_MOCK=1 LLM_PROVIDER=template $(NODE) scripts/demo.js

demo-meta:
	MOCK=1 INGEST_MOCK=1 LLM_PROVIDER=meta $(NODE_ENVFILE) scripts/demo.js

demo-muse:
	MOCK=1 INGEST_MOCK=1 LLM_PROVIDER=meta $(NODE_ENVFILE) scripts/demo-muse.js

imagenes:
	$(NODE_ENVFILE) scripts/generar-imagenes.js

transcribir:
	$(NODE_ENVFILE) scripts/transcribir.js

serve:
	$(NODE_ENVFILE) scripts/serve.js

test:
	$(NODE) --test
