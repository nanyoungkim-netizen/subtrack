import { createClient } from '@supabase/supabase-js';

const SB = createClient(
  'https://hwppttcigebpvpvzidex.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cHB0dGNpZ2VicHZwdnppZGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MzE4NTUsImV4cCI6MjA4OTIwNzg1NX0.oNe50eIvP2guEugRk9x8GVlqvHUmYG6jPDWabukk3M8'
);

// 자동-결제 슬랙 메시지 파싱
function parseSlack(text) {
  if (!text || !text.includes('툴 결제 내역 공유')) return null;
  const lines = text.split('\n').map(l => l.trim());
  const get = (key) => {
    const line = lines.find(l => l.replace(/\*/g,'').startsWith(key+':'));
    return line ? line.slice(line.indexOf(':')+1).trim().replace(/\*/g,'') : '';
  };
  const user = get('사용자').replace(/^<@[^|]+\|/, '').replace(/>$/, '').replace(/^@/,'');
  const service = get('서비스명');
  const desc = get('내용');
  const rawCycle = get('결제방식');
  const cycle = rawCycle.includes('월') ? '월결제' : rawCycle.includes('연') ? '연결제' : '월결제';
  const date = get('결제일').replace(/\./g, '-');
  const amount = get('결제금액');
  const payment = get('결제카드');
  return service ? { service, user, description: desc, cycle, start_date: date, amount, payment } : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let body = req.body || {};
    // 자피어 슬랙 text 파싱
    if (body.text && !body.service) {
      const parsed = parseSlack(body.text);
      if (parsed) body = { ...body, ...parsed };
    }
    const { service, description, user, amount, payment, cycle, start_date, note } = body;
    if (!service) return res.status(400).json({ error: 'service required', received: body });

    // 중복 체크
    const chkRes = await SB.from('subscriptions').select('id').eq('s', service).eq('status', '구독중');
    if (chkRes.data && chkRes.data.length > 0) {
      return res.status(200).json({ message: 'already exists', id: chkRes.data[0].id });
    }

    // 새 ID
    const maxRes = await SB.from('subscriptions').select('id').order('id', { ascending: false }).limit(1);
    const newId = (maxRes.data && maxRes.data.length > 0) ? maxRes.data[0].id + 1 : 2000;

    const { data, error } = await SB.from('subscriptions').insert([{
      id: newId, s: service, d: description || null, u: user || null,
      a: amount || null, m: payment || null, c: cycle || '월결제',
      sd: start_date || null, note: note || null, status: '구독중', source: 'zapier'
    }]).select();

    if (error) throw error;
    return res.status(200).json({ success: true, data: data[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
