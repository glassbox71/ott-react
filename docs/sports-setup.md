# 스포츠 페이지 연결

`/sports`는 ESPN 축구 스코어보드 API(프리미어리그·라리가·분데스리가·K리그1)에서 오늘부터 14일간의 경기 일정·점수를 30초마다 조회합니다. 일부 리그만 조회에 성공하면 해당 경기와 조회 실패 안내를 함께 표시합니다. 실제 편성이 6개 미만이면 명시적으로 표시된 미리보기 카드로 채웁니다. 미리보기는 실제 생중계가 아니며 채팅을 열지 않습니다.

## 공개 중계 자동 검색

스포츠 페이지는 기본으로 FIFA 공식 채널의 현재 라이브 플레이어(`https://www.youtube.com/embed/live_stream?channel=UCpcTrCXblq78GZrTUTLWeBw`)에 연결합니다. API 키 없이 요청할 수 있지만 현재 방송 여부·국가별 재생 가능 여부는 확인되지 않았습니다. 방송이 없거나 채널 임베드가 지원되지 않으면 YouTube에서 오류를 표시할 수 있습니다. 화면의 공식 채널 링크로 직접 확인하고 플레이어를 다시 연결할 수 있습니다. 이 채널 항목은 확인된 LIVE 경기 수에 포함하지 않습니다.

`VITE_YOUTUBE_API_KEY`로 YouTube Data API v3를 호출합니다. 기본은 축구·soccer·football match 공개 라이브 검색(최대 50개)입니다. FIFA 공식 필터는 공식 채널 ID를 확인해 해당 채널로 제한합니다. videos.list에서 공개 여부, 실제 방송 시작·종료, 임베드 허용을 확인하고 동시 시청자 수로 정렬합니다. TOP 5를 별도로 표시하며 적으면 실제 개수를 안내합니다. 제목에 명확한 게임·시뮬레이션·해설·관계없는 방송을 제외하지만 모든 영상의 경기 내용·중계 권한을 보증하지는 않습니다.

5분 캐시와 자동 갱신을 사용하며 새로고침도 캐시를 따릅니다. 키는 브라우저에 공개되므로 HTTP referrer/API 사용 제한을 설정하세요. 많은 사용자가 접속하는 서비스에는 서버 캐시가 필요합니다. 환경 변수는 빌드 때 삽입되므로 배포 플랫폼에 설정하고 다시 빌드해야 합니다.

비교 저장소 wavve-test의 기존 YouTube 설정으로 실제 search.list와 videos.list 조회가 성공했습니다. FIFA 공식 채널에서 당시 검색된 공개 라이브는 0개였고, 다른 채널의 축구 방송은 확인됐습니다. 참고 저장소의 키는 로컬의 Git에서 제외된 .env.local에서만 재사용했고 값은 소스나 문서에 기록하지 않았습니다. 이 결과가 운영 사이트의 환경 변수 설정 또는 영상 재생을 보장하지는 않습니다.

GitHub 저장소의 홈페이지 링크는 https://ott-react-zeta.vercel.app 입니다. vercel.json은 Vite 빌드와 /sports의 SPA 경로 처리를 준비합니다. 배포 플랫폼 권한·환경 변수와 실제 배포 결과는 별도로 확인해야 합니다.

## Firebase와 경기별 채팅

기존 Firebase VITE 환경 변수 6개를 설정하고 Google 로그인을 활성화하세요. 앱 도메인을 Firebase Auth 승인 도메인에 등록해야 합니다. 환경 변수는 기존 firebase/firebase.js에서 사용합니다. 설정이 없으면 스포츠 화면을 보여주고 채팅 연결 대기를 안내합니다.

Firestore의 `sportsBroadcasts/{gameId}`에 관리자가 중계를 등록할 수도 있습니다. 축구 ESPN 이벤트 ID에 `football-espn-` 접두사를 붙인 값을 문서 ID로 쓰면 해당 경기 일정과 합쳐집니다. 다른 경기에는 `football-`로 시작하는 고유한 ID를 사용하세요. sport가 football인 편성만 표시해 기존 야구 경기·채팅과 섞이지 않게 합니다.

필드: `sport`(반드시 `football`), `home`(문자열), `away`(문자열), `venue`(문자열), `startsAt`(ISO 문자열), `live`(불리언), `status`(문자열), `streamUrl`(문자열). 선택적으로 `homeScore`, `awayScore`, `title`을 입력할 수 있습니다. 종료 시 live를 false로 변경하세요. 허용 URL은 HTTPS YouTube `/embed/VIDEO_ID` 및 직접 재생 가능한 HTTPS mp4/webm입니다. 방송 제공처가 허용하는 영상만 등록하세요.

채팅은 `sportsRooms/{gameId}/messages`에 저장하고 최근 100개를 구독합니다. 로그인한 사용자는 `presence` 하위 컬렉션에 탭별 하트비트를 30초마다 기록합니다. 90초 안에 접속한 고유 uid 수를 표시합니다(최근 500개 접속 세션 기준, 익명 시청자 제외). 오래된 presence 문서는 서버의 정리 작업이 필요합니다. 실제 서비스의 스팸 방지·관리자 삭제·보관 정책은 서버에서 추가하세요.

`docs/sports-firestore.rules`의 match 블록을 기존 프로젝트 보안 규칙에 병합하세요. 기존 사용자 데이터 규칙을 대체하지 마세요. 넓은 기존 allow 규칙이 있으면 이 제약도 무력화되므로 검토해야 합니다. 배포 권한/프로젝트 설정이 없어 이 작업에서는 규칙을 배포하지 않았습니다.

## 검증

`node --test tests/sports.test.mjs`, `npm run build`, `npx eslint src/pages/Sports.jsx src/features/sports/*.js src/features/sports/*.jsx src/firebase/firebase.js`.
설정 이후 두 개의 로그인된 브라우저로 같은 실제 경기를 선택해 메시지 송수신·접속자 표시·경기 전환 격리를 확인하세요. 다른 경기를 선택했을 때 해당 경기 메시지만 보여야 합니다. API 키/프로젝트 설정 없는 실행에서는 이 다중 사용자 검증을 수행할 수 없습니다.

## 학생용 재사용 프롬프트

[스포츠 페이지 제작 프롬프트](sports-prompt.md)를 참고하세요.
