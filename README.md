# 웨딩스냅 베스트

여러 사람이 암호로 들어와 웨딩 사진을 고르고, 표를 많이 받은 순서로 갤러리를 보는 사이트.

- 화면: `index.html` (거르기 → 비교 → 최종 N장 → 갤러리, 관리자 화면)
- 서버: `api/*.js` (Vercel Functions)
- 데이터: Neon Postgres (`settings`, `photos`, `voters` 표), 사진 파일: Vercel Blob

## 배포에 필요한 설정
- 환경 변수 `DATABASE_URL`: 웨딩 전용 데이터베이스 접속 주소
- Vercel Blob 저장소를 프로젝트에 연결 (`BLOB_READ_WRITE_TOKEN`이 자동으로 생겨요)

## 내 컴퓨터에서 시험
`npm install && node dev-server.mjs` → http://localhost:3000 (투표 암호 vote1234, 관리자 암호 admin1234, 데이터는 메모리에만 저장)
