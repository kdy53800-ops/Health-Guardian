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
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`: 예약 푸시 알림용 한 쌍의 키. `health-guardian-test`와 `health-guardian-snh`의 Production 환경에 **같은 키 쌍**을 설정합니다. 비공개키를 저장소에 올리지 마세요.
- `VAPID_SUBJECT`: 푸시 발신자 연락처 URL 또는 `mailto:` 주소. 두 프로젝트 각각의 운영 URL을 사용할 수 있습니다.
- `CRON_SECRET`: Supabase Vault의 `health_guardian_cron_secret`과 같은 값. 현재 5분 주기 작업이 호출하는 `health-guardian-test` 프로젝트에 설정합니다.

환경변수를 추가하거나 변경한 후에는 해당 Vercel 프로젝트를 다시 배포해야 합니다. 두 사이트는 같은 Supabase 알림 구독 데이터를 사용하고 예약 발송은 테스트 프로젝트의 작업 엔드포인트에서 수행하므로, VAPID 키를 교체할 때는 두 프로젝트를 함께 변경하세요. 기존에 알림을 켠 사용자는 앱을 다시 열면 새 키로 구독이 갱신됩니다.

## 데이터베이스 변경

`supabase/migrations`의 SQL 파일을 파일명 순서대로 적용합니다. 인바디 결과 이미지는 비공개 버킷에 저장되며, 로그인과 권한을 확인하는 `/api/inbody-image`를 통해서만 조회합니다.
