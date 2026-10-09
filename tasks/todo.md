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
