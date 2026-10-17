# 배포 순서 (Claude가 이어서 할 때 보는 메모)

이미 끝난 것
- Neon 프로젝트 `neon-violet-lantern` (id `floral-lake-06988942`) 안에 웨딩 전용 데이터베이스 `wedding`이 있다.
  - 표: `settings`, `photos`, `voters`. `settings`에 `max`, `vote_pw`, `admin_pw`, `vote_pw_plain`, `auth_secret`가 들어 있다.
  - 이 사이트용 접속 계정은 `wedding_only` (회사 데이터베이스 표는 못 읽는다. 확인 완료).
    접속 주소의 비밀번호는 저장소에 두지 않는다. 필요하면 `wedding_app` 역할로 `alter role wedding_only password '...'`를 실행해 새로 정한다.
  - 같은 프로젝트의 `neondb`에는 회사 재무 데이터가 있으니 건드리지 않는다.

남은 것 (Vercel 연결에 쓰기 권한이 필요)
1. Vercel 팀 `nanyoungs-projects`에 프로젝트 `wedding-best`를 만든다 (framework 없음).
2. 환경 변수 `DATABASE_URL` = `postgresql://wedding_only:<비밀번호>@ep-falling-moon-aqk897qf-pooler.c-8.us-east-1.aws.neon.tech/wedding?sslmode=require`
3. Blob 저장소를 만들어 이 프로젝트에 연결한다 (`BLOB_READ_WRITE_TOKEN`).
4. 이 브랜치의 파일로 production 배포 → 관리자 암호로 로그인해 사진 1장 올리기, 투표, 갤러리까지 확인.
