// Data access. Uses Neon Postgres when DATABASE_URL (or POSTGRES_URL) is set, otherwise an in-memory store (local testing only).
import { neon } from '@neondatabase/serverless';

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const sql = DB_URL ? neon(DB_URL) : null;
const mem = { settings: { max: '20' }, photos: new Map(), voters: new Map() };

export async function getSettings() {
  if (!sql) return { ...mem.settings };
  const rows = await sql`select k, v from settings`;
  return Object.fromEntries(rows.map(r => [r.k, r.v]));
}

export async function setSetting(k, v) {
  if (!sql) { mem.settings[k] = String(v); return; }
  await sql`insert into settings (k, v) values (${k}, ${String(v)}) on conflict (k) do update set v = excluded.v`;
}

export async function listPhotos() {
  if (!sql) return [...mem.photos.values()];
  return await sql`select name, url, w, h from photos order by name`;
}

export async function getPhoto(name) {
  if (!sql) return mem.photos.get(name) || null;
  const rows = await sql`select name, url from photos where name = ${name}`;
  return rows[0] || null;
}

export async function upsertPhoto(p) {
  if (!sql) { mem.photos.set(p.name, p); return; }
  await sql`insert into photos (name, url, w, h) values (${p.name}, ${p.url}, ${p.w}, ${p.h})
            on conflict (name) do update set url = excluded.url, w = excluded.w, h = excluded.h, created_at = now()`;
}

// names = null deletes every photo. Returns the removed blob URLs.
export async function deletePhotos(names) {
  if (!sql) {
    const out = [];
    for (const [k, v] of mem.photos) if (!names || names.includes(k)) { out.push(v.url); mem.photos.delete(k); }
    return out;
  }
  const rows = names
    ? await sql`delete from photos where name = any(${names}) returning url`
    : await sql`delete from photos returning url`;
  return rows.map(r => r.url);
}

export async function getVoter(name) {
  if (!sql) return mem.voters.get(name) || null;
  const rows = await sql`select state, picks from voters where name = ${name}`;
  return rows[0] || null;
}

export async function saveVoter(name, state, picks) {
  if (!sql) { mem.voters.set(name, { name, state, picks, updated_at: new Date().toISOString() }); return; }
  await sql`insert into voters (name, state, picks, updated_at) values (${name}, ${JSON.stringify(state)}::jsonb, ${picks}, now())
            on conflict (name) do update set state = excluded.state, picks = excluded.picks, updated_at = now()`;
}

export async function listVoters() {
  if (!sql) {
    return [...mem.voters.values()].map(v => ({ name: v.name, picks: v.picks, seen: Object.keys(v.state?.s1 || {}).length, updated_at: v.updated_at }));
  }
  return await sql`select name, picks,
      (select count(*) from jsonb_object_keys(case when jsonb_typeof(state->'s1') = 'object' then state->'s1' else '{}'::jsonb end))::int as seen,
      updated_at
    from voters order by updated_at desc`;
}

export async function resetVotes() {
  if (!sql) { mem.voters.clear(); return; }
  await sql`delete from voters`;
}
