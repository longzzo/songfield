/* =========================================================
  멀티 카드 결투 — 로비 서버 (Phase 1)
  Cloudflare Workers + Durable Objects (partyserver) 위에서 동작.
  방 1개 = Durable Object 인스턴스 1개 (이름 = 방 코드).
  참가자 좌석 / 호스트 / 준비 / 채팅 / 봇 채움 / 끊김을 서버가 관리하고
  접속된 모든 클라이언트에 브로드캐스트한다.

  무료 *.workers.dev 로 `wrangler deploy` 하면 끝. (PartyKit 관리형 호스팅 불필요)
  클라이언트는 partysocket 으로 /parties/card-duel/<방코드> 에 붙는다.

  Phase 1 범위: 로비·접속·준비·채팅·끊김만 진짜 멀티.
  실제 전투 동기화(서버 권위 엔진)는 Phase 2에서 추가한다.
========================================================= */
import {
  Server,
  routePartykitRequest,
  type Connection,
  type ConnectionContext,
} from "partyserver";
// 브라우저와 공용인 게임 엔진(CommonJS). 서버에서 직접 인스턴스화해 전투를 권위적으로 진행.
import { GameEngine } from "../engine.js";

const ACTION_WHITELIST = new Set([
  "playCard", "selectTarget", "cancelTarget", "useImprint", "releaseImprint",
  "pray", "startOffer", "cancelOffer", "skipTurn",
  "chooseDefense", "forgive", "submitChoice", "submitForcedSale", "submitReplace",
  "submitRedistribute", "cancelRedistribute", "submitGuardianChoice", "submitCleanse",
]);
const TURN_TIMEOUT_MS = 35000;        // 온라인 사람의 행동 제한
const OFFLINE_TIMEOUT_MS = 1500;      // 끊긴 좌석은 빨리 자동 처리

const AI_TYPES = [
  "aggressive", "defensive", "alchemist", "trader", "mage",
  "holy", "vengeful", "opportunist", "chaotic",
];
const BOT_NAMES = [
  "라그나", "실비아", "도윤", "카이엔", "모리안", "유진", "보로미르", "세라핀",
  "한별", "그림", "오딘", "라피스", "테오", "윤하", "발더", "미라",
];
const READY_LINES = ["준비 완료!", "가시죠", "ㅇㅋ 레디", "기다리고 있었어요", "한 판 합시다", "준비됐습니다"];
const CHAT_POOL = [
  "이번 판은 누가 이길까요", "전 거래형으로 갈게요", "분노 덱 무섭던데", "방장님 빨리요~",
  "지난 판 아쉬웠어요", "각인 잘 쌓아야 함", "성법 길 가보려고요", "ㅋㅋ 긴장되네",
  "방어구 좀 모아야겠다", "혼란형 진짜 변수임", "이번엔 끝까지 살아남겠어",
];
const REPLY_LINES = ["ㅇㅈ", "ㅋㅋㅋ", "그쵸", "좋네요", "기대됨", "화이팅"];

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;
const START_MIN = 2;

type Player = {
  id: string;
  nickname: string;
  isHost: boolean;
  isReady: boolean;
  isOnline: boolean;
  isBot: boolean;
  aiType: string;
};
type ChatMsg = { id: number; name?: string; text: string; sys?: boolean };
type LobbyStatus = "lobby" | "playing";

