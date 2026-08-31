import { neon } from '@neondatabase/serverless';
import { encrypt } from '../lib/secure.js';

// 노션 → cards 테이블 일회성 이관. x-migration-secret 헤더 필요.
// 이관 완료 후 이 파일과 MIGRATION_SECRET 환경변수는 제거한다.
export default async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).json({ ok:false });
  const secret = req.headers['x-migration-secret'] || '';
  if(!process.env.MIGRATION_SECRET || secret !== process.env.MIGRATION_SECRET){
    return res.status(403).json({ ok:false });
  }
  const body = req.body || {};
  const cards = body.cards;
  if(!Array.isArray(cards)) return res.status(400).json({ ok:false, error:'cards array required' });

  const sql = neon(process.env.DATABASE_URL);
  await sql`CREATE TABLE IF NOT EXISTS cards (
    id serial PRIMARY KEY,
    number_enc text, last4 text, cvc_enc text,
    expiry text, user_name text, status text,
    paybook text, confirmed text,
    prev_number_enc text, prev_cvc_enc text,
    note text, created_at timestamptz default now()
  )`;
  if(body.replace) await sql`DELETE FROM cards`;

  let n = 0;
  for(const it of cards){
    const last4 = String(it.number || '').replace(/\D/g,'').slice(-4);
    await sql`INSERT INTO cards
      (number_enc,last4,cvc_enc,expiry,user_name,status,paybook,confirmed,prev_number_enc,prev_cvc_enc,note)
      VALUES (${encrypt(it.number)},${last4},${encrypt(it.cvc)},${it.expiry||null},${it.user_name||null},${it.status||null},
              ${it.paybook||null},${it.confirmed||null},${encrypt(it.prev_number)},${encrypt(it.prev_cvc)},${it.note||null})`;
    n++;
  }
  return res.status(200).json({ ok:true, inserted:n });
}
