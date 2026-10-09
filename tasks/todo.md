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
