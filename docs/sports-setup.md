# 야구 라이브 /sports

수정 대상은 `glassbox71/ott-react`입니다. `glassbox71/wavve-test`의 공개 YouTube 라이브 검색·영상 검증·시청자 순위·Firestore 채팅 방식을 참고했습니다.

## 화면과 데이터

- 기본: 공개 야구 라이브 전체 검색. 인기 TOP 5와 나머지 전체 목록을 표시합니다.
- WBSC 공식: 실제 확인한 공식 채널 ID `UC-UXjExO348UiOCxazH69hA`로 제한합니다.
- FIFA · 축구: 사용자의 요청에 따라 유지한 별도 축구 필터입니다. FIFA 방송을 야구로 표시하지 않습니다.
- 예시 카드, 하이라이트, 채널 주소만 넣은 플레이어는 없습니다. 검색 결과가 적으면 실제 개수만 표시합니다.

YouTube `search.list`는 `eventType=live`, `type=video`, `videoEmbeddable=true`, `order=viewCount`와 야구/baseball 검색어를 사용합니다. 최대 50개 후보를 `videos.list`로 다시 조회해 공개·임베드 허용·실제 방송 시작·미종료·live 상태를 확인합니다. 제목으로 명확한 게임·시뮬레이션·해설·카드 개봉·소프트볼 등을 제외합니다. 메타데이터 필터만으로 모든 영상 내용과 방송 권한을 보증하지는 않습니다.

동시 시청자 수 내림차순으로 정렬하며, 비공개 수치는 숫자를 만들어 넣지 않습니다. 5분 캐시와 자동 갱신을 사용합니다. 새로고침도 캐시를 사용하며 마지막 실제 조회 시간을 유지합니다. 조회 실패·키 누락·할당량 초과·성공했지만 결과 없음이 구분됩니다. 방송 종료·지역 제한은 YouTube 플레이어에서 발생할 수 있어 원본 링크를 함께 제공합니다.

## 환경 변수와 실행

`VITE_YOUTUBE_API_KEY`와 기존 `VITE_FIREBASE_*` 설정을 사용합니다. 값을 채팅·로그·소스에 기록하지 마세요. 브라우저 Vite 변수는 빌드 결과에 포함되므로 API 키의 HTTP referrer/API 사용 제한을 설정하고 서버 비밀 키를 넣지 마세요.

```sh
npm ci
npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
npm run build
npm run test:sports
npx eslint src/pages/Sports.jsx src/features/sports/*.js src/features/sports/*.jsx
```

`.env.local`은 Git에서 제외됩니다. 비교 저장소의 기존 YouTube 클라이언트 설정은 로컬 검증에서만 재사용했습니다. 배포 환경 변수는 Vercel 프로젝트에서 별도로 확인하고 변경 후 다시 빌드해야 합니다. 다른 Firebase 프로젝트의 설정이나 사용자 데이터를 이 프로젝트에 복사하지 않습니다.

## Firebase 채팅

기존 Google 로그인 사용자는 해당 계정을 사용하며, 비로그인 방문자는 Firebase Anonymous Auth로 자동 입장합니다. 운영 프로젝트에서 Anonymous 제공자를 활성화해야 합니다. [구글 로그인·게스트 채팅 진단](auth-and-guest-chat.md)을 참고하세요. `sportsRooms/{sport}-youtube-{videoId}/messages`에 메시지를 저장하고 최근 100개를 `onSnapshot`으로 구독합니다. 최초 서버 동기화가 확인되면 전송을 활성화합니다. 이후 일시적인 오프라인에서도 메시지를 숨기지 않고 전송 대기를 표시합니다. 저장 거부 시 작성 내용을 화면에 남기고 재전송을 제공합니다. 접속자 집계 실패는 메시지 송수신과 분리합니다. [저장·접속자 오류 진단](chat-troubleshooting.md)을 참고하세요. 방송 선택 변경 시 구독을 해제하므로 다른 방송의 채팅이 섞이지 않습니다.

`presence` 하위 컬렉션은 탭별 30초 하트비트와 90초 유효 기간을 사용합니다. 최근 500개 세션의 고유 로그인 사용자 수이며 익명 시청자 수와는 다릅니다. 종료·충돌로 남은 오래된 세션은 운영 서버에서 정리해야 합니다.

