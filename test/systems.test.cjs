/* =========================================================
  신규 시스템(수호 각인·균열·흐림·정화/수호 선택·광역) 스모크 테스트
  결정론적으로 새 코드 경로를 직접 호출해 예외/상태를 검증.
  실행: node test/systems.test.cjs
========================================================= */
const { GameEngine } = require("../engine.js");
function assert(c, m) { if (!c) { console.error("FAIL:", m); process.exit(1); } }

const e = new GameEngine();
e.newGame([
  { id: "H1", nickname: "A", isBot: false },
  { id: "H2", nickname: "B", isBot: false },
  { id: "B1", nickname: "C", isBot: true, aiType: "aggressive" },
]);
e.state.turnGap = 999999; e.state.aiDelay = 999999; // 비동기 진행 정지(정적 검증)
const H1 = e.getParticipant("H1");
const H2 = e.getParticipant("H2");

// 1) 수호 각인 부여/발동/소실
assert(e.grantGuardianSigil(H1) === true, "수호각인 부여");
assert(H1.guardianSigil, "수호각인 보유");
e.forceTriggerGuardianSigil(H1); // 강제 발동(예외 없어야)
// 같은 각인 중복 방지: H2에게도 부여 → 다른 각인이어야
e.grantGuardianSigil(H2);
assert(!H2.guardianSigil || H2.guardianSigil.id !== H1.guardianSigil.id, "수호각인 좌석 간 고유");
H1.hp = 1; e.maybeBreakGuardianSigil(H1); // 예외 없어야

// 2) 균열: 강제 개방 후 이벤트 적용
e.state.riftOpened = true;
for (const ev of ["hp_minus_4", "mp_minus_2", "seal_card", "remove_card", "hp_plus_3"]) {
  e.applyRiftEffect(H1, ev); // 예외 없어야
}
assert(H1.hp >= 0, "균열 후 HP 유효");

// 3) 흐림: 대상 무작위 변경 경로
H1.statuses.blurred = true;
const card = { targetType: "enemy", name: "테스트검" };
const redirected = e.resolveBlurredTarget(H1, H2, card);
assert(redirected && redirected.id, "흐림 타깃 해석 결과 유효");
assert(H1.statuses.blurred === false, "흐림은 1회 소모");

// 4) 균열표식 + 상태 부여/정화
e.applyStatus(H2, "riftMarked");
e.applyStatus(H2, "blurred");
assert(H2.statuses.riftMarked && H2.statuses.blurred, "균열표식/흐림 부여");
const opts = e.getCleanseOptions(H2);
assert(opts.length > 0, "정화 후보 존재");
e.cleanseSelectedStatus(H2, "riftMarked");
assert(H2.statuses.riftMarked === false, "정화로 균열표식 제거");

// 5) 수호 선택 모달(멀티): 사람이면 pendingRequest, submit 으로 해소
let done1 = false;
e.openGuardianChoiceModal(H1, () => { done1 = true; });
assert(e.state.pendingRequest && e.state.pendingRequest.kind === "guardian" && e.state.pendingRequest.ownerId === "H1", "수호선택 모달 owner=H1");
assert(e.state.pendingRequest.choices.length >= 1, "수호선택 후보");
// 잘못된 좌석은 무시
e.submitGuardianChoice("H2", e.state.pendingRequest.choices[0].id);
assert(e.state.pendingRequest, "잘못된 좌석 submit 무시");
e.submitGuardianChoice("H1", e.state.pendingRequest.choices[0].id);
assert(!e.state.pendingRequest && done1, "수호선택 해소 + done 호출");

// 6) 정화 선택 모달(멀티)
H2.statuses.vulnerable = true; H2.statuses.weakened = true;
let done2 = false;
e.openCleanseStatusModal(H2, () => { done2 = true; });
assert(e.state.pendingRequest && e.state.pendingRequest.kind === "cleanse" && e.state.pendingRequest.ownerId === "H2", "정화 모달 owner=H2");
e.submitCleanse("H2", "vulnerable");
assert(!e.state.pendingRequest && done2 && H2.statuses.vulnerable === false, "정화 모달 해소");

// 7) 광역 공격 카드 식별
const aoe = require("../engine.js").CARDS.find((c) => c.effect === "area_damage_2_70");
assert(aoe && e.isAreaAttackCard(aoe), "광역 카드 식별");

// 8) 새 카드/효과 존재
const C = require("../engine.js").CARDS;
for (const fx of ["gain_guardian_sigil", "choose_guardian_sigil_2", "force_guardian_trigger_or_gain",
  "prevent_next_rift_event", "apply_rift_mark_and_blur_enemy", "rift_mark_on_hit",
  "area_damage_3_55_rift_mark", "reflect_weapon_2_if_blocked", "reflect_magic_2_if_blocked",
  "magic_guard_bonus_3", "area_guard_bonus_3"]) {
  assert(C.some((c) => c.effect === fx), `새 효과 카드 존재: ${fx}`);
}

console.log("PASS ✓  신규 시스템 스모크 테스트 통과 (수호/균열/흐림/모달/광역/새카드)");
process.exit(0);
