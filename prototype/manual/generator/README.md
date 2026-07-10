# Manual generator

Drives the app with **Playwright** to capture a screenshot per step and a
video per flow, then renders a detailed zh-TW visual user manual.

## Regenerate everything

```bash
cd prototype/manual
./generate.sh
```

This boots a throwaway backend + frontend, seeds demo data, runs the capture,
and writes:

- `manual/guide.html` — the visual user manual (open in a browser)
- `manual/shots/*.png` — one screenshot per step
- `manual/clips/<flow>.mp4` / `.gif` / `.webm` — full-flow recordings
- `manual/manifest.json` — the data the guide is built from

## Structure

| File | Role |
|------|------|
| `flows.mjs` | Declarative flows/steps. **Edit the zh-TW copy here.** Each step's `arrive(page)` drives the UI to that screen; `title`/`desc`/`tip` become the manual text. |
| `capture.mjs` | Runs the flows, screenshots each step, records + encodes video, writes `manifest.json`. |
| `build-guide.mjs` | Renders `manifest.json` → `guide.html`. |
| `config.mjs` | Paths, viewports, base URL, demo geolocation. |

## Run pieces individually

With the app already running (frontend :5173, backend :8000, data seeded):

```bash
cd prototype/manual/generator
npm install                      # first time
npx playwright install chromium  # first time
MANUAL_BASE_URL=http://127.0.0.1:5173 node capture.mjs
node build-guide.mjs
```

## Adding / editing a step

Edit `flows.mjs`. Keep `arrive()` resilient — prefer role/text locators and
`waitFor()` over fixed sleeps — and write `desc` for an end user, not a dev.
Re-run `./generate.sh` to refresh screenshots, video, and the guide together.
