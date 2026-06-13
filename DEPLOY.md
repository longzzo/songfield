# 배포 가이드 — 멀티 카드 결투

클라이언트는 **GitHub Pages**(정적), 멀티플레이 서버는 **PartyKit**(별도 클라우드)로 배포합니다.
둘은 분리돼 있고, 클라이언트가 WebSocket으로 PartyKit 서버에 붙습니다.

> 아래 단계 중 **로그인/계정**이 필요한 부분(`gh`, `partykit`)은 직접 실행해야 합니다.

---

## 0. 로컬에서 먼저 실행 (검증 완료된 흐름)

터미널 2개:

```bash
# 터미널 A — 멀티 서버
npm install
npm run dev            # PartyKit dev → http://127.0.0.1:1999

# 터미널 B — 클라이언트
npm run serve          # http://localhost:8080
```

브라우저에서 **http://localhost:8080** 을 두 탭으로 열고, 한쪽에서 "방 만들기" 후 표시된
방 코드를 다른 탭의 "코드로 참가"에 입력하면 참가자/준비/채팅이 실시간 동기화됩니다.

> `file://` 로 직접 열면 안 됩니다(상대경로·소켓 호스트 판별 때문). 반드시 `npm run serve` 로 띄우세요.

---

## 1. PartyKit 서버 배포

```bash
npx partykit login      # GitHub 계정으로 OAuth 로그인
npx partykit deploy     # 배포 → 호스트 출력: card-duel.<당신의-유저명>.partykit.dev
```

배포 후 출력된 **프로덕션 호스트**를 클라이언트에 반영합니다.

`index.html` 안의 이 줄을 실제 호스트로 교체:

```js
: "card-duel.YOUR-PARTYKIT-USERNAME.partykit.dev"; // TODO: 실제 호스트로 교체
```

예) `: "card-duel.back10092.partykit.dev";`

---

## 2. GitHub Pages 배포

이 폴더(`card-duel`)를 리포 루트로 푸시하고, Pages를 `main` 브랜치 루트에서 서빙합니다.
(`node_modules`, 14MB 단일파일은 `.gitignore`로 제외되어 배포되지 않습니다.)

`gh` CLI 사용 시:

```bash
cd card-duel
git init -b main
git add -A
git commit -m "멀티 카드 결투: PartyKit 멀티플레이 + Pages 배포"
gh repo create card-duel --public --source=. --remote=origin --push
gh api -X POST repos/{owner}/card-duel/pages -f "source[branch]=main" -f "source[path]=/"
```

`gh` 가 없으면: GitHub에서 공개 리포 생성 → `git remote add origin <URL>` → `git push -u origin main`
→ 리포 **Settings → Pages → Source: Deploy from a branch → main / (root)** 선택.

배포 주소: `https://<유저명>.github.io/card-duel/`

> 1번에서 프로덕션 호스트를 먼저 교체한 뒤 푸시해야 Pages에서 멀티가 동작합니다.
> (교체를 깜빡했다면 수정 후 다시 commit/push 하면 Pages가 갱신됩니다.)

---

## 현재 범위 (Phase 1) 와 다음 단계

- **지금 진짜 멀티인 것**: 방 생성/참가, 참가자 목록, 준비 상태, 채팅, 접속/끊김 표시.
- **임시 한계**: 전투 자체는 각 클라이언트의 로컬 엔진에서 "자기 자신" 좌석으로 진행됩니다.
  여러 사람이 같은 방에서 시작하면 전투 화면은 각자 따로 돌아갑니다.
- **다음(Phase 2)**: 엔진을 PartyKit 서버로 옮겨 전투를 서버 권위로 동기화 + 빈자리 서버 AI.
  자세한 계획은 plan 파일 참고.
