/* =========================================================
  멀티 카드 결투 — Game components (React via Babel)
========================================================= */
const { useState, useEffect, useRef, useMemo } = React;
/* CATEGORY_LABEL / PATH_LABEL / EMOTION_LABEL / AI_TYPE_LABEL / DISEASE_NAME / STAT /
   isProtectionScript / signed / logTypeLabel are globals from engine.js — use directly. */

function initials(name) {
  const t = (name || "?").trim();
  return t.slice(0, 2);
}

function Avatar({ name, isBot, size }) {
  return (
    <div className={"avatar " + (isBot ? "bot" : "human")} style={size ? { width: size, height: size } : null}>
      {initials(name)}
    </div>
  );
}

function ResourceBars({ p }) {
  const rows = [
    { k: "HP", cls: "hp", v: p.hp, max: p.maxHp },
    { k: "MP", cls: "mp", v: p.mp, max: p.maxMp },
    { k: "GP", cls: "gp", v: p.gp, max: p.maxGp },
  ];
  return (
    <div className="bars">
      {rows.map((r) => (
        <div key={r.k} className={"bar-row " + r.cls}>
          <span className="k">{r.k}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: Math.max(0, Math.min(100, (r.v / r.max) * 100)) + "%" }} /></span>
          <span className="v">{r.v}/{r.max}</span>
        </div>
      ))}
    </div>
  );
}

function StatusBadges({ p, compact }) {
  const list = [];
  if (p.statuses.bleeding > 0) list.push(["출혈 " + p.statuses.bleeding, "st-bleeding"]);
  if (p.statuses.vulnerable) list.push(["취약", "st-vulnerable"]);
  if (p.statuses.weakened) list.push(["위축", "st-weakened"]);
  if (p.statuses.confusion) list.push(["혼선", "st-confusion"]);
  if (p.statuses.disease > 0) list.push([DISEASE_NAME[p.statuses.disease], "st-disease"]);
  if (p.mod.nextDamageReduce > 0) list.push(["피해감소 " + p.mod.nextDamageReduce, "st-buff"]);
  if (p.mod.nextWeaponPowerDelta !== 0) list.push(["무기보정 " + signed(p.mod.nextWeaponPowerDelta), "st-buff"]);
  if (p.mod.preventNextStatus) list.push(["상태무효", "st-buff"]);
  const sealed = p.hand.filter((c) => c.sealedTurns > 0).length;
  if (sealed > 0) list.push(["봉인 " + sealed, "st-seal"]);
  if (list.length === 0) return <span className="muted">상태 없음</span>;
  return <>{list.map(([t, c], i) => <span key={i} className={"status-badge " + c}>{t}</span>)}</>;
}

