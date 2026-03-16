const SUPABASE_URL = 'https://hwppttcigebpvpvzidex.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cHB0dGNpZ2VicHZwdnppZGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MzE4NTUsImV4cCI6MjA4OTIwNzg1NX0.oNe50eIvP2guEugRk9x8GVlqvHUmYG6jPDWabukk3M8';

const headers = {
  'apikey': SUPABASE_KEY,
  'Authorization': 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal'
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET: 전체 목록 불러오기
  if (req.method === 'GET') {
    try {
      const r = await fetch(SUPABASE_URL + '/rest/v1/subscriptions?select=*&order=id.asc&limit=1000', { headers });
      const data = await r.json();
      if (!r.ok) return res.status(500).json({ ok: false, error: JSON.stringify(data) });
      return res.status(200).json({ ok: true, data: data.length > 0 ? data : null, initialized: data.length > 0 });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // POST: 전체 데이터 저장 (기존 전체 삭제 후 재삽입)
  if (req.method === 'POST') {
    try {
      const { data } = req.body;
      if (!Array.isArray(data)) return res.status(400).json({ ok: false, error: 'data 배열 필요' });

      // 1. 기존 데이터 전체 삭제
      const delRes = await fetch(SUPABASE_URL + '/rest/v1/subscriptions?id=gte.0', {
        method: 'DELETE',
        headers
      });
      if (!delRes.ok && delRes.status !== 404) {
        const delErr = await delRes.text();
        return res.status(500).json({ ok: false, error: 'delete failed: ' + delErr });
      }

      // 2. 새 데이터 전체 삽입
      if (data.length > 0) {
        const insRes = await fetch(SUPABASE_URL + '/rest/v1/subscriptions', {
          method: 'POST',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify(data)
        });
        if (!insRes.ok) {
          const insErr = await insRes.text();
          return res.status(500).json({ ok: false, error: 'insert failed: ' + insErr });
        }
      }

      return res.status(200).json({ ok: true, saved: data.length });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}