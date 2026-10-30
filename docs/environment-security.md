# 운영 환경변수 보호

## 2026-10-30 적용

Vercel `health-guardian-snh` 프로젝트의 다음 환경변수를 Config에서 Secret
유형으로 변경했다.

- `NAVER_CLIENT_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`

Vercel API에서 `type`만 `sensitive`로 변경했으며, 기존 값과 환경 범위는
변경하지 않았다. 변경 후 두 변수의 유형이 `sensitive`인지 다시 조회해
확인했다. 이 작업은 키의 재발급 또는 유출된 키의 폐기가 아니다.

Secret은 배포에서 계속 사용되지만 대시보드나 환경변수 조회에서 원래 값을
다시 읽을 수 없다. 비밀값을 문서, 소스 코드, 로그에 기록하지 않는다.

## 이후 변경 시

- 값을 변경한 경우 새 배포를 실행하고 네이버 로그인과 DB 연동을 확인한다.
- 키 유출이 의심되면 서비스 제공자에서 키를 교체하고 Vercel에도 새 값을
  등록한다. Secret 유형 변경만으로 이미 유출된 키가 폐기되지는 않는다.
- 운영·미리보기·개발 환경은 장기적으로 별도 계정 및 DB와 연결한다.
  같은 제공자의 키를 임의의 문자열로 바꾸면 로그인과 DB 연동이 실패한다.
- 기존 배포에는 이전 설정이 남으므로, 이전 배포 접근 권한과 프로젝트
  구성원의 권한도 함께 관리한다.

참고: [Vercel Config / Secret 유형](https://vercel.com/changelog/environment-variables-now-use-config-and-secret-types)
