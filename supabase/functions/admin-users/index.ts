// KNF Field Data: "People" admin for the PI. Creates logins and changes roles, passwords and access.
// Runs on Supabase (Edge Function "admin-users"); the service key never leaves the server.
// Only a signed-in account whose profile role is "PI / Co-PI" may call it.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ROLES = ['PI / Co-PI', 'Project staff', 'Field director / crew chief', 'Student', 'USFS staff', 'Volunteer', 'Lab staff', 'Other'];
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// the project's secret key (new-style SUPABASE_SECRET_KEYS, or the legacy service-role key)
function serverKey(): string {
  try { const k = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'); const v = k.default || Object.values(k)[0]; if (v) return String(v); } catch (_) { /* fall through */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, serverKey(), { auth: { persistSession: false } });
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: who, error: whoErr } = await admin.auth.getUser(jwt);
    if (whoErr || !who?.user) return reply({ error: 'Not signed in' }, 401);
    const { data: me } = await admin.from('profiles').select('role, disabled').eq('id', who.user.id).single();
    if (!me || me.disabled || me.role !== 'PI / Co-PI') return reply({ error: 'Only the PI / Co-PI can manage people' }, 403);

    const b = await req.json();
    if (b.role && !ROLES.includes(b.role)) return reply({ error: 'Unknown role' }, 400);

    if (b.action === 'create') {
      const email = String(b.email || '').trim().toLowerCase(), name = String(b.name || '').trim();
      if (!/^\S+@\S+\.\S+$/.test(email) || !name || String(b.password || '').length < 8) return reply({ error: 'Email, name and a password of 8+ characters are needed' }, 400);
      const { data, error } = await admin.auth.admin.createUser({ email, password: b.password, email_confirm: true, user_metadata: { name, role: b.role || 'Volunteer' } });
      if (error) return reply({ error: error.message }, 400);
      await admin.from('profiles').upsert({ id: data.user.id, email, name, role: b.role || 'Volunteer', disabled: false });
      return reply({ ok: true, id: data.user.id });
    }
    if (b.action === 'set_role') {
      if (b.id === who.user.id && b.role !== 'PI / Co-PI') return reply({ error: 'You cannot remove your own PI role' }, 400);
      const { error } = await admin.from('profiles').update({ role: b.role }).eq('id', b.id);
      return error ? reply({ error: error.message }, 400) : reply({ ok: true });
    }
    if (b.action === 'set_name') {
      const { error } = await admin.from('profiles').update({ name: String(b.name || '').trim() }).eq('id', b.id);
      return error ? reply({ error: error.message }, 400) : reply({ ok: true });
    }
    if (b.action === 'reset_password') {
      if (String(b.password || '').length < 8) return reply({ error: 'Password must be 8+ characters' }, 400);
      const { error } = await admin.auth.admin.updateUserById(b.id, { password: b.password });
      return error ? reply({ error: error.message }, 400) : reply({ ok: true });
    }
    if (b.action === 'disable' || b.action === 'enable') {
      if (b.id === who.user.id) return reply({ error: 'You cannot disable your own account' }, 400);
      const off = b.action === 'disable';
      const { error } = await admin.auth.admin.updateUserById(b.id, { ban_duration: off ? '876000h' : 'none' });
      if (error) return reply({ error: error.message }, 400);
      await admin.from('profiles').update({ disabled: off }).eq('id', b.id);
      return reply({ ok: true });
    }
    return reply({ error: 'Unknown action' }, 400);
  } catch (e) {
    return reply({ error: String((e as Error)?.message || e) }, 500);
  }
});
