const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

function requireSupabaseEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      `SUPABASE_ENV_MISSING:url=${SUPABASE_URL ? 'yes' : 'no'},key=${SUPABASE_SERVICE_ROLE_KEY ? 'yes' : 'no'}`
    );
  }
}

type Primitive = string | number | boolean | null;

function buildQuery(params?: Record<string, Primitive | Primitive[] | undefined>) {
  const search = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      search.set(key, `in.(${value.map((item) => String(item)).join(',')})`);
      return;
    }

    search.set(key, String(value));
  });

  const query = search.toString();
  return query ? `?${query}` : '';
}

async function supabaseFetch<T>(path: string, init?: RequestInit): Promise<T> {
  requireSupabaseEnv();

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY!}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SUPABASE_${response.status}:${text}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function selectRows<T>(
  table: string,
  options?: {
    select?: string;
    filters?: Record<string, Primitive | Primitive[] | undefined>;
    order?: string;
    limit?: number;
  }
): Promise<T[]> {
  const query = buildQuery({
    select: options?.select || '*',
    ...options?.filters,
    order: options?.order,
    limit: options?.limit,
  });

  return supabaseFetch<T[]>(`${table}${query}`, { method: 'GET' });
}

export async function selectSingle<T>(
  table: string,
  options?: {
    select?: string;
    filters?: Record<string, Primitive | Primitive[] | undefined>;
    order?: string;
  }
): Promise<T | null> {
  const rows = await selectRows<T>(table, { ...options, limit: 1 });
  return rows[0] ?? null;
}

export async function insertRows<T>(table: string, rows: unknown, onConflict?: string): Promise<T[]> {
  const query = onConflict ? buildQuery({ on_conflict: onConflict }) : '';
  return supabaseFetch<T[]>(`${table}${query}`, {
    method: 'POST',
    headers: onConflict
      ? {
          Prefer: 'resolution=merge-duplicates,return=representation',
        }
      : undefined,
    body: JSON.stringify(rows),
  });
}

export async function updateRows<T>(
  table: string,
  values: unknown,
  filters: Record<string, Primitive | Primitive[] | undefined>
): Promise<T[]> {
  const query = buildQuery(filters);
  return supabaseFetch<T[]>(`${table}${query}`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  });
}

export async function deleteRows<T>(
  table: string,
  filters: Record<string, Primitive | Primitive[] | undefined>
): Promise<T[]> {
  const query = buildQuery(filters);
  return supabaseFetch<T[]>(`${table}${query}`, {
    method: 'DELETE',
  });
}
