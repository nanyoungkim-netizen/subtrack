import { put, get } from '@vercel/blob';

const BLOB_KEY = 'subtrack-data.json';

async function loadData() {
  try {
    const blob = await get(BLOB_KEY);
    const res = await fetch(blob.url);
    return await res.json();
  } catch {
    return null;
  }
}

async function saveData(list) {
  await put(BLOB_KEY, JsON.stringify(list), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') {
    try {
      const list = await loadData();
      return res.status(200).json({ ok: true, data: list, initialized: list !== null });
    } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
  }
  if (req.method === 'POST') {
    try {
      const { data } = req.body;
      if (!Array.isArray(data)) return res.status(400).json({ ok: false, error: 'data 몉 필요합니다' });
      await saveData(data);
      return res.status(200).json({ ok: true, saved: data.length });
    } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
  }
  return res.status(405).json({ error: 'Method not allowed' });
}
