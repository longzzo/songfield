# 멀티 카드 결투 — 실시간 멀티플레이 + 배포 계획

## Context

`card-duel`는 빌드 없이 CDN React + 브라우저 Babel로 도는 정적 카드 턴제 게임이다.
현재 "멀티플레이"는 **전부 목업**이다 — `app.jsx`의 `useRoom`이 봇·가짜 채팅·가짜 끊김을
로컬에서 시뮬레이션하고, 실제 네트워크가 없다. `engine.js`의 `GameEngine`은 DOM 의존이
거의 없고(`window.setTimeout`만 사용) `pendingRequest` + `emit()` 패턴으로 상태/입력이
깔끔히 분리돼 있어 **서버로 이식하기 좋은 구조**다. 단, `player()`가 항상
`participants[0]`(나)로 고정돼 있다는 가정이 액션 메서드 전반에 박혀 있다.

목표: ① 디자인 소폭 정리, ② GitHub Pages 배포, ③ PartyKit 기반 **서버 권위형** 실시간
멀티플레이를 **단계별**로 구축. 1단계에서 배포 + PartyKit 세팅 + 실시간 로비/채팅을
확실히 동작시키고, 2단계에서 전투 엔진을 서버 권위로 옮긴다.

## 사전 준비 (사용자 작업 — 인증 필요)

- GitHub 계정 + `gh auth login` (Pages용 공개 리포 생성/푸시).
- PartyKit 로그인: `npx partykit login` (GitHub OAuth). 배포는 무료 PartyKit/Cloudflare로.
- PartyKit 배포 후 받은 프로덕션 호스트(`<project>.<user>.partykit.dev`)를 클라이언트
  설정 상수에 기입한다.

---

## Phase 1 — 배포 + PartyKit 세팅 + 실시간 로비/채팅 (먼저 출시)

각 단계 후 동작을 확인하고 진행한다. 이 단계에서 **로비·접속·준비·채팅·끊김 감지가 진짜
멀티**가 된다. 전투 자체는 아직 로컬 엔진으로 돌린다(2단계에서 서버 권위로 전환) — 명시적
임시 한계로 표기.

### 1-A. 리포 구조 & 프로젝트 세팅
- 루트(`card-duel/` 상위 또는 `card-duel/` 자체)를 git 리포로 초기화, `gh repo create`로
  공개 리포 생성.
- 추가 파일:
  - `package.json` — devDeps: `partykit`, `typescript`. scripts: `dev`(partykit dev),
    `deploy`(partykit deploy).
  - `partykit.json` — `{ "name": "...", "main": "party/server.ts" }`.
  - `party/server.ts` — 로비 파티 서버(아래).
- 14MB `멀티 카드 결투 (단일파일).html`은 Pages/배포에서 제외(`.gitignore` 또는 배포 대상에서 빼기).

### 1-B. 클라이언트: partysocket 도입 (무빌드 유지)
- `멀티 카드 결투.html`에 ESM 시브 추가하여 글로벌 노출:
  `<script type="module">import {PartySocket} from 'https://esm.sh/partysocket'; window.PartySocket=PartySocket;</script>`
- 새 설정 상수(예: html 인라인 또는 `net.js`): `PARTYKIT_HOST`
  (dev `127.0.0.1:1999`, prod `<project>.<user>.partykit.dev`).

### 1-C. `useRoom` 재작성 (목업 → 실제 연결)
**파일: `card-duel/app.jsx`** (`useRoom` 전체 교체)
- `new window.PartySocket({ host: PARTYKIT_HOST, room: <방코드> })`로 접속.
- 목업 로직 제거: `BOT_NAMES`/`scheduleBotsReady`/가짜 채팅 인터벌/가짜 disconnect 인터벌.
  봇 채워넣기·채팅·준비·끊김은 서버 메시지로 대체.
- 서버 메시지 핸들러로 `room`/`chat` state 갱신. 송신 액션:
  `join(nickname)`, `toggleReady`, `chat(text)`, `setBots(count)`, `start`.
- `createRoom`/`joinRoom`은 방 코드만 정하고 소켓 연결을 트리거. 코드 검증/방장 결정은 서버가.
- `humanId`는 서버가 배정한 자신의 participant id로 대체(2단계의 viewerId 토대).

### 1-D. 서버: 로비 파티 (`party/server.ts`)
- 파티 1개 = 방 1개(파티 id = 방 코드).
- 상태: `{ players:[{id,nickname,isHost,isReady,isOnline,isBot,aiType}], hostId, status, botCount }`.
- `onConnect`: 좌석 배정, 첫 접속자=host, 전체에 roster 브로드캐스트.
- `onMessage`: ready/chat/setBots/start 처리 후 브로드캐스트. 빈자리는 서버가 봇으로 채움
  (기존 `AI_TYPES`/이름 풀 로직을 서버로 이식).
- `onClose`: 해당 좌석 `isOnline=false`(또는 lobby면 제거), 브로드캐스트 → **진짜 끊김 감지**가
  기존 `DisconnectBanner`를 구동.

