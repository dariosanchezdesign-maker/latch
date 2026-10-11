-- Latch · Sprint 1 · accounts and real cases
-- Tables, enums, indexes, row level security, and the private documents bucket.
-- Spec: SPRINT-1.md §2. Fictional data only during this sprint.
--
-- Access model (used by every policy below):
--   active  member of a patient's care_team   → can read and act (advance orders, update the case).
--   pending caregiver who created the patient → can read, upload, create the case and log events,
--                                                but can't advance orders: nothing is "sent" until the patient approves.
--   revoked, or not on the care_team           → nothing.
-- patients, care_team and consents are written only by server code (Netlify Functions with the
-- service_role key, or SECURITY DEFINER functions), never directly by the browser.

begin;

-- ---------- Enums ----------
create type public.care_role      as enum ('self', 'caregiver');
create type public.care_status    as enum ('pending', 'active', 'revoked');
create type public.consent_method as enum ('self', 'link');
create type public.case_status    as enum ('active', 'done');
create type public.order_type     as enum ('mri', 'specialist_referral', 'lab_work', 'follow_up', 'other');
create type public.document_kind  as enum ('visit_summary', 'plan_card', 'clinical_notes', 'other');

-- ---------- Tables ----------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  phone       text,
  lang        text not null default 'es' check (lang in ('es', 'en')),
  created_at  timestamptz not null default now()
);

create table public.patients (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  dob         date,
  town        text,
  plan_name   text,
  member_id   text,
  created_by  uuid not null references public.profiles (id),
  created_at  timestamptz not null default now()
);

create table public.care_team (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.patients (id) on delete cascade,
  profile_id  uuid references public.profiles (id) on delete cascade,   -- null while an invite has no account yet
  role        public.care_role not null,
  relation    text check (relation in ('mamá', 'papá', 'pareja', 'otro')),
  status      public.care_status not null default 'pending',
  created_at  timestamptz not null default now(),
  unique (patient_id, profile_id)
);

create table public.consents (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.patients (id) on delete cascade,
  granted_to  uuid not null references public.profiles (id) on delete cascade,
  scope       text[] not null default array['request_records', 'submit_authorizations', 'manage_appointments']
              check (scope <@ array['request_records', 'submit_authorizations', 'manage_appointments']),
  method      public.consent_method not null,
  token_hash  text unique,              -- sha256 of the approval-link token; the token itself is never stored
  expires_at  timestamptz,
  granted_at  timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  check (method = 'self' or (token_hash is not null and expires_at is not null))
);

create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references public.patients (id) on delete cascade,
  case_id       uuid,                   -- FK added below (cases ↔ documents reference each other)
  kind          public.document_kind not null,
  storage_path  text not null unique,   -- object key in the private "documents" bucket
  mime_type     text,
  uploaded_by   uuid not null references public.profiles (id),
  extracted     jsonb,                  -- what /api/read returned
  created_at    timestamptz not null default now()
);

create table public.cases (
  id                  uuid primary key default gen_random_uuid(),
  patient_id          uuid not null references public.patients (id) on delete cascade,
  visit_date          date,
  doctor              text,
  clinic              text,
  source_document_id  uuid references public.documents (id) on delete set null,
  status              public.case_status not null default 'active',
  created_by          uuid not null references public.profiles (id),
  created_at          timestamptz not null default now()
);

alter table public.documents
  add constraint documents_case_id_fkey foreign key (case_id) references public.cases (id) on delete set null;

create table public.orders (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references public.cases (id) on delete cascade,
  type          public.order_type not null,
  detail        text,
  needs_auth    boolean not null default false,
  missing_docs  jsonb not null default '[]'::jsonb,
  stage         text not null default 'request',   -- same stages the app uses: request, waitClinic, review, waitPlan, denied, waitAppeal, schedule, done…
  created_at    timestamptz not null default now()
);

create table public.events (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.cases (id) on delete restrict,
  order_id    uuid references public.orders (id) on delete restrict,
  type        text not null,    -- case_created, request_approved, simulated_clinic_response, sent_to_plan, simulated_denial, appeal_approved, appointment_confirmed…
  payload     jsonb not null default '{}'::jsonb,
  actor       uuid references public.profiles (id) default auth.uid(),
  created_at  timestamptz not null default now()
);

-- ---------- Indexes ----------
create index care_team_profile_idx  on public.care_team (profile_id, status);
create index care_team_patient_idx  on public.care_team (patient_id);
create index consents_patient_idx   on public.consents (patient_id);
create index patients_created_idx   on public.patients (created_by);
create index cases_patient_idx      on public.cases (patient_id, status);
create index orders_case_idx        on public.orders (case_id);
create index documents_patient_idx  on public.documents (patient_id);
create index documents_case_idx     on public.documents (case_id);
create index events_case_idx        on public.events (case_id, created_at);

-- ---------- Access helpers ----------
-- SECURITY DEFINER so policies can check care_team without recursing through care_team's own RLS.
create function public.access_level(p_patient uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.care_team ct
                 where ct.patient_id = p_patient and ct.profile_id = auth.uid() and ct.status = 'active')
      then 'active'
    when exists (select 1 from public.care_team ct
                 join public.patients p on p.id = ct.patient_id
                 where ct.patient_id = p_patient and ct.profile_id = auth.uid()
                   and ct.status = 'pending' and ct.role = 'caregiver' and p.created_by = auth.uid())
      then 'pending'
  end
