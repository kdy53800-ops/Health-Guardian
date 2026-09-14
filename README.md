# Health Guardian

해운대 나눔과행복병원 건강 기록 서비스입니다.

## 배포 환경변수

Vercel 프로젝트에 다음 값을 설정합니다.

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`
- `SESSION_SECRET`: 충분히 긴 임의 문자열. 없으면 기존 네이버 비밀키를 사용하지만 별도 설정을 권장합니다.
- `TEST_LOGIN_PASSWORD`: 로고 연속 클릭으로 여는 가상 테스트 계정의 서버 검증 비밀번호

## 데이터베이스 변경

`supabase/migrations`의 SQL 파일을 파일명 순서대로 적용합니다. 인바디 결과 이미지는 비공개 버킷에 저장되며, 로그인과 권한을 확인하는 `/api/inbody-image`를 통해서만 조회합니다.
