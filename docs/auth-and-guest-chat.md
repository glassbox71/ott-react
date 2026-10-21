# 구글 로그인 진단과 게스트 채팅

## 코드에서 확인한 문제

1. 기존 로그인은 Google 팝업 인증 이후 Firestore users 문서를 읽고 생성하는 작업까지 완료해야 회원 상태를 저장하고 이동했습니다. 따라서 인증에 성공해도 DB 권한 오류·네트워크 지연 때문에 로그인 실패처럼 보일 수 있었습니다.
2. 오류는 콘솔에만 기록됐고 화면에는 오류·진행 상태가 없었습니다. Firebase 사용자 객체와 프로필 데이터가 콘솔에 기록되는 부분도 제거했습니다.
3. 앱 시작 시 Firebase 인증 상태를 구독하지 않아 새로고침 후 회원 화면이 복원되지 않았습니다.
4. 기존 채팅은 로그인한 Firebase 사용자만 허용하고, 로그인 화면으로 이동하도록 안내했습니다.

현재는 Google 인증 완료 즉시 회원 상태와 화면을 갱신하고 프로필 저장·조회는 백그라운드로 분리합니다. DB 실패는 회원 인증을 취소하지 않고 프로필 경고로 표시합니다. auth 상태를 구독해 세션을 복원하며 익명 사용자는 회원 헤더·찜 기능에 로그인한 것으로 취급하지 않습니다.

## 로그인 없이 채팅

방송이 없거나 중계 조회에 실패해도 스포츠 페이지의 공용 응원 라운지는 사용할 수 있습니다. 방송 선택 후에는 영상별 채팅방으로 분리됩니다.

스포츠 채팅이 열리면 `signInAnonymously`로 게스트 UID를 자동 발급받습니다. 구글 계정이나 로그인 버튼은 필요 없습니다. 기존 Google 인증이 있으면 그 UID를 재사용합니다. 게스트 이름은 UID를 바탕으로 생성한 `게스트 XXXXXX`입니다. 브라우저 저장소를 지우거나 로그아웃하면 다른 게스트 UID가 될 수 있습니다.

서로 다른 방의 메시지와 구독을 분리합니다. Firebase가 발급한 게스트도 `request.auth != null`인 인증 사용자이므로 기존 UID 검증 규칙을 유지할 수 있습니다. **인증 없는 공개 쓰기로 규칙을 풀지 않습니다.** Google 팝업과 게스트 인증이 동시에 진행돼 회원 세션을 덮어쓰는 경합도 방지합니다.

## 운영 Firebase에서 필요한 설정

코드 변경만으로 Firebase Console의 인증 제공자·승인 도메인을 변경할 수는 없습니다. 운영 프로젝트 접근 권한은 이 작업 환경에 없습니다.

1. Firebase Console → Authentication → Sign-in method에서 **Google**과 **Anonymous(익명)**를 활성화하세요. Google 제공자의 프로젝트 지원 이메일도 확인하세요.
2. Authentication → Settings → Authorized domains에 운영 호스트 `ott-react-zeta.vercel.app`과 실제 사용하는 사용자 도메인을 추가하세요. localhost에서 Google 팝업을 테스트할 때는 localhost도 필요합니다.
3. Vercel 프로젝트의 환경 변수에 같은 Firebase 프로젝트의 `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`를 설정하세요. storageBucket·messagingSenderId도 기존 Firebase 웹 설정과 일치시키세요. 변경 후 재배포해야 Vite 번들에 반영됩니다.
4. authDomain은 Firebase에서 받은 인증 도메인(일반적으로 프로젝트.firebaseapp.com)을 사용하세요. 승인 도메인 목록과 authDomain은 서로 다른 설정입니다.
5. 기존 Firestore 규칙에 `docs/sports-firestore.rules` 블록이 배포돼 있는지 확인하세요. users/{uid} 프로필 규칙도 기존 정책에 맞게 점검하세요. 프로젝트 전체 규칙을 이 조각으로 교체하지 마세요.

현재 인스턴스에는 YouTube 설정만 있고 Firebase 인증 설정은 없습니다. 따라서 운영 로그인 실패 원인을 실제 오류 코드로 확정하지는 못했습니다. 승인 도메인·Google 제공자 비활성화는 가능한 운영 원인이며, 실제 발생했다고 단정한 것은 아닙니다.

## 오류 안내

- unauthorized-domain: 운영 호스트 승인 필요
- operation-not-allowed: Google 또는 익명 제공자 활성화 필요
- popup-blocked / popup-closed-by-user: 팝업 허용 또는 재시도
- invalid-api-key / auth-domain-config-required: 프로젝트 웹 설정 점검
- network-request-failed: 인증 서버 연결 점검
- 프로필 경고: 인증은 완료됐지만 Firestore 프로필 동기화가 실패한 상태

인증 오류는 설명과 안전한 오류 코드(auth/… 형태)로 화면에 안내하며 키 값이나 사용자 데이터를 로그에 기록하지 않습니다. 게스트 연결 실패 시 재연결 버튼을 제공합니다. Google 팝업은 사용자 클릭에서 바로 시작해 팝업 차단을 줄입니다.

## 검증

```sh
npm run test:auth
npm run test:sports
npm run build
npx eslint src/App.jsx src/store/useAuthStore.js src/store/useHeartStore.js src/pages/Login.jsx src/pages/SelectMember.jsx src/firebase/firebase.js src/features/auth/*.js src/features/sports/*.js src/features/sports/*.jsx
npx firebase-tools@15.34.0 emulators:start --only auth,firestore --project demo-ott-sports --config firebase.emulators.json
# 별도 터미널
FIRESTORE_EMULATOR_HOST=127.0.0.1:18080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:19099 npm run test:sports:chat
```

인증 단위 테스트는 프로필 대기·실패와 인증 성공의 분리, 오류 안내, 세션 복원, 로그아웃 후 늦은 응답 차단, 게스트 연결 중복·경합 방지를 검증합니다. Auth 에뮬레이터에서 서로 다른 두 실제 익명 세션 발급을 로컬로 확인했습니다. 브라우저에서도 자동 게스트 입장과 회원 헤더 분리를 확인했습니다. CI는 Auth+Firestore 에뮬레이터에서 두 익명 세션의 실제 메시지 송수신과 기존 보안 규칙을 추가 검증합니다.

에뮬레이터 검증은 운영 Google OAuth 승인·운영 Firebase의 제공자 설정과 별개입니다. 실제 운영 계정 로그인과 운영 게스트 채팅은 위 설정을 적용한 뒤 별도 확인해야 합니다.
