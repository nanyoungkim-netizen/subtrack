// 구글 로그인 이메일 → 닉네임 매핑 (서버 전용).
// 용도: 리서처가 '본인 카드'인지 판별해 전체번호·CVC 열람을 허용할 때만 사용.
// 출처: 슬랙 워크스페이스(이메일) × SLACK_ID_MAP(닉네임→UID)을 슬랙 UID로 조인. 2026-09-16 생성.
// 사람이 바뀌면 여기만 갱신하면 된다.
export const EMAIL_TO_NICK = {
  "beobjoong.kim@plabfootball.com": "Kikr",
  "byeonghyeon.kim@plabfootball.com": "Funky",
  "dongkyu.kang@plabfootball.com": "Q",
  "geonsoo.kim@plabfootball.com": "Cus",
  "gyeongwon.yun@plabfootball.com": "Beaver",
  "haerang.choi@plabfootball.com": "Rilla",
  "hocheol.kim@plabfootball.com": "IRON",
  "hyeonho.lee@plabfootball.com": "Minu",
  "hyojun.jin@plabfootball.com": "Junta",
  "hyuckhoon.ko@plabfootball.com": "Rokoon",
  "hyungju.mun@plabfootball.com": "Stone",
  "hyunjung.heo@plabfootball.com": "Rami",
  "hyunwoo.oh@plabfootball.com": "Sian",
  "insoo.seo@plabfootball.com": "Hero",
  "jaesol.lim@plabfootball.com": "SALT",
  "jihun.park@plabfootball.com": "Burns",
  "jiyeon.kim@plabfootball.com": "Rooney",
  "jongsa.kim@plabfootball.com": "Aqoo",
  "jongwoo.kim@plabfootball.com": "Woz",
  "jun.fujisawa@plabfootball.com": "YUN",
  "kiwoong.choi@plabfootball.com": "YAMUCHI",
  "kyungmin.kim@plabfootball.com": "Hook",
  "minyoung.lim@plabfootball.com": "Chovy",
  "nanyoung.kim@plabfootball.com": "Mush",
  "noritatsu.echigo@plabfootball.com": "ATO",
  "sanghyun.kim@plabfootball.com": "Lark",
  "seongwon.kim@plabfootball.com": "Sante",
  "seonyoung.lim@plabfootball.com": "Zerry",
  "seungho.shin@plabfootball.com": "Endo",
  "seungjin.cha@plabfootball.com": "Peach",
  "seungkuk.ryu@plabfootball.com": "MacGook",
  "sihyun.kim@plabfootball.com": "Aki",
  "sunjong.yoo@plabfootball.com": "Pepe",
  "suyoung.yang@plabfootball.com": "DDao",
  "taeho.yoon@plabfootball.com": "Pucca",
  "taewon.kim@plabfootball.com": "Turkey",
  "techin.park@plabfootball.com": "Jeongnam",
  "yelim.lee@plabfootball.com": "Yello",
  "yeonju.yu@plabfootball.com": "Lime",
  "yooncheol.shin@plabfootball.com": "dDubi",
  "yoonjung.kim@plabfootball.com": "HODOO",
  "youngkwang.kim@plabfootball.com": "MewTwo",
  "yumin.han@plabfootball.com": "Moomin"
};

// 이메일로 닉네임 찾기(대소문자 무시). 없으면 ''
export function nickOfEmail(email){
  const e = String(email || '').trim().toLowerCase();
  if(!e) return '';
  return EMAIL_TO_NICK[e] || '';
}

// 카드 소유자(user_name)가 이 닉네임의 것인지. 대소문자·공백 무시 비교
export function isOwnCard(cardUserName, nick){
  if(!nick) return false;
  const a = String(cardUserName || '').trim().toLowerCase();
  const b = String(nick).trim().toLowerCase();
  return !!a && a === b;
}
