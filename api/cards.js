import { neon } from '@neondatabase/serverless';
import { getAuth, encrypt, decrypt, maskCard } from '../lib/secure.js';

// 법인카드 데이터. 관리자 인증(쿠키 또는 Bearer 토큰) 없으면 전부 401.
export default async function handler(req, res){
  const s = getAuth(req);
  if(!s || s.role !== 'admin') return res.status(401).json({ ok:false, error:'unauthorized' });

  const sql = neon(process.env.DATABASE_URL);
  await sql`CREATE TABLE IF NOT EXISTS cards (
    id serial PRIMARY KEY,
    number_enc text, last4 text, cvc_enc text,
    expiry text, user_name text, status text,
    paybook text, confirmed text,
    prev_number_enc text, prev_cvc_enc text,
    note text, created_at timestamptz default now()
  )`;

  if(req.method === 'GET'){
    const { id, reveal } = req.query;
    // 특정 카드 1건만 복호화(클릭 시)
    if(id && reveal){
      const rows = await sql`SELECT * FROM cards WHERE id=${parseInt(id)} LIMIT 1`;
      const c = rows[0];
      if(!c) return res.status(404).json({ ok:false });
      return res.status(200).json({ ok:true, card: {
        id:c.id,
        number: decrypt(c.number_enc), cvc: decrypt(c.cvc_enc),
        prev_number: decrypt(c.prev_number_enc), prev_cvc: decrypt(c.prev_cvc_enc)
      }});
    }
    // 목록은 항상 마스킹
    const rows = await sql`SELECT * FROM cards ORDER BY id ASC`;
    const cards = rows.map(function(c){ return {
      id:c.id, number: maskCard(c.last4), last4:c.last4,
      cvc: c.cvc_enc ? '***' : '', expiry:c.expiry, user_name:c.user_name,
      status:c.status, paybook:c.paybook, confirmed:c.confirmed, note:c.note,
      has_prev: !!c.prev_number_enc
    };});
    return res.status(200).json({ ok:true, cards: cards });
  }

  if(req.method === 'POST'){   // 추가/수정
    const it = (req.body && req.body.item) || {};
    const last4 = String(it.number || '').replace(/\D/g,'').slice(-4);
    if(it.id){
      await sql`UPDATE cards SET
        number_enc=${encrypt(it.number)}, last4=${last4}, cvc_enc=${encrypt(it.cvc)},
        expiry=${it.expiry||null}, user_name=${it.user_name||null}, status=${it.status||null},
        paybook=${it.paybook||null}, confirmed=${it.confirmed||null},
        prev_number_enc=${encrypt(it.prev_number)}, prev_cvc_enc=${encrypt(it.prev_cvc)}, note=${it.note||null}
        WHERE id=${it.id}`;
      return res.status(200).json({ ok:true, id: it.id });
    }
    const r = await sql`INSERT INTO cards
      (number_enc,last4,cvc_enc,expiry,user_name,status,paybook,confirmed,prev_number_enc,prev_cvc_enc,note)
      VALUES (${encrypt(it.number)},${last4},${encrypt(it.cvc)},${it.expiry||null},${it.user_name||null},${it.status||null},
              ${it.paybook||null},${it.confirmed||null},${encrypt(it.prev_number)},${encrypt(it.prev_cvc)},${it.note||null})
      RETURNING id`;
    return res.status(200).json({ ok:true, id: r[0].id });
  }

  if(req.method === 'DELETE'){
    const { id } = req.query;
    if(!id) return res.status(400).json({ ok:false });
    await sql`DELETE FROM cards WHERE id=${parseInt(id)}`;
    return res.status(200).json({ ok:true });
  }

  return res.status(405).json({ ok:false });
}
