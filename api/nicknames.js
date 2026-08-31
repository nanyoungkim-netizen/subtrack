import { neon } from '@neondatabase/serverless';
import { getAuth } from '../lib/secure.js';

// 닉네임 매핑표(KO_MAP)를 Neon DB에 영속 저장한다.
// app_settings(key,val) 키-값 테이블에 key='ko_map' 한 행으로 전체 맵을 JSON 문자열로 보관.
// 테이블 보장은 인스턴스당 1회만 (매 요청 CREATE TABLE 왕복 제거)
let tableReady = false;
async function ensureTable(sql) {
  if (tableReady) return;
  await sql`CREATE TABLE IF NOT EXISTS app_settings (
    key text PRIMARY KEY,
    val text,
    updated_at timestamptz DEFAULT now()
  )`;
  tableReady = true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = getAuth(req);
  if (!auth) return res.status(401).json({ ok: false, error: 'unauthorized' });
  if (req.method !== 'GET' && auth.role !== 'admin') return res.status(403).json({ ok: false, error: 'forbidden' });

  const sql = neon(process.env.DATABASE_URL);

  try {
    await ensureTable(sql);

    if (req.method === 'GET') {
      const rows = await sql`SELECT val FROM app_settings WHERE key = 'ko_map' LIMIT 1`;
      let map = null;
      if (rows[0] && rows[0].val) {
        try { map = JSON.parse(rows[0].val); } catch (_) { map = null; }
      }
      return res.status(200).json({ ok: true, map });
    }

    if (req.method === 'POST') {
      const map = req.body && req.body.map;
      if (!map || typeof map !== 'object' || Array.isArray(map)) {
        return res.status(400).json({ ok: false, error: 'map object required' });
      }
      await sql`
        INSERT INTO app_settings (key, val, updated_at)
        VALUES ('ko_map', ${JSON.stringify(map)}, now())
        ON CONFLICT (key) DO UPDATE SET val = EXCLUDED.val, updated_at = now()
      `;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
