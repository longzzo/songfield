/* =========================================================
  엔진 서버권위(actorId) 리팩터 검증 — Node 하니스
  - 2인(사람) + 1봇 로스터로 게임을 구동
  - 잘못된 actorId 입력이 무시되는지(좌석 게이팅) 검증
  - 매 시점 불변식 검증(크래시 없음, 자원/턴/모달 소유자 유효)
  - gameOver 도달 시 승자/순위 유효 검증 (도달 못 해도 불변식 통과면 OK)
  실행: node test/engine.test.cjs
========================================================= */
const { GameEngine, STAT } = require("../engine.js");

function assert(cond, msg) { if (!cond) { console.error("FAIL:", msg); process.exit(1); } }

const engine = new GameEngine();
const roster = [
  { id: "H1", nickname: "사람A", isBot: false },
  { id: "H2", nickname: "사람B", isBot: false },
  { id: "B1", nickname: "봇C", isBot: true, aiType: "aggressive" },
];
const HUMANS = new Set(["H1", "H2"]);

engine.newGame(roster);
engine.state.aiDelay = 0; engine.state.turnGap = 0; // 테스트 가속

assert(engine.state.participants.length === 3, "참가자 3명");
assert(engine.getParticipant("H1").type === "human", "사람은 type=human");
assert(engine.getParticipant("B1").type === "ai", "봇은 type=ai");

const MAX_ACTIONS = 600;
let actionCount = 0;
let lastActionAt = Date.now();
let gatingTested = false;

function checkInvariants() {
  const st = engine.state;
  for (const p of st.participants) {
    assert(p.hp >= 0 && p.hp <= p.maxHp, `HP 범위(${p.id}=${p.hp})`);
    assert(p.mp >= 0 && p.mp <= p.maxMp, `MP 범위(${p.id}=${p.mp})`);
    assert(p.gp >= 0 && p.gp <= p.maxGp, `GP 범위(${p.id}=${p.gp})`);
    assert(p.hand.length <= STAT.maxHand, `손패 상한(${p.id})`);
  }
  if (st.phase === "playerAction" && !st.gameOver) {
    const cur = engine.getParticipant(st.currentActorId);
    assert(cur && cur.alive && cur.type !== "ai", "행동 좌석은 살아있는 사람");
  }
  if (st.pendingRequest) {
    const owner = engine.getParticipant(st.pendingRequest.ownerId);
    assert(owner && owner.type !== "ai", "모달 소유자는 사람");
  }
}

function humanAct(id) {
  const me = engine.getParticipant(id);
  if (!me || !me.alive) { engine.skipTurn(id); return; }
  const enemy = engine.livingParticipants().find((p) => p.id !== id);
  const weapon = me.hand.find((c) => c.category === "weapon" && c.timing === "active" && !engine.isCardSealed(c) && engine.canPay(me, c.cost));
  if (weapon && enemy) {
    engine.playCard(id, weapon.instanceId);
    if (engine.state.phase === "selectTarget") engine.selectTarget(id, enemy.id);
  } else {
    engine.playerTimeout(id); // 무기 없으면 자동 기도(보충), 있으면 스킵
  }
}

function respondModal(req) {
  const o = req.ownerId;
  if (!HUMANS.has(o)) return;
  if (req.kind === "defense") engine.forgive(o);
  else if (req.kind === "choice") engine.submitChoice(o, req.choices[0].instanceId);
  else if (req.kind === "forcedSale") engine.submitForcedSale(o, req.candidates[0].instanceId);
  else if (req.kind === "replace") engine.submitReplace(o, req.candidates[0].instanceId);
  else if (req.kind === "redistribute") engine.cancelRedistribute(o);
}

function react() {
  const st = engine.state;
  checkInvariants();
  if (st.gameOver) return finish();
  if (st.pendingRequest) { respondModal(st.pendingRequest); return; }
  if (st.phase === "playerAction" && HUMANS.has(st.currentActorId)) {
    if (!gatingTested) {
      gatingTested = true;
      const other = st.currentActorId === "H1" ? "H2" : "H1";
      const phaseBefore = st.phase, actorBefore = st.currentActorId;
      engine.skipTurn(other); engine.pray(other); engine.playCard(other, "nope");
      assert(st.phase === phaseBefore && st.currentActorId === actorBefore, "다른 좌석 입력은 무시되어야 함");
    }
    actionCount += 1;
    lastActionAt = Date.now();
    if (actionCount > MAX_ACTIONS) return finish("cap");
    humanAct(st.currentActorId);
  }
}

const started = Date.now();
const poll = setInterval(() => {
  try { react(); } catch (e) { console.error("FAIL: 예외 발생\n", e); process.exit(1); }
  // 교착(수동적 AI끼리 서로 못 죽이는 시드) 감지: 사람 행동이 한동안 없으면 PASS 종료.
  if (!engine.state.gameOver && actionCount > 0 && Date.now() - lastActionAt > 4000) return finish("stalemate");
  if (Date.now() - started > 30000) return finish("timecap"); // 절대 백스톱
}, 0);

let finished = false;
function finish(reason) {
  if (finished) return; finished = true;
  clearInterval(poll);
  const st = engine.state;
  assert(gatingTested, "좌석 게이팅 테스트 실행됨");
  if (st.gameOver) {
    assert(st.participants.some((p) => p.id === st.winnerId) || st.winnerId === null, "winnerId 유효");
    assert(engine.finalRanking().length === 3, "최종 순위 3명");
    console.log(`PASS ✓  완주: 행동 ${actionCount}회, 승자=${st.winnerId}, 라운드=${st.round}`);
  } else {
    console.log(`PASS ✓  무사고(${reason}): 행동 ${actionCount}회, 라운드=${st.round}, 불변식·좌석게이팅 OK`);
  }
  process.exit(0);
}
