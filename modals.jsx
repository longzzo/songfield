/* =========================================================
  멀티 카드 결투 — Modals & overlays
========================================================= */
const { useState: useStateM, useEffect: useEffectM } = React;
const GM = window.GE;
const { CATEGORY_LABEL: CL, EMOTION_LABEL: EL, AI_TYPE_LABEL: ATL } = GM;

function ChoiceCard({ card, value, desc, danger, onClick }) {
  return (
    <button className={"choice-card" + (danger ? " danger" : "")} onClick={onClick}>
      <div className="cc-title">{card ? card.name : desc}</div>
      {card && (
        <div className="cc-meta">
          <span className={"chip cat-" + card.category}>{CL[card.category]}</span>
          <span className={"chip em-" + card.emotion}>{EL[card.emotion]}</span>
          <span className="chip">가격 {card.price}</span>
        </div>
      )}
      {value && <div className="cc-value">{value}</div>}
      {desc && card && <div className="cc-desc">{desc}</div>}
      {desc && !card && <div className="cc-desc">{value}</div>}
    </button>
  );
}

function DefenseModal({ req, sendAction }) {
  return (
    <div className="overlay">
      <div className="modal">
        <div className="m-title">공격 대응</div>
        <div className="m-sub">
          <strong>{req.attackerName}</strong>의 <strong>{req.cardName}</strong> 공격을 받았습니다.
          기본 피해는 <strong>{req.baseDamage}</strong>입니다. 방어 카드 또는 용서를 선택하세요.
        </div>
        <div className="choice-grid">
          {req.defenseCards.map((c) => (
            <ChoiceCard key={c.instanceId} card={c} value={c._guardValue} onClick={() => sendAction("chooseDefense", c.instanceId)} />
          ))}
          <button className="choice-card danger" onClick={() => sendAction("forgive")}>
            <div className="cc-title">방어하지 않기 · 용서</div>
            <div className="cc-value">피해를 그대로 받음</div>
            <div className="cc-desc">방어 카드가 있는 상태에서 선택하면 성법 점수를 얻습니다.</div>
          </button>
        </div>
      </div>
    </div>
  );
}

