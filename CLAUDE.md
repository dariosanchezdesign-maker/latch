# Latch · hackathon build (Oct 8–10, 2026)

Latch helps Puerto Rico patients and their family caregivers get through health-plan prior authorizations: it reads a visit summary, finds what's missing, drafts the requests and follows up.

This repo is the **hackathon build**. Rule: the prototype's core functionality must be built during the event (Caribbean AI Summit Hackathon, Devpost). The UI and data in this repo were prepared before the event; the engine is built now. Commit after every passing check.

## What's here at the start

| Path | What it is |
| --- | --- |
| `index.html` | Landing page + app in one file. Hoy · Plan · Familia screens, Spanish/English (`D.es` / `D.en` dictionary, `t(key)`). **Today it is fed by a fixed script.** |
| `crear-cuenta.html` | Static sign-up mockup (design only, labeled "Maqueta"). Don't wire it up. |
| `data/rules.json` | Rules table: 4 order types (mri, specialist_referral, lab_work, follow_up), what each needs (`needsPriorAuth`, `requiredDocs`, `clinicalNotesMaxAgeDays: 30`). Fictional plans: Plan Salud Coquí, Salud Isla Advantage. |
| `samples/` | 3 fictional visit summaries: A (typed PDF, MRI, **gap: clinical notes**), B (phone photo, knee MRI, no gap), C (PDF, no MRI, nothing needs approval). |
| `expected/` | Answer key per sample: what extraction should return and which gaps to find. Use it to test steps 2–3. |

## Where the fake parts live in `index.html`

- `startExtract()` runs a timed animation and always "finds" María's data → step 2 replaces this with a real call.
- `#sampleAvs` ("Usar ejemplo") and the file inputs `#xFile0` / `#xFile` start the flow.
- State machine: `ORDER = ['request','waitClinic','review','waitPlan','schedule','done']`, state object `S`, `render()`.
- Clinic reply, plan approval and appointment times stay **simulated** (the "Simular respuesta" button). Keep them labeled as simulated.

## Build steps (do one at a time; each has a done-check)

1. **Server function (1 h).** Netlify Function at `/api/read` (`netlify/functions/read.mjs` + `netlify.toml` redirect `/api/*`). First return fixed JSON. *Done when:* the deployed site calls it and logs the answer.
2. **Document reading (3 h).** The function sends the uploaded PDF or image to the Claude API (Messages API, document/image input) and asks for strict JSON: patient, doctor, clinic, health plan, visit date, orders[]. *Done when:* samples A, B, C each match `expected/`.
3. **Rules + gap check (2 h).** Compare each extracted order with `data/rules.json` (in code, not by the model). *Done when:* sample A shows "Falta algo: notas clínicas"; B and C show no gap.
4. **Plan from data (3 h).** Replace the fixed script: steps, statuses and the Hoy card come from the JSON. *Done when:* two different samples produce two different plans.
5. **Generated drafts (2 h).** The model writes the clinic request and packet summary from the extracted details, in Spanish or English. *Done when:* each letter names the right doctor, date and procedure.
6. **Demo hardening (1 h).** Loading states, friendly error, keep "Usar ejemplo" working offline with a saved result from a real run. *Done when:* the full demo runs twice in a row without a hiccup.

If time runs short, steps 1–4 are a complete demo.

## Hard rules

- The API key lives only in Netlify as `ANTHROPIC_API_KEY`. Never put it in the page, the repo or logs.
- The browser never calls the Claude API directly; only the function does.
- Fictional data only. Show a "Demo: no subas récords reales" note on the upload screen.
- Ask the model for JSON only; validate it; retry once on bad JSON, then show a friendly error.
- Make the smallest change that passes the step's check. Don't redesign the UI.
- UI copy is Spanish first; add English keys to `D.en` alongside.
