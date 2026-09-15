import { neon } from '@neondatabase/serverless';
import { getAuth } from '../lib/secure.js';
import { DEFAULT_TEMPLATES, TEMPLATE_VARS } from '../lib/msgtpl.js';

// 알림 문구 템플릿 조회/저장 (관리자 전용)
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = getAuth(req);
  if (!auth) return res.status(401).json({ ok: false, error: 'unauthorized' });
  if (auth.role !== 'admin') return res.status(403).json({ ok: false, error: 'forbidden' });

  const sql = neon(process.env.DATABASE_URL);
  try {
    await sql`CREATE TABLE IF NOT EXISTS app_settings (key text PRIMARY KEY, val text, updated_at timestamptz DEFAULT now())`;

    if (req.method === 'GET') {
      let saved = {};
      try {
        const rows = await sql`SELECT val FROM app_settings WHERE key='msg_templates' LIMIT 1`;
        if (rows[0] && rows[0].val) saved = JSON.parse(rows[0].val) || {};
      } catch (_) { saved = {}; }
      return res.status(200).json({ ok: true, defaults: DEFAULT_TEMPLATES, saved: saved, vars: TEMPLATE_VARS });
    }

    if (req.method === 'POST') {
      const t = (req.body && req.body.templates) || null;
      if (!t || typeof t !== 'object' || Array.isArray(t)) {
        return res.status(400).json({ ok: false, error: 'templates object required' });
      }
      // 기본값과 같은 항목은 저장하지 않음(기본값 변경 시 자동 반영되도록)
      const clean = {};
      Object.keys(t).forEach(function (k) {
        if (!(k in DEFAULT_TEMPLATES)) return;                 // 모르는 키 무시
        const v = typeof t[k] === 'string' ? t[k] : '';
        if (v.trim() && v !== DEFAULT_TEMPLATES[k]) clean[k] = v;
      });
      await sql`
        INSERT INTO app_settings (key, val, updated_at)
        VALUES ('msg_templates', ${JSON.stringify(clean)}, now())
        ON CONFLICT (key) DO UPDATE SET val = EXCLUDED.val, updated_at = now()
      `;
      return res.status(200).json({ ok: true, saved: clean });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
