import { neon } from '@neondatabase/serverless';
import { loadTemplates, render } from '../lib/msgtpl.js';
import crypto from 'crypto';

// 연결제 갱신 임박(15일 이내) 구독을, 카드 담당자에게 개인 DM으로 알림.
// - 발송 수단: Slack Bot Token(chat.postMessage). 개인 DM은 conversations.open 후 전송.
// - 트리거: Vercel Cron(매일). 주말 제외, 중복발송 방지(notify_log).
// - 토큰/시크릿은 환경변수(SLACK_BOT_TOKEN, CRON_SECRET)로만 받는다.

// 닉네임 → 슬랙 ID 기본값 (프론트 SLACK_ID_MAP과 동일). override는 app_settings(slack_ids)로 병합.
const BASE_SLACK_ID = {"Q":"UGNKU8WLD","IRON":"UGP8ENQ3V","Yello":"UGPBD81HA","Cus":"UGP9X2D3L","MacGook":"UJD690FCM","Minu":"UGNL59LJC","Sante":"U0180UXLD2Q","Rilla":"U01SLNUA155","HODOO":"U0261145X18","Lark":"U027F6SG8AC","Sian":"U027WL6H93N","Rokoon":"U0288AXGGCW","Stone":"U02D6CDKQ3W","Chovy":"U02CX5SQNSZ","Pucca":"U02K890UPK3","Zerry":"U033U995K53","Mush":"U03JQ5FHP5Z","dDubi":"U03QQ53099N","DDao":"U03TC2CQEVD","Burns":"U04ATHK9S84","SALT":"U04GTSZ93T7","Rooney":"U04NX77SNJ1","Hero":"U04SUG1K22D","Moomin":"U04T8FN2ZCZ","Rami":"U04SYARM2MS","Junta":"U04TN658A84","Woz":"U054RK2GKK8","Peach":"U0645BVMJES","Aqoo":"U066F6AA6KD","Hook":"U069A4EC72S","Teddy":"U069GP8MWDQ","Pire":"U06CFJYUGQZ","MewTwo":"U070M3N25LP","Endo":"U071QDWFQNL","YAMUCHI":"U072B0P4R6Y","Beaver":"U05DQHV6XAT","Turkey":"U05EUR1CCN4","Pepe":"U05DQHVDS5D","Jeongnam":"U07M4U01X3J","Aki":"U07S5FBLPK7","Kikr":"U08990X2ZNH","Lime":"U0A3JQ8SGHG","Funky":"U08RUG330D9","Newjin":"U0A07QF0URW"};

const NOTIFY_WINDOW_DAYS = 15;   // 갱신 며칠 이내면 알림

function pad(n){ return n<10 ? '0'+n : ''+n; }
function ymd(d){ return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate()); }
function nextRenewal(sd, today, pd){
  const start = new Date(sd);
  if(isNaN(start)) return null;
  const day = (pd && parseInt(pd,10)) ? parseInt(pd,10) : start.getUTCDate();  // 결제일(pd) 우선
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day));
  while(next <= today) next.setUTCFullYear(next.getUTCFullYear()+1);
  return next;
}
function daysBetween(a, b){ return Math.round((b - a)/86400000); }

function buildMsg(T, koName, tool, renewalStr, days, amount, card){
  return render(T.renewal, { '이름':koName, '서비스':tool, '갱신일':renewalStr, '디데이':'D-'+days, '금액':(amount||'-'), '카드':card });
}

// 인상 승인 종료일: 전용 필드 hu 우선, 없으면 제목 (~M/D까지) 파싱
function hikeStrOf(d, today){
  if(d.hu) return (''+d.hu).slice(0,10);
  const m = (d.s||'').match(/~\s*(\d{1,2})\s*\/\s*(\d{1,2})/);
  if(!m) return null;
  const mo=parseInt(m[1],10), dy=parseInt(m[2],10);
  if(!mo||!dy) return null;
  const mk = (yy)=> ymd(new Date(Date.UTC(yy, mo-1, dy)));
  let str = mk(today.getUTCFullYear());
  if(daysBetween(today, new Date(str)) < -183) str = mk(today.getUTCFullYear()+1);
  return str;
}
function buildGenericMsg(T, koName, tool, amount, card){
  return render(T.generic, { '이름':koName, '서비스':tool, '금액':amount, '카드':card });
}
function buildHikeMsg(T, koName, tool, hikeStr, days, ha, a){
  const dd = days<0 ? ('D+'+(-days)) : ('D-'+days);
  return render(T.hike, { '이름':koName, '서비스':tool, '상태':(days<0?'지났어요':'곧 끝나요'),
    '종료일':hikeStr, '디데이':dd, '인상금액':ha, '원금액':a });
}

