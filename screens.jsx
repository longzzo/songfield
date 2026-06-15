/* =========================================================
  멀티 카드 결투 — Screens: Lobby / Room / Game (새 디자인)
========================================================= */
const { useState: useS, useEffect: useE, useRef: useR } = React;
const GS = window.GE;

const PHASE_LABEL = {
  init: "초기화", playerAction: "행동", selectTarget: "대상 선택",
  sacrifice: "바칠 카드", defense: "공격 대응", aiActing: "상대 행동",
  between: "턴 전환", gameOver: "종료",
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
        <div className="title-xl">랜덤 카드 결투</div>
        <div className="subtitle">최대 10인 랜덤 카드 턴제 결투 · 실시간 멀티플레이</div>

        <div className="field">
          <label>닉네임</label>
          <input className="input" value={nickname} maxLength={12} placeholder="결투자의 이름" onChange={(e) => setNickname(e.target.value)} />
        </div>

        <div className="field">
          <label>최대 인원 · {playerCount}명 (대기실에서 봇을 직접 추가합니다)</label>
          <input type="range" min={2} max={10} value={playerCount} style={{ accentColor: "#a88030" }} onChange={(e) => setPlayerCount(Number(e.target.value))} />
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
function RoomScreen({ room, chat, me, onToggleReady, onSetMax, onSetRift, onAddBot, onRemoveBot, onStart, onSend, onLeave }) {
  const [draft, setDraft] = useS("");
  const [copied, setCopied] = useS(false);
  const chatRef = useR(null);
  useE(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [chat.length]);

  const everyoneReady = room.players.every((p) => p.isReady);
  const isHost = me && me.isHost;
  const maxPlayers = room.maxPlayers || room.players.length;
  const botCount = room.players.filter((p) => p.isBot).length;
  const isFull = room.players.length >= maxPlayers;
  const riftRound = room.riftOpenRound || 8;
  const canStart = everyoneReady && room.players.length >= 2;
  const copy = () => { navigator.clipboard?.writeText(room.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => {}); };
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
                  {p.isHost && <span className="chip">방장</span>}
                  {p.isBot && <span className="chip">BOT</span>}
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
              <div className="host-controls-row" style={{ marginTop: 10 }}>
                <span className="muted" style={{ fontSize: 12 }}>금역 개방 <b style={{ color: "#e090c0" }}>{riftRound}라운드</b></span>
                <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                  <button className="btn sm" disabled={riftRound <= 1} onClick={() => onSetRift(riftRound - 1)}>균열 −</button>
                  <button className="btn sm" disabled={riftRound >= 15} onClick={() => onSetRift(riftRound + 1)}>균열 +</button>
                </div>
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>
                균열의 악마가 깨어나는 라운드입니다. 빠르게(1~2) 두면 테스트·난전, 늦게 두면 후반 변수.
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 9, marginTop: 12 }}>
            <button className={"btn block" + (me && me.isReady ? "" : " gold")} onClick={onToggleReady}>
              {me && me.isReady ? "준비 해제" : "준비 완료"}
            </button>
          </div>
          <button className="btn gold block" style={{ marginTop: 9 }} disabled={!isHost || !canStart} onClick={onStart}>
            {isHost ? (room.players.length < 2 ? "최소 2명 필요 (봇을 추가하세요)" : (everyoneReady ? "결투 시작" : "전원 준비 대기 중…")) : "방장이 시작할 수 있습니다"}
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

/* ---------------- Game (서버 상태 기반 · 새 레이아웃) ---------------- */
function cardClickable(state, myId, card) {
  if (state.phase === "sacrifice") return state.currentActorId === myId && !GS.cardSealed(card);
  const me = state.participants.find((p) => p.id === myId);
  return GS.isMyTurn(state, myId) && card.timing === "active" && !GS.cardSealed(card) && me && GS.canPayCost(me, card.cost);
}
function cardReason(state, myId, card) {
  if (state.phase === "sacrifice") return GS.cardSealed(card) ? "봉인됨" : "바치기 가능";
  if (!GS.isMyTurn(state, myId)) return "내 턴 아님";
  if (GS.cardSealed(card)) return "봉인됨";
  if (card.timing !== "active") return "대응 전용";
  const me = state.participants.find((p) => p.id === myId);
  if (me && !GS.canPayCost(me, card.cost)) return "비용 부족";
  return "";
}

