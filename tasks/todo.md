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

- [ ] 1. Keep the extracted data (`S.x`) and build the list of steps with their statuses (`S.steps`).
- [ ] 2. Reading card: lines 1–4 (doctor and date, orders found, health plan, what needs approval) come from the data.
- [ ] 3. Hoy screen: the greeting, title ("El plan de Roberto"), subtitle (doctor + date), the main card, the step track and the Waiting / Next columns come from the steps.
- [ ] 4. Main-card text (ask the clinic → wait → review → wait for the plan → pick a date) uses the real clinic, plan, procedure and patient name.
- [ ] 5. Plan screen: one expandable item per step. The approval step keeps its checklist; its documents come from `docsPresent`.
- [ ] 6. Pop-up panels (request to clinic, packet to plan, pick a date) use the real names. The letter stays a simple template for now (step 5 has the model write it).
- [ ] 7. Header and Familia: patient name, town and doctor come from the data.
- [ ] 8. Upload screen note becomes "Demo: no subas récords reales" (a hard rule in CLAUDE.md; the current note says every file is treated as María's).
- [ ] 9. Spanish first, with English keys added next to each.
- [ ] 10. Test on the live site: A, B and C each give a different plan. Commit "Step 4: plan from data" and push.

## Stays simulated (labeled as today)

Clinic reply, plan approval number, appointment times (the "Simular respuesta" button).

## Decisions to confirm

1. **Caregiver name.** The app greets "Hola, Ana" (María's daughter). The documents don't name a caregiver.
   Proposal: greet with just "Hola" and show "Tú · cuidador(a)" in the header.
2. **If reading fails.** Proposal: for now, fall back to María's sample data so the demo still runs. The friendly error comes in step 6.

## Review

(filled in at the end)
