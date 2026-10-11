# Latch · Sprint 1 — Cuentas y casos reales

**Meta:** que Latch recuerde. Una familia entra con su email (por ahora; ver nota abajo), registra a su paciente con su consentimiento, sube un resumen de visita, y el caso queda guardado y sigue avanzando aunque cierre la app.

> **Cambio (11 oct 2026):** durante el desarrollo el login es por **email + código de 6 dígitos** (OTP de Supabase, sin magic link), no por teléfono. La pantalla de entrada pide "Escribe tu email" en vez del número. El código de login vive aislado en un solo módulo para cambiar a teléfono (SMS/WhatsApp) sin tocar el resto. Todo lo demás de este documento sigue igual.

**Duración:** 1–2 semanas.
**Datos:** **solo ficticios** durante todo el sprint. Nada de datos reales de pacientes hasta que existan los acuerdos de privacidad (BAA) y las políticas de HIPAA.

---

## 1. Decisiones técnicas

| Pieza | Decisión | Por qué |
|---|---|---|
| Frontend | Mantener el app actual (HTML/CSS/JS) y su diseño | No reescribir lo que ya funciona. Se conecta a datos reales poco a poco. |
| Hosting | Netlify (igual que hoy) | Ya está configurado. |
| IA | Netlify Functions existentes (`/api/read`, apelación) | Ya funcionan. La llave sigue solo en el servidor. |
| Base de datos, login y archivos | **Supabase** (Postgres + Auth + Storage) | Login sin contraseña (email ahora, teléfono después), base de datos con reglas de acceso por fila (RLS) y archivos privados en un solo servicio. |
| Login | **Email + código de 6 dígitos (OTP)** de Supabase Auth durante desarrollo | Sin contraseñas. El trial de Twilio no está disponible en Puerto Rico, así que el login por teléfono queda para cuando haya proveedor de SMS. El código de login va aislado para cambiar a teléfono sin tocar el resto. |

**Antes de datos reales (no en este sprint):** confirmar qué plan de Supabase y qué proveedor de SMS/WhatsApp firman un BAA, y moverse a ese plan.

> Más adelante se puede migrar a Next.js si el app crece. No es necesario para este sprint.

---

## 2. Modelo de datos

Todas las tablas con `id uuid` (default `gen_random_uuid()`), `created_at timestamptz default now()`. RLS **activado en todas**.

**profiles** — una por usuario de Supabase Auth
- `id` (= `auth.users.id`), `full_name`, `phone`, `lang` (`es`|`en`, default `es`)

**patients** — la persona cuyo cuidado se maneja
- `full_name`, `dob` (date, opcional), `town`, `plan_name`, `member_id`, `created_by` (→ profiles)

**care_team** — quién puede ver/actuar sobre cada paciente
- `patient_id` (→ patients), `profile_id` (→ profiles, nullable mientras está pendiente)
- `role`: `self` | `caregiver`
- `relation`: `mamá` | `papá` | `pareja` | `otro` (texto)
- `status`: `pending` | `active` | `revoked`
- único por (`patient_id`, `profile_id`)

**consents** — el permiso del paciente, con evidencia
- `patient_id`, `granted_to` (→ profiles)
- `scope` (text[]): `request_records`, `submit_authorizations`, `manage_appointments`
- `method`: `self` (el paciente es el usuario) | `link` (aprobó por enlace)
- `token_hash` (para el enlace de aprobación; nunca guardar el token en claro), `expires_at`
- `granted_at`, `revoked_at`

**cases** — una visita médica que generó órdenes
- `patient_id`, `visit_date`, `doctor`, `clinic`, `source_document_id` (→ documents)
- `status`: `active` | `done`
- `created_by`

**orders** — cada orden del médico dentro del caso
- `case_id`, `type` (`mri`, `specialist_referral`, `lab_work`, `follow_up`, `other`), `detail`
- `needs_auth` (bool), `missing_docs` (jsonb), `stage` (text — los mismos estados que el app ya usa hoy: pedir notas, esperando clínica, revisar autorización, esperando plan, negada, apelación, aprobada, cita, etc.)

**documents** — archivos subidos
- `patient_id`, `case_id` (nullable), `kind` (`visit_summary`, `plan_card`, `clinical_notes`, `other`)
- `storage_path` (bucket **privado**), `mime_type`, `uploaded_by`, `extracted` (jsonb con lo que devolvió `/api/read`)

