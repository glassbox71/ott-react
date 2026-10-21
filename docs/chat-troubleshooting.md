# 채팅 메시지가 사라지거나 접속자 동기화가 실패할 때

채팅은 Firebase **Cloud Firestore** 데이터베이스에 저장합니다. Cloud Storage 버킷 용량과는 별개입니다. 기존 화면의 ‘접속자 상태를 동기화하지 못했습니다’는 오류 코드를 버린 안내여서, 이 문구만으로 저장 용량·권한·네트워크 중 원인을 확정할 수 없습니다.

## 수정한 코드 문제

- 메시지 구독이 캐시로 전환되면 기존 메시지까지 숨기던 조건을 제거했습니다. 서버 저장 대기와 저장 실패를 메시지마다 구분합니다.
- 접속자 조회·저장과 메시지 조회·저장 오류를 분리했습니다. 접속자 쓰기 실패가 채팅을 막거나, 메시지 스냅샷이 접속자 오류를 지우지 않습니다. 집계 실패는 0명으로 표시하지 않습니다.
- 거부된 메시지는 Firestore의 로컬 롤백 이후에도 화면에 남습니다. 같은 문서 ID로 다시 전송하므로 재전송용 중복 메시지를 만들지 않습니다. 확인되지 않은 전송은 성공으로 표시하지 않습니다.
- 서버 승인이 스냅샷보다 먼저 와도 승인된 메시지를 유지합니다. 임시 메시지는 해당 화면의 메모리에만 있으며 새로고침·방 이동 후 복원을 보장하지 않습니다.
- 구독이 권한 오류로 종료되면 ‘채팅 연결 다시 확인’으로 새 구독을 시작할 수 있습니다.

## 운영 오류 코드별 조치

| 화면 코드 | 의미 및 확인 사항 |
| --- | --- |
| permission-denied | Firestore 규칙이 거부했습니다. 현재 Vercel의 Firebase 프로젝트와 규칙을 게시한 프로젝트가 같은지 확인하고, 기존 규칙의 `match /databases/{database}/documents` 안에 [스포츠 규칙](sports-firestore.rules)을 병합·게시하세요. 기존 users 등 다른 규칙을 삭제하지 마세요. |
| unauthenticated | Firebase Auth 익명 인증과 현재 세션을 확인하세요. 인증 없는 공개 쓰기는 허용하지 않습니다. |
| unavailable / deadline-exceeded | Firestore 연결, 브라우저 네트워크 차단과 일시 장애를 확인하세요. |
| resource-exhausted | Firestore 프로젝트의 사용량·할당량을 확인하세요. |
| not-found / failed-precondition | 연결 프로젝트의 기본 `(default)` Firestore 데이터베이스 생성 여부를 확인하고, 색인 오류가 있다면 Firebase Console에서 해당 색인을 확인하세요. |

라운지 경로는 `sportsRooms/baseball-lounge/messages` 및 `sportsRooms/baseball-lounge/presence`입니다. 축구는 `football-lounge`, 방송별 방은 `{sport}-youtube-{videoId}`입니다. rules 파일의 두 match 블록은 라운지와 방송별 방 모두에 적용됩니다. 상위 sportsRooms 문서를 먼저 생성할 필요는 없습니다.

규칙만 게시했다면 Vercel 재빌드는 필요 없습니다. Vite Firebase 환경 변수를 변경했다면 재배포가 필요합니다. 접속자 저장만 permission-denied라면 presence 규칙을 확인하고, 메시지 저장도 거부되면 messages 규칙도 함께 확인하세요. Firebase App Check를 강제하는 프로젝트라면 해당 웹 앱의 App Check 등록도 점검하세요.

## 검증 범위

`npm run test:sports:ui`는 Chromium에서 실제 LiveChat 컴포넌트와 **모의 Firebase 전송 계층**으로 접속자 권한 거부 중 전송, 캐시 전환, 메시지 거부 후 보존, 재전송과 승인, 모바일 가로 넘침을 검증합니다. Chrome/Chromium 경로는 `CHROME_PATH`로 지정할 수 있습니다.

`npm run test:sports:chat`는 Auth·Firestore **실제 에뮬레이터**가 필요하며, 두 익명 사용자의 송수신·UID 검증·방 분리·접속자 생성과 heartbeat 갱신을 검사합니다. GitHub Actions에서 두 에뮬레이터를 함께 실행합니다.

운영 사이트 접속은 이 작업 환경의 프록시에서 403으로 차단됐고 운영 Firebase 관리 권한도 제공되지 않았습니다. 따라서 운영 오류 코드는 미확인이고, 운영 규칙 게시 및 운영 채팅 성공은 이 코드 검증과 구분해야 합니다.
