/* =========================================================
  멀티 카드 결투 — Screens: Lobby / Room / Game
========================================================= */
const { useState: useS, useEffect: useE, useRef: useR } = React;
const GS = window.GE;

const PHASE_LABEL = {
  init: "초기화", playerAction: "플레이어 행동", selectTarget: "대상 선택",
  sacrifice: "바칠 카드 선택", defense: "공격 대응", aiActing: "상대 행동 중",
  between: "턴 전환", gameOver: "게임 종료",
};

/* ---------------- Lobby ---------------- */
function LobbyScreen({ nickname, setNickname, playerCount, setPlayerCount, onCreate, onJoin }) {
  const [code, setCode] = useS("");
  const canCreate = nickname.trim().length >= 1;
  const canJoin = canCreate && code.trim().length >= 4;
  return (
    <div className="center-stage">
      <div className="parchment-card">
        <div className="crest">⚔</div>
        <div className="title-xl">멀티 카드 결투</div>
        <div className="subtitle">최대 10인 랜덤 카드 턴제 결투 · 실시간 멀티플레이</div>

        <div className="field">
          <label>닉네임</label>
          <input className="input" value={nickname} maxLength={12} placeholder="결투자의 이름" onChange={(e) => setNickname(e.target.value)} />
        </div>

        <div className="field">
          <label>최대 인원 · {playerCount}명 (대기실에서 봇을 직접 추가합니다)</label>
          <input type="range" min={2} max={10} value={playerCount} style={{ accentColor: "var(--gold)" }} onChange={(e) => setPlayerCount(Number(e.target.value))} />
        </div>

        <div style={{ marginTop: 18 }}>
          <button className="btn gold block" disabled={!canCreate} onClick={() => onCreate(nickname.trim(), playerCount)}>방 만들기</button>
        </div>

        <div className="divider-or">또는 코드로 참가</div>

        <div className="field" style={{ marginTop: 8 }}>
          <input className="input code" value={code} maxLength={6} placeholder="ABC123" onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn block" disabled={!canJoin} onClick={() => onJoin(code.trim().toUpperCase(), nickname.trim(), playerCount)}>방 참가</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Room ---------------- */
function RoomScreen({ room, chat, me, onToggleReady, onSetMax, onAddBot, onRemoveBot, onStart, onSend, onLeave }) {
  const [draft, setDraft] = useS("");
  const [copied, setCopied] = useS(false);
  const chatRef = useR(null);
  useE(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [chat.length]);

  const everyoneReady = room.players.every((p) => p.isReady);
  const isHost = me && me.isHost;
  const maxPlayers = room.maxPlayers || room.players.length;
  const botCount = room.players.filter((p) => p.isBot).length;
  const isFull = room.players.length >= maxPlayers;
  const canStart = everyoneReady && room.players.length >= 2;
  const copy = () => {
    navigator.clipboard?.writeText(room.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => {});
  };
  const send = () => { const t = draft.trim(); if (!t) return; onSend(t); setDraft(""); };

  return (
    <div className="room-wrap">
      <div className="room-head">
        <div>
          <div className="rule-gold" style={{ fontSize: 12, marginBottom: 8 }}>대기실</div>
          <h1 style={{ fontSize: 24 }}>결투를 준비하세요</h1>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div className="code-pill">
            <span className="muted" style={{ fontSize: 11 }}>방 코드</span>
            <span className="code">{room.code}</span>
            <button className="btn sm" onClick={copy}>{copied ? "복사됨" : "복사"}</button>
          </div>
          <button className="btn ghost sm" onClick={onLeave}>나가기</button>
        </div>
      </div>

      <div className="room-grid">
        <div className="panel">
          <div className="panel-title">참가자 <span className="muted">{room.players.length}/{maxPlayers}명</span></div>
          {room.players.map((p) => (
            <div key={p.id} className={"seat" + (me && p.id === me.id ? " me" : "")}>
              <Avatar name={p.nickname} isBot={p.isBot} />
              <div>
                <div className="seat-name">
                  {p.nickname}
                  <span className={"dot " + (p.isOnline ? "on" : "off")} />
                  {p.isHost && <span className="chip" style={{ fontSize: 10 }}>방장</span>}
                  {p.isBot && <span className="muted" style={{ fontSize: 11 }}>BOT</span>}
                </div>
                <div className="seat-sub">{me && p.id === me.id ? "나" : (p.isBot ? "인공지능 결투자" : "플레이어")}</div>
              </div>
              <div className="seat-right">
                <span className={"ready-tag " + (p.isReady ? "yes" : "no")}>{p.isReady ? "준비 완료" : "대기 중"}</span>
              </div>
            </div>
          ))}

          {isHost && (
            <div className="host-controls">
              <div className="host-controls-row">
                <span className="muted" style={{ fontSize: 12 }}>최대 인원 {maxPlayers}명 · 봇 {botCount}</span>
                <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                  <button className="btn sm" disabled={maxPlayers <= Math.max(2, room.players.length)} onClick={() => onSetMax(maxPlayers - 1)}>정원 −</button>
                  <button className="btn sm" disabled={maxPlayers >= 10} onClick={() => onSetMax(maxPlayers + 1)}>정원 +</button>
                </div>
              </div>
              <div className="host-controls-row" style={{ marginTop: 8 }}>
                <button className="btn sm block" disabled={isFull} onClick={onAddBot}>봇 추가</button>
                <button className="btn sm ghost block" disabled={botCount === 0} onClick={() => onRemoveBot()}>봇 제거</button>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 9, marginTop: 12 }}>
            <button className={"btn block" + (me && me.isReady ? "" : " gold")} onClick={onToggleReady}>
              {me && me.isReady ? "준비 해제" : "준비 완료"}
            </button>
          </div>
          <button className="btn gold block" style={{ marginTop: 9 }} disabled={!isHost || !canStart}
            onClick={onStart}>
            {isHost
              ? (room.players.length < 2 ? "최소 2명 필요 (봇을 추가하세요)" : (everyoneReady ? "결투 시작" : "전원 준비 대기 중…"))
              : "방장이 시작할 수 있습니다"}
          </button>
        </div>

        <div className="panel">
          <div className="panel-title">채팅</div>
          <div className="chat-list" ref={chatRef}>
            {chat.map((m) => (
              <div key={m.id} className={"chat-msg" + (m.sys ? " sys" : "")}>
                {!m.sys && <span className="who">{m.name}</span>}{m.text}
              </div>
            ))}
          </div>
          <div className="chat-input-row">
            <input className="input" value={draft} placeholder="메시지 입력…" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
            <button className="btn" onClick={send}>전송</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Game (서버 상태 기반 렌더) ---------------- */
function cardClickable(state, myId, card) {
  if (state.phase === "sacrifice") return state.currentActorId === myId && !GS.cardSealed(card);
  const me = state.participants.find((p) => p.id === myId);
  return GS.isMyTurn(state, myId) && card.timing === "active" && !GS.cardSealed(card) && me && GS.canPayCost(me, card.cost);
}
function cardReason(state, myId, card) {
  if (state.phase === "sacrifice") return GS.cardSealed(card) ? "봉인된 카드는 바칠 수 없음" : "바치기 선택 가능";
  if (!GS.isMyTurn(state, myId)) return "내 턴이 아님";
  if (GS.cardSealed(card)) return "봉인됨";
  if (card.timing !== "active") return "공격 대응 시에만 사용";
  const me = state.participants.find((p) => p.id === myId);
  if (me && !GS.canPayCost(me, card.cost)) return "비용 부족";
  return "";
}

function GameScreen({ state, myId, sendAction, onlineById, offlineNames }) {
  const st = state;
  if (!st) return null;
  const me = st.participants.find((p) => p.id === myId);
  const current = st.participants.find((p) => p.id === st.currentActorId);
  const isMyTurn = GS.isMyTurn(st, myId);
  const myAlive = !me || me.alive;
  const hasModal = !!st.pendingRequest;
  const opponents = st.participants.filter((p) => p.id !== myId);
  const alive = st.participants.filter((p) => p.alive).length;

  const notice = (() => {
    if (isMyTurn) return { cls: "", text: "당신의 턴입니다. 카드 · 마법 각인 · 기본 행동을 선택하세요.", ping: true };
    if (st.phase === "selectTarget" && st.pendingAction && st.pendingAction.actorId === myId) return { cls: "", text: "효과를 적용할 대상을 선택하세요.", ping: true };
    if (st.phase === "sacrifice" && st.currentActorId === myId) return { cls: "", text: "바칠 카드를 손패에서 선택하세요.", ping: true };
    if (me && me.alive === false) return { cls: "ai", text: "관전 중입니다. 남은 결투의 전개를 지켜보세요." };
    return { cls: "ai", text: `${current ? current.name : "상대"} 님이 행동 중입니다…` };
  })();

  const myTurnSelect = st.phase === "selectTarget" && st.pendingAction && st.pendingAction.actorId === myId;
  const mySacrifice = st.phase === "sacrifice" && st.currentActorId === myId;

  return (
    <div className="game-root">
      <div className="topbar">
        <div className="brand">멀티 카드 결투<small>최대 10인 랜덤 카드 턴제 결투</small></div>
        <div className="spacer" />
        <div className="stats">
          <div className="stat-pill"><b>{st.round}</b><span>Round</span></div>
          <div className="stat-pill"><b>{alive}</b><span>Alive</span></div>
          <div className="stat-pill" style={{ minWidth: 104 }}><b style={{ fontSize: 13 }}>{current ? current.name : "-"}</b><span>Turn</span></div>
          <div className="stat-pill" style={{ minWidth: 112 }}><b style={{ fontSize: 12 }}>{PHASE_LABEL[st.phase] || "진행"}</b><span>Phase</span></div>
        </div>
      </div>

      <DisconnectBanner names={offlineNames} />

      <div className={"notice " + notice.cls}>
        {notice.ping && <span className="ping" />}
        <span>{notice.text}</span>
        {myTurnSelect && <button className="btn sm ghost" style={{ marginLeft: "auto" }} onClick={() => sendAction("cancelTarget")}>취소</button>}
        {mySacrifice && <button className="btn sm ghost" style={{ marginLeft: "auto" }} onClick={() => sendAction("cancelOffer")}>취소</button>}
      </div>

      <div className="battle-grid">
        <div className="arena-panel">
          <div className="section-h">결투장 <span className="muted">{opponents.filter((p) => p.alive).length}명 생존</span></div>
          <div className="opp-grid">
            {opponents.map((p) => (
              <ParticipantCard key={p.id} p={p}
                selectable={myTurnSelect && p.alive}
                current={p.id === st.currentActorId}
                online={onlineById[p.id]}
                onSelect={(id) => sendAction("selectTarget", id)} />
            ))}
          </div>
        </div>

        <div className="log-panel">
          <div className="section-h">전투 기록</div>
          <CombatLog logs={st.logs} />
        </div>
      </div>

      {me && (
      <div className="console-grid">
        <div className={"console-card you" + (isMyTurn ? " active" : "")}>
          <div className="section-h">
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Avatar name={me.name} isBot={false} size={26} /> {me.name}
            </span>
            {isMyTurn && <span className="badge solid-gold">내 턴</span>}
            {!me.alive && <span className="flag eliminated">탈락</span>}
          </div>
          <div className="you-stats"><ResourceBars p={me} /></div>
          <div className="pcard-meta" style={{ marginTop: 10 }}>
            <span className="tiny">손패 {me.hand.length}/{GS.STAT.maxHand}</span>
            <span className="tiny">길 {GS.PATH_LABEL[me.primaryPath || "none"]}</span>
            <span className="tiny">감정 {GS.EMOTION_LABEL[me.emotionPath || "none"]}</span>
          </div>
          <div className="you-status"><StatusBadges p={me} /></div>
          <TurnTimer activeKey={isMyTurn && !hasModal ? `${st.round}-${st.orderIndex}` : null} durationMs={30000} onTimeout={() => sendAction("skipTurn")} />
        </div>

        <div className="console-card">
          <div className="section-h">마법 각인 <span className="muted">{me.imprints.length}/{GS.STAT.maxImprints}</span></div>
          <ImprintList imprints={me.imprints} player={me} isTurn={isMyTurn} sendAction={sendAction} />
        </div>

        <div className="console-card">
          <div className="section-h">기본 행동</div>
          <div className="action-col">
            <button className="btn" disabled={!isMyTurn || me.hand.some((c) => c.category === "weapon")} onClick={() => sendAction("pray")}>기도</button>
            <button className="btn" disabled={!isMyTurn || me.hand.length === 0} onClick={() => sendAction("startOffer")}>바치기</button>
            <button className="btn ghost" disabled={!isMyTurn} onClick={() => sendAction("skipTurn")}>턴 넘기기</button>
          </div>
          <div className="muted" style={{ marginTop: 12, lineHeight: 1.5 }}>
            무기가 없으면 기도로 카드를 보충하고, 불필요한 카드는 바치기로 교체합니다.
          </div>
        </div>
      </div>
      )}

      {me && (
      <div className="hand-panel">
        <div className="section-h">손패 <span className="muted">{mySacrifice ? "바칠 카드를 선택하세요" : "카드를 클릭해 사용합니다"}</span></div>
        <div className="hand-list">
          {me.hand.length === 0 && <div className="hand-empty">손패가 비었습니다.</div>}
          {me.hand.map((card) => (
            <HandCard key={card.instanceId} card={card}
              clickable={cardClickable(st, myId, card)}
              sealed={GS.cardSealed(card)}
              reason={cardReason(st, myId, card)}
              onClick={(id) => sendAction("playCard", id)} />
          ))}
        </div>
      </div>
      )}

      <PendingModal state={st} myId={myId} sendAction={sendAction} />
    </div>
  );
}

Object.assign(window, { LobbyScreen, RoomScreen, GameScreen });