function ParticipantCard({ p, selectable, current, online, onSelect }) {
  const offline = online === false;
  const cls = ["pcard"];
  if (!p.alive) cls.push("dead");
  if (selectable) cls.push("selectable");
  if (current && p.alive) cls.push("current");
  if (offline && p.alive) cls.push("offline");
  return (
    <article className={cls.join(" ")} onClick={() => selectable && onSelect(p.id)}>
      <div className="pcard-flags">
        {current && p.alive && <span className="flag turn">현재 턴</span>}
        {selectable && <span className="flag target">선택 가능</span>}
        {!p.alive && <span className="flag eliminated">탈락</span>}
      </div>
      <div className="pcard-head">
        <Avatar name={p.name} isBot={p.type !== "player"} />
        <div>
          <div className="nm">{p.name}{p.alive && <span className={"dot " + (offline ? "off" : "on")} />}</div>
          <div className="ai-type">{p.alive ? AI_TYPE_LABEL[p.aiType] : "전투 불능"}</div>
        </div>
      </div>
      <ResourceBars p={p} />
      <div className="pcard-meta">
        <span className="tiny">손패 {p.hand.length}</span>
        <span className="tiny">각인 {p.imprints.length}/3</span>
        <span className="tiny">길 {PATH_LABEL[p.primaryPath || "none"]}</span>
        <span className="tiny">감정 {EMOTION_LABEL[p.emotionPath || "none"]}</span>
      </div>
      <div className="pcard-status"><StatusBadges p={p} /></div>
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

function CardChips({ card }) {
  return (
    <div className="hc-chips">
      <span className={"chip em-" + card.emotion}>{EMOTION_LABEL[card.emotion]}</span>
      <span className="chip">가격 {card.price}</span>
      {card.timing === "defense" && <span className="chip">대응 전용</span>}
    </div>
  );
}

function HandCard({ card, clickable, sealed, reason, onClick }) {
  const cls = ["hcard", "em-" + card.emotion];
  if (!clickable) cls.push("disabled");
  if (sealed) cls.push("sealed");
  return (
    <article className={cls.join(" ")} onClick={() => clickable && onClick(card.instanceId)}>
      {sealed && <div className="seal-ribbon">봉인 {card.sealedTurns}</div>}
      <div className="hc-head">
        <div className="hc-name">{card.name}</div>
        <span className={"chip cat-" + card.category}>{CATEGORY_LABEL[card.category]}</span>
      </div>
      <CardChips card={card} />
      <div className="hc-stat hc-cost">{cardCostText(card)}</div>
      <div className="hc-stat hc-eff">{cardEffText(card)}</div>
      <div className="hc-text">{card.text}</div>
      {reason && <div className="hc-reason">{reason}</div>}
    </article>
  );
}

function ImprintList({ imprints, player, isTurn, engine }) {
  if (!imprints.length) return <span className="muted">등록된 마법 각인이 없습니다.</span>;
  return (
    <div className="imprint-list">
      {imprints.map((card) => {
        const usable = isTurn && engine.canPay(player, card.cost);
        return (
          <div className="imprint-item" key={card.id}>
            <div className="imp-name">{card.name}<span className={"chip em-" + card.emotion} style={{ marginLeft: "auto" }}>{EMOTION_LABEL[card.emotion]}</span></div>
            <div className="imp-sub">MP {card.cost.mp} · {card.text}</div>
            <div className="imprint-actions">
              <button className="btn sm gold" disabled={!usable} onClick={() => engine.useImprint(card.id)}>사용</button>
              <button className="btn sm ghost" disabled={!isTurn} onClick={() => engine.releaseImprint(card.id)}>해제</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CombatLog({ logs }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [logs.length]);
  return (
    <div className="log-list" ref={ref}>
      {logs.map((e) => (
        <div key={e.id} className={"log-entry log-" + e.type}>
          <span className="log-tag">{logTypeLabel(e.type)}</span>
          <span className="txt">{e.text}</span>
        </div>
      ))}
    </div>
  );
}

/* Turn timer — counts down during the player's action turn. */
function TurnTimer({ activeKey, durationMs, onTimeout }) {
  const [remain, setRemain] = useState(durationMs);
  const firedRef = useRef(false);
  useEffect(() => {
    firedRef.current = false;
    setRemain(durationMs);
    if (activeKey == null) return;
    const start = Date.now();
    const id = setInterval(() => {
      const left = Math.max(0, durationMs - (Date.now() - start));
      setRemain(left);
      if (left <= 0 && !firedRef.current) { firedRef.current = true; clearInterval(id); onTimeout(); }
    }, 100);
    return () => clearInterval(id);
  }, [activeKey, durationMs]);
  const pct = Math.max(0, Math.min(100, (remain / durationMs) * 100));
  const low = remain <= durationMs * 0.33;
  return (
    <div className="timer-wrap">
      <div className="timer-label"><span>턴 시간</span><span>{Math.ceil(remain / 1000)}초</span></div>
      <div className="timer-track"><div className={"timer-fill" + (low ? " low" : "")} style={{ width: pct + "%" }} /></div>
    </div>
  );
}

Object.assign(window, {
  Avatar, ResourceBars, StatusBadges, ParticipantCard, HandCard, CardChips,
  ImprintList, CombatLog, TurnTimer, cardCostText, cardEffText,
});
