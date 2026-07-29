import { neon } from '@neondatabase/serverless';

// 범용 키-값 설정 저장 (app_settings 테이블 재사용).
// 예) key='card_managers' → 카드별 결제 담당자 매핑 JSON
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = neon(process.env.DATABASE_URL);

  try {
    await sql`CREATE TABLE IF NOT EXISTS app_settings (
      key text PRIMARY KEY,
      val text,
      updated_at timestamptz DEFAULT now()
    )`;

    if (req.method === 'GET') {
      const key = req.query.key;
      if (!key) return res.status(400).json({ ok: false, error: 'key required' });
      const rows = await sql`SELECT val FROM app_settings WHERE key = ${key} LIMIT 1`;
      let value = null;
      if (rows[0] && rows[0].val) {
        try { value = JSON.parse(rows[0].val); } catch (_) { value = null; }
      }
      return res.status(200).json({ ok: true, value });
    }

    if (req.method === 'POST') {
      const { key, value } = req.body || {};
      if (!key) return res.status(400).json({ ok: false, error: 'key required' });
      await sql`
        INSERT INTO app_settings (key, val, updated_at)
        VALUES (${key}, ${JSON.stringify(value == null ? {} : value)}, now())
        ON CONFLICT (key) DO UPDATE SET val = EXCLUDED.val, updated_at = now()
      `;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