function GameScreen({ state, myId, sendAction, onlineById, offlineNames, onLeave }) {
  const st = state;
  const [selected, setSelected] = useS(null);
  const [showLog, setShowLog] = useS(false);
  if (!st) return null;

  const me = st.participants.find((p) => p.id === myId);
  const current = st.participants.find((p) => p.id === st.currentActorId);
  const isMyTurn = GS.isMyTurn(st, myId);
  const alive = st.participants.filter((p) => p.alive).length;
  const myTurnSelect = st.phase === "selectTarget" && st.pendingAction && st.pendingAction.actorId === myId;
  const mySacrifice = st.phase === "sacrifice" && st.currentActorId === myId;
  const lastLog = st.logs[st.logs.length - 1];

  const selectedCard = me && selected ? me.hand.find((c) => c.instanceId === selected) : null;
  const selClickable = selectedCard ? cardClickable(st, myId, selectedCard) : false;

  const onHandClick = (card) => {
    if (mySacrifice) { sendAction("playCard", card.instanceId); setSelected(null); return; }
    setSelected(card.instanceId);
  };
  const playSelected = () => { if (selectedCard && selClickable) { sendAction("playCard", selectedCard.instanceId); setSelected(null); } };

  const notice = (() => {
    if (isMyTurn) return { cls: "notice-playerAction", text: "당신의 턴입니다. 손패·마법 각인·기본 행동을 선택하세요." };
    if (myTurnSelect) return { cls: "notice-selectTarget", text: "효과를 적용할 대상을 참가자 목록에서 선택하세요." };
    if (mySacrifice) return { cls: "notice-sacrifice", text: "바칠 카드를 손패에서 선택하세요." };
    if (me && !me.alive) return { cls: "", text: "관전 중입니다. 남은 결투를 지켜보세요." };
    return { cls: "", text: `${current ? current.name : "상대"} 님이 행동 중입니다…` };
  })();

  // 전투 상황 패널 중앙 표시
  const focusTitle = isMyTurn ? "당신의 턴" : (current ? `${current.name}의 턴` : "결투 진행");
  const focusDesc = st.riftOpened ? "금역 개방 — 카드 획득 시 균열 현상 주의" : `라운드 ${st.round}`;
  const targetName = myTurnSelect ? "선택 중" : "-";

  return (
    <div className="game-app">
      <header className="top-bar">
        <div className="brand-block"><strong>랜덤 카드 결투</strong></div>
        <div className="top-stats">
          <span>Round {st.round}</span>
          <span>Turn {current ? current.name : "-"}</span>
          <span>Alive {alive}</span>
          <span className={st.riftOpened ? "badge badge-rift" : ""}>{PHASE_LABEL[st.phase] || "진행"}{st.riftOpened ? " · 금역" : ""}</span>
        </div>
        <div className="top-actions">
          <button className="small-btn" onClick={() => setShowLog((v) => !v)}>{showLog ? "로그 접기" : "로그"}</button>
          <button className="small-btn" onClick={onLeave}>나가기</button>
        </div>
      </header>

      <section className={"notice " + notice.cls}>
        <span>{notice.text}</span>
        {myTurnSelect && <button className="small-btn" style={{ marginLeft: "auto" }} onClick={() => sendAction("cancelTarget")}>취소</button>}
        {mySacrifice && <button className="small-btn" style={{ marginLeft: "auto" }} onClick={() => sendAction("cancelOffer")}>취소</button>}
        {offlineNames.length > 0 && <span style={{ marginLeft: "auto", color: "#c08868" }}>접속 끊김: {offlineNames.join(", ")}</span>}
      </section>

      <main className="battle-shell">
        <section className="combat-column">
          <section className="battle-focus-section panel-block">
            <div className="section-head"><h2>전투 상황</h2></div>
            <div className={"battle-focus" + (st.riftOpened ? " rift-active" : "")}>
              {st.riftOpened
                ? <div className="rift-banner">☄ 금역 개방 · 균열의 악마가 깨어났습니다 — 카드를 뽑을 때 균열 현상 주의</div>
                : <div className="rift-banner sealed">금역 봉인 중 · {(st.riftOpenRound || 8)}라운드에 균열의 악마가 깨어납니다</div>}
              <div className="focus-stage">
                <div className="focus-side actor-side">
                  <div className="focus-label">행동</div>
                  <strong>{current ? current.name : "-"}</strong>
                  <em>{current ? AI_TYPE_LABEL[current.aiType] : ""}</em>
                </div>
                <div className={"focus-center" + (st.riftOpened ? " phase-rift" : "")}>
                  <div className="focus-phase">{PHASE_LABEL[st.phase] || "진행"}</div>
                  <h3>{focusTitle}</h3>
                  <p>{focusDesc}</p>
                </div>
                <div className="focus-side target-side">
                  <div className="focus-label">대상</div>
                  <strong>{targetName}</strong>
                </div>
              </div>
              <div className="focus-grid">
                <div className="focus-detail"><span>Round</span><strong>{st.round}</strong></div>
                <div className="focus-detail"><span>생존</span><strong>{alive}명</strong></div>
                <div className="focus-detail"><span>금역</span><strong>{st.riftOpened ? "개방" : "봉인"}</strong></div>
              </div>
              {lastLog && <div className={"focus-last-log" + (lastLog.type === "rift" ? " rift" : "")}><strong>{logTypeLabel(lastLog.type)}</strong><span>{lastLog.text}</span></div>}
            </div>
          </section>

          <section className="selected-card-section panel-block">
            <div className="section-head">
              <h2>선택 카드</h2>
              {selectedCard && <button className="small-btn primary-action" disabled={!selClickable} onClick={playSelected}>사용</button>}
            </div>
            <div className={"selected-card-panel" + (selectedCard ? "" : " muted")}>
              {selectedCard ? <SelectedCardDetail card={selectedCard} /> : "손패에서 카드를 클릭하면 상세 정보가 표시됩니다."}
            </div>
          </section>

          <aside className={"log-section panel-block" + (showLog ? "" : " collapsed")}>
            <CombatLog logs={st.logs} />
          </aside>
        </section>

        <aside className="participant-section panel-block">
          <div className="section-head"><h2>참가자 <span className="muted">{alive}명 생존</span></h2></div>
          <div className="participant-list">
            {st.participants.map((p) => (
              <ParticipantRow key={p.id} p={p} isMe={p.id === myId}
                selectable={myTurnSelect && p.alive && p.id !== myId}
                current={p.id === st.currentActorId}
                online={onlineById[p.id]}
                onSelect={(id) => sendAction("selectTarget", id)} />
            ))}
          </div>
        </aside>
      </main>

      <section className="player-section">
        <div className={"player-card panel-block" + (isMyTurn ? " current-turn" : "")}>
          <div className="compact-head"><h2>플레이어</h2></div>
          {me && (
            <div className="player-stats">
              <div className="you-name"><Avatar name={me.name} isBot={false} size={24} /> {me.name}{!me.alive && <span className="badge badge-rift">탈락</span>}</div>
              <ResourceMeters p={me} />
              <div className="player-status-compact">
                {me.guardianSigil ? <GuardianBadge sigil={me.guardianSigil} /> : <span className="guardian-none">수호 각인 없음</span>}
              </div>
              <div className="player-status-compact"><StatusBadges p={me} /></div>
            </div>
          )}
        </div>

        <div className="imprint-box panel-block">
          <div className="compact-head"><h2>마법 각인 {me && <span className="muted">{me.imprints.length}/{GS.STAT.maxImprints}</span>}</h2></div>
          <div className="imprint-list">
            {me && <ImprintList imprints={me.imprints} player={me} isTurn={isMyTurn} sendAction={sendAction} />}
          </div>
        </div>

        <div className="action-box panel-block">
          <div className="compact-head"><h2>기본 행동</h2></div>
          <div className="action-buttons">
            <button disabled={!isMyTurn || !me || me.hand.some((c) => c.category === "weapon")} onClick={() => sendAction("pray")}>기도</button>
            <button disabled={!isMyTurn || !me || me.hand.length === 0} onClick={() => sendAction("startOffer")}>바치기</button>
            <button className="ghost" disabled={!isMyTurn} onClick={() => sendAction("skipTurn")}>턴 넘기기</button>
          </div>
        </div>
      </section>

      <section className="hand-section panel-block">
        <div className="compact-head hand-title"><h2>손패 <span className="muted">{mySacrifice ? "바칠 카드를 선택" : "클릭하면 선택 카드에 표시"}</span></h2></div>
        <div className="hand-list">
          {me && me.hand.length === 0 && <div className="muted" style={{ padding: 10 }}>손패가 비었습니다.</div>}
          {me && me.hand.map((card) => (
            <HandCard key={card.instanceId} card={card}
              clickable={cardClickable(st, myId, card)}
              sealed={GS.cardSealed(card)}
              selected={card.instanceId === selected}
              reason={cardReason(st, myId, card)}
              onClick={onHandClick} />
          ))}
        </div>
      </section>

      <PendingModal state={st} myId={myId} sendAction={sendAction} />
    </div>
  );
}

Object.assign(window, { LobbyScreen, RoomScreen, GameScreen });
