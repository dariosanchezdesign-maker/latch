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
- Server function that keeps the API key secret
- AI reading of the visit summary (PDF or photo) into structured data
- Rules check that finds what each order is missing
- Plan, statuses and Hoy card generated from the real document
- AI-drafted clinic requests in Spanish or English

See the commit history for the timeline.

## Working vs. simulated

| Working | Simulated (labeled on screen) |
| --- | --- |
| Reading the document, finding gaps, building the plan, drafting requests | Clinic reply, health-plan approval, appointment times |

## Stack

Plain HTML/CSS/JS, Netlify Functions, Claude API (Anthropic).
