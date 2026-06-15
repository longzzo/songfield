/* =========================================================
  멀티 카드 결투 — Game components (새 디자인 / 서버 상태 렌더)
========================================================= */
const { useState, useEffect, useRef } = React;
/* CATEGORY_LABEL / PATH_LABEL / EMOTION_LABEL / AI_TYPE_LABEL / DISEASE_NAME / STAT /
   isProtectionScript / signed / logTypeLabel / canPayCost / cardSealed 는 engine.js 전역. */

function initials(name) { return (name || "?").trim().slice(0, 2); }

function Avatar({ name, isBot, size }) {
  return (
    <div className={"avatar " + (isBot ? "bot" : "human")} style={size ? { width: size, height: size, fontSize: Math.round(size * 0.42) } : null}>
      {initials(name)}
    </div>
  );
}

function ResourceMeters({ p }) {
  const rows = [["HP", "hp", p.hp, p.maxHp], ["MP", "mp", p.mp, p.maxMp], ["GP", "gp", p.gp, p.maxGp]];
  return (
    <>
      {rows.map(([k, cls, v, max]) => (
        <div key={k} className={"resource-meter meter-" + cls}>
          <div className="meter-label"><span>{k}</span><span>{v}/{max}</span></div>
          <div className="meter-track"><span style={{ width: Math.max(0, Math.min(100, (v / max) * 100)) + "%" }} /></div>
        </div>
      ))}
    </>
  );
}

function StatusBadges({ p }) {
  const list = [];
  if (p.statuses.bleeding > 0) list.push(["출혈 " + p.statuses.bleeding, "status-bleeding"]);
  if (p.statuses.vulnerable) list.push(["취약", "status-vulnerable"]);
  if (p.statuses.weakened) list.push(["위축", "status-weakened"]);
  if (p.statuses.confusion) list.push(["혼선", "status-confusion"]);
  if (p.statuses.blurred) list.push(["흐림", "status-blurred"]);
  if (p.statuses.riftMarked) list.push(["균열표식", "status-rift"]);
  if (p.statuses.disease > 0) list.push([DISEASE_NAME[p.statuses.disease], "status-disease"]);
  if (p.mod.nextDamageReduce > 0) list.push(["피해감소 " + p.mod.nextDamageReduce, "status-buff"]);
  if (p.mod.nextWeaponPowerDelta !== 0) list.push(["무기보정 " + signed(p.mod.nextWeaponPowerDelta), "status-buff"]);
  if (p.mod.preventNextStatus) list.push(["상태무효", "status-buff"]);
  if (p.mod.preventNextRift) list.push(["균열무효", "status-buff"]);
  const sealed = (p.hand || []).filter((c) => c.sealedTurns > 0).length;
  if (sealed > 0) list.push(["봉인 " + sealed, "status-seal"]);
  if (list.length === 0) return <span className="muted">상태 없음</span>;
  return <>{list.map(([t, c], i) => <span key={i} className={"status-badge " + c}>{t}</span>)}</>;
}

function GuardianBadge({ sigil }) {
  if (!sigil) return null;
  return <span className="guardian-sigil" title={sigil.text || sigil.name}>✦ {sigil.name}</span>;
}

function ParticipantRow({ p, isMe, selectable, current, online, onSelect }) {
  const offline = online === false;
  const cls = ["participant-row"];
  if (isMe) cls.push("player-row");
  if (current && p.alive) cls.push("current-turn");
  if (selectable) cls.push("selectable");
  if (!p.alive) cls.push("dead");
  else if (p.hp <= 12) cls.push("danger");
  return (
    <article className={cls.join(" ")} onClick={() => selectable && onSelect(p.id)}>
      <div className="participant-main">
        <div className="participant-title">
          <div className="participant-name">{p.name}{offline && p.alive && <span className="dot off" style={{ marginLeft: 5 }} />}</div>
          <div className="participant-role">{p.alive ? AI_TYPE_LABEL[p.aiType] : "전투 불능"}{isMe ? " · 나" : ""}</div>
        </div>
        <div className="participant-flags">
          {current && p.alive && <span className="turn-badge">턴</span>}
          {selectable && <span className="target-badge">대상</span>}
          {p.guardianSigil && <span className="badge badge-guardian" title={p.guardianSigil.name}>✦</span>}
        </div>
      </div>
      <div className="hp-judge"><strong>{p.hp}</strong><span>HP</span></div>
      <div className="participant-bars"><ResourceMeters p={p} /></div>
      <div className="participant-subline">
        <span>길 {PATH_LABEL[p.primaryPath || "none"]}</span>
        <span>감정 {EMOTION_LABEL[p.emotionPath || "none"]}</span>
        <span>손 {p.hand ? p.hand.length : 0}</span>
        <span>각인 {p.imprints ? p.imprints.length : 0}</span>
      </div>
      <div className="status-badges"><StatusBadges p={p} /></div>
    </article>
  );
}