**events** — historial y auditoría (solo se agrega, nunca se edita)
- `case_id`, `order_id` (nullable), `type` (ej. `case_created`, `request_approved`, `simulated_clinic_response`, `sent_to_plan`, `simulated_denial`, `appeal_approved`, `appointment_confirmed`), `payload` (jsonb), `actor` (→ profiles)

### Reglas de acceso (RLS)
- Un usuario ve/edita `patients`, `cases`, `orders`, `documents`, `events` **solo** si es miembro `active` del `care_team` de ese paciente.
- `profiles`: cada usuario ve y edita solo el suyo (y los nombres de su care_team).
- `consents`: visibles para el care_team del paciente; solo se crean/revocan por funciones del servidor.
- `events`: insert permitido al care_team; **update y delete prohibidos**.
- Storage: bucket `documents` privado; acceso solo con URLs firmadas de corta duración, verificando care_team en el servidor.

---

## 3. Flujos y pantallas

**A. Entrar** — email → código de 6 dígitos → si es nuevo, nombre (y teléfono opcional, para el futuro login por SMS/WhatsApp).
**B. ¿Para quién es?**
- *Para mí:* crea `patients` + `care_team(role=self, active)` + `consents(method=self)`. Sigue a la tarjeta del plan.
- *Para un familiar:* nombre, relación → crea `patients` + `care_team(caregiver, pending)`.
**C. Tarjeta del plan** — en este sprint: entrada manual (plan, número de socio). (La lectura por foto viene después.)
**D. Permiso del paciente** (solo "para un familiar")
- Se genera un enlace de aprobación con token (expira en 7 días).
- En este sprint el envío es **simulado y marcado**: se muestra el enlace para copiar ("En la versión real, esto llega por WhatsApp").
- Página pública `/aprobar/:token`: muestra quién pide permiso y qué podrá hacer y qué no (como en la maqueta). "Sí, autorizar" → `consents` + `care_team.status=active`. "No, gracias" → `revoked`.
- Mientras está pendiente, el familiar puede **seguir** y subir el resumen, pero no se "envía" nada hasta que haya permiso.
**E. Inicio** — lista de pacientes del usuario y sus casos activos; botón "Subir resumen de visita".
**F. Subir resumen** — sube a Storage (`documents`), llama a `/api/read`, crea `cases` + `orders` con el resultado, registra `events(case_created)`.
**G. Caso** — las pantallas actuales (Hoy / Plan / Familia) leen y escriben en la base de datos. Cada acción (aprobar, simular respuesta, enviar, simular negación, aprobar apelación, escoger cita) actualiza `orders.stage` y agrega un `event`. Al recargar, todo sigue donde estaba.
**H. Familia** — lista real del care_team, estado del permiso, revocar acceso.

Todo en español e inglés, como hoy. Lo simulado sigue marcado en pantalla.

---

## 4. Seguridad básica (desde ya)
- Nunca registrar en logs nombres, documentos ni contenido extraído; solo IDs y códigos de estado.
- La `service_role` key de Supabase solo en Netlify Functions, nunca en el navegador.
- Variables en Netlify: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`.
- Banner fijo "Datos ficticios · ambiente de prueba" en todo el app durante este sprint.
- Script `seed` con 2–3 familias ficticias (María Santos, Roberto Díaz, Carmen Vélez) para probar.

---

## 5. Criterios de aceptación
1. Un usuario nuevo entra con su email y un código de 6 dígitos, sin contraseña.
2. "Para mí" y "Para un familiar" crean los registros correctos; el familiar queda `pending` hasta que el paciente apruebe.
3. El enlace de aprobación funciona una sola vez, expira, y aprobar/rechazar cambia el estado.
4. Subir el resumen de María crea un caso con sus órdenes y la falta de notas clínicas, igual que el demo.
5. Avanzar el caso de María hasta "Cita confirmada", **recargar la página**, y todo sigue en el mismo estado.
6. Un segundo usuario (otra familia) **no puede ver** el caso de María, ni por la interfaz ni consultando la API directamente (probar RLS).
7. Revocar a un familiar le quita el acceso de inmediato.
8. Los archivos subidos no son accesibles sin URL firmada.
9. Todo funciona a 390px sin scroll horizontal; ES/EN completos.
10. `events` registra cada acción con su actor y hora.

## 6. Fuera de este sprint
WhatsApp real · envío real a clínicas/planes · tabla editable de reglas · lectura de tarjeta por foto · bóveda de documentos reutilizable · panel para navegador humano · datos reales.
