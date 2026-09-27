export function supabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

export async function supabaseAuth(pathname, body) {
  if (!supabaseConfigured()) throw new Error("Supabase is not configured.");
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/${pathname}`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.msg || data.error_description || data.message || `Supabase auth failed with ${response.status}`);
  return data;
}

export async function supabaseAdminCreateUser(body) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase service role is not configured.");
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.msg || data.error_description || data.message || `Supabase admin signup failed with ${response.status}`);
  return data;
}

export async function supabaseRest(table, { method = "GET", body, query = "", prefer = "" } = {}) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase service role is not configured.");
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      ...(prefer ? { prefer } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || data?.hint || `Supabase REST failed with ${response.status}`);
  return data;
}

export async function loadWorkspace(email) {
  const rows = await supabaseRest("studio_workspaces", {
    query: `?user_email=eq.${encodeURIComponent(email)}&select=data&limit=1`
  });
  return rows?.[0]?.data || null;
}

export async function saveWorkspace(email, data) {
  await supabaseRest("studio_workspaces", {
    method: "POST",
    body: { user_email: email, data, updated_at: new Date().toISOString() },
    prefer: "resolution=merge-duplicates"
  });
}

export async function mirrorCharacterToSupabase(character) {
  try {
    await supabaseRest("studio_characters", {
      method: "POST",
      body: {
        id: character.id,
        name: character.name,
        identity: character.identity || {},
        preferences: character.preferences || {},
        updated_at: new Date().toISOString()
      },
      prefer: "resolution=merge-duplicates"
    });
    return { mirrored: true };
  } catch (error) {
    return { mirrored: false, error: error.message };
  }
}
