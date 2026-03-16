export default async function handler(req, res) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const FILENAME = 'subtrack-data.json';

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET: 데이터 불러오기
  if (req.method === 'GET') {
    try {
      // 파일 목록 조회
      const listRes = await fetch(`https://blob.vercel-storage.com?prefix=${FILENAME}&limit=1`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const listData = await listRes.json();
      const blobs = listData.blobs || [];

      if (blobs.length === 0) {
        return res.status(200).json({ ok: true, data: null, initialized: false });
      }

      // 파일 내용 읽기
      const dataRes = await fetch(blobs[0].url);
      const data = await dataRes.json();
      return res.status(200).json({ ok: true, data, initialized: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // POST: 데이터 저장
  if (req.method === 'POST') {
    try {
      const { data } = req.body;
      if (!Array.isArray(data)) return res.status(400).json({ ok: false, error: 'data 배열 필요' });

      const putRes = await fetch(`https://blob.vercel-storage.com/${FILENAME}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-allow-overwrite': '1',
          'x-cache-control-max-age': '0',
        },
        body: JSON.stringify(data)
      });

      if (!putRes.ok) {
        const errText = await putRes.text();
        return res.status(500).json({ ok: false, error: errText });
      }

      return res.status(200).json({ ok: true, saved: data.length });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}