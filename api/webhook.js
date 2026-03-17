import { createClient } from '@supabase/supabase-js';

const SB_URL = process.env.SUPABASE_URL || 'https://hwppttcigebpvpvzidex.supabase.co';
const SB_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cHB0dGNpZ2VicHZwdnppZGV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MzE4NTUsImV4cCI6MjA4OTIwNzg1NX0.oNe50eIvP2guEugRk9x8GVlqvHUmYG6jPDWabukk3M8';
const supabase = createClient(SB_URL, SB_KEY);

// 슬랙 자동-결제 워크플로 메시지 파싱
// 형식: [툴 결제 내역 공유]\n사용자: @닉네임\n서비스명: XXX\n내용: XXX\n결제방식: XXX\n결제일: YYYY-MM-DD\n결제금액: XX달러\n결제카드: XXXX
function parseSlackMessage(text) {
  if (!text) return null;
  
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const data = {};
  
  for (const line of lines) {
    if (line.includes(':')) {
      const idx = line.indexOf(':');
      const key = line.slice(0, idx).trim().replace(/^\*|\*$/g, '');
      const val = line.slice(idx + 1).trim().replace(/^\*|\*$/g, '');
      
      if (key === '사용자') data.user = val.replace(/^<@[^|]+\|/, '').replace(/>$/, '').replace(/^@/, '');
      else if (key === '서비스명') data.service = val;
      else if (key === '내용') data.description = val;
      else if (key === '결제방식') data.cycle = val.includes('월') ? '월결제' : val.includes('연') ? '연결제' : val;
      else if (key === '결제일') data.start_date = val.replace(/\./g, '-');
      else if (key === '결제금액') data.amount = val;
      else if (key === '결제카드') data.payment = val;
    }
  }
  
  return data.service ? data : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let data = req.body;
    
    // 자피어에서 text 필드로 슬랙 메시지가 오는 경우 파싱
    if (data.text && !data.service) {
      const parsed = parseSlackMessage(data.text);
      if (parsed) {
        data = { ...data, ...parsed };
      }
    }
    
    const { service, description, user, amount, payment, cycle, start_date, note } = data;
    
    if (!service) {
      return res.status(400).json({ error: 'service is required', received: data });
    }

    // Supabase에 저장
    const newItem = {
      s: service,
      d: description || null,
      u: user || null,
      a: amount || null,
      m: payment || null,
      c: cycle || '월결제',
      sd: start_date || null,
      note: note || null,
      status: '구독중',
      source: 'zapier'
    };

    // 기존 항목 확인 (서비스명 + 사용자로 중복 체크)
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('s', service)
      .eq('u', user || '')
      .eq('status', '구독중');

    if (existing && existing.length > 0) {
      return res.status(200).json({ 
        message: 'Already exists', 
        id: existing[0].id 
      });
    }

    // 새 ID 생성
    const { data: maxData } = await supabase
      .from('subscriptions')
      .select('id')
      .order('id', { ascending: false })
      .limit(1);
    
    const newId = maxData && maxData.length > 0 ? maxData[0].id + 1 : 1000;
    newItem.id = newId;

    const { data: inserted, error } = await supabase
      .from('subscriptions')
      .insert([newItem])
      .select();

    if (error) throw error;

    return res.status(200).json({ 
      success: true, 
      message: 'Subscription added',
      data: inserted[0]
    });

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
}
