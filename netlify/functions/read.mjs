// POST /api/read  { name, type, data(base64) }  →  { ok: true, extracted } | { error }
const TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 4.5 * 1024 * 1024;

const PROMPT = `You are reading a patient's visit summary (Puerto Rico, usually Spanish).
Call record_visit_summary with what the document says.
Rules:
- Record only what is written in the document. Never guess or invent. If something is not stated, leave it out.
- isVisitSummary is false if this is not a medical visit summary.
- Dates as YYYY-MM-DD.
- visit.doctor includes the title as written (Dr. / Dra.).
- patient.sex only if the document states it (F or M).
- orders: one entry per thing the doctor ordered. type is mri, specialist_referral, lab_work, follow_up, or other. detail is a short description in the document's language.
- docsPresent lists only documents actually included in this file:
  order (a signed order/requisition), clinical_notes, plan_card (the insurance card or its details), referral, lab_order.
  Count clinical_notes ONLY if the notes themselves are included. If the document says notes are pending, will be sent later or are in the clinic's record, do NOT count them.
- clinicalNotesDate: the date of the included clinical notes, only if they are included.`;

const TOOL = {
  name: 'record_visit_summary',
  description: 'Record the details found in the visit summary.',
  input_schema: {
    type: 'object',
    properties: {
      isVisitSummary: { type: 'boolean' },
      patient: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          dob: { type: 'string', description: 'YYYY-MM-DD' },
          town: { type: 'string' },
          sex: { type: 'string', enum: ['F', 'M'], description: 'Only if stated' }
        }
      },
      visit: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD' },
          doctor: { type: 'string', description: 'With title, e.g. Dr. Luis Rivera' },
          clinic: { type: 'string' }
        }
      },
      plan: {
        type: 'object',
        properties: { name: { type: 'string' }, memberId: { type: 'string' } }
      },
      orders: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['mri', 'specialist_referral', 'lab_work', 'follow_up', 'other'] },
            detail: { type: 'string' }
          },
          required: ['type', 'detail']
        }
      },
      docsPresent: {
        type: 'array',
        items: { type: 'string', enum: ['order', 'clinical_notes', 'plan_card', 'referral', 'lab_order'] }
      },
      clinicalNotesDate: { type: 'string', description: 'YYYY-MM-DD, only if notes are included' }
    },
    required: ['isVisitSummary', 'patient', 'visit', 'plan', 'orders', 'docsPresent']
  }
};

const fail = (error, status) => Response.json({ error }, { status });

async function askClaude(key, type, data) {
  const file = type === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: type, data } }
    : { type: 'image', source: { type: 'base64', media_type: type, data } };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: Netlify.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-5',
      max_tokens: 4096,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content: [file, { type: 'text', text: PROMPT }] }]
    })
  });
  if (!res.ok) {
    console.log('Claude API status', res.status);
    return { status: res.status };
  }
  const msg = await res.json();
  const call = (msg.content || []).find(b => b.type === 'tool_use' && b.name === TOOL.name);
  return { input: call && call.input };
}

const complete = x => x && x.isVisitSummary === false
  || (x && x.patient?.name && x.visit?.doctor && Array.isArray(x.orders) && x.orders.length > 0);

export default async (req) => {
  if (req.method !== 'POST') return fail('method', 405);
  const key = Netlify.env.get('ANTHROPIC_API_KEY');
  if (!key) return fail('no_key', 500);

  let body;
  try { body = await req.json(); } catch { return fail('unreadable', 400); }
  const { type, data } = body || {};
  if (!TYPES.includes(type)) return fail('file_type', 415);
  if (typeof data !== 'string' || !data) return fail('unreadable', 400);
  const bytes = Math.floor(data.length * 3 / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
  if (bytes > MAX_BYTES) return fail('file_size', 413);

  let extracted;
  for (let attempt = 0; attempt < 2; attempt++) {
    let r;
    try { r = await askClaude(key, type, data); } catch (e) { console.log('Claude API fetch failed', e.name); return fail('ai_unavailable', 502); }
    if (r.status) return fail(r.status === 400 ? 'unreadable' : 'ai_unavailable', r.status === 400 ? 422 : 502);
    extracted = r.input;
    if (complete(extracted)) break;
  }
  if (extracted && extracted.isVisitSummary === false) return fail('not_summary', 422);
  if (!complete(extracted)) return fail('unreadable', 422);
  return Response.json({ ok: true, extracted });
};

export const config = { path: '/api/read' };
