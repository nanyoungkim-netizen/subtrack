# 배포 순서 (Claude가 이어서 할 때 보는 메모)

데이터베이스는 **Neon 프로젝트 `wedding-best`** (id `restless-rice-30609906`, 싱가포르). 표와 설정은 이미 만들어 두었다.
사진 저장소는 Vercel Blob `wedding-best-photos` (Public). 둘 다 Vercel Storage에 있다.
회사 데이터가 있는 다른 Neon 프로젝트는 쓰지 않는다.

1. 새 Neon 프로젝트에 표를 만든다.
   - `settings (k text primary key, v text not null)`
   - `photos (name text primary key, url text not null, w int, h int, created_at timestamptz not null default now())`
   - `voters (name text primary key, state jsonb not null default '{}'::jsonb, picks text[] not null default '{}', updated_at timestamptz not null default now())`
2. `settings`에 넣을 값: `max`(기본 20), `auth_secret`(무작위 문자열), `vote_pw`/`admin_pw`(= sha256(auth_secret + ':' + 암호) 16진수), `vote_pw_plain`(초대 글에 보일 투표 암호).
3. Vercel 프로젝트 `wedding-best`(framework 없음)를 만든다.
4. Storage 화면에서 `wedding-best`(Neon)와 `wedding-best-photos`(Blob)를 이 프로젝트에 **Connect** 한다. 접속 정보(`DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`)가 자동으로 들어간다.
5. 이 브랜치의 파일로 production 배포 → 관리자 암호로 로그인해 사진 1장 올리기, 투표, 갤러리까지 확인.
