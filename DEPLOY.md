# 배포 가이드 — 멀티 카드 결투

클라이언트는 **GitHub Pages**(정적), 멀티플레이 서버는 **Cloudflare Workers**(무료 `*.workers.dev`)로
배포합니다. 둘은 분리돼 있고, 클라이언트가 WebSocket으로 Workers 서버에 붙습니다.

> 서버는 `partyserver`(Cloudflare 네이티브, PartyKit 후속) 위에서 돌고 `wrangler`로 배포합니다.
> PartyKit 관리형 호스팅(`*.partykit.dev`)이나 그 로그인은 더 이상 쓰지 않습니다.
> 로그인은 Cloudflare 자체 OAuth(`wrangler login`)라 안정적입니다.

> 아래 중 **로그인/계정**이 필요한 부분(`wrangler`, GitHub Pages)은 직접 실행해야 합니다.

---

## 0. 로컬에서 먼저 실행 (검증된 흐름)

터미널 2개:

```bash
# 터미널 A — 멀티 서버 (Cloudflare Workers 로컬 에뮬레이터)
npm install
npm run dev            # wrangler dev → http://127.0.0.1:8787

# 터미널 B — 클라이언트
npm run serve          # http://localhost:8080
```

브라우저에서 **http://localhost:8080** 을 두 탭으로 열고, 한쪽에서 "방 만들기" 후 표시된
방 코드를 다른 탭의 "코드로 참가"에 입력하면 참가자/준비/채팅이 실시간 동기화됩니다.

> `file://` 로 직접 열면 안 됩니다(상대경로·소켓 호스트 판별 때문). 반드시 `npm run serve` 로 띄우세요.

---

## 1. 멀티 서버 배포 (Cloudflare Workers, 무료)

Cloudflare 계정이 필요합니다(무료). 없으면 https://dash.cloudflare.com/sign-up 에서 가입.

```bash
npx wrangler login      # 브라우저가 열리고 Cloudflare 계정으로 OAuth 승인
npx wrangler deploy     # 배포 → 호스트 출력: card-duel.<당신의-서브도메인>.workers.dev
```

> 처음 배포 시 워커 서브도메인(`<서브도메인>.workers.dev`)을 한 번 정하라고 할 수 있습니다.
> Durable Objects는 무료 플랜에서 SQLite 기반으로 동작하므로 추가 결제가 필요 없습니다.

배포 후 출력된 **프로덕션 호스트**를 클라이언트에 반영합니다.

`index.html` 안의 이 줄을 실제 호스트로 교체:

```js
: "card-duel.YOUR-SUBDOMAIN.workers.dev"; // TODO: `wrangler deploy` 후 실제 호스트로 교체
```

예) `: "card-duel.back10092.workers.dev";`

---

## 2. GitHub Pages 배포

이 폴더를 리포 루트로 푸시하고, Pages를 `main` 브랜치 루트에서 서빙합니다.
(`node_modules`, 14MB 단일파일은 `.gitignore`로 제외되어 배포되지 않습니다.)

GitHub에서 리포 **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`** 선택.

배포 주소: `https://<유저명>.github.io/<리포명>/`

> 1번에서 프로덕션 호스트를 먼저 교체한 뒤 `main`에 푸시해야 Pages에서 멀티가 동작합니다.
> (교체를 깜빡했다면 수정 후 다시 commit/push 하면 Pages가 갱신됩니다.)

---

## 현재 범위 (Phase 1) 와 다음 단계

- **지금 진짜 멀티인 것**: 방 생성/참가, 참가자 목록, 준비 상태, 채팅, 접속/끊김 표시.
- **임시 한계**: 전투 자체는 각 클라이언트의 로컬 엔진에서 "자기 자신" 좌석으로 진행됩니다.
  여러 사람이 같은 방에서 시작하면 전투 화면은 각자 따로 돌아갑니다.
- **다음(Phase 2)**: 엔진을 서버(Workers)로 옮겨 전투를 서버 권위로 동기화 + 빈자리 서버 AI.
  자세한 계획은 `PLAN.md` 참고.
