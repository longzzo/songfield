/* =========================================================
  멀티 카드 결투 — Modals & overlays (새 디자인)
========================================================= */
const { useState: useStateM } = React;
const GM = window.GE;
const { CATEGORY_LABEL: CL, EMOTION_LABEL: EL, AI_TYPE_LABEL: ATL } = GM;

function CardChoiceButton({ card, value, desc, danger, onClick }) {
  return (
    <button className={"choice-card" + (danger ? " danger-choice" : "")} onClick={onClick}>
      <div className="choice-card-title">{card ? card.name : desc}</div>
      {card && (
        <div className="choice-card-meta">
          <span className={"category-chip category-" + card.category}>{CL[card.category]}</span>
          <span className={"emotion-chip emotion-" + card.emotion}>{EL[card.emotion]}</span>
          <span className="price-chip">가격 {card.price}</span>
        </div>
      )}
      {value && <div className="choice-card-value">{value}</div>}
      {card && desc && <div className="choice-card-desc">{desc}</div>}
    </button>
  );
}

function Modal({ title, children }) {
  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function DefenseModal({ req, sendAction }) {
  return (
    <Modal title="공격 대응">
      <div className="modal-content">
        <p><strong>{req.attackerName}</strong>의 <strong>{req.cardName}</strong>{req.isArea ? " (광역)" : ""}{req.isMagic ? " (기적)" : ""} 공격. 기본 피해 <strong>{req.baseDamage}</strong>. 방어 카드 또는 용서를 선택하세요.</p>
      </div>
      <div className="choice-list">
        {req.defenseCards.map((c) => (
          <CardChoiceButton key={c.instanceId} card={c} value={c._guardValue} desc={c.text} onClick={() => sendAction("chooseDefense", c.instanceId)} />
        ))}
        <button className="choice-card danger-choice" onClick={() => sendAction("forgive")}>
          <div className="choice-card-title">방어하지 않기 · 용서</div>
          <div className="choice-card-value">피해를 그대로 받음</div>
          <div className="choice-card-desc">방어 카드가 있을 때 용서하면 성법 점수를 얻습니다.</div>
        </button>
      </div>
    </Modal>
  );
}

function ChoiceModal({ req, sendAction }) {
  return (
    <Modal title={req.title || "선택"}>
      <div className="modal-content"><p>{req.description}</p></div>
      <div className="choice-list">
        {req.choices.map((c) => (
          <CardChoiceButton key={c.instanceId} card={c} value="획득 후보" desc={c.text} onClick={() => sendAction("submitChoice", c.instanceId)} />
        ))}
      </div>
    </Modal>
  );
}

function ForcedSaleModal({ req, sendAction }) {
  return (
    <Modal title="강매 카드 선택">
      <div className="modal-content"><p><strong>{req.targetName}</strong>에게 판매할 카드를 선택하세요. 대상은 가격만큼 GP를 잃고 부족분은 HP 피해로 받습니다.</p></div>
      <div className="choice-list">
        {req.candidates.map((c) => (
          <CardChoiceButton key={c.instanceId} card={c} value={c._saleValue} desc={c.text} onClick={() => sendAction("submitForcedSale", c.instanceId)} />
        ))}
      </div>
    </Modal>
  );
}

function ReplaceModal({ req, sendAction }) {
  return (
    <Modal title="정렬 도구">
      <div className="modal-content"><p>버리고 새 카드로 교체할 카드를 선택하세요.</p></div>
      <div className="choice-list">
        {req.candidates.map((c) => (
          <CardChoiceButton key={c.instanceId} card={c} value={c._replaceValue} desc={c.text} onClick={() => sendAction("submitReplace", c.instanceId)} />
        ))}
      </div>
    </Modal>
  );
}

function GuardianModal({ req, sendAction }) {
  return (
    <Modal title="성약문 · 수호 각인 선택">
      <div className="modal-content"><p>얻을 수호 각인을 선택하세요. 같은 수호 각인은 동시에 한 명만 보유합니다.</p></div>
      <div className="choice-list">
        {req.choices.map((s) => (
          <button key={s.id} className="choice-card" onClick={() => sendAction("submitGuardianChoice", s.id)}>
            <div className="choice-card-title">✦ {s.name}</div>
            <div className="choice-card-meta"><span className={"emotion-chip emotion-" + s.emotion}>{EL[s.emotion]}</span></div>
            <div className="choice-card-desc">{s.summary}</div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function CleanseModal({ req, sendAction }) {
  return (
    <Modal title="정화 · 제거할 상태 선택">
      <div className="modal-content"><p>제거할 상태이상을 선택하세요.</p></div>
      <div className="choice-list">
        {req.options.map((o) => (
          <button key={o.key} className="choice-card" onClick={() => sendAction("submitCleanse", o.key)}>
            <div className="cleanse-opt">
              <span className="co-label">{o.label}</span>
              <span className="co-value">{o.value}</span>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function RedistributeModal({ req, sendAction }) {
  const [hp, setHp] = useStateM(req.hp);
  const [mp, setMp] = useStateM(req.mp);
  const gp = req.total - hp - mp;
  const valid = hp >= 1 && hp <= req.maxHp && mp >= 0 && mp <= req.maxMp && gp >= 0 && gp <= req.maxGp;
  return (
    <Modal title="환전 · 자원 재분배">
      <div className="modal-content"><p>총합 <strong>{req.total}</strong> 안에서 HP / MP / GP를 재분배하세요. HP는 1 미만으로 만들 수 없습니다.</p></div>
      <div className="redist-row hp"><span className="rk">HP</span><input type="range" min={1} max={Math.min(req.maxHp, req.total)} value={hp} onChange={(e) => setHp(Number(e.target.value))} /><span className="rv">{hp}</span></div>
      <div className="redist-row mp"><span className="rk">MP</span><input type="range" min={0} max={req.maxMp} value={mp} onChange={(e) => setMp(Number(e.target.value))} /><span className="rv">{mp}</span></div>
      <div className="redist-row gp"><span className="rk">GP</span><input type="range" min={0} max={req.maxGp} value={Math.max(0, gp)} readOnly disabled /><span className="rv">{gp}</span></div>
      <div className={"redist-total" + (valid ? "" : " bad")}>
        <span>합계 {hp + mp + gp} / {req.total}</span>
        <span>{valid ? "분배 가능" : "GP가 범위를 벗어남"}</span>
      </div>
      <div className="modal-actions">
        <button onClick={() => sendAction("cancelRedistribute")}>취소</button>
        <button className="primary-action" disabled={!valid} onClick={() => sendAction("submitRedistribute", hp, mp, gp)}>재분배</button>
      </div>
    </Modal>
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
  if (req.kind === "guardian") return <GuardianModal req={req} sendAction={sendAction} />;
  if (req.kind === "cleanse") return <CleanseModal req={req} sendAction={sendAction} />;
  return null;
}

function EliminationOverlay({ survivors, onSpectate }) {
  return (
    <Modal title="탈락">
      <div className="result-crest lose">✶</div>
      <div className="result-title">탈락했습니다</div>
      <div className="result-sub">전투에서 패배했지만 남은 결투를 관전할 수 있습니다.</div>
      <div className="rule-gold" style={{ margin: "14px 0 10px", fontSize: 12, textAlign: "center" }}>현재 생존자</div>
      <div className="spectate-survivors">
        {survivors.map((p) => (
          <span key={p.id} className="badge"><Avatar name={p.name} isBot={p.type === "ai"} size={20} /> {p.name}</span>
        ))}
      </div>
      <div className="modal-actions" style={{ justifyContent: "center" }}>
        <button className="primary-action" onClick={onSpectate}>관전 시작</button>
      </div>
    </Modal>
  );
}

function GameOverOverlay({ state, myId, ranking, playerWon, isHost, onRematch, onLobby }) {
  const rows = (ranking || []).map((r) => ({ rank: r.rank, participant: state.participants.find((p) => p.id === r.id) }));
  return (
    <Modal title="결투 종료">
      <div className={"result-crest " + (playerWon ? "win" : "lose")}>{playerWon ? "♛" : "✶"}</div>
      <div className="result-title">{playerWon ? "최후의 생존자" : "결투 종료"}</div>
      <div className="result-sub">{playerWon ? "당신이 마지막까지 살아남았습니다." : "당신은 탈락했지만 결투는 끝났습니다."}</div>
      <div className="rank-list">
        {rows.map(({ rank, participant }) => participant && (
          <div key={participant.id} className={"rank-row" + (rank === 1 ? " top" : "") + (participant.id === myId ? " me" : "")}>
            <span className="rk-no">{rank}</span>
            <Avatar name={participant.name} isBot={participant.type === "ai"} size={26} />
            <span className="rk-name">{participant.name}{participant.id === myId && <span className="chip">나</span>}</span>
            <span className="rk-tag muted">{ATL[participant.aiType]}</span>
          </div>
        ))}
      </div>
      <div className="modal-actions" style={{ justifyContent: "center" }}>
        <button onClick={onLobby}>로비로</button>
        <button className="primary-action" disabled={!isHost} onClick={onRematch}>{isHost ? "대기실로 · 다시 하기" : "방장 대기 중"}</button>
      </div>
    </Modal>
  );
}

Object.assign(window, { PendingModal, EliminationOverlay, GameOverOverlay });
