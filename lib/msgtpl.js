// 알림 문구 템플릿: 기본값 + 치환 렌더링 + DB(app_settings.msg_templates) 로드
// 사용자가 앱의 "알림 문구" 탭에서 직접 수정할 수 있고, 저장 안 했으면 기본값을 쓴다.

export const DEFAULT_TEMPLATES = {
  // 연결제 갱신 임박 DM
  renewal:
'👋 {이름} 안녕하세요!\n' +
'\n' +
'담당하고 계신 *{서비스}* 연결제 갱신일이 곧 다가와요 📅\n' +
'• 갱신 예정일: *{갱신일}* ({디데이})\n' +
'• 금액: *{금액}* / 카드 끝자리 {카드}\n' +
'\n' +
'사용여부를 확인해주시고 아래 절차대로 진행해주세요.\n' +
'• 사용 O → 갱신 후 결제 내용을 공유해주세요\n' +
'• 사용 X → 갱신 전에 해지 처리해주세요\n' +
'\n' +
'감사합니다 😊',

  // 요금 인상 승인 종료 임박 DM
  hike:
'👋 {이름} 안녕하세요!\n' +
'\n' +
'*{서비스}* 요금 인상 승인 기간이 *{상태}* 📌\n' +
'• 인상 승인 종료일: *{종료일}* ({디데이})\n' +
'• 현재(인상) 금액: *{인상금액}*\n' +
'• 원래 금액: {원금액}\n' +
'\n' +
'승인 기간이 끝나면 원래 요금제로 낮추거나 해지가 필요해요.\n' +
'확인해서 처리 부탁드리고, 완료되면 알려주세요 🙏\n' +
'\n' +
'감사합니다 😊',

  // 수동 단건 알림(갱신일 정보가 없을 때)
  generic:
'👋 {이름} 안녕하세요!\n' +
'\n' +
'담당하고 계신 *{서비스}* 구독 관련해서 확인 부탁드려요 📌\n' +
'• 금액: *{금액}*\n' +
'• 카드 끝자리 {카드}\n' +
'\n' +
'계속 사용/해지 여부 확인 후 처리 부탁드리고, 완료되면 알려주세요 🙏\n' +
'\n' +
'감사합니다 😊',

  // 워크플로 제출 시 스레드 답글(헤더) + 버튼 문구
  workflow:
'🆕 *새 구독 결제 워크플로가 올라왔어요!*\n' +
'{관리자} 확인해서 등록/반영 부탁드려요 🙏',
  workflow_button: '반영하기',

  // 처리 결과 스레드 답글
  result_approved: '✅ *신규 구독으로 등록했어요* — *{서비스}*',
  result_upgraded: '🔁 *기존 구독에 반영했어요* — *{서비스}*',
  result_rejected: '🚫 *거절 처리했어요* — *{서비스}*'
};

// 각 템플릿에서 쓸 수 있는 치환자(프론트 안내용)
export const TEMPLATE_VARS = {
  renewal: ['이름','서비스','갱신일','디데이','금액','카드'],
  hike: ['이름','서비스','상태','종료일','디데이','인상금액','원금액'],
  generic: ['이름','서비스','금액','카드'],
  workflow: ['관리자','서비스'],
  workflow_button: [],
  result_approved: ['서비스'],
  result_upgraded: ['서비스'],
  result_rejected: ['서비스']
};

// {키} 치환. 한 줄 안의 치환자가 "모두 비어있으면" 그 줄은 통째로 뺀다
// (예: 인상금액이 없으면 금액 줄이 통째로 사라짐 → 기존 동작 보존)
export function render(tpl, vars){
  const v = vars || {};
  return String(tpl || '')
    .split('\n')
    .filter(function(line){
      const keys = line.match(/\{([^}]+)\}/g);
      if(!keys || !keys.length) return true;               // 치환자 없는 줄은 유지
      return keys.some(function(k){
        const name = k.slice(1, -1);
        const val = v[name];
        return val !== undefined && val !== null && String(val) !== '';
      });
    })
    .map(function(line){
      return line.replace(/\{([^}]+)\}/g, function(_, name){
        const val = v[name];
        return (val === undefined || val === null) ? '' : String(val);
      });
    })
    .join('\n');
}

// DB에서 사용자 수정본을 읽어 기본값 위에 덮어씌운다
export async function loadTemplates(sql){
  let saved = {};
  try {
    const rows = await sql`SELECT val FROM app_settings WHERE key='msg_templates' LIMIT 1`;
    if(rows && rows[0] && rows[0].val) saved = JSON.parse(rows[0].val) || {};
  } catch(_){ saved = {}; }
  const out = Object.assign({}, DEFAULT_TEMPLATES);
  Object.keys(saved).forEach(function(k){
    if(typeof saved[k] === 'string' && saved[k].trim()) out[k] = saved[k];
  });
  return out;
}
