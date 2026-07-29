import { neon } from '@neondatabase/serverless';

// 연결제 갱신 임박(15일 이내) 구독을, 카드 담당자에게 개인 DM으로 알림.
// - 발송 수단: Slack Bot Token(chat.postMessage). 개인 DM은 conversations.open 후 전송.
// - 트리거: Vercel Cron(매일). 주말 제외, 중복발송 방지(notify_log).
// - 토큰/시크릿은 환경변수(SLACK_BOT_TOKEN, CRON_SECRET)로만 받는다.

// 닉네임 → 슬랙 ID 기본값 (프론트 SLACK_ID_MAP과 동일). override는 app_settings(slack_ids)로 병합.
const BASE_SLACK_ID = {"Q":"UGNKU8WLD","IRON":"UGP8ENQ3V","Yello":"UGPBD81HA","Cus":"UGP9X2D3L","MacGook":"UJD690FCM","Minu":"UGNL59LJC","Sante":"U0180UXLD2Q","Rilla":"U01SLNUA155","HODOO":"U0261145X18","Lark":"U027F6SG8AC","Sian":"U027WL6H93N","Rokoon":"U0288AXGGCW","Stone":"U02D6CDKQ3W","Chovy":"U02CX5SQNSZ","Pucca":"U02K890UPK3","Zerry":"U033U995K53","Mush":"U03JQ5FHP5Z","dDubi":"U03QQ53099N","DDao":"U03TC2CQEVD","Burns":"U04ATHK9S84","SALT":"U04GTSZ93T7","Rooney":"U04NX77SNJ1","Hero":"U04SUG1K22D","Moomin":"U04T8FN2ZCZ","Rami":"U04SYARM2MS","Junta":"U04TN658A84","Woz":"U054RK2GKK8","Peach":"U0645BVMJES","Aqoo":"U066F6AA6KD","Hook":"U069A4EC72S","Teddy":"U069GP8MWDQ","Pire":"U06CFJYUGQZ","MewTwo":"U070M3N25LP","Endo":"U071QDWFQNL","YAMUCHI":"U072B0P4R6Y","Beaver":"U05DQHV6XAT","Turkey":"U05EUR1CCN4","Pepe":"U05DQHVDS5D","Jeongnam":"D07LNQ9GMHV","Aki":"U07S5FBLPK7","Kikr":"U08990X2ZNH","Lime":"U0A3JQ8SGHG","Funky":"U08RUG330D9","Newjin":"U0A07QF0URW"};

const NOTIFY_WINDOW_DAYS = 15;   // 갱신 며칠 이내면 알림

function pad(n){ return n<10 ? '0'+n : ''+n; }
function ymd(d){ return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate()); }
function nextRenewal(sd, today){
  const start = new Date(sd);
  if(isNaN(start)) return null;
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  while(next <= today) next.setUTCFullYear(next.getUTCFullYear()+1);
  return next;
}
function daysBetween(a, b){ return Math.round((b - a)/86400000); }

function buildMsg(koName, tool, renewalStr, days, amount, card){
  return '👋 '+koName+' 안녕하세요!\n\n' +
    '담당하고 계신 *'+tool+'* 연결제 갱신일이 곧 다가와요 📅\n' +
    '• 갱신 예정일: *'+renewalStr+'* (D-'+days+')\n' +
    '• 금액: *'+(amount||'-')+'* / 카드 끝자리 '+card+'\n\n' +
    '사용여부를 확인해주시고 아래 절차대로 진행해주세요.\n' +
    '• 사용 O → 갱신 후 결제 내용을 공유해주세요\n' +
    '• 사용 X → 갱신 전에 해지 처리해주세요\n\n' +
    '감사합니다 😊';
}

async function sendDM(token, userId, text){
  try {
    const open = await fetch('https://slack.com/api/conversations.open', {
      method:'POST',
      headers:{ 'Authorization':'Bearer '+token, 'Content-Type':'application/json; charset=utf-8' },
      body: JSON.stringify({ users: userId })
    }).then(r=>r.json());
    const channel = (open && open.ok && open.channel && open.channel.id) ? open.channel.id : userId;
    const post = await fetch('https://slack.com/api/chat.postMessage', {
      method:'POST',
      headers:{ 'Authorization':'Bearer '+token, 'Content-Type':'application/json; charset=utf-8' },
      body: JSON.stringify({ channel, text })
    }).then(r=>r.json());
    return post;
  } catch(e){ return { ok:false, error:e.message }; }
}

