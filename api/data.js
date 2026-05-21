import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sql = neon(process.env.DATABASE_URL);

  if (req.method === 'GET') {
    try {
      const { id, status, source } = req.query;
      if (id) {
        const rows = await sql`SELECT * FROM subscriptions WHERE id = ${parseInt(id)} LIMIT 1`;
        return res.status(200).json({ ok: true, data: rows[0] || null });
      }
      let rows;
      if (status && source) {
        rows = await sql`SELECT * FROM subscriptions WHERE status = ${status} AND source = ${source} ORDER BY id ASC`;
      } else if (status) {
        rows = await sql`SELECT * FROM subscriptions WHERE status = ${status} ORDER BY id ASC`;
      } else if (source) {
        rows = await sql`SELECT * FROM subscriptions WHERE source = ${source} ORDER BY id ASC`;
      } else {
        rows = await sql`SELECT * FROM subscriptions ORDER BY id ASC`;
      }
      return res.status(200).json({ ok: true, data: rows, initialized: rows.length > 0 });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const { id, s, d, u, status, a, m, c, sd, ed, note, source, pd } = req.body;
      const rows = await sql`
        UPDATE subscriptions SET
          s=${s||null}, d=${d||''}, u=${u||''}, status=${status||'구독중'},
          a=${a||''}, m=${m||''}, c=${c||'월결제'},
          sd=${sd||null}, ed=${ed||null}, note=${note||''},
          source=${source||null}, pd=${pd||null}
        WHERE id=${id}
        RETURNING *
      `;
      return res.status(200).json({ ok: true, data: rows[0] });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { data } = req.body;
      await sql`DELETE FROM subscriptions`;
      for (const row of data) {
        const { id, s, d, u, status, a, m, c, sd, ed, note, source, pd } = row;
        await sql`INSERT INTO subscriptions (id,s,d,u,status,a,m,c,sd,ed,note,source,pd)
          VALUES (${id},${s||null},${d||''},${u||''},${status||'구독중'},
                  ${a||''},${m||''},${c||'월결제'},${sd||null},${ed||null},
                  ${note||''},${source||null},${pd||null})`;
      }
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
  }
