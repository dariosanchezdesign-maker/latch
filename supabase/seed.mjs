// Latch · Sprint 1 · seed: three fictional families for testing (SPRINT-1.md §4).
// Run from the repo root with the service_role key in the shell environment, never in a file:
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node supabase/seed.mjs
// Safe to re-run: existing seed users and patients are reused, nothing is deleted.
// Logs only IDs and statuses, never names.
import { createHash, randomBytes } from 'node:crypto';

const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the shell first.'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function call(path, opts = {}) {
  const r = await fetch(URL + path, { ...opts, headers: { ...H, ...opts.headers } });
  const body = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${opts.method || 'GET'} ${path.split('?')[0]} → ${r.status} ${body?.code || body?.error_code || ''}`);
  return body;
}
const rest = (table, query = '') => call(`/rest/v1/${table}${query}`);
const insert = (table, row) => call(`/rest/v1/${table}`, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) }).then(r => r[0]);

// Seed users get fictional .test addresses (reserved, never deliverable). Sign in as them from tests with the admin API.
async function user(email, full_name, phone) {
  const list = await call('/auth/v1/admin/users?page=1&per_page=1000');
  const found = (list.users || []).find(u => u.email === email);
  if (found) return found.id;
  const u = await call('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, email_confirm: true, user_metadata: { full_name } }) });
  await call(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'PATCH', body: JSON.stringify({ full_name, phone }) });
  return u.id;
}

async function patient(createdBy, p) {
  const have = await rest('patients', `?created_by=eq.${createdBy}&member_id=eq.${encodeURIComponent(p.member_id)}&select=id`);
  if (have.length) return { id: have[0].id, isNew: false };
  return { id: (await insert('patients', { ...p, created_by: createdBy })).id, isNew: true };
}

const hash = t => createHash('sha256').update(t).digest('hex');
const days = n => new Date(Date.now() + n * 864e5).toISOString();

const FAMILIES = [
  { // Ana cares for her mother María; María already approved by link.
    key: 'santos',
    user: ['ana.santos@latch.test', 'Ana Santos', '(787) 555-0142'],
    patient: { full_name: 'María Santos Rivera', dob: '1954-03-14', town: 'Carolina', plan_name: 'Plan Salud Coquí', member_id: 'PSC-4471902' },
    team: { role: 'caregiver', relation: 'mamá', status: 'active' },
    consent: 'granted',
  },
  { // Roberto manages his own care.
    key: 'diaz',
    user: ['roberto.diaz@latch.test', 'Roberto Díaz Ortiz', '(787) 555-0187'],
    patient: { full_name: 'Roberto Díaz Ortiz', dob: '1959-06-07', town: 'Bayamón', plan_name: 'Salud Isla Advantage', member_id: 'SIA-30098812' },
    team: { role: 'self', relation: null, status: 'active' },
    consent: 'self',
  },
  { // Luis signed up for his partner Carmen; her approval is still pending.
    key: 'velez',
    user: ['luis.velez@latch.test', 'Luis Vélez', '(787) 555-0163'],
    patient: { full_name: 'Carmen Vélez Torres', dob: '1961-11-02', town: 'Las Piedras', plan_name: 'Plan Salud Coquí', member_id: 'PSC-5520318' },
    team: { role: 'caregiver', relation: 'pareja', status: 'pending' },
    consent: 'pending',
  },
];

for (const f of FAMILIES) {
  const uid = await user(...f.user);
  const p = await patient(uid, f.patient);
  if (!p.isNew) { console.log(`${f.key}: already seeded · user ${uid} · patient ${p.id}`); continue; }
  await insert('care_team', { patient_id: p.id, profile_id: uid, ...f.team });
  let link = '';
  if (f.consent === 'self') {
    await insert('consents', { patient_id: p.id, granted_to: uid, method: 'self', granted_at: new Date().toISOString() });
  } else {
    const token = randomBytes(32).toString('base64url');
    await insert('consents', { patient_id: p.id, granted_to: uid, method: 'link', token_hash: hash(token), expires_at: days(7),
                               granted_at: f.consent === 'granted' ? new Date().toISOString() : null });
    if (f.consent === 'pending') link = ` · approval link (shown once): /aprobar/${token}`;
  }
  console.log(`${f.key}: seeded · user ${uid} · patient ${p.id} · ${f.team.status}${link}`);
}