export default async function handler(req, res){
  const sql = neon(process.env.DATABASE_URL);
  const token = process.env.SLACK_BOT_TOKEN;
  const secret = process.env.CRON_SECRET;
  const dry = req.query.dryRun==='1' || req.query.dry==='1';
  const testTo = req.query.testTo;

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
  const slackOverride = (await getSetting('slack_ids')) || {};
  const slackIdOf = (nick)=> (nick && (slackOverride[nick] || BASE_SLACK_ID[nick])) || null;

  // 테스트 발송(본인 등 특정 슬랙ID로 1회) — 남용 방지 위해 CRON_SECRET 필수
  if(testTo){
    if(!secret || !authed) return res.status(403).json({ ok:false, error:'testTo requires CRON_SECRET (?key=)' });
    if(!token) return res.status(200).json({ ok:false, error:'no SLACK_BOT_TOKEN' });
    const r = await sendDM(token, testTo, '🔔 [테스트] 구독 알림 봇 연결 테스트예요. 잘 도착했나요? 😊');
    return res.status(200).json({ ok: !!r.ok, test:true, resp:r });
  }

  if(!token && !dry) return res.status(200).json({ ok:false, skipped:'no SLACK_BOT_TOKEN' });

  const koMap = (await getSetting('ko_map')) || {};
  const cardManagers = (await getSetting('card_managers')) || {};
  const notifyLog = (await getSetting('notify_log')) || {};

  // KST 기준 오늘 (UTC+9)
  const nowKst = new Date(Date.now() + 9*3600*1000);
  const kstToday = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate()));
  const dow = kstToday.getUTCDay(); // 0=일 6=토
  const isWeekend = (dow===0 || dow===6);

  let subs = [];
  try {
    subs = await sql`SELECT id,s,u,a,m,c,sd,status FROM subscriptions WHERE status='구독중' AND c='연결제'`;
  } catch(e){ return res.status(500).json({ ok:false, error:e.message }); }

  const newLog = Object.assign({}, notifyLog);
  const results = [];

  for(const d of subs){
    if(!d.sd) continue;
    const renewal = nextRenewal(d.sd, kstToday);
    if(!renewal) continue;
    const days = daysBetween(kstToday, renewal);
    if(days < 0 || days > NOTIFY_WINDOW_DAYS) continue;
    const card = (d.m||'').trim();
    const nick = cardManagers[card];
    if(!nick){ results.push({ id:d.id, s:d.s, card, skip:'담당자 미지정' }); continue; }
    const slackId = slackIdOf(nick);
    if(!slackId){ results.push({ id:d.id, s:d.s, nick, skip:'슬랙ID 없음' }); continue; }
    const renewalStr = ymd(renewal);
    const logKey = d.id+':'+renewalStr;
    if(newLog[logKey]){ results.push({ id:d.id, s:d.s, skip:'이미 발송됨' }); continue; }
    if(isWeekend){ results.push({ id:d.id, s:d.s, skip:'주말(영업일 대기)' }); continue; }
    const koName = koMap[nick] || nick;
    const text = buildMsg(koName, d.s, renewalStr, days, d.a, card);
    if(dry){ results.push({ id:d.id, s:d.s, nick, to:slackId, would_send:true }); continue; }
    const r = await sendDM(token, slackId, text);
    results.push({ id:d.id, s:d.s, nick, to:slackId, sent: !!r.ok, err: r.ok?undefined:(r.error||'') });
    if(r.ok) newLog[logKey] = new Date().toISOString();
  }

  // 오래된 로그 정리 + 저장
  if(!dry){
    const cutoff = ymd(new Date(kstToday.getTime() - 45*86400000));
    Object.keys(newLog).forEach(function(k){
      const dt = k.split(':')[1] || '';
      if(dt && dt < cutoff) delete newLog[k];
    });
    try {
      await sql`INSERT INTO app_settings (key,val,updated_at) VALUES ('notify_log', ${JSON.stringify(newLog)}, now())
        ON CONFLICT (key) DO UPDATE SET val=EXCLUDED.val, updated_at=now()`;
    } catch(_){}
  }

  return res.status(200).json({ ok:true, dry: !!dry, today: ymd(kstToday), weekend: isWeekend, count: results.length, results });
}
