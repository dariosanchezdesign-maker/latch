# Step 4 · Plan from data

Goal (from CLAUDE.md): replace the fixed script. Steps, statuses and the Hoy card come from the extracted JSON.
Done when: two different samples produce two different plans.

## How the plan is built from the data

- One step for the visit, then one step per order, in the order the document lists them.
- Each order gets a status from `data/rules.json` + the gap check:
  - **Needs plan approval and something is missing** (sample A's MRI) → the approval flow starts at "ask the clinic" (today's flow).
  - **Needs plan approval and nothing is missing** (sample B's MRI) → it skips the clinic and starts at "review and send to the plan".
  - **Doesn't need approval** (referrals, labs) → "Te toca agendar" (you schedule it).
  - **Follow-up** → "Más adelante" (later, after the other results).
- **Nothing needs approval at all** (sample C) → the Hoy card says that nothing needs the plan's approval, and the first thing to do is schedule the first order (e.g. the endocrinology appointment).

## Todo

- [x] 1. Keep the extracted data (`S.x`) and build the list of steps with their statuses (`S.steps`).
- [x] 2. Reading card: lines 1–4 (doctor and date, orders found, health plan, what needs approval) come from the data.
- [x] 3. Hoy screen: the greeting, title ("El plan de Roberto"), subtitle (doctor + date), the main card, the step track and the Waiting / Next columns come from the steps.
- [x] 4. Main-card text (ask the clinic → wait → review → wait for the plan → pick a date) uses the real clinic, plan, procedure and patient name.
- [x] 5. Plan screen: one expandable item per step. The approval step keeps its checklist; its documents come from `docsPresent`.
- [x] 6. Pop-up panels (request to clinic, packet to plan, pick a date) use the real names. The letter stays a simple template for now (step 5 has the model write it).
- [x] 7. Header and Familia: patient name, town and doctor come from the data.
- [x] 8. Upload screen note becomes "Demo: no subas récords reales" (a hard rule in CLAUDE.md; the current note says every file is treated as María's).
- [x] 9. Spanish first, with English keys added next to each.
- [x] 10. Test on the live site: A, B and C each give a different plan. Commit "Step 4: plan from data" and push.

## Stays simulated (labeled as today)

Clinic reply, plan approval number, appointment times (the "Simular respuesta" button).

## Decisions to confirm

1. **Caregiver name.** The app greets "Hola, Ana" (María's daughter). The documents don't name a caregiver.
   Proposal: greet with just "Hola" and show "Tú · cuidador(a)" in the header.
2. **If reading fails.** Proposal: for now, fall back to María's sample data so the demo still runs. The friendly error comes in step 6.

Both decisions approved: greet with "Hola" / "Tú · cuidador(a)", and fall back to sample A if reading fails.

## Review

Done-check passed on the live site with real reads (Oct 8):

| Sample | Title | First task (Hoy card) | Steps |
| --- | --- | --- | --- |
| A · María | El plan de María | Pedir las notas de la visita a Clínica Costa Norte | Visita · Referido a Cardiología · MRI (falta algo) · Laboratorio · Seguimiento |
| B · Roberto | El plan de Roberto | Revisar la autorización de la MRI | Visita · MRI (lista para enviar) · Seguimiento |
| C · Carmen | El plan de Carmen | Agendar la cita de endocrinología | Visita · Referido a Endocrinología · Laboratorio · Seguimiento |

What changed in `index.html`:
- Text uses placeholders (`{pt}`, `{clinic}`, `{plan}`, `{dr}`, `{proc}`…) that `t()` fills from the extracted data (`ctx()`). Values are HTML-escaped.
- `buildSteps()` turns the orders + rules + gaps into steps; `enterPlan()` picks the starting point (request / review / clear).
- New "clear" state for summaries where nothing needs approval; its card shows the first order to book and the rule's note.
- Reading card, Hoy track and columns, Plan list, Familia, header and pop-up panels all read from the steps.
- `SAMPLE_X` (a saved real result for sample A) is used if reading fails.
- Removed 23 unused María-only text entries (es + en). Upload note now says "Demo: no subas récords reales".

Still simulated (unchanged): clinic reply, PA number, appointment centers and times. The clinic letter is a template until step 5.

---

# Step 4 rework · "the plan comes from the document" (detailed spec from the user)

Replaces the first version above where they differ. The caregiver decision is reversed by this spec: the caregiver is "Ana" + the patient's first surname.

- [x] 1. Dictionary rebuilt from the original design copy (pre-step-4), with the case data swapped for tokens:
      `{ptFull} {pt} {cgFull} {cg} {drFull} {dr} {delDr} {alDr} {elDr} {clinic} {plan} {member} {vdate} {town} {n} {m}`.
      `t()` fills them from the current case (`ctx()`); "Dr./Dra." gets "del / de la", "al / a la", "el / la" in Spanish.
- [x] 2. Three paths (`S.path`) in `enterPlan()`: `gap` → 'request' (María), `doc` → 'review' (Roberto, "the notes came in the summary"),
      `ref` → 'schedule' (Carmen: main order = first non-follow-up order; schedule drawer offers simulated times with the specialist from the order's detail).
      Variant keys like `s.review.p.doc`, `s.schedule.t.ref`; `t()` uses `key.path` when it exists.
- [x] 3. Hoy track: visit + one node per order; main order shows its real status, others "Latch lo coordina", follow-ups "Más adelante".
      Columns via `--cols` (fixes the 5-column track for 3 or 4 steps). "Esperando" / "Lo próximo" built from the orders; empty cards are hidden.
- [x] 4. Plan: one step per order; the main order keeps its checklist (no notes / send / approval items on the `ref` path); others show detail + prep note from rules.json.
- [x] 5. Sidebar and Familia: names and initials from the case.

Review (local walkthrough of all three cases to "done", ES and EN; no unfilled `{token}` anywhere):

| Sample | Starts at | Hoy card | Track (cols) |
| --- | --- | --- | --- |
| A · María | request | Pedir las notas de la visita a Clínica Costa Norte | 5 · "3 de 5 en orden" |
| B · Roberto | review | Revisar la autorización de la MRI ("Las notas clínicas ya vinieron en el resumen…") | 3 · "Esperando" hidden |
| C · Carmen | schedule | Escoger la cita de endocrinología (times with el Dr. Jorge Medina) | 4 |

Known, unchanged: the MRI imaging centers are the simulated Carolina-area list for every case.

---

# Step 5 · Generated drafts

Goal (from CLAUDE.md): the model writes the clinic request and the packet summary from the extracted details, in Spanish or English.
Done when: each letter names the right doctor, date and procedure.

## Todo

- [x] 1. New server function `netlify/functions/draft.mjs` at `/api/draft`. Input: `{ kind: 'request' | 'packet', lang: 'es' | 'en', facts }`,
      where facts are only what the letter needs (patient, date of birth, doctor, clinic, visit date, plan + member ID, the main order's detail, what's missing, caregiver name).
- [x] 2. Same pattern as `/api/read`: Claude API with a forced tool (`write_draft` → `{ paragraphs[] }`), JSON validated.
      **Code check:** the letter must contain the doctor's surname, the visit's day number and the procedure (e.g. "MRI"). If not, retry once; then return an error.
- [x] 3. Page: when the plan opens on María's or Roberto's path, ask for the draft in the background (current language). Cache it per kind + language; switching language fetches the other one.
- [x] 4. Request panel ("Ver mensaje"): shows the generated letter. While it's being written: "Latch está escribiendo el borrador…". If it fails: today's template letter, so the demo never breaks. Your own edits still win.
- [x] 5. Packet panel: add a "Ver resumen" section (same look as "Ver mensaje") with the generated summary for the plan's reviewer.
- [x] 6. Spanish first, English keys next to each.
- [x] 7. Test live: A's request letter names Dr. Luis Rivera, 18 sep 2026 and the cardiac MRI; B's packet summary names Dr. Pedro Santiago Ruiz, 25 sep 2026 and the knee MRI; both in ES and EN. Commit "Step 5: generated drafts" and push.

Not in this step: Carmen's path needs no plan approval, so it has no letter to draft.

## Review

Done-check passed on the live site (real drafts, Oct 8):

| Draft | Language | Doctor | Date | Procedure |
| --- | --- | --- | --- | --- |
| A · clinic request | ES | Dr. Luis Rivera | 18 de septiembre de 2026 | Resonancia magnética (MRI) cardíaca con contraste, CPT 75561 |
| A · clinic request | EN | Dr. Luis Rivera | September 18, 2026 | cardiac MRI with contrast (CPT 75561) |
| A · packet summary | ES | Dr. Luis Rivera | 18 de septiembre de 2026 | MRI cardíaca, CPT 75561 (3 of 3 runs passed the check) |
| B · packet summary | ES | Dr. Pedro Santiago Ruiz | 25 de septiembre de 2026 | MRI de rodilla derecha, CPT 73721 |
| B · packet summary | EN | Dr. Pedro Santiago Ruiz | September 25, 2026 | MRI of the right knee, CPT 73721 |

What changed:
- `netlify/functions/draft.mjs` (`/api/draft`): forced tool call → paragraphs; a code check (language, doctor's surname, day + month, procedure) with one retry; on failure it returns `{ error: 'draft_check', missing: [...] }`.
- `index.html`: drafts start in the background right after reading (usually ready when the panel opens), cached per kind + language. The request panel shows the draft (your edits still win; template if it fails). The packet panel has a new "Ver resumen" section. A note says the draft was written by Latch.
- Bug found while testing: the notes' source was passed as an English phrase, so Spanish summaries sometimes copied it and failed the language check. Now it's a neutral code (`clinic` / `visit_summary`).

Notes: B's English summary keeps the procedure in Spanish, as the document wrote it.

---

# Step 5b · Appeal a denial in one tap (spec from the user)

- [x] 1. 'waitPlan' card: "Simular negación" (ghost) next to "Simular respuesta" → new 'denied' stage.
- [x] 2. 'denied' is an action stage: "El plan negó la {mainN}", the 8-in-10 line, "Revisar y enviar apelación". Hoy track: "Negada · Te toca".
- [x] 3. 'appeal' drawer: To {plan} · Apelaciones, what is appealed, documents included, and a letter from `/api/draft` with kind "appeal" ("Redactando…" while loading; editable; template fallback).
- [x] 4. Sending → 'waitAppeal' ("El plan está revisando la apelación", "suele contestar en 30 días o menos", "Simular respuesta") → approved → 'schedule'.
- [x] 5. History entries and English copy.

`ORDER` now: request → waitClinic → review → waitPlan → (denied → waitAppeal) → schedule → done. The appeal draft starts as soon as the denial is simulated.

---

# Step 6 · Demo hardening

Goal (from CLAUDE.md): loading states, friendly error, keep "Usar ejemplo" working offline with a saved result from a real run.
Done when: the full demo runs twice in a row without a hiccup.

## Problems found

1. **A failed upload silently shows María's plan.** If someone uploads Roberto's photo and the read fails, they get María's plan with no explanation. That's the step 4 stopgap.
2. **"Usar ejemplo" breaks offline.** It needs the network three times: the sample PDF, `/api/read`, and `data/rules.json`. Without the rules, the gap check is empty and María's plan comes out wrong.
3. **The file picker accepts files the server rejects** (`.heic`, `.doc`, `.docx`), and there's no size check before uploading.
4. **No time limit on reading.** A stuck request leaves "Leyendo el documento…" on screen forever.

## Todo

- [x] 1. Load `data/rules.json` once when the page opens and keep it outside the demo state, so it survives "Reiniciar" and dropped connections. If even that fails, use a copy built into the page.
- [x] 2. "Usar ejemplo" uses the saved result from a real run (`SAMPLE_X`) whenever the live read fails, times out or the device is offline. *(See decision below.)*
- [x] 3. Real uploads never fall back to María. Instead, the reading card shows a **friendly error** with the reason and two buttons: "Probar otro archivo" and "Usar ejemplo".
      Reasons (ES + EN): wrong file type, file too big, not a visit summary, couldn't read it, the AI service is unavailable / no internet.
- [x] 4. Check the file type and size in the page before uploading (PDF, JPG, PNG, WEBP, 4.5 MB max). The file picker only offers those types.
- [x] 5. Time limit on the read (45 s). When it's hit, show the friendly error (or use the saved result for "Usar ejemplo").
- [x] 6. Loading: the reading card keeps "Leyendo el documento…". After 10 s it adds "Puede tardar hasta un minuto." so a slow read doesn't look frozen.
- [x] 7. Test the done-check on the live site: the full demo twice in a row (María: request → deny → appeal → schedule → done; then "Reiniciar demo" and Roberto by upload), plus offline "Usar ejemplo" and each friendly error.
- [x] 8. Commit "Step 6: demo hardening" and push.

## Decision to confirm

**"Usar ejemplo": live or saved?**
- **A (recommended): live first, saved as backup.** It reads the sample PDF with Claude like a real upload (about 10–15 s), and uses the saved result if that fails, times out or there's no internet.
- **B: always the saved result.** Instant and never fails, but the sample button no longer shows Claude reading. Only real uploads would.

Chosen: **A** (live first, saved as backup).

## Review

Done-check passed on the live site (Oct 8): the full demo ran three times in a row with "Reiniciar demo" between runs, with no hiccups:

| Run | Case | Read | Flow | Letters | Total |
| --- | --- | --- | --- | --- | --- |
| 1 | María · "Usar ejemplo" | live, 15 s | request → notes → review → send → **deny** → appeal → approved → schedule → done | request, packet, appeal: all AI drafts (200) | 26 s |
| 2 | María · "Usar ejemplo" | live, 14 s | same as run 1 | all AI drafts | 23 s |
| 3 | Roberto · photo upload | live, 12 s | review → send → approved → schedule → done | packet: AI draft | 17 s |

Failure cases tested locally (server functions missing or mocked):
- Wrong type (.txt, .docx), file over 4.5 MB → friendly message before uploading.
- No connection, AI service down, not a visit summary, timeout → friendly message with "Probar otro archivo" / "Usar ejemplo".
- Slow read → "Puede tardar hasta un minuto." appears after 10 s.
- "Usar ejemplo" with the read failing → saved result + a note saying so; María's plan is correct (gap found).

What changed in `index.html`:
- `RULES` loaded once at page start; `RULES_BACKUP` built-in copy of `data/rules.json` for offline (keep the two in sync).
- `readDoc()` has a 45 s limit and returns `{ error }` instead of throwing; `checkFile()` checks type and size first; the picker only offers PDF/JPG/PNG/WEBP.
- `startExtract()`: real uploads show an error card on failure; only "Usar ejemplo" falls back to `SAMPLE_X`. A run counter ignores answers from a run that was reset.
- New copy (ES + EN): `ex.slow`, `ex.saved`, `er.*`.

Already covered from earlier steps: every letter falls back to its template (or hides "Ver resumen") if the AI fails, so the flow never blocks.


---

# Footer · rights and disclaimer

Goal: small footer with © line + disclaimer on the landing and `crear-cuenta.html`; only the © line inside the app.

What's already there:
- Landing already has a footer (`.lp-foot`, keys `ft.1` / `ft.2` in `L`), muted 12.5px, `.lp-wrap` padding.
- App already has `#xFoot` at the bottom of `.x-main` (keys `ft1` / `ft2` in `D`), below the view, so it never sits on the Hoy card.
- `crear-cuenta.html` is Spanish only, with no ES/EN switch.

Plan:
- [x] Landing: change `ft.1` / `ft.2` (ES + EN) to the new two lines. Keep the existing markup and "Sandbox" tag.
- [x] App: `#xFoot` shows only `ft1`, changed to the © line (ES + EN). Remove `ft2` from `D`.
- [x] `crear-cuenta.html`: add `<footer>` inside `.pg` using existing tokens (`--muted`, `--line`, 12.5px). Text in Spanish; a 3-line script swaps to English if `localStorage['latch-lang'] === 'en'` (the choice made in the app).
- [x] Check at 390px: no horizontal scroll on landing, app and crear-cuenta.
- [x] Commit "Add footer with rights and disclaimer" and push.

## Review

- `index.html`: landing keys `ft.1` / `ft.2` (ES + EN) now hold the © line and the disclaimer; markup and "Sandbox" tag unchanged. App `ft1` is the © line only; `ft2` removed and `#xFoot` renders one line.
- `crear-cuenta.html`: new `.foot` (existing `--muted` / `--line` tokens, 12.5px, inside `.pg` so it uses the page padding). Spanish by default; English if `latch-lang` is `en`.
- Checked at 390px: landing, app (upload and Hoy screens) and crear-cuenta have no horizontal scroll (scrollWidth 390). In the app the footer sits below the view and, scrolled to the end, above the mobile tab bar.
- Note: the app no longer shows the old "datos ficticios" footer; the "Demo: no subas récords reales" note on the upload screen stays.

---

# Motion · three key moments

- [x] "Falta algo" dot in the reading checklist: one soft pulse (scale 1 → 1.15 → 1, 600ms) as the row appears.
- [x] Hoy track: the current step's dot (main order, `li.cur`) breathes a halo in its own color at 25% (2s, ease-in-out, infinite). Rest frame equals today's static look; no step is `cur` once the flow is done.
- [x] "El plan negó la MRI" card: rises in once (8px → 0, opacity 0 → 1, 300ms). A one-shot `denyIn` flag adds `.x-in` only on the render right after the denial, so later re-renders don't replay it.
- [x] All three inside `@media (prefers-reduced-motion: no-preference)`.

## Review

CSS plus two tiny JS touches in `index.html`: the `cur` class on the main track step and the `denyIn` flag. No layout, copy, color or logic changes. Ran the full María flow at 390px (read → request → clinic → plan → denial → appeal → schedule → done): each animation fires as specified, scrollWidth stays 390 on Hoy, Plan and Familia.

---

# Motion · document reading and send confirmations

- [x] Scan sweep on the reading card while `/api/read` is in flight (`.x-scan` only while `S.reading`; stops on the render that follows the response, success or error).
- [x] Checklist reveal: 180ms stagger, no lead-in delay (was 500ms + 650ms per row); rows rise 6px/250ms, icons pop 0.6→1.1→1/300ms; "Falta algo" stays last and keeps its pulse. Last row lands ~0.8s after the response.
- [x] Sent confirmations (request, packet, appeal): circle scales 0.8→1 (200ms), then the check draws (400ms). Check is now an inline SVG path (`pathLength="1"`), same path, size and color as `#i-check`. One-shot `sentIn` so the 8s undo re-render doesn't replay it.
- [x] Paper plane on the drawer's send button takes off (+12px, −12px, fade, 300ms), then the confirmation appears.
- [x] All motion inside `@media (prefers-reduced-motion: no-preference)`; reduced motion shows all rows and confirmations instantly, no 300ms wait.

## Review

Local runs at 390px: María flow twice end to end, all three confirmations animated, scrollWidth 390 throughout. Error case (uploaded non-medical picture, local `/api` failing): scan stopped 7ms after the response, error card shown, no rows. Not changed: the API call itself, copy, layout, final states.

---

# Motion · appointment celebration

- [x] "Cita confirmada": circle 0.6 → 1.08 → 1 (350ms), check draws over 600ms.
- [x] Two rings after the check (#6D4AFF, then #E65BBE +120ms), scale 1 → 2.2, opacity .35 → 0, 700ms; pseudo-elements, absolutely positioned.
- [x] Burst: 10 dots (6–8px, #5B8CFF / #E65BBE / #6D4AFF) at 36° steps, 40–70px out from the circle edge, gone by 900ms; markup removed 2s after confirming. Not rendered with reduced motion.
- [ ] Stepper line fill to the MRI step: not done. At "done" no step between the visit and the MRI is marked done, so the line doesn't change; animating a fill would change the final look. Asked.
- [x] Confirmation animations now survive re-renders (e.g. a draft arriving): `sent = { k, at }` and a negative `--t` delay resume the animation; after 2s re-renders are static. Replaces the one-shot `sentIn`.

## Review

Two full María runs at 390px. Frame-by-frame (Web Animations API, paused and seeked, since the pane reported `hidden` and throttled live timing) matched the spec. Final state: scale 1, rings at 0, check drawn, burst out of the DOM, scrollWidth 390, dots stay >120px inside the drawer. The three "enviada" confirmations keep the regular check.

---

# Sprint 1 · Cuentas y casos reales (spec: `SPRINT-1.md`)

Override from the user: Supabase **email** OTP (6-digit code, no magic link) instead of phone OTP during development; auth code isolated so phone OTP can replace it later.

## Phase 1 · Database
- [x] `supabase/migrations/20261011000000_sprint1_schema.sql`: enums, 8 tables, indexes, RLS on every table, column-level grants, append-only `events`, profile-on-signup trigger, `team_members()` helper, private `documents` bucket (no client storage policies: signed URLs from the server only).
- [x] Access model: `active` member = full access; `pending` caregiver who created the patient = can read, upload, create cases and log events, but can't advance orders (nothing is "sent" without consent); `revoked` = nothing.
- [x] patients / care_team / consents: no client inserts (server functions in phase 2), so nobody can add themselves to someone else's patient.
- [x] `supabase/seed.mjs`: Santos (Ana → María, active by link), Díaz (Roberto, self), Vélez (Luis → Carmen, pending link). Fictional `@latch.test` emails. Uses the service_role key from the shell env only.
- [x] Validate the migration and the RLS rules locally against real Postgres (PGlite) with stubbed `auth`/`storage` schemas.
- [x] `SPRINT-1.md`: note the email OTP change.

## Phase 1 review
- Migration validated on PGlite (Postgres 16 in WASM) with stand-in `auth`/`storage` schemas and real `anon`/`authenticated` roles: 46/46 checks (María invisible to Roberto through every table and helper; pending can upload but not advance; revoke cuts access at once; events append-only even for the server; token_hash unreadable; anon gets nothing).
- Not yet applied to the real Supabase project; steps in `supabase/README.md`.

## Phase 2 · Auth + onboarding (after review)
## Phase 3 · Cases (after review)
## Phase 4 · Verification of the 10 acceptance criteria (after review)