`docs/sports-firestore.rules`의 match 블록을 기존 Firebase 보안 규칙 안에 병합하세요. 기존 규칙을 통째로 교체하지 마세요. 인증 UID·필드·메시지 길이·서버 시간·presence 소유자를 검증하며 클라이언트의 메시지 수정·삭제를 금지합니다. 기존의 넓은 allow 규칙은 이 제약을 무력화할 수 있으므로 함께 검토해야 합니다.

## 두 사용자 통합 테스트

Java 21 이상과 Firestore 에뮬레이터가 필요합니다. 에뮬레이터는 실제 운영 Firebase 설정이나 로그인 비밀번호를 사용하지 않습니다.

```sh
npx firebase-tools@15.34.0 emulators:start --only auth,firestore --project demo-ott-sports --config firebase.emulators.json
# 별도 터미널
FIRESTORE_EMULATOR_HOST=127.0.0.1:18080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:19099 npm run test:sports:chat
```

테스트는 문서의 실제 보안 규칙을 로드해 서로 다른 인증 UID 두 개의 실시간 메시지 송수신, 방송별 격리, 미인증 읽기 거부, 발신 UID 위조·긴 메시지·수정·삭제 거부, presence 소유자를 확인합니다. `FIRESTORE_EMULATOR_HOST`가 없으면 이 테스트는 명시적으로 SKIP 처리합니다. SKIP을 통과로 보고하면 안 됩니다.

GitHub Actions의 `.github/workflows/sports-check.yml`도 같은 통합 테스트를 실행합니다. 테스트 환경은 `demo-ott-sports`이며 운영 데이터나 비밀번호를 사용하지 않습니다. 워크플로 파일 저장·푸시와 CI 실행 성공은 별개이므로 실제 결과를 확인하세요.

이 환경에서는 공식 `storage.googleapis.com` 에뮬레이터 다운로드가 프록시의 403 응답으로 막혔습니다. 로컬 통합 테스트는 SKIP 상태였습니다. 이후 [GitHub Actions 실행 #1](https://github.com/glassbox71/ott-react/actions/runs/39543184163)의 Two-user Firestore integration and rules 단계가 성공해, 에뮬레이터에서 두 인증 사용자의 실시간 송수신·방송별 격리·보안 규칙을 검증했습니다. 운영 Firebase 프로젝트의 로그인·채팅은 여전히 별도 검증이 필요합니다. 패키지·TLS·체크섬 검증을 끄거나 출처 불명 JAR로 대체하지 않았습니다.

## 배포

저장소에 등록된 기존 배포 주소는 https://ott-react-zeta.vercel.app 입니다. `vercel.json`은 Vite 빌드와 `/sports` 직접 접근의 SPA 처리를 설정합니다. GitHub main 반영과 Vercel 배포 성공은 별개입니다. 연결된 Vercel 프로젝트의 빌드 환경 변수·실제 배포 결과를 확인한 뒤 운영 `/sports`에서 재생·로그인·채팅을 검증해야 합니다.

## 학생용 프롬프트

[재사용 프롬프트](sports-prompt.md)를 참고하세요. 요구사항만 복사해도 결과가 자동으로 같아지는 것은 아닙니다. 기존 코드·환경 변수·접근 권한·실제 검증 결과를 함께 확인해야 합니다.

## 이번 인스턴스 검증 범위

실제 YouTube API 메타데이터로 야구 목록과 TOP 5를 확인했습니다. 브라우저 API 통합 테스트는 호스트의 정상 TLS 신뢰 설정을 사용하는 테스트용 네트워크 전달기를 사용했고, 목록·필터·선택·모바일 화면을 검증했습니다. 이것은 실제 영상 재생 검증과 별개입니다. 실제 YouTube privacy 플레이어 HTTP 응답은 200이었으나, 브라우저에서는 i.ytimg.com 프록시 차단과 인증서 오류가 발생해 영상 재생 성공을 확인하지 못했습니다. TLS 검증은 끄지 않았습니다.
