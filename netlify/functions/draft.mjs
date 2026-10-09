// POST /api/draft  { kind: 'request' | 'packet', lang: 'es' | 'en', facts }  →  { ok: true, paragraphs } | { error }
// request: letter to the clinic's records team asking for the visit's clinical notes.
// packet:  short summary for the health plan's prior-authorization reviewer.
const KINDS = ['request', 'packet'];
const LANGS = ['es', 'en'];
const FIELDS = ['patient', 'dob', 'doctor', 'clinic', 'visitDate', 'plan', 'memberId', 'orderType', 'procedure', 'notesDate', 'notesSource', 'caregiver', 'relation'];
const MONTHS = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
};
const PROC = { mri: /MRI|resonancia/i };

const TASK = {
  request: {
    es: 'Escribe la carta del cuidador al equipo de récords médicos de la clínica pidiendo las notas clínicas firmadas de la visita. El plan médico las necesita para la preautorización del procedimiento. Menciona que se adjunta la autorización firmada del paciente para compartir sus récords.',
    en: 'Write the caregiver’s letter to the clinic’s medical records team asking for the signed clinical notes from the visit. The health plan needs them for the procedure’s prior authorization. Mention that the patient’s signed authorization to share their records is attached.'
  },
  packet: {
    es: 'Escribe un resumen corto para la persona del plan médico que revisa la preautorización: quién es el paciente y su número de miembro, qué procedimiento ordenó el médico (con el código CPT si aparece), cuándo fue la visita, y qué documentos se incluyen (la orden, las notas clínicas y la información del plan). Pide que revisen la preautorización.',
    en: 'Write a short summary for the health plan’s prior-authorization reviewer: who the patient is and their member ID, which procedure the doctor ordered (with the CPT code if given), when the visit was, and which documents are included (the order, the clinical notes and the plan information). Ask them to review the prior authorization.'
  }
};

const RULES = {
  es: `Reglas:
- Escribe en español, en un tono amable y claro.
- Usa solo los datos que se dan. No inventes teléfonos, direcciones, fechas, diagnósticos ni números.
- Nombra al médico tal como aparece (con Dr./Dra.), la fecha de la visita escrita con el mes en palabras, y el procedimiento.
- No des consejos médicos.
- 3 a 5 párrafos cortos. El primero es el saludo y el último la despedida con el nombre del cuidador y su relación con el paciente.
Llama a write_draft con los párrafos.`,
  en: `Rules:
- Write in English, in a kind, clear tone.
- Use only the facts given. Don’t invent phone numbers, addresses, dates, diagnoses or numbers.
- Name the doctor as written (with Dr./Dra.), the visit date with the month spelled out, and the procedure.
- Don’t give medical advice.
- 3 to 5 short paragraphs. The first is the greeting and the last is the sign-off with the caregiver’s name and relationship to the patient.
Call write_draft with the paragraphs.`
};

const TOOL = {
  name: 'write_draft',
  description: 'Return the draft as paragraphs.',
  input_schema: {
    type: 'object',
    properties: { paragraphs: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 8 } },
    required: ['paragraphs']
  }
};

const fail = (error, status) => Response.json({ error }, { status });

// First surname: "Dr. Luis Rivera" → "Rivera"; "Dra. Ana Colón Rosa" → "Colón".
const drSurname = d => { const w = String(d).split(/\s+/).filter(Boolean).slice(1); return w.length >= 3 ? w[w.length - 2] : w[w.length - 1] || ''; };

// The letter must be in the asked language and name the doctor, the visit date (day + month) and the procedure.
const LANG_OK = { es: s => /\bde\b/i.test(s) && !/\bthe\b/i.test(s), en: s => /\bthe\b/i.test(s) };
// Returns the names of the checks that failed (empty = good).
function missingFacts(text, facts, lang) {
  const [, m, d] = String(facts.visitDate).split('-').map(Number);
  const month = MONTHS[lang][m - 1] || '';
  const proc = PROC[facts.orderType];
  const checks = {
    language: LANG_OK[lang](text),
    doctor: text.includes(drSurname(facts.doctor)),
    date: new RegExp(`(^|\\D)${d}(\\D|$)`).test(text) && text.toLowerCase().includes(month.toLowerCase().slice(0, 3)),
    procedure: !proc || proc.test(text)
  };
  return Object.keys(checks).filter(k => !checks[k]);
}

async function askClaude(key, kind, lang, facts) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: Netlify.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-5',
      max_tokens: 2048,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content: `${TASK[kind][lang]}\n\n${RULES[lang]}\n\nFacts (JSON):\n${JSON.stringify(facts, null, 2)}` }]
    })
  });
  if (!res.ok) { console.log('Claude API status', res.status); return { status: res.status }; }
  const msg = await res.json();
  const call = (msg.content || []).find(b => b.type === 'tool_use' && b.name === TOOL.name);
  const p = call && call.input && call.input.paragraphs;
  return { paragraphs: Array.isArray(p) && p.every(x => typeof x === 'string' && x.trim()) ? p.map(x => x.trim()) : null };
}

export default async (req) => {
  if (req.method !== 'POST') return fail('method', 405);
  const key = Netlify.env.get('ANTHROPIC_API_KEY');
  if (!key) return fail('no_key', 500);

  let body;
  try { body = await req.json(); } catch { return fail('bad_request', 400); }
  const { kind, lang, facts: raw } = body || {};
  if (!KINDS.includes(kind) || !LANGS.includes(lang) || !raw || typeof raw !== 'object') return fail('bad_request', 400);
  const facts = {};
  for (const f of FIELDS) if (raw[f] != null) facts[f] = String(raw[f]).slice(0, 400);
  if (!facts.patient || !facts.doctor || !/^\d{4}-\d{2}-\d{2}$/.test(facts.visitDate || '') || !facts.procedure) return fail('bad_request', 400);

  let missing = ['paragraphs'];
  for (let attempt = 0; attempt < 2; attempt++) {
    let r;
    try { r = await askClaude(key, kind, lang, facts); } catch (e) { console.log('Claude API fetch failed', e.name); return fail('ai_unavailable', 502); }
    if (r.status) return fail('ai_unavailable', 502);
    missing = r.paragraphs ? missingFacts(r.paragraphs.join('\n'), facts, lang) : ['paragraphs'];
    if (!missing.length) return Response.json({ ok: true, paragraphs: r.paragraphs });
    console.log('draft check failed, attempt', attempt + 1, missing.join(','));
  }
  return Response.json({ error: 'draft_check', missing }, { status: 422 });
};

export const config = { path: '/api/draft' };