interface Env {
  CardDuel: DurableObjectNamespace<CardDuel>;
}

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export class CardDuel extends Server<Env> {
  // 봇 타이머/메모리 상태를 유지해야 하므로 하이버네이션 비활성화.
  static options = { hibernate: false };

  // 사람 좌석: 연결 id -> Player (봇은 별도)
  humans = new Map<string, Player>();
  joined = new Set<string>();
  bots: Player[] = [];
  hostId: string | null = null;
  status: LobbyStatus = "lobby";
  maxPlayers = 8;
  riftOpenRound = 8; // 금역(균열) 개방 라운드 — 방장이 대기실에서 조절
  chat: ChatMsg[] = [];
  chatSeq = 1;
  botSeq = 0;
  botTimers = new Set<ReturnType<typeof setTimeout>>();

  // ----- 서버 권위 전투 -----
  engine: any = null;
  unsub: (() => void) | null = null;
  actionTimer: ReturnType<typeof setTimeout> | null = null;
  timerToken = 0;

  /* ---------- helpers ---------- */
  roster(): Player[] {
    return [...this.humans.values(), ...this.bots];
  }
  pushChat(msg: Omit<ChatMsg, "id">) {
    const m: ChatMsg = { id: this.chatSeq++, ...msg };
    this.chat.push(m);
    if (this.chat.length > 200) this.chat = this.chat.slice(-200);
    this.broadcast(JSON.stringify({ type: "chat", message: m }));
  }
  broadcastRoom() {
    const payload = JSON.stringify({
      type: "room",
      room: {
        code: this.name,
        players: this.roster(),
        hostId: this.hostId,
        status: this.status,
        maxPlayers: this.maxPlayers,
        riftOpenRound: this.riftOpenRound,
      },
    });
    this.broadcast(payload);
  }
  ensureHost() {
    const humans = [...this.humans.values()];
    if (humans.length === 0) { this.hostId = null; return; }
    if (!this.hostId || !this.humans.has(this.hostId)) {
      this.hostId = humans[0].id;
    }
    humans.forEach((p) => { p.isHost = p.id === this.hostId; });
  }

  /* ---------- 봇 추가/제거 (방장이 수동으로) ---------- */
  addBot() {
    if (this.roster().length >= this.maxPlayers) return;
    const usedNames = new Set(this.roster().map((p) => p.nickname));
    const freeNames = shuffle(BOT_NAMES.filter((n) => !usedNames.has(n)));
    const idx = this.botSeq++;
    const nickname = freeNames[0] || `결투자${this.roster().length + 1}`;
    const bot: Player = {
      id: `bot_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      nickname, isHost: false, isReady: false, isOnline: true,
      isBot: true, aiType: pick(AI_TYPES),
    };
    this.bots.push(bot);
    if (this.status === "lobby") this.scheduleBotReady(bot, 0);
  }
  removeBot(id?: string) {
    if (!this.bots.length) return;
    if (id) this.bots = this.bots.filter((b) => b.id !== id);
    else this.bots.pop();
  }
  // 사람은 절대 밀어내지 않고, 정원을 넘는 봇만 제거.
  trimBotsToCapacity() {
    while (this.roster().length > this.maxPlayers && this.bots.length) this.bots.pop();
  }
  scheduleBotReady(bot: Player, i: number) {
    const t = setTimeout(() => {
      this.botTimers.delete(t);
      const live = this.bots.find((b) => b.id === bot.id);
      if (!live || this.status !== "lobby") return;
      live.isReady = true;
      this.broadcastRoom();
      if (Math.random() < 0.7) this.pushChat({ name: live.nickname, text: pick(READY_LINES) });
    }, 900 + Math.random() * 2200 + i * 280);
    this.botTimers.add(t);
  }
  clearBotTimers() { this.botTimers.forEach((t) => clearTimeout(t)); this.botTimers.clear(); }

  /* ---------- 서버 권위 전투 ---------- */
  isInGameSeat(id: string) { return this.humans.has(id); } // 사람 좌석 id == 연결 id == 참가자 id

  startGame() {
    this.stopGame();
    const roster = this.roster().map((p) => ({ id: p.id, nickname: p.nickname, isBot: p.isBot, aiType: p.aiType }));
    this.engine = new GameEngine();
    this.unsub = this.engine.subscribe(() => this.onEngineEmit());
    this.engine.newGame(roster, { riftOpenRound: this.riftOpenRound }); // 내부 emit() → onEngineEmit 으로 초기 상태 브로드캐스트
  }
  stopGame() {
    if (this.unsub) { this.unsub(); this.unsub = null; }
    this.clearActionTimeout();
    this.engine = null;
  }
  onEngineEmit() {
    if (!this.engine) return;
    this.broadcastState();
    this.scheduleActionTimeout();
  }

  // 손패 등 비공개 정보를 관전자/상대에게 가린 뷰를 좌석별로 전송.
  redactState(st: any, viewerId: string) {
    const participants = st.participants.map((p: any) =>
      p.id === viewerId ? p : { ...p, hand: p.hand.map(() => ({ hidden: true })) });
    let pendingRequest = st.pendingRequest;
    if (pendingRequest && pendingRequest.ownerId !== viewerId) {
      pendingRequest = { kind: pendingRequest.kind, ownerId: pendingRequest.ownerId };
    }
    return { ...st, participants, pendingRequest };
  }
  broadcastState() {
    const st = this.engine.state;
    const ranking = st.gameOver
      ? this.engine.finalRanking().map((r: any) => ({ rank: r.rank, id: r.participant ? r.participant.id : null }))
      : null;
    for (const conn of this.getConnections()) {
      conn.send(JSON.stringify({ type: "sync", state: this.redactState(st, conn.id), ranking }));
    }
  }

  // 현재 행동/응답해야 하는 사람 좌석 id (없으면 null).
  activeHumanSeat(): string | null {
    const st = this.engine?.state;
    if (!st || st.gameOver) return null;
    if (st.pendingRequest && this.isInGameSeat(st.pendingRequest.ownerId)) return st.pendingRequest.ownerId;
    if (st.phase === "playerAction" && this.isInGameSeat(st.currentActorId)) return st.currentActorId;
    return null;
  }
  clearActionTimeout() { if (this.actionTimer) { clearTimeout(this.actionTimer); this.actionTimer = null; } }
  scheduleActionTimeout() {
    this.clearActionTimeout();
    const activeId = this.activeHumanSeat();
    if (!activeId) return;
    const online = this.humans.get(activeId)?.isOnline !== false;
    const token = ++this.timerToken;
    this.actionTimer = setTimeout(() => this.autoResolve(activeId, token), online ? TURN_TIMEOUT_MS : OFFLINE_TIMEOUT_MS);
  }
  autoResolve(activeId: string, token: number) {
    if (token !== this.timerToken || !this.engine) return;
    const st = this.engine.state;
    const req = st.pendingRequest;
    if (req && req.ownerId === activeId) {
      if (req.kind === "defense") this.engine.forgive(activeId);
      else if (req.kind === "choice") this.engine.submitChoice(activeId, req.choices[0].instanceId);
      else if (req.kind === "forcedSale") this.engine.submitForcedSale(activeId, req.candidates[0].instanceId);
      else if (req.kind === "replace") this.engine.submitReplace(activeId, req.candidates[0].instanceId);
      else if (req.kind === "redistribute") this.engine.cancelRedistribute(activeId);
      else if (req.kind === "guardian") this.engine.submitGuardianChoice(activeId, req.choices[0].id);
      else if (req.kind === "cleanse") this.engine.submitCleanse(activeId, req.options[0].key);
    } else if (st.phase === "playerAction" && st.currentActorId === activeId) {
      this.engine.playerTimeout(activeId);
    }
  }

  /* ---------- 연결 수명주기 ---------- */
  onConnect(connection: Connection, _ctx: ConnectionContext) {
    // 이미 진행 중인 방이라면 관전/대기. nickname 은 join 메시지로 확정.
    const player: Player = {
      id: connection.id,
      nickname: "결투자",
      isHost: false,
      isReady: false,
      isOnline: true,
      isBot: false,
      aiType: "human",
    };
    this.humans.set(connection.id, player);
    this.ensureHost();
    // 사람이 들어오면 정원이 모자라도 사람은 항상 수용하고, 넘치는 봇은 비운다.
    this.maxPlayers = Math.max(this.maxPlayers, this.humans.size);
    this.trimBotsToCapacity();
    // 신규 접속자에게 현재 채팅 히스토리 전달
    connection.send(JSON.stringify({ type: "history", chat: this.chat, selfId: connection.id }));
    this.broadcastRoom();
    // 진행 중인 방이면 현재 전투 상태를 바로 전달(관전 시작).
    if (this.status === "playing" && this.engine) {
      const st = this.engine.state;
      const ranking = st.gameOver
        ? this.engine.finalRanking().map((r: any) => ({ rank: r.rank, id: r.participant ? r.participant.id : null }))
        : null;
      connection.send(JSON.stringify({ type: "start", hostId: this.hostId }));
      connection.send(JSON.stringify({ type: "sync", state: this.redactState(st, connection.id), ranking }));
    }
  }

  onMessage(sender: Connection, message: string | ArrayBuffer) {
    const raw = typeof message === "string" ? message : "";
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }
    const me = this.humans.get(sender.id);
    if (!me) return;

    switch (msg.type) {
      case "join": {
        const nick = String(msg.nickname || "").trim().slice(0, 12) || "결투자";
        const first = !this.joined.has(me.id);
        me.nickname = nick;
        this.joined.add(me.id);
        // 최대 인원(정원)은 방장만 설정. 빈자리는 자동으로 채우지 않는다.
        if (me.id === this.hostId && typeof msg.maxPlayers === "number") {
          const v = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.floor(msg.maxPlayers)));
          this.maxPlayers = Math.max(this.humans.size, v);
        }
        if (first && me.id === this.hostId) {
          this.pushChat({ sys: true, text: `${nick} 님이 방을 만들었습니다. 친구를 코드로 초대하거나 봇과 시작하세요.` });
        } else if (first) {
          this.pushChat({ sys: true, text: `${nick} 님이 ${this.name} 방에 참가했습니다.` });
        }
        this.broadcastRoom();
        break;
      }
      case "ready": {
        me.isReady = !me.isReady;
        this.broadcastRoom();
        break;
      }
      case "setMax": {
        if (me.id !== this.hostId) break;
        let v = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.floor(msg.value)));
        v = Math.max(v, this.humans.size); // 사람 수 아래로는 못 내림
        this.maxPlayers = v;
        this.trimBotsToCapacity();
        this.broadcastRoom();
        break;
      }
      case "setRift": {
        if (me.id !== this.hostId) break;
        this.riftOpenRound = Math.min(15, Math.max(1, Math.floor(msg.value)));
        this.broadcastRoom();
        break;
      }
      case "addBot": {
        if (me.id !== this.hostId) break;
        this.addBot();
        this.broadcastRoom();
        break;
      }
      case "removeBot": {
        if (me.id !== this.hostId) break;
        this.removeBot(typeof msg.id === "string" ? msg.id : undefined);
        this.broadcastRoom();
        break;
      }
      case "chat": {
        const text = String(msg.text || "").trim().slice(0, 200);
        if (!text) break;
        this.pushChat({ name: me.nickname, text });
        // 봇 가벼운 반응
        if (this.bots.length && Math.random() < 0.5) {
          const b = pick(this.bots);
          const t = setTimeout(() => {
            this.botTimers.delete(t);
            if (this.bots.find((x) => x.id === b.id)) this.pushChat({ name: b.nickname, text: pick(REPLY_LINES) });
          }, 700 + Math.random() * 1400);
          this.botTimers.add(t);
        }
        break;
      }
      case "start": {
        if (me.id !== this.hostId) break;
        const everyoneReady = this.roster().every((p) => p.isReady);
        if (!everyoneReady || this.roster().length < START_MIN) break;
        this.clearBotTimers();
        this.status = "playing";
        // 서버가 엔진을 권위적으로 구동. 클라는 "start" 로 화면 전환 후 "sync" 상태를 받아 렌더.
        this.pushChat({ sys: true, text: "결투가 시작되었습니다. 행운을 빕니다." });
        this.broadcast(JSON.stringify({ type: "start", hostId: this.hostId }));
        this.broadcastRoom();
        this.startGame();
        break;
      }
      case "action": {
        if (this.status !== "playing" || !this.engine) break;
        if (!this.isInGameSeat(sender.id)) break; // 관전자/비참가자 입력 무시
        const action = String(msg.action || "");
        if (!ACTION_WHITELIST.has(action)) break;
        const args = Array.isArray(msg.args) ? msg.args : [];
        try { this.engine[action](sender.id, ...args); } catch { /* 엔진 내부 검증으로 무시 */ }
        break;
      }
      case "backToRoom": {
        if (me.id !== this.hostId) break;
        this.stopGame();
        this.status = "lobby";
        this.roster().forEach((p) => { p.isReady = false; p.isOnline = true; });
        this.bots.forEach((b, i) => this.scheduleBotReady(b, i));
        this.pushChat({ sys: true, text: "대기실로 돌아왔습니다. 다시 준비하세요." });
        this.broadcast(JSON.stringify({ type: "backToRoom" }));
        this.broadcastRoom();
        break;
      }
    }
  }

  onClose(connection: Connection) { this.dropHuman(connection.id); }
  onError(connection: Connection) { this.dropHuman(connection.id); }

  dropHuman(id: string) {
    const me = this.humans.get(id);
    if (!me) return;
    if (this.status === "playing") {
      // 진행 중: 좌석 유지, 오프라인 표시 (DisconnectBanner 구동)
      me.isOnline = false;
      // 끊긴 좌석이 지금 행동/응답 차례면 짧은 타임아웃으로 자동 처리해 게임이 멈추지 않게.
      if (this.engine) this.scheduleActionTimeout();
    } else {
      // 로비: 좌석 제거
      this.humans.delete(id);
      this.joined.delete(id);
    }
    this.ensureHost();
    this.broadcastRoom();
  }
}

/* Worker 엔트리: /parties/card-duel/<방코드> 요청을 위 Durable Object 로 라우팅 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routePartykitRequest(request, env)) ||
      new Response("Not Found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
