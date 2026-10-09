# Latch

**El plan médico, sin el caos.** Latch guides Puerto Rico patients and the family members who care for them through health-plan prior authorizations: it reads a visit summary, finds what's missing for approval, drafts the requests and follows up, one thing at a time.

Built for the Caribbean AI Summit Hackathon (Oct 8–10, 2026). Solo entry by Darío Sánchez.

## Try it

- Live demo: https://latch-care-demo.netlify.app
- Click **Usar ejemplo** to load a sample visit summary, or upload one of the files in `samples/`.
- All patients, doctors, clinics and plans are fictional. Don't upload real medical records.

## What was built when

**Prepared before the event (design and inputs, credited per the rules)**
- UI and visual design: landing page, Hoy · Plan · Familia screens, sign-up mockup (`crear-cuenta.html`)
- Branding: name, logo, colors, fonts (Magnetik, Host Grotesk, Azeret Mono)
- Fictional test data: `samples/`, `expected/`, and a draft `data/rules.json`
- Pitch deck

**Built during the hackathon (core functionality)**
- Server functions that keep the API key secret (`/api/read`, `/api/draft`)
- AI reading of the visit summary (PDF or photo) into structured data, checked against the answer key in `expected/`
- Rules check, in code, that finds what each order is missing (`data/rules.json`)
- Plan, statuses and Hoy card generated from the real document, with three paths: something missing (ask the clinic), nothing missing (send to the plan), nothing needs approval (book the specialist)
- AI-drafted letters in Spanish or English: the request to the clinic, the summary for the plan's reviewer, and an appeal if the plan denies. Code checks that each letter names the right doctor, date and procedure, with a template as fallback.
- Appeal a denial in one tap
- Demo hardening: friendly errors, file checks, a 45-second limit on reading, and **Usar ejemplo** falls back to a saved result from a real read when offline

See the commit history for the timeline, and `tasks/todo.md` for each step's plan and test results.

## Working vs. simulated

| Working | Simulated (labeled on screen) |
| --- | --- |
| Reading the document, finding gaps, building the plan, drafting the clinic request, plan summary and appeal | Clinic reply, health-plan approval or denial ("Simular respuesta" / "Simular negación"), approval number, appointment times and centers |

## Stack

Plain HTML/CSS/JS, Netlify Functions, Claude API (Anthropic).

## Setup notes

- Netlify environment variables: `ANTHROPIC_API_KEY` (required, secret) and `ANTHROPIC_MODEL` (optional, defaults to `claude-sonnet-4-5`). The functions force a tool call to get strict JSON, so keep a model that supports forced `tool_choice`.
- `index.html` has a built-in copy of `data/rules.json` for offline use (`RULES_BACKUP`). If you edit the rules, update both.