async function sendDM(token, userId, text, blocks){
  try {
    const open = await fetch('https://slack.com/api/conversations.open', {
      method:'POST',
      headers:{ 'Authorization':'Bearer '+token, 'Content-Type':'application/json; charset=utf-8' },
      body: JSON.stringify({ users: userId })
    }).then(r=>r.json());
    const channel = (open && open.ok && open.channel && open.channel.id) ? open.channel.id : userId;
    const payload = { channel, text, unfurl_links:false };
    if(blocks) payload.blocks = blocks;
    const post = await fetch('https://slack.com/api/chat.postMessage', {
      method:'POST',
      headers:{ 'Authorization':'Bearer '+token, 'Content-Type':'application/json; charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(r=>r.json());
    return post;
  } catch(e){ return { ok:false, error:e.message }; }
}

// ── 슬랙 Events API: 머시봇에 온 DM 답장을 관리자에게 전달 ──────────
// 이 함수(cron-notify)의 POST를 슬랙 Event Request URL로 쓴다.
// 새 서버리스 함수를 못 만들어서(Hobby 12개 제한) 여기에 얹었다.
// 서명 검증을 위해 bodyParser를 끄므로, POST 본문은 직접 읽는다.
export const config = { api: { bodyParser: false } };

function readRawBody(req){
  return new Promise(function(resolve, reject){
    const chunks = [];
    req.on('data', function(c){ chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)); });
    req.on('end', function(){ resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

// 슬랙 서명 검증(v0). SLACK_SIGNING_SECRET 없으면 전부 거부.
function verifySlackSig(req, raw){
  const secret = process.env.SLACK_SIGNING_SECRET;
  if(!secret) return false;
  const ts = req.headers['x-slack-request-timestamp'];
  const sig = req.headers['x-slack-signature'];
  if(!ts || !sig) return false;
  if(Math.abs(Math.floor(Date.now()/1000) - Number(ts)) > 300) return false;  // 리플레이 방지
  const mine = 'v0=' + crypto.createHmac('sha256', secret)
    .update('v0:' + ts + ':' + raw.toString('utf8')).digest('hex');
  try {
    const a = Buffer.from(mine), b = Buffer.from(String(sig));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch(_){ return false; }
}

// 지정 채널(+스레드)에 메시지 전송
async function postMsg(token, channel, text, blocks, threadTs){
  try {
    const payload = { channel, text, unfurl_links:false };
    if(blocks) payload.blocks = blocks;
    if(threadTs) payload.thread_ts = threadTs;
    return await fetch('https://slack.com/api/chat.postMessage', {
      method:'POST',
      headers:{ 'Authorization':'Bearer '+token, 'Content-Type':'application/json; charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(r=>r.json());
  } catch(e){ return { ok:false, error:e.message }; }
}

function kstStamp(tsSec){
  const d = new Date((Number(tsSec) || (Date.now()/1000)) * 1000 + 9*3600*1000);
  const p = (n)=> n<10 ? '0'+n : ''+n;
  return (d.getUTCMonth()+1)+'/'+d.getUTCDate()+' '+p(d.getUTCHours())+':'+p(d.getUTCMinutes());
}

async function handleSlackEvent(req, res, sql){
  let raw;
  try { raw = await readRawBody(req); } catch(_){ return res.status(400).json({ ok:false }); }
  if(!verifySlackSig(req, raw)) return res.status(401).json({ ok:false, error:'bad_signature' });

  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch(_){ return res.status(400).json({ ok:false }); }

  // 슬랙이 Request URL 저장할 때 보내는 확인 요청
  if(body.type === 'url_verification'){
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send(body.challenge || '');
  }
  if(body.type !== 'event_callback') return res.status(200).json({ ok:true });

  const ev = body.event || {};

  // 재고 관리 앱(plab-inventory): #구매-요청 새 글은 그 앱으로 그대로 넘긴다(머시봇 Event URL 공유).
  // 원본 본문·서명 헤더를 그대로 보내서 받는 앱이 직접 서명을 확인한다. DM 처리와는 겹치지 않는다.
  const invChannels = (process.env.INVENTORY_SLACK_CHANNELS || 'C02FUHFGLGN').split(',').map(function(s){ return s.trim(); });
  if(ev.type === 'message' && !ev.thread_ts && invChannels.indexOf(ev.channel) >= 0){
    try {
      await fetch('https://plab-inventory.vercel.app/api/slack/events', {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'x-slack-request-timestamp': String(req.headers['x-slack-request-timestamp'] || ''),
          'x-slack-signature': String(req.headers['x-slack-signature'] || ''),
        },
        body: raw,
        signal: AbortSignal.timeout(2500),
      });
    } catch(_){}
    return res.status(200).json({ ok:true, forwarded:'inventory' });
  }

  const adminId = process.env.ADMIN_SLACK_ID || 'U03JQ5FHP5Z';
  const isDM = ev.channel_type === 'im' || String(ev.channel||'').charAt(0) === 'D';

  // 사람이 봇에게 직접 보낸 DM만. 봇 메시지·수정/삭제는 패스.
  if(ev.type !== 'message' || !isDM) return res.status(200).json({ ok:true, skip:'not_dm' });
  if(ev.bot_id || ev.app_id) return res.status(200).json({ ok:true, skip:'bot' });
  if(ev.subtype && ev.subtype !== 'file_share') return res.status(200).json({ ok:true, skip:ev.subtype });
  if(!ev.user) return res.status(200).json({ ok:true, skip:'no_user' });

  const token = process.env.SLACK_BOT_TOKEN;
  if(!token) return res.status(200).json({ ok:false, error:'no_token' });

  // 재시도/중복 방지 (최근 200건 event_id 기억)
  const eid = body.event_id || (ev.channel + ':' + ev.ts);
  let seen = [];
  try {
    const rows = await sql`SELECT val FROM app_settings WHERE key='bot_reply_seen' LIMIT 1`;
    if(rows[0] && rows[0].val){ const v = JSON.parse(rows[0].val); if(Array.isArray(v)) seen = v; }
  } catch(_){}
  if(seen.indexOf(eid) >= 0) return res.status(200).json({ ok:true, skip:'dup' });
  async function markSeen(){
    try {
      seen.unshift(eid);
      await sql`INSERT INTO app_settings (key,val,updated_at) VALUES ('bot_reply_seen', ${JSON.stringify(seen.slice(0,200))}, now())
        ON CONFLICT (key) DO UPDATE SET val=EXCLUDED.val, updated_at=now()`;
    } catch(_){}
  }

  const text = String(ev.text || '').slice(0, 2500);
  const nFiles = Array.isArray(ev.files) ? ev.files.length : 0;
  const quote = (t)=> t ? t.split('\n').map(function(l){ return '> ' + l; }).join('\n') : '> _(텍스트 없음)_';

  // ── (A) 머시가 전달 메시지에 *스레드 답글* → 원래 보낸 사람에게 머시봇이 대신 전달 ──
  if(ev.user === adminId && ev.thread_ts && ev.thread_ts !== ev.ts){
    await markSeen();
    let relay = {};
    try {
      const rows = await sql`SELECT val FROM app_settings WHERE key='relay_map' LIMIT 1`;
      if(rows[0] && rows[0].val){ const v = JSON.parse(rows[0].val); if(v && typeof v === 'object') relay = v; }
    } catch(_){}
    const target = relay[ev.thread_ts];
    if(!target){
      await postMsg(token, ev.channel, '⚠️ 누구에게 보낼지 못 찾았어요. 너무 오래된 전달 메시지는 중계가 안 돼요 — 그분께 직접 DM 부탁드려요.', null, ev.thread_ts);
      return res.status(200).json({ ok:true, skip:'no_target' });
    }
    if(!text){
      await postMsg(token, ev.channel, '⚠️ 글로 적어주셔야 전달돼요. (파일·이미지는 중계되지 않아요)', null, ev.thread_ts);
      return res.status(200).json({ ok:true, skip:'empty' });
    }
    const relayBlocks = [
      { type:'section', text:{ type:'mrkdwn', text:'💬 <@'+adminId+'> 님의 답장이에요' } },
      { type:'section', text:{ type:'mrkdwn', text: quote(text) } }
    ];
    const rr = await sendDM(token, target, '💬 답장: '+text, relayBlocks);
    await postMsg(token, ev.channel,
      (rr && rr.ok) ? ('✅ <@'+target+'> 님에게 보냈어요') : ('❌ 전송 실패 — 직접 DM 부탁드려요'),
      null, ev.thread_ts);
    return res.status(200).json({ ok: !!(rr && rr.ok), relayed:true });
  }

  // ── (B) 머시 본인의 일반 DM은 무한루프 방지로 제외(단 '테스트'는 확인용 전달) ──
  const selfTest = (ev.user === adminId) && /^\s*(테스트|test)/i.test(text);
  if(ev.user === adminId && !selfTest) return res.status(200).json({ ok:true, skip:'self' });

  // ── (C) 다른 사람이 머시봇에 보낸 DM → 머시에게 전달 ──
  const blocks = [
    { type:'section', text:{ type:'mrkdwn', text:'💬 <@'+ev.user+'> 님이 *머시봇*에게 답장했어요' } },
    { type:'section', text:{ type:'mrkdwn', text: quote(text) + (nFiles ? ('\n📎 첨부 '+nFiles+'개') : '') } },
    { type:'context', elements:[ { type:'mrkdwn',
        text:'🕑 '+kstStamp(ev.ts)+'  ·  ↩️ *이 메시지에 스레드로 답글*을 달면 머시봇이 <@'+ev.user+'> 님에게 대신 보내드려요' } ] }
  ];
  const fallback = '💬 머시봇에 온 답장: ' + (text || '(첨부)');

  const r = await sendDM(token, adminId, fallback, blocks);
  await markSeen();

  // 전달 메시지 ts → 보낸 사람 매핑 저장(스레드 답글 중계용, 최근 300건)
  if(r && r.ok && r.ts){
    try {
      const rows = await sql`SELECT val FROM app_settings WHERE key='relay_map' LIMIT 1`;
      let relay = {};
      if(rows[0] && rows[0].val){ const v = JSON.parse(rows[0].val); if(v && typeof v === 'object') relay = v; }
      const entries = [[r.ts, ev.user]].concat(Object.keys(relay).map(function(k){ return [k, relay[k]]; }));
      const next = {};
      entries.slice(0, 300).forEach(function(e){ if(!(e[0] in next)) next[e[0]] = e[1]; });
      await sql`INSERT INTO app_settings (key,val,updated_at) VALUES ('relay_map', ${JSON.stringify(next)}, now())
        ON CONFLICT (key) DO UPDATE SET val=EXCLUDED.val, updated_at=now()`;
    } catch(_){}
  }

  return res.status(200).json({ ok: !!(r && r.ok) });
}

export default async function handler(req, res){
  const sql = neon(process.env.DATABASE_URL);

  // 슬랙 Events API는 POST로 온다 (CRON_SECRET 인증 대상 아님 — 서명으로 검증)
  if(req.method === 'POST') return handleSlackEvent(req, res, sql);

  const token = process.env.SLACK_BOT_TOKEN;
  const secret = process.env.CRON_SECRET;
  const dry = req.query.dryRun==='1' || req.query.dry==='1';
  const testTo = req.query.testTo;
  const previewTo = req.query.previewTo;   // 실제 문구를 이 사람에게만 미리보기 발송(이력 미기록)
  const preview = !!previewTo;
  const sendId = req.query.sendId;          // 특정 구독 1건만 수동 발송

  // 인증: CRON_SECRET이 있으면 헤더(Bearer) 또는 ?key= 로 확인 (Vercel Cron은 헤더 자동 첨부)
  const auth = req.headers['authorization'] || '';
  const authed = !!secret && (auth === 'Bearer '+secret || req.query.key === secret);
  if(secret && !authed){
    return res.status(401).json({ ok:false, error:'unauthorized' });
  }

  async function getSetting(key){
    try {
      const rows = await sql`SELECT val FROM app_settings WHERE key=${key} LIMIT 1`;
      if(rows[0] && rows[0].val){ try { return JSON.parse(rows[0].val); } catch(_){ return null; } }
    } catch(_){}
    return null;
  }
  const T = await loadTemplates(sql);
  const slackOverride = (await getSetting('slack_ids')) || {};
  const slackIdOf = (nick)=> (nick && (slackOverride[nick] || BASE_SLACK_ID[nick])) || null;

  // 테스트 발송(특정 슬랙ID로 1회). CRON_SECRET이 설정돼 있으면 위 인증을 통과해야 함.
  if(testTo){
    if(!token) return res.status(200).json({ ok:false, error:'no SLACK_BOT_TOKEN' });
    const r = await sendDM(token, testTo, '🔔 [테스트] 구독 알림 봇 연결 테스트예요. 잘 도착했나요? 😊');
    return res.status(200).json({ ok: !!r.ok, test:true, resp:r });
  }

  if(!token && !dry) return res.status(200).json({ ok:false, skipped:'no SLACK_BOT_TOKEN' });

  const koMap = (await getSetting('ko_map')) || {};
  const cardManagers = (await getSetting('card_managers')) || {};
  const notifyLog = (await getSetting('notify_log')) || {};
  const notifyHistory = (await getSetting('notify_history')) || [];
  const newHistory = Array.isArray(notifyHistory) ? notifyHistory.slice() : [];

  // KST 기준 오늘 (UTC+9)
  const nowKst = new Date(Date.now() + 9*3600*1000);
  const kstToday = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate()));
  const dow = kstToday.getUTCDay(); // 0=일 6=토
  const isWeekend = (dow===0 || dow===6);

  // ── 특정 구독 1건 수동 발송 (앱의 '지금 알림 보내기' 버튼) ──
  if(sendId){
    if(!token) return res.status(200).json({ ok:false, error:'no SLACK_BOT_TOKEN' });
    let one;
    try { const rows = await sql`SELECT * FROM subscriptions WHERE id=${parseInt(sendId)} LIMIT 1`; one = rows[0]; }
    catch(e){ return res.status(500).json({ ok:false, error:e.message }); }
    if(!one) return res.status(200).json({ ok:false, error:'구독을 찾을 수 없어요' });
    const card = (one.m||'').trim();
    const nick = one.mgr || cardManagers[card];
    if(!nick) return res.status(200).json({ ok:false, error:'담당자 미지정 (카드 '+card+')' });
    const slackId = slackIdOf(nick);
    if(!slackId) return res.status(200).json({ ok:false, error:'담당자 슬랙ID 없음 ('+nick+')' });
    const koName = koMap[nick] || nick;
    let text, kind;
    const hs = hikeStrOf(one, kstToday);
    if(hs){ const hd = daysBetween(kstToday, new Date(hs)); text = buildHikeMsg(T, koName, one.s, hs, hd, one.ha, one.a); kind='인상만료'; }
    else if(one.c==='연결제' && one.sd){ const rn = nextRenewal(one.sd, kstToday, one.pd); const rd = daysBetween(kstToday, rn); text = buildMsg(T, koName, one.s, ymd(rn), rd, one.a, card); kind='갱신'; }
    else { text = buildGenericMsg(T, koName, one.s, one.a, card); kind='구독확인'; }
    if(preview) text = '🧪 *[미리보기]* 원래 받는 사람: *'+koName+'*\n\n' + text;
    const dest = (previewTo || testTo) ? (previewTo || testTo) : slackId;
    if(dry) return res.status(200).json({ ok:true, dry:true, to:slackId, nick, koName, kind, text });
    const r = await sendDM(token, dest, text);
    if(r.ok && !preview && !(previewTo||testTo)){
      const at = new Date().toISOString();
      newHistory.unshift({ at, id:one.id, tool:one.s, nick, koName, card, kind:'수동('+kind+')', amount:(one.a||'') });
      try {
        await sql`INSERT INTO app_settings (key,val,updated_at) VALUES ('notify_history', ${JSON.stringify(newHistory.slice(0,300))}, now())
          ON CONFLICT (key) DO UPDATE SET val=EXCLUDED.val, updated_at=now()`;
      } catch(_){}
    }
    return res.status(200).json({ ok: !!r.ok, sent: !!r.ok, to:dest, nick, koName, kind, err: r.ok?undefined:(r.error||'') });
  }

  let subs = [];
  try {
    subs = await sql`SELECT id,s,u,a,m,c,sd,status,mgr,pd FROM subscriptions WHERE status='구독중' AND c='연결제'`;
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }

  const newLog = Object.assign({}, notifyLog);
  const results = [];

  for(const d of subs){
    if(!d.sd) continue;
    const renewal = nextRenewal(d.sd, kstToday, d.pd);
    if(!renewal) continue;
    const days = daysBetween(kstToday, renewal);
    if(days < 0 || days > NOTIFY_WINDOW_DAYS) continue;
    const card = (d.m||'').trim();
    const nick = d.mgr || cardManagers[card];
    if(!nick){ results.push({ id:d.id, s:d.s, card, skip:'담당자 미지정' }); continue; }
    const slackId = slackIdOf(nick);
    if(!slackId){ results.push({ id:d.id, s:d.s, nick, skip:'슬랙ID 없음' }); continue; }
    const renewalStr = ymd(renewal);
    const logKey = d.id+':'+renewalStr;
    if(!preview && newLog[logKey]){ results.push({ id:d.id, s:d.s, skip:'이미 발송됨' }); continue; }
    if(!preview && isWeekend){ results.push({ id:d.id, s:d.s, skip:'주말(영업일 대기)' }); continue; }
    const koName = koMap[nick] || nick;
    let text = buildMsg(T, koName, d.s, renewalStr, days, d.a, card);
    if(preview) text = '🧪 *[미리보기]* 원래 받는 사람: *'+koName+'*\n\n' + text;
    if(dry){ results.push({ id:d.id, s:d.s, nick, to:slackId, would_send:true }); continue; }
    const dest = preview ? previewTo : slackId;
    const r = await sendDM(token, dest, text);
    results.push({ id:d.id, s:d.s, nick, to:dest, preview, sent: !!r.ok, err: r.ok?undefined:(r.error||'') });
    if(!preview && r.ok){
      const at = new Date().toISOString();
      newLog[logKey] = at;
      newHistory.unshift({ at, id:d.id, tool:d.s, nick, koName, card, kind:'갱신', renewal:renewalStr, days, amount:(d.a||'') });
    }
  }

  // ── 요금 인상 승인 기간 만료/임박 알림 (3일 전부터 처리 전까지 매일 1회) ──
  let hikeSubs = [];
  try { hikeSubs = await sql`SELECT id,s,u,a,m,c,sd,status,hu,ha,mgr FROM subscriptions WHERE status='구독중'`; } catch(_){}
  for(const d of hikeSubs){
    const hs = hikeStrOf(d, kstToday);
    if(!hs) continue;
    const hdays = daysBetween(kstToday, new Date(hs));
    if(hdays > 3) continue;                      // 만료 3일 전부터
    const card = (d.m||'').trim();
    const nick = d.mgr || cardManagers[card];
    if(!nick){ results.push({ id:d.id, s:d.s, hike:hs, kind:'hike', skip:'담당자 미지정' }); continue; }
    const slackId = slackIdOf(nick);
    if(!slackId){ results.push({ id:d.id, s:d.s, nick, hike:hs, kind:'hike', skip:'슬랙ID 없음' }); continue; }
    const koName = koMap[nick] || nick;
    let text = buildHikeMsg(T, koName, d.s, hs, hdays, d.ha, d.a);
    if(preview) text = '🧪 *[미리보기]* 원래 받는 사람: *'+koName+'*\n\n' + text;
    if(dry){ results.push({ id:d.id, s:d.s, nick, to:slackId, kind:'hike', would_send:true }); continue; }
    const dest = preview ? previewTo : slackId;
    const r = await sendDM(token, dest, text);
    results.push({ id:d.id, s:d.s, nick, to:dest, preview, kind:'hike', sent: !!r.ok, err: r.ok?undefined:(r.error||'') });
    if(!preview && r.ok){
      newHistory.unshift({ at:new Date().toISOString(), id:d.id, tool:d.s, nick, koName, card, kind:'인상만료', hike:hs, days:hdays, amount:(d.a||'') });
    }
  }

  // 오래된 로그 정리 + 저장 (미리보기는 이력 미기록)
  if(!dry && !preview){
    const cutoff = ymd(new Date(kstToday.getTime() - 45*86400000));
    Object.keys(newLog).forEach(function(k){
      const dt = k.split(':')[1] || '';
      if(dt && dt < cutoff) delete newLog[k];
    });
    try {
      await sql`INSERT INTO app_settings (key,val,updated_at) VALUES ('notify_log', ${JSON.stringify(newLog)}, now())
        ON CONFLICT (key) DO UPDATE SET val=EXCLUDED.val, updated_at=now()`;
      const trimmed = newHistory.slice(0, 300);   // 최근 300건만 보관
      await sql`INSERT INTO app_settings (key,val,updated_at) VALUES ('notify_history', ${JSON.stringify(trimmed)}, now())
        ON CONFLICT (key) DO UPDATE SET val=EXCLUDED.val, updated_at=now()`;
    } catch(_){}
  }

  return res.status(200).json({ ok:true, dry: !!dry, today: ymd(kstToday), weekend: isWeekend, count: results.length, results });
}