function cardCostText(card) {
  const parts = [];
  if (card.cost.hp > 0) parts.push("HP " + card.cost.hp);
  if (card.cost.mp > 0) parts.push("MP " + card.cost.mp);
  if (card.cost.gp > 0) parts.push("GP " + card.cost.gp);
  return "비용 " + (parts.length ? parts.join(" / ") : "없음");
}
function cardEffText(card) {
  const parts = [];
  if (card.power > 0) parts.push("피해 " + card.power);
  if (card.guard > 0) parts.push("방어 " + card.guard);
  if (isProtectionScript(card)) parts.push("최종 피해 -3");
  return parts.length ? parts.join(" / ") : "보조 효과";
}

function HandCard({ card, clickable, sealed, selected, reason, onClick }) {
  const cls = ["card", "cat-" + card.category, "em-" + card.emotion, "emotion-border-" + card.emotion];
  if (!clickable) cls.push("disabled");
  if (sealed) cls.push("sealed");
  if (selected) cls.push("current");
  return (
    <article className={cls.join(" ")} onClick={() => onClick(card)}>
      {sealed && <div className="sealed-ribbon">봉인 {card.sealedTurns}</div>}
      <div className="card-head">
        <div className="card-name">{card.name}</div>
        <div className="chip-row"><span className={"category-chip category-" + card.category}>{CATEGORY_LABEL[card.category]}</span></div>
      </div>
      <div className="chip-row">
        <span className={"emotion-chip emotion-" + card.emotion}>{EMOTION_LABEL[card.emotion]}</span>
        <span className="price-chip">가격 {card.price}</span>
        {card.timing === "defense" && <span className="timing-chip">대응</span>}
      </div>
      <div className="card-cost-mini">{cardCostText(card)}</div>
      <div className="card-core">{cardEffText(card)}</div>
      {reason && <div className="unavailable-reason">{reason}</div>}
    </article>
  );
}

function SelectedCardDetail({ card }) {
  if (!card) return null;
  return (
    <>
      <div className="selected-card-head">
        <strong>{card.name}</strong>
        <span className={"category-chip category-" + card.category}>{CATEGORY_LABEL[card.category]}</span>
        <span className={"emotion-chip emotion-" + card.emotion}>{EMOTION_LABEL[card.emotion]}</span>
      </div>
      <div className="selected-card-meta">
        <span className="price-chip">가격 {card.price}</span>
        <span className="price-chip">{cardCostText(card)}</span>
        <span className="price-chip">{cardEffText(card)}</span>
      </div>
      <p>{card.text}</p>
    </>
  );
}

function ImprintList({ imprints, player, isTurn, sendAction }) {
  if (!imprints.length) return <span className="muted">등록된 마법 각인이 없습니다.</span>;
  return (
    <>
      {imprints.map((card) => {
        const usable = isTurn && canPayCost(player, card.cost);
        return (
          <div className="imprint-item" key={card.id}>
            <strong>{card.name}</strong>
            <span className="muted">MP {card.cost.mp} · {EMOTION_LABEL[card.emotion]}</span>
            <div className="imprint-actions">
              <button className="primary-action" disabled={!usable} onClick={() => sendAction("useImprint", card.id)}>사용</button>
              <button disabled={!isTurn} onClick={() => sendAction("releaseImprint", card.id)}>해제</button>
            </div>
          </div>
        );
      })}
    </>
  );
}

function CombatLog({ logs }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [logs.length]);
  return (
    <div className="log-list" ref={ref}>
      {logs.map((e) => (
        <div key={e.id} className={"log-entry log-" + e.type}>
          <span className="log-type">{logTypeLabel(e.type)}</span>
          <span className="txt">{e.text}</span>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, {
  Avatar, ResourceMeters, StatusBadges, GuardianBadge, ParticipantRow, HandCard, SelectedCardDetail,
  ImprintList, CombatLog, cardCostText, cardEffText,
});
