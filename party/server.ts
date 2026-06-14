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

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 10;

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
  chat: ChatMsg[] = [];
  chatSeq = 1;
  botTimers = new Set<ReturnType<typeof setTimeout>>();

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

  /* ---------- 봇 채움 ---------- */
  syncBots() {
    const humanCount = this.humans.size;
    const want = Math.max(0, this.maxPlayers - humanCount);
    if (this.bots.length > want) {
      this.bots = this.bots.slice(0, want);
    } else if (this.bots.length < want) {
      const usedNames = new Set(this.roster().map((p) => p.nickname));
      const freeNames = shuffle(BOT_NAMES.filter((n) => !usedNames.has(n)));
      const types = shuffle(AI_TYPES);
      let ni = 0;
      while (this.bots.length < want) {
        const idx = this.bots.length;
        const nickname = freeNames[ni++] || `결투자${idx + 1}`;
        const bot: Player = {
          id: `bot_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          nickname, isHost: false, isReady: false, isOnline: true,
          isBot: true, aiType: types[idx % types.length],
        };
        this.bots.push(bot);
        if (this.status === "lobby") this.scheduleBotReady(bot, idx);
      }
    }
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
    this.syncBots();
    // 신규 접속자에게 현재 채팅 히스토리 전달
    connection.send(JSON.stringify({ type: "history", chat: this.chat, selfId: connection.id }));
    this.broadcastRoom();
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
        // 인원 수는 방장만 설정 가능
        if (me.id === this.hostId && typeof msg.maxPlayers === "number") {
          this.maxPlayers = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.floor(msg.maxPlayers)));
        }
        this.syncBots();
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
        this.maxPlayers = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.floor(msg.value)));
        this.syncBots();
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
        if (!everyoneReady) break;
        this.clearBotTimers();
        this.status = "playing";
        // Phase 1: 전투는 각 클라이언트 로컬 엔진에서 동일 roster 로 진행한다.
        const roster = this.roster().map((p) => ({ id: p.id, nickname: p.nickname, isBot: p.isBot, aiType: p.aiType }));
        this.pushChat({ sys: true, text: "결투가 시작되었습니다. 행운을 빕니다." });
        this.broadcast(JSON.stringify({ type: "start", roster, hostId: this.hostId }));
        this.broadcastRoom();
        break;
      }
      case "backToRoom": {
        if (me.id !== this.hostId) break;
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
    } else {
      // 로비: 좌석 제거
      this.humans.delete(id);
      this.joined.delete(id);
    }
    this.ensureHost();
    this.syncBots();
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