$$;

create function public.can_see(p_patient uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.access_level(p_patient) is not null
$$;

create function public.can_act(p_patient uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.access_level(p_patient) = 'active'
$$;

create function public.case_patient(p_case uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select patient_id from public.cases where id = p_case
$$;

-- Names on a patient's care team, for the Familia screen. Profiles stay private (no phone numbers leak).
create function public.team_members(p_patient uuid)
returns table (care_team_id uuid, profile_id uuid, full_name text, role public.care_role,
               relation text, status public.care_status, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select ct.id, ct.profile_id, pr.full_name, ct.role, ct.relation, ct.status, ct.created_at
  from public.care_team ct
  left join public.profiles pr on pr.id = ct.profile_id
  where ct.patient_id = p_patient and public.can_see(p_patient)
  order by ct.created_at
$$;

revoke all on function public.access_level(uuid), public.can_see(uuid), public.can_act(uuid),
                       public.case_patient(uuid), public.team_members(uuid) from public, anon;
grant execute on function public.access_level(uuid), public.can_see(uuid), public.can_act(uuid),
                          public.case_patient(uuid), public.team_members(uuid) to authenticated;

-- ---------- New user → profile ----------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.phone)
  on conflict (id) do nothing;
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- events: append only ----------
create function public.events_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'events are append-only';
end
$$;

create trigger events_append_only
  before update or delete on public.events
  for each row execute function public.events_append_only();

-- ---------- Row level security ----------
alter table public.profiles  enable row level security;
alter table public.patients  enable row level security;
alter table public.care_team enable row level security;
alter table public.consents  enable row level security;
alter table public.documents enable row level security;
alter table public.cases     enable row level security;
alter table public.orders    enable row level security;
alter table public.events    enable row level security;

-- Start from nothing, then grant only what each table needs. anon gets no table access at all.
revoke all on public.profiles, public.patients, public.care_team, public.consents,
              public.documents, public.cases, public.orders, public.events from anon, authenticated;

-- profiles: your own row only. Created by the trigger above.
grant select on public.profiles to authenticated;
grant update (full_name, phone, lang) on public.profiles to authenticated;
create policy "own profile: read"   on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile: update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- patients: read if on the care team; edit the details (manual plan card, etc.). Created by the server.
grant select on public.patients to authenticated;
grant update (full_name, dob, town, plan_name, member_id) on public.patients to authenticated;
create policy "care team: read patient"   on public.patients for select to authenticated using (public.can_see(id));
create policy "care team: update patient" on public.patients for update to authenticated using (public.can_see(id)) with check (public.can_see(id));

-- care_team: read your patients' teams. Invites, approvals and revocations go through the server.
grant select on public.care_team to authenticated;
create policy "care team: read team" on public.care_team for select to authenticated using (public.can_see(patient_id));

-- consents: readable by the care team, token_hash excluded. Created and revoked only by the server.
grant select (id, patient_id, granted_to, scope, method, expires_at, granted_at, revoked_at, created_at)
  on public.consents to authenticated;
create policy "care team: read consents" on public.consents for select to authenticated using (public.can_see(patient_id));

-- documents: read and add for your patients; link to a case and store the extraction.
grant select, insert on public.documents to authenticated;
grant update (case_id, extracted) on public.documents to authenticated;
create policy "care team: read documents" on public.documents for select to authenticated using (public.can_see(patient_id));
create policy "care team: add documents"  on public.documents for insert to authenticated
  with check (public.can_see(patient_id) and uploaded_by = auth.uid());
create policy "care team: update documents" on public.documents for update to authenticated
  using (public.can_see(patient_id)) with check (public.can_see(patient_id));

-- cases: read and create for your patients; only active members change them.
grant select, insert on public.cases to authenticated;
grant update (status) on public.cases to authenticated;
create policy "care team: read cases"   on public.cases for select to authenticated using (public.can_see(patient_id));
create policy "care team: create cases" on public.cases for insert to authenticated
  with check (public.can_see(patient_id) and created_by = auth.uid());
create policy "active member: update cases" on public.cases for update to authenticated
  using (public.can_act(patient_id)) with check (public.can_act(patient_id));

-- orders: read and create with the case; only active members advance the stage.
grant select, insert on public.orders to authenticated;
grant update (stage, missing_docs) on public.orders to authenticated;
create policy "care team: read orders"   on public.orders for select to authenticated using (public.can_see(public.case_patient(case_id)));
create policy "care team: create orders" on public.orders for insert to authenticated
  with check (public.can_see(public.case_patient(case_id)));
create policy "active member: advance orders" on public.orders for update to authenticated
  using (public.can_act(public.case_patient(case_id))) with check (public.can_act(public.case_patient(case_id)));

-- events: read and append for your patients, as yourself. No update or delete (also blocked by trigger).
grant select, insert on public.events to authenticated;
create policy "care team: read events"   on public.events for select to authenticated using (public.can_see(public.case_patient(case_id)));
create policy "care team: append events" on public.events for insert to authenticated
  with check (public.can_see(public.case_patient(case_id)) and actor = auth.uid());

-- ---------- Storage ----------
-- Private bucket. No policies on storage.objects for it: browsers can't list, read or write directly.
-- Uploads and downloads use short-lived signed URLs created by Netlify Functions after checking the care team.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false;

commit;