### 1-E. 디자인 소폭 수정
**파일: `card-duel/screens.jsx` (LobbyScreen)**, 필요시 `theme.css`
- 부제 "10인 랜덤..." → "최대 10인" 등 인원 표현 통일.
- "참가 인원 (봇 포함)" 라벨 → "최대 인원 · 빈자리는 봇" 취지로 수정(서버 봇 채움과 일치).
- 실제 렌더링 확인이 필요하면 로컬 서빙 후 Preview로 스크린샷 점검.

### 1-F. GitHub Pages 배포
- `card-duel/` 디렉터리 내용을 Pages 사이트 루트로 게시(`gh-pages` 브랜치 또는 `/docs`).
  `gh-pages` npm 패키지로 `card-duel` 폴더만 푸시하는 방식 권장(서버/14MB 파일 제외).
- 리포 설정에서 Pages 소스 지정 → `https://<user>.github.io/<repo>/` 확인.
- PartyKit 서버는 별도로 `npx partykit deploy` → 클라 `PARTYKIT_HOST`(prod) 반영 후 재배포.

**Phase 1 검증**
- 로컬: 터미널 A `npx partykit dev`(:1999), 터미널 B `npx serve card-duel`.
  브라우저 두 탭에서 같은 코드로 입장 → 양쪽 참가자 목록·채팅·준비 상태·끊김 배너가
  실시간 동기화되는지 확인.
- 프로덕션: Pages URL을 두 기기/탭에서 열어 동일 점검.

---

## Phase 2 — 서버 권위형 전투 엔진 (다음 마일스톤)

목표: 전투 상태를 서버가 소유·검증하고, 클라이언트는 입력 전송 + 상태 렌더만. 빈자리는 서버 AI.

### 2-A. 엔진 공유/이식
- `engine.js`를 서버에서 import 가능하게(모듈 export 추가, 브라우저 window 글로벌도 유지하는
  isomorphic 형태). `party/server.ts`가 `GameEngine`을 직접 인스턴스화.
- `window.setTimeout` → `setTimeout`(브라우저/Workers 공용).

### 2-B. 엔진 리팩터: 암시적 `player()` 제거
- `playCard`/`useImprint`/`releaseImprint`/`pray`/`startOffer`/`skipTurn`/`chooseDefense`/
  `forgive`/`submitChoice`/`submitForcedSale`/`submitReplace`/`submitRedistribute`/
  `selectTarget` 등 액션 메서드가 **명시적 actorId**를 받아 `currentActorId`와 검증하도록 변경
  (현재 `this.player()`/`isPlayerTurn()` 직접 의존 부분 — `engine.js:768~890` 영역).
- `pendingRequest`에 `ownerId` 추가 → 방어 모달 등은 해당 플레이어 클라에서만 표시.

### 2-C. 클라이언트 viewerId 파라미터화
- "나" 기준을 서버 배정 id로: `engine.player()` → `state.participants.find(p=>p.id===myId)`,
  `isPlayerTurn` → `currentActorId===myId` 비교.
- 영향 파일: `screens.jsx`(GameScreen의 `me`/`isMyTurn`/`cardClickable`/`cardReason`),
  `components.jsx`, `app.jsx`(`offlineNames`/오버레이 승패 판정), `modals.jsx`(ownerId 게이트).

### 2-D. 서버 전투 루프
- `start` 수신 → 서버가 `engine.newGame(roster)`; `emit()`마다 직렬화 state 브로드캐스트.
- 클라 액션 메시지 → 서버가 해당 actorId로 엔진 호출(검증 실패 시 무시).
- 봇 좌석은 서버에서 `doAITurn` 진행(setTimeout). 재접속 시 좌석/턴 유지.

**Phase 2 검증**
- 두 탭/기기에서 같은 방 입장 → 시작 → 턴이 서로에게 동기화, 내 턴에만 카드 클릭 가능,
  방어 모달이 대상 플레이어에게만 뜸, 한쪽 새로고침 후 재접속해도 상태 복구되는지 확인.

---

## 재사용할 기존 자산
- 엔진 전 로직(전투 공식/카드/AI): `engine.js`의 `GameEngine`, `AI_TYPES`, `doAITurn`,
  `chooseAIDefense` 등 그대로 활용.
- 봇 이름/채팅 풀: `app.jsx`의 `BOT_NAMES`/`CHAT_POOL` → 서버로 이식.
- UI 컴포넌트: `components.jsx`/`modals.jsx`/`screens.jsx` 대부분 유지, "나" 기준만 파라미터화.
- 끊김 UI: `DisconnectBanner`(modals.jsx) — 실제 onClose 신호로 구동.

## 알려진 임시 한계
- Phase 1 동안 전투는 로컬 엔진으로 동작(여러 사람이 같은 방에서 시작하면 전투는 각자 로컬).
  로비/접속/채팅/끊김만 진짜 멀티. 전투 동기화는 Phase 2에서 완성.