function ChoiceModal({ req, sendAction }) {
  return (
    <div className="overlay">
      <div className="modal">
        <div className="m-title">{req.title}</div>
        <div className="m-sub">{req.description}</div>
        <div className="choice-grid">
          {req.choices.map((c) => (
            <ChoiceCard key={c.instanceId} card={c} value="획득 후보" desc={c.text} onClick={() => sendAction("submitChoice", c.instanceId)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ForcedSaleModal({ req, sendAction }) {
  return (
    <div className="overlay">
      <div className="modal">
        <div className="m-title">강매 카드 선택</div>
        <div className="m-sub"><strong>{req.targetName}</strong>에게 판매할 카드를 선택하세요. 대상은 가격만큼 GP를 잃고, 부족분은 HP 피해로 받습니다.</div>
        <div className="choice-grid">
          {req.candidates.map((c) => (
            <ChoiceCard key={c.instanceId} card={c} value={c._saleValue} desc={c.text} onClick={() => sendAction("submitForcedSale", c.instanceId)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ReplaceModal({ req, sendAction }) {
  return (
    <div className="overlay">
      <div className="modal">
        <div className="m-title">정렬 도구</div>
        <div className="m-sub">버리고 새 카드로 교체할 카드를 선택하세요.</div>
        <div className="choice-grid">
          {req.candidates.map((c) => (
            <ChoiceCard key={c.instanceId} card={c} value={c._replaceValue} desc={c.text} onClick={() => sendAction("submitReplace", c.instanceId)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function RedistributeModal({ req, sendAction }) {
  const [hp, setHp] = useStateM(req.hp);
  const [mp, setMp] = useStateM(req.mp);
  const gp = req.total - hp - mp;
  const valid = hp >= 1 && hp <= req.maxHp && mp >= 0 && mp <= req.maxMp && gp >= 0 && gp <= req.maxGp;
  return (
    <div className="overlay">
      <div className="modal">
        <div className="m-title">환전 · 자원 재분배</div>
        <div className="m-sub">총합 <strong>{req.total}</strong> 안에서 HP / MP / GP를 재분배하세요. HP는 1 미만으로 만들 수 없습니다.</div>
        <div className="redist-row hp">
          <span className="rk">HP</span>
          <input type="range" min={1} max={Math.min(req.maxHp, req.total)} value={hp} onChange={(e) => setHp(Number(e.target.value))} />
          <span className="rv">{hp}</span>
        </div>
        <div className="redist-row mp">
          <span className="rk">MP</span>
          <input type="range" min={0} max={req.maxMp} value={mp} onChange={(e) => setMp(Number(e.target.value))} />
          <span className="rv">{mp}</span>
        </div>
        <div className="redist-row gp">
          <span className="rk">GP</span>
          <input type="range" min={0} max={req.maxGp} value={Math.max(0, gp)} readOnly disabled />
          <span className="rv" style={!valid && gp < 0 ? { color: "#f0b6ae" } : null}>{gp}</span>
        </div>
        <div className={"redist-total" + (valid ? "" : " bad")}>
          <span>합계 {hp + mp + gp} / {req.total}</span>
          <span>{valid ? "분배 가능" : "GP가 범위를 벗어났습니다"}</span>
        </div>
        <div className="m-actions">
          <button className="btn ghost" onClick={() => sendAction("cancelRedistribute")}>취소</button>
          <button className="btn gold" disabled={!valid} onClick={() => sendAction("submitRedistribute", hp, mp, gp)}>재분배</button>
        </div>
      </div>
    </div>
  );
}

function PendingModal({ state, myId, sendAction }) {
  const req = state && state.pendingRequest;
  if (!req || req.ownerId !== myId) return null; // 내 모달일 때만 표시
  if (req.kind === "defense") return <DefenseModal req={req} sendAction={sendAction} />;
  if (req.kind === "choice") return <ChoiceModal req={req} sendAction={sendAction} />;
  if (req.kind === "forcedSale") return <ForcedSaleModal req={req} sendAction={sendAction} />;
  if (req.kind === "replace") return <ReplaceModal req={req} sendAction={sendAction} />;
  if (req.kind === "redistribute") return <RedistributeModal req={req} sendAction={sendAction} />;
  return null;
}

/* ----- Disconnect banner ----- */
function DisconnectBanner({ names }) {
  if (!names.length) return null;
  return (
    <div className="disc-banner">
      <span className="dot off" />
      {names.length === 1
        ? `${names[0]} 님의 연결이 불안정합니다. 자리는 유지됩니다.`
        : `${names.join(", ")} 님의 연결이 불안정합니다.`}
    </div>
  );
}

/* ----- Elimination overlay (player knocked out → spectate) ----- */
function EliminationOverlay({ survivors, onSpectate }) {
  return (
    <div className="overlay">
      <div className="modal result-modal">
        <div className="result-crest lose">✶</div>
        <div className="result-title">탈락했습니다</div>
        <div className="result-sub">전투에서 패배했지만, 남은 결투를 관전할 수 있습니다.</div>
        <div className="rule-gold" style={{ margin: "18px 0 10px", fontSize: 12 }}>현재 생존자</div>
        <div className="spectate-survivors">
          {survivors.map((p) => (
            <span key={p.id} className="badge"><Avatar name={p.name} isBot={p.type === "ai"} size={20} /> {p.name}</span>
          ))}
        </div>
        <div className="m-actions" style={{ justifyContent: "center" }}>
          <button className="btn gold" onClick={onSpectate}>관전 시작</button>
        </div>
      </div>
    </div>
  );
}

/* ----- Game over overlay (ranking) ----- */
function GameOverOverlay({ state, myId, ranking, playerWon, isHost, onRematch, onLobby }) {
  const meId = myId;
  const rows = (ranking || []).map((r) => ({ rank: r.rank, participant: state.participants.find((p) => p.id === r.id) }));
  return (
    <div className="overlay">
      <div className="modal result-modal">
        <div className={"result-crest " + (playerWon ? "win" : "lose")}>{playerWon ? "♛" : "✶"}</div>
        <div className="result-title">{playerWon ? "최후의 생존자" : "결투 종료"}</div>
        <div className="result-sub">{playerWon ? "당신이 마지막까지 살아남았습니다." : "당신은 탈락했지만 결투는 끝났습니다."}</div>
        <div className="rank-list">
          {rows.map(({ rank, participant }) => participant && (
            <div key={participant.id} className={"rank-row" + (rank === 1 ? " top" : "") + (participant.id === meId ? " me" : "")}>
              <span className="rk-no">{rank}</span>
              <Avatar name={participant.name} isBot={participant.type === "ai"} size={26} />
              <span className="rk-name">{participant.name}{participant.id === meId && <span className="chip">나</span>}</span>
              <span className="rk-tag muted">{ATL[participant.aiType]}</span>
            </div>
          ))}
        </div>
        <div className="m-actions" style={{ justifyContent: "center" }}>
          <button className="btn ghost" onClick={onLobby}>로비로</button>
          <button className="btn gold" disabled={!isHost} onClick={onRematch}>{isHost ? "대기실로 · 다시 하기" : "방장 대기 중"}</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  ChoiceCard, PendingModal, DisconnectBanner, EliminationOverlay, GameOverOverlay,
});
