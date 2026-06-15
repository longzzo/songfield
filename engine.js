"use strict";
/* =========================================================
  멀티 카드 결투 — Game Engine (ported 1:1 from main.js)
  DOM/prompt 의존부만 pendingRequest + emit 으로 교체.
  전투 공식 / 카드 효과 / AI 로직은 변경 없이 이식.
========================================================= */

const STAT = {
  startHp: 40, startMp: 10, startGp: 15,
  maxHp: 50, maxMp: 20, maxGp: 30,
  startHand: 7, maxHand: 12, maxImprints: 3,
};

const CATEGORY_LABEL = { weapon: "무기", armor: "방어구", item: "잡화", trade: "거래", miracle: "기적", special: "특수" };
const PATH_LABEL = { aura: "오러", alchemy: "연금", trade: "거래", magic: "마법", holy: "성법", balance: "균형", none: "미도달" };
const EMOTION_LABEL = { neutral: "무속성", rage: "분노", fear: "공포", hope: "희망", calm: "평온", chaos: "혼란", none: "없음" };
const AI_TYPE_LABEL = {
  aggressive: "공격형", defensive: "방어형", alchemist: "연금형", trader: "거래형", mage: "마법형",
  holy: "성법형", vengeful: "복수형", opportunist: "기회주의형", chaotic: "혼란형", human: "플레이어",
};
const AI_TYPES = ["aggressive", "defensive", "alchemist", "trader", "mage", "holy", "vengeful", "opportunist", "chaotic"];

/* ----- 수호 각인 / 균열 (신규 시스템) ----- */
const GUARDIAN_SIGILS = [
  { id: "sigil_dawn", name: "새벽의 가호", emotion: "hope", text: "회복과 정화를 번갈아 내리는 수호 각인.", actions: [
    { weight: 45, effect: "heal_1", text: "HP를 1 회복한다." },
    { weight: 30, effect: "gain_mp_1", text: "MP를 1 회복한다." },
    { weight: 25, effect: "remove_minor_status", text: "경증 상태이상 1개를 제거한다." },
  ] },
  { id: "sigil_ember", name: "잿불의 가호", emotion: "rage", text: "작은 공격과 전투 충동을 일으키는 수호 각인.", actions: [
    { weight: 50, effect: "random_enemy_damage_1", text: "무작위 적에게 1 피해를 준다." },
    { weight: 30, effect: "next_weapon_power_up_1", text: "다음 무기 피해가 1 증가한다." },
    { weight: 20, effect: "random_enemy_vulnerable", text: "무작위 적에게 취약을 부여한다." },
  ] },
  { id: "sigil_stillness", name: "고요의 가호", emotion: "calm", text: "방어와 안정에 치우친 수호 각인.", actions: [
    { weight: 45, effect: "remove_minor_status", text: "경증 상태이상 1개를 제거한다." },
    { weight: 35, effect: "next_damage_reduce_1", text: "다음에 받을 피해를 1 줄인다." },
    { weight: 20, effect: "heal_1", text: "HP를 1 회복한다." },
  ] },
  { id: "sigil_rift", name: "균열의 가호", emotion: "chaos", text: "손패와 봉인을 뒤흔드는 불안정한 수호 각인.", actions: [
    { weight: 45, effect: "replace_one_card", text: "손패 1장을 무작위 교체한다." },
    { weight: 35, effect: "seal_random_enemy_card", text: "무작위 적의 손패 1장을 봉인한다." },
    { weight: 20, effect: "gain_gp_1", text: "GP를 1 얻는다." },
  ] },
  { id: "sigil_coin", name: "동전의 가호", emotion: "neutral", text: "거래 자원을 보태는 수호 각인.", actions: [
    { weight: 60, effect: "gain_gp_1", text: "GP를 1 얻는다." },
    { weight: 25, effect: "gain_gp_2", text: "GP를 2 얻는다." },
    { weight: 15, effect: "random_enemy_gp_minus_1", text: "무작위 적의 GP를 1 줄인다." },
  ] },
  { id: "sigil_tide", name: "잔물결의 가호", emotion: "hope", text: "마력과 체력을 천천히 보충하는 수호 각인.", actions: [
    { weight: 45, effect: "gain_mp_1", text: "MP를 1 회복한다." },
    { weight: 35, effect: "heal_1", text: "HP를 1 회복한다." },
    { weight: 20, effect: "remove_bleeding", text: "출혈을 제거한다." },
  ] },
];
const RIFT_EVENTS = [
  { id: "rift_wound", name: "균열 상처", effect: "hp_minus_4", text: "금역의 틈에서 날카로운 기운이 새어 나옵니다. HP -4." },
  { id: "rift_mana_leak", name: "마력 누수", effect: "mp_minus_2", text: "흐트러진 마력이 금역으로 빨려 들어갑니다. MP -2." },
  { id: "rift_seal_shard", name: "봉인 파편", effect: "seal_card", text: "깨진 봉인의 파편이 손패에 들러붙습니다. 카드 1장 봉인." },
  { id: "rift_memory_loss", name: "기억 손실", effect: "remove_card", text: "금역의 잡음이 손패 하나를 지워 버립니다. 카드 1장 소실." },
  { id: "rift_afterglow", name: "잔광", effect: "hp_plus_3", text: "무너진 금역 사이로 희미한 빛이 스며듭니다. HP +3." },
];
const RIFT_OPEN_ROUND = 8;
const RIFT_EVENT_RATE = 0.15;

const PATH_GAIN = {
  weapon: { path: "aura", value: 0.7 }, armor: { path: "aura", value: 0.7 },
  item: { path: "alchemy", value: 1.0 }, trade: { path: "trade", value: 1.2 },
  miracle: { path: "magic", value: 1.4 }, special: { path: "holy", value: 1.3 },
  pray: { path: "holy", value: 1.3 }, forgive: { path: "holy", value: 1.3 }, offer: { path: "holy", value: 1.3 },
};
const PATH_RATES = {
  none: { weapon: 35, armor: 28, item: 16, trade: 12, miracle: 7, special: 2 },
  aura: { weapon: 39, armor: 33, item: 13, trade: 9, miracle: 5, special: 1 },
  alchemy: { weapon: 32, armor: 26, item: 26, trade: 10, miracle: 4, special: 2 },
  trade: { weapon: 31, armor: 25, item: 14, trade: 24, miracle: 4, special: 2 },
  magic: { weapon: 31, armor: 24, item: 13, trade: 9, miracle: 21, special: 2 },
  holy: { weapon: 31, armor: 27, item: 17, trade: 9, miracle: 6, special: 10 },
  balance: { weapon: 34, armor: 29, item: 17, trade: 12, miracle: 6, special: 2 },
};
const EMOTION_RATES = {
  none: { neutral: 40, rage: 16, fear: 13, hope: 14, calm: 10, chaos: 7 },
  rage: { neutral: 34, rage: 26, fear: 12, hope: 12, calm: 9, chaos: 7 },
  fear: { neutral: 35, rage: 14, fear: 24, hope: 12, calm: 8, chaos: 7 },
  hope: { neutral: 35, rage: 13, fear: 11, hope: 25, calm: 10, chaos: 6 },
  calm: { neutral: 36, rage: 13, fear: 11, hope: 13, calm: 20, chaos: 7 },
  chaos: { neutral: 37, rage: 13, fear: 12, hope: 12, calm: 8, chaos: 18 },
};
const DISEASE_NAME = ["정상", "열감", "과열증", "붕괴열"];

const CARD_CSV = `id,name,category,path,emotion,price,hpCost,mpCost,gpCost,power,guard,effect,rarity,timing,targetType,imprint,text
weapon_training_sword,수련검,weapon,aura,neutral,2,0,0,0,3,0,none,4,active,enemy,false,대상 1명에게 3 피해를 준다.
weapon_long_sword,장검,weapon,aura,neutral,4,0,0,0,5,0,none,4,active,enemy,false,대상 1명에게 5 피해를 준다.
weapon_iron_mace,철퇴,weapon,aura,neutral,5,0,0,0,6,0,none,2,active,enemy,false,대상 1명에게 6 피해를 준다.
weapon_piercing_spear,관통창,weapon,aura,neutral,5,0,0,0,4,0,pierce_1,2,active,enemy,false,대상 1명에게 4 피해를 준다. 방어값을 1 무시한다.
weapon_throwing_axe,투척도끼,weapon,aura,neutral,3,0,0,0,4,0,none,4,active,enemy,false,대상 1명에게 4 피해를 준다.
weapon_heavy_greatsword,묵직한 대검,weapon,aura,neutral,8,0,0,0,8,0,none,1,active,enemy,false,대상 1명에게 8 피해를 준다.
weapon_rage_rending_blade,찢는 검,weapon,aura,rage,5,0,0,0,4,0,bleeding_on_hit,4,active,enemy,false,대상 1명에게 4 피해를 준다. 피해를 주면 출혈을 부여한다.
weapon_rage_crack_strike,균열타,weapon,aura,rage,5,0,0,0,3,0,vulnerable_on_hit,2,active,enemy,false,대상 1명에게 3 피해를 준다. 피해를 주면 취약을 부여한다.
weapon_rage_berserk_lance,폭주창,weapon,aura,rage,5,2,0,0,7,0,none,1,active,enemy,false,내 HP를 2 잃고 대상 1명에게 7 피해를 준다.
weapon_rage_execution_axe,격노도끼,weapon,aura,rage,6,0,0,0,5,0,low_hp_bonus_2,1,active,enemy,false,대상 1명에게 5 피해를 준다. 내 HP가 15 이하이면 피해가 2 증가한다.
weapon_fear_needle,공포의 송곳,weapon,aura,fear,4,0,0,0,3,0,weakened_on_hit,4,active,enemy,false,대상 1명에게 3 피해를 준다. 피해를 주면 위축을 부여한다.
weapon_fear_intimidating_mace,위압철퇴,weapon,aura,fear,5,0,0,0,4,0,bonus_vs_weakened_2,2,active,enemy,false,대상 1명에게 4 피해를 준다. 대상이 위축 상태이면 피해가 2 증가한다.
weapon_fear_chain_blade,사슬검,weapon,aura,fear,4,0,0,0,3,0,next_weapon_power_down_1_on_hit,1,active,enemy,false,대상 1명에게 3 피해를 준다. 피해를 주면 대상의 다음 무기 피해가 1 감소한다.
weapon_hope_dawn_sword,새벽검,weapon,aura,hope,5,0,0,0,4,0,heal_self_1_on_hit,4,active,enemy,false,대상 1명에게 4 피해를 준다. 피해를 주면 내 HP를 1 회복한다.
weapon_hope_resolve_spear,결의의 창,weapon,aura,hope,5,0,0,0,3,0,low_hp_bonus_3,1,active,enemy,false,대상 1명에게 3 피해를 준다. 내 HP가 15 이하이면 피해가 3 증가한다.
weapon_calm_quiet_strike,고요한 일격,weapon,aura,calm,5,0,0,0,3,0,remove_minor_status_self,2,active,enemy,false,대상 1명에게 3 피해를 준다. 사용 후 내 경증 상태이상 1개를 제거한다.
weapon_calm_guardian_blade,수호검,weapon,aura,calm,5,0,0,0,4,0,next_damage_reduce_1,2,active,enemy,false,대상 1명에게 4 피해를 준다. 다음에 내가 받는 피해가 1 감소한다.
weapon_chaos_twisted_blade,뒤틀린 칼날,weapon,aura,chaos,6,0,0,0,4,0,confusion_50_on_hit,1,active,enemy,false,대상 1명에게 4 피해를 준다. 피해를 주면 50% 확률로 혼선을 부여한다.
armor_leather_guard,가죽 방패,armor,aura,neutral,2,0,0,0,0,3,none,4,defense,defense,false,피해를 3 줄인다.
armor_iron_shield,철 방패,armor,aura,neutral,4,0,0,0,0,5,none,4,defense,defense,false,피해를 5 줄인다.
armor_tower_shield,대형 방패,armor,aura,neutral,6,0,0,0,0,7,none,2,defense,defense,false,피해를 7 줄인다.
armor_reinforced_coat,보강 외투,armor,aura,neutral,4,0,0,0,0,4,prevent_bleeding_once,4,defense,defense,false,피해를 4 줄인다. 이번 공격으로 출혈이 부여될 경우 막는다.
armor_parry_buckler,받아넘기는 버클러,armor,aura,neutral,4,0,0,0,0,3,counter_1_if_blocked,2,defense,defense,false,피해를 3 줄인다. 최종 피해가 0이면 공격자에게 1 피해를 준다.
armor_rage_spiked_guard,가시 견갑,armor,aura,rage,5,0,0,0,0,4,vulnerable_if_blocked,2,defense,defense,false,피해를 4 줄인다. 최종 피해가 0이면 공격자에게 취약을 부여한다.
armor_rage_blood_armor,혈기 갑옷,armor,aura,rage,6,0,0,0,0,5,next_weapon_power_up_1,1,defense,defense,false,피해를 5 줄인다. 방어 후 내 다음 무기 피해가 1 증가한다.
armor_fear_shadow_cloak,그림자 망토,armor,aura,fear,5,0,0,0,0,4,enemy_next_weapon_power_down_1,4,defense,defense,false,피해를 4 줄인다. 방어 후 공격자의 다음 무기 피해가 1 감소한다.
armor_fear_calm_mask,진정 가면,armor,aura,fear,4,0,0,0,0,3,remove_weakened_self,1,defense,defense,false,피해를 3 줄인다. 방어 후 내 위축을 제거한다.
armor_hope_dawn_emblem,새벽 문장갑,armor,aura,hope,4,0,0,0,0,3,heal_self_1,4,defense,defense,false,피해를 3 줄인다. 방어 후 내 HP를 1 회복한다.
armor_hope_oath_plate,맹세 흉갑,armor,aura,hope,6,0,0,0,0,5,low_hp_guard_bonus_2,1,defense,defense,false,피해를 5 줄인다. 내 HP가 15 이하이면 방어값이 2 증가한다.
armor_calm_still_barrier,고요 장막,armor,aura,calm,5,0,0,0,0,4,prevent_confusion,2,defense,defense,false,피해를 4 줄인다. 이번 공격으로 혼선이 부여될 경우 막는다.
armor_calm_clear_guard,정심 방패,armor,aura,calm,5,0,0,0,0,3,remove_minor_status_self,2,defense,defense,false,피해를 3 줄인다. 방어 후 내 경증 상태이상 1개를 제거한다.
armor_chaos_unstable_wall,불안정 방벽,armor,aura,chaos,4,0,0,0,0,5,random_guard_plus_or_minus_2,1,defense,defense,false,피해를 5 줄인다. 50% 확률로 방어값이 2 증가하고 실패하면 2 감소한다.
item_hope_bandage,응급 붕대,item,alchemy,hope,3,0,0,0,0,0,heal_self_4,4,active,self,false,내 HP를 4 회복한다.
item_hope_regen_ampoule,재생 앰플,item,alchemy,hope,4,0,0,0,0,0,heal_self_2_remove_bleeding,2,active,self,false,내 HP를 2 회복한다. 내 출혈을 제거한다.
item_calm_antipyretic,해열제,item,alchemy,calm,4,0,0,0,0,0,disease_down_1_self,4,active,self,false,내 질병 단계를 1 낮춘다.
item_calm_purifier,정화 용액,item,alchemy,calm,5,0,0,0,0,0,remove_minor_status_self,2,active,self,false,내 경증 상태이상 1개를 제거한다.
item_calm_stabilizer,안정제,item,alchemy,calm,6,0,0,0,0,0,remove_seal_or_confusion_self,1,active,self,false,내 봉인 또는 혼선 중 하나를 제거한다.
item_neutral_sorting_tool,정렬 도구,item,alchemy,neutral,3,0,0,0,0,0,replace_one_card_self,4,active,self,false,손패 1장을 선택해 버리고 새 카드 1장을 획득한다.
item_neutral_hardening_salve,경화 연고,item,alchemy,neutral,3,0,0,0,0,0,next_damage_reduce_2,2,active,self,false,다음에 내가 받는 피해가 2 감소한다.
item_rage_catalyst_powder,촉매 가루,item,alchemy,rage,4,0,0,0,0,0,next_weapon_power_up_2,4,active,self,false,내 다음 무기 피해가 2 증가한다.
item_fear_numbing_dust,마비 분말,item,alchemy,fear,4,0,0,0,0,0,apply_weakened_enemy,2,active,enemy,false,대상 1명에게 위축을 부여한다.
item_chaos_unstable_reagent,불안정 시약,item,alchemy,chaos,5,2,0,0,0,0,disease_up_1_enemy,1,active,enemy,false,내 HP를 2 잃는다. 대상 1명의 질병 단계를 1 올린다.
trade_neutral_exchange,환전,trade,trade,neutral,4,0,0,0,0,0,redistribute_resources,4,active,self,false,내 HP MP GP를 원하는 만큼 재분배한다. 단 HP는 1 미만으로 만들 수 없다.
trade_hope_small_funding,소액 융자,trade,trade,hope,3,0,0,0,0,0,gain_gp_4,4,active,self,false,내 GP를 4 얻는다.
trade_fear_forced_sale,강매,trade,trade,fear,5,0,0,0,0,0,sell_own_card_to_target_by_price,4,active,enemy,false,내 손패 1장을 선택해 대상에게 판다. 대상은 그 카드 가격만큼 GP를 잃고 부족분은 HP 피해로 받는다.
trade_chaos_risky_contract,위험 계약,trade,trade,chaos,5,3,0,0,0,0,draw_cards_2,1,active,self,false,내 HP를 3 잃고 카드 2장을 획득한다.
trade_calm_insurance,보험 증서,trade,trade,calm,5,0,0,2,0,0,next_damage_reduce_4,2,active,self,false,GP를 2 지불한다. 다음에 내가 받는 피해가 4 감소한다.
trade_fear_purchase,매입,trade,trade,fear,7,0,0,0,0,0,reveal_random_target_card_and_buy_by_price,1,active,enemy,false,대상 손패 1장을 무작위로 공개한다. 그 카드 가격만큼 GP를 지불하면 가져온다.
trade_hope_collateral,담보 계약,trade,trade,hope,4,3,0,0,0,0,gain_mp_4,2,active,self,false,내 HP를 3 잃고 MP를 4 얻는다.
miracle_neutral_mana_bolt,마력탄,miracle,magic,neutral,5,0,2,0,3,0,magic_damage_3,4,active,enemy,true,대상 1명에게 3 피해를 준다. 사용 후 마법 각인에 등록된다.
miracle_rage_flame_mark,화염문장,miracle,magic,rage,6,0,3,0,5,0,magic_damage_5,2,active,enemy,true,대상 1명에게 5 피해를 준다. 사용 후 마법 각인에 등록된다.
miracle_fear_dread_mark,공포각인,miracle,magic,fear,5,0,2,0,0,0,apply_weakened_enemy,4,active,enemy,true,대상 1명에게 위축을 부여한다. 사용 후 마법 각인에 등록된다.
miracle_fear_seal_script,봉쇄문장,miracle,magic,fear,7,0,3,0,0,0,seal_random_target_card,1,active,enemy,true,대상 손패 중 무작위 카드 1장을 1턴 동안 봉인한다. 사용 후 마법 각인에 등록된다.
miracle_hope_recovery_mark,회복문장,miracle,magic,hope,7,0,3,0,0,0,heal_self_5,4,active,self,true,내 HP를 5 회복한다. 사용 후 마법 각인에 등록된다.
miracle_hope_revival_script,재기문장,miracle,magic,hope,8,0,4,0,0,0,heal_self_3_disease_down_1,1,active,self,true,내 HP를 3 회복하고 질병 단계를 1 낮춘다. 사용 후 마법 각인에 등록된다.
miracle_calm_still_barrier,평온장막,miracle,magic,calm,6,0,2,0,0,0,remove_minor_status_self,2,active,self,true,내 경증 상태이상 1개를 제거한다. 사용 후 마법 각인에 등록된다.
miracle_chaos_disorder_spell,혼선주문,miracle,magic,chaos,7,0,3,0,0,0,apply_confusion_enemy,2,active,enemy,true,대상 1명에게 혼선을 부여한다. 사용 후 마법 각인에 등록된다.
special_calm_meditation,묵상,special,holy,calm,5,0,0,0,0,0,draw_choice_2_pick_1,4,active,self,false,카드 2장을 확인하고 그중 1장을 선택해 획득한다.
special_hope_protection_script,보호문,special,holy,hope,4,0,0,0,0,0,reduce_final_damage_3,4,defense,defense,false,상대 공격 대응 시 사용할 수 있다. 최종 피해를 3 감소시킨다. 방어구로 취급하지 않는다.
special_neutral_offering_script,봉헌문,special,holy,neutral,6,0,0,0,0,0,sacrifice_1_or_2_draw_plus_1,2,active,self,false,손패를 1~2장 선택해 바친다. 바친 수보다 1장 많은 새 카드를 획득한다.
special_calm_purification_prayer,정화기도,special,holy,calm,8,0,0,0,0,0,remove_one_status_or_disease_down_1,1,active,self,false,내 상태이상 1개를 제거한다. 질병을 선택하면 질병 단계를 1 낮춘다.
special_hope_guardian_script,수호문,special,holy,hope,7,0,0,0,0,0,gain_guardian_sigil,1,active,self,false,무작위 수호 각인 1개를 얻는다. 이미 수호 각인이 있으면 새 각인으로 교체한다.
weapon_rage_splinter_rain,파편비,weapon,aura,rage,6,0,0,0,2,0,area_damage_2_70,1,active,allEnemies,false,모든 적에게 70% 확률로 2 피해를 준다.
weapon_chaos_rift_burst,균열폭발,weapon,aura,chaos,7,0,0,0,3,0,area_damage_3_55_rift_mark,1,active,allEnemies,false,모든 적에게 55% 확률로 3 피해를 준다. 피해를 주면 균열표식을 부여한다.
weapon_chaos_mark_dagger,표식 단검,weapon,aura,chaos,4,0,0,0,2,0,rift_mark_on_hit,2,active,enemy,false,대상 1명에게 2 피해를 준다. 피해를 주면 균열표식을 부여한다.
armor_fear_echo_shield,반향 방패,armor,aura,fear,6,0,0,0,0,4,reflect_weapon_2_if_blocked,1,defense,defense,false,피해를 4 줄인다. 무기 공격을 완전히 막으면 공격자에게 2 피해를 되돌린다.
armor_calm_moon_ward,월광 결계,armor,aura,calm,6,0,0,0,0,3,magic_guard_bonus_3,1,defense,defense,false,피해를 3 줄인다. 기적 공격을 막을 때 방어값이 3 증가한다.
armor_chaos_spell_mirror,주문 거울,armor,aura,chaos,7,0,0,0,0,3,reflect_magic_2_if_blocked,1,defense,defense,false,기적 공격에만 대응할 수 있다. 기적 피해를 완전히 막으면 공격자에게 2 피해를 되돌린다.
armor_hope_sky_canopy,하늘 덮개,armor,aura,hope,5,0,0,0,0,2,area_guard_bonus_3,2,defense,defense,false,피해를 2 줄인다. 광역 공격을 막을 때 방어값이 3 증가한다.
special_hope_guardian_pact,성약문,special,holy,hope,8,0,0,0,0,0,choose_guardian_sigil_2,1,active,self,false,수호 각인 후보 2개 중 1개를 선택해 얻는다. 이미 수호 각인이 있으면 교체한다.
special_calm_grace_amplifier,가호 증폭,special,holy,calm,6,0,0,0,0,0,force_guardian_trigger_or_gain,2,active,self,false,수호 각인이 있으면 즉시 1회 발동시킨다. 수호 각인이 없으면 무작위 수호 각인을 얻는다.
special_calm_forbidden_compass,금역나침반,special,holy,calm,6,0,0,0,0,0,prevent_next_rift_event,2,active,self,false,다음에 내가 받을 균열 현상 1회를 무효화한다.
special_chaos_rift_shard,금역의 파편,special,holy,chaos,7,0,0,0,0,0,apply_rift_mark_and_blur_enemy,1,active,enemy,false,대상에게 균열표식과 흐림을 부여한다.
special_hope_sanctuary_declaration,성역선언,special,holy,hope,6,0,0,0,0,0,prevent_next_status_once,2,active,self,false,다음에 내가 받을 상태이상 부여를 1회 무효화한다. 내 다음 턴 종료 시까지 지속된다.`;

function parseCards(csv) {
  const lines = csv.trim().split("\n");
  const header = lines.shift().split(",");
  return lines.map((line) => {
    const values = line.split(",");
    const row = Object.fromEntries(header.map((key, index) => [key, values[index]]));
    return {
      id: row.id, name: row.name, category: row.category, path: row.path, emotion: row.emotion,
      price: Number(row.price), cost: { hp: Number(row.hpCost), mp: Number(row.mpCost), gp: Number(row.gpCost) },
      power: Number(row.power), guard: Number(row.guard), effect: row.effect, rarity: Number(row.rarity),
      timing: row.timing, targetType: row.targetType, imprint: row.imprint === "true", text: row.text,
    };
  });
}
const CARDS = parseCards(CARD_CSV);

/* ---------- pure utils ---------- */
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function signed(value) { return value >= 0 ? `+${value}` : `${value}`; }
function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function randomItem(items) { return items[Math.floor(Math.random() * items.length)]; }
function weightedPick(weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [key, weight] of entries) { roll -= weight; if (roll <= 0) return key; }
  return entries[entries.length - 1][0];
}
function weightedPickObject(items, weightFn) {
  const total = items.reduce((sum, item) => sum + weightFn(item), 0);
  let roll = Math.random() * total;
  for (const item of items) { roll -= weightFn(item); if (roll <= 0) return item; }
  return items[items.length - 1];
}
function beats(a, b) {
  return (
    (a === "rage" && b === "fear") || (a === "fear" && b === "hope") || (a === "hope" && b === "rage") ||
    (a === "calm" && b === "chaos") || (a === "chaos" && b === "calm")
  );
}
function statusLabel(status) {
  return { bleeding: "출혈", vulnerable: "취약", weakened: "위축", confusion: "혼선", riftMarked: "균열표식", blurred: "흐림" }[status] || status;
}
function isProtectionScript(card) { return card?.effect === "reduce_final_damage_3"; }

/* =========================================================
  GameEngine
========================================================= */
class GameEngine {
  constructor() {
    this.listeners = new Set();
    this.instanceSeq = 1;
    this.gameSeq = 1;
    this.state = null;
    this.pendingDefense = null;
    this._choiceCtx = null;
    this._redistCtx = null;
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((fn) => fn()); }

  /* ----- accessors ----- */
  getParticipant(id) { return this.state?.participants.find((p) => p.id === id) || null; }
  livingParticipants() { return this.state.participants.filter((p) => p.alive); }
  // 서버 권위형: 특정 좌석(actorId)이 지금 행동할 차례인지. (예전 isPlayerTurn 대체)
  isActorTurn(actorId) { return this.state.phase === "playerAction" && this.state.currentActorId === actorId && !this.state.gameOver; }
  isHuman(p) { return p && p.type !== "ai"; }
  isCardSealed(card) { return card.sealedTurns > 0; }
  canPay(actor, cost) { return actor.hp > cost.hp && actor.mp >= cost.mp && actor.gp >= cost.gp; }

  /* ----- logging ----- */
  log(text, type = null) {
    if (!this.state) return;
    this.state.logs.push({ id: this.state.logSeq++, type: type || inferLogType(text), text });
    if (this.state.logs.length > 220) this.state.logs.shift();
  }

  /* =========================================================
    게임 상태 생성  (roster = [{id, nickname, isBot, aiType}])
  ========================================================= */
  newGame(roster) {
    this.instanceSeq = 1;
    const gameId = this.gameSeq++;

    const participants = [];
    roster.forEach((r, i) => {
      // 서버 권위형: 봇만 "ai", 사람은 모두 "human"(상호작용 좌석).
      const isBot = !!r.isBot;
      const type = isBot ? "ai" : "human";
      const aiType = isBot ? (r.aiType || AI_TYPES[i % AI_TYPES.length]) : "human";
      const p = this.createParticipant(r.id || `p${i}`, r.nickname, type, aiType);
      participants.push(p);
    });

    const order = shuffle(participants.map((p) => p.id));
    this.state = {
      gameId, participants, order, orderIndex: 0, round: 1, phase: "init",
      currentActorId: null, pendingAction: null, pendingRequest: null,
      gameOver: false, winnerId: null, riftOpened: false,
      eliminationOrder: [], logs: [], logSeq: 1, aiDelay: 650, turnGap: 200,
    };
    this.pendingDefense = null;

    participants.forEach((p) => { for (let i = 0; i < STAT.startHand; i += 1) this.drawCard(p, false); });
    this.log("전투 시작. 턴 순서가 무작위로 결정되었습니다.", "system");
    this.emit();
    this.beginTurn(gameId);
  }

  createParticipant(id, name, type, aiType) {
    return {
      id, name, type, aiType,
      hp: STAT.startHp, mp: STAT.startMp, gp: STAT.startGp,
      maxHp: STAT.maxHp, maxMp: STAT.maxMp, maxGp: STAT.maxGp,
      hand: [], imprints: [], guardianSigil: null, alive: true, recentAttacker: null,
      primaryPath: null, emotionPath: null,
      pathScores: { aura: 0, alchemy: 0, trade: 0, magic: 0, holy: 0 },
      emotionCounts: { rage: 0, fear: 0, hope: 0, calm: 0, chaos: 0 },
      statuses: { bleeding: 0, vulnerable: false, weakened: false, confusion: false, riftMarked: false, blurred: false, disease: 0 },
      mod: { nextDamageReduce: 0, nextWeaponPowerDelta: 0, preventNextStatus: false, preventNextRift: false },
    };
  }

  /* ----- 카드 지급 ----- */
  makeInstance(card) { return { ...card, instanceId: `card_${this.instanceSeq++}`, sealedTurns: 0 }; }
  drawCard(actor, withLog = true) {
    if (!actor.alive || actor.hand.length >= STAT.maxHand) return null;
    const instance = this.generateCardFor(actor);
    actor.hand.push(instance);
    if (withLog) { this.log(`${actor.name} 카드 획득: ${instance.name}`); this.maybeTriggerRiftEvent(actor); }
    return instance;
  }
  generateCardFor(actor) {
    const pathKey = actor.primaryPath || "none";
    const category = weightedPick(PATH_RATES[pathKey]);
    const existingEmotions = new Set(CARDS.filter((c) => c.category === category).map((c) => c.emotion));
    const emotionRates = EMOTION_RATES[actor.emotionPath || "none"];
    const filteredEmotionRates = Object.fromEntries(Object.entries(emotionRates).filter(([emotion]) => existingEmotions.has(emotion)));
    const emotion = weightedPick(filteredEmotionRates);
    let candidates = CARDS.filter((c) => c.category === category && c.emotion === emotion);
    if (candidates.length === 0) candidates = CARDS.filter((c) => c.category === category);
    if (candidates.length === 0) candidates = CARDS;
    const card = weightedPickObject(candidates, (c) => c.rarity);
    return this.makeInstance(card);
  }
  drawMany(actor, count) { for (let i = 0; i < count; i += 1) this.drawCard(actor); }
  drawVirtualCard(actor) { return this.generateCardFor(actor); }

  /* =========================================================
    턴 루프
  ========================================================= */
  beginTurn(expectedGameId = null) {
    if (!this.state || this.state.gameOver) return;
    if (expectedGameId !== null && this.state.gameId !== expectedGameId) return;
    this.checkRiftOpening();
    const actor = this.getParticipant(this.state.order[this.state.orderIndex]);
    if (!actor) return;
    // 죽은 좌석은 currentActorId 를 찍지 않고 건너뛴다(과도 상태에서 죽은 좌석이
    // 행동 가능한 좌석으로 보이는 것을 방지).
    if (!actor.alive) { this.advanceTurn(); return; }
    this.state.currentActorId = actor.id;

    this.state.phase = actor.type === "ai" ? "aiActing" : "playerAction";
    this.state.turnStartedAt = Date.now();
    this.applyStartTurnEffects(actor);
    this.checkDeaths();
    if (this.state.gameOver) return;

    this.log(`-- ${actor.name}의 턴 --`, "system");
    this.emit();

    if (actor.type === "ai") {
      const scheduledGameId = this.state.gameId;
      const actorId = actor.id;
      setTimeout(() => {
        if (!this.state || this.state.gameId !== scheduledGameId || this.state.gameOver) return;
        const liveActor = this.getParticipant(actorId);
        if (!liveActor || this.state.currentActorId !== actorId || this.state.phase !== "aiActing") return;
        this.doAITurn(liveActor, scheduledGameId);
      }, this.state.aiDelay);
    }
  }

  endTurn(actor) {
    if (this.state.gameOver) return;
    this.applyEndTurnEffects(actor);
    this.clearExpiredSeals(actor);
    this.evaluatePaths(actor);
    this.checkDeaths();
    if (this.state.gameOver) return;
    this.advanceTurn();
  }

  advanceTurn() {
    if (!this.state || this.state.gameOver) return;
    // 턴 전환 공백: 다음 좌석이 시작되기 전까지는 누구의 행동 차례도 아님.
    this.state.phase = "between";
    this.state.orderIndex += 1;
    if (this.state.orderIndex >= this.state.order.length) {
      this.state.orderIndex = 0;
      this.state.round += 1;
      this.state.participants.forEach((p) => this.evaluatePaths(p));
      this.log(`==== 라운드 ${this.state.round} 시작 ====`, "system");
    }
    this.emit();
    const scheduledGameId = this.state.gameId;
    setTimeout(() => this.beginTurn(scheduledGameId), this.state.turnGap);
  }

  finishMainAction(actor) {
    this.checkDeaths();
    if (this.state.gameOver) return;
    this.endTurn(actor);
  }

  /* =========================================================
    카드 사용 / 전투
  ========================================================= */
  useCard(actor, card, targetId = null, options = {}) {
    if (!actor.alive || this.state.gameOver) return;
    const fromImprint = Boolean(options.fromImprint);
    if (!fromImprint && !actor.hand.some((c) => c.instanceId === card.instanceId)) return;
    if (!fromImprint && this.isCardSealed(card)) { this.log(`${card.name}은 봉인되어 사용할 수 없습니다.`, "status"); this.emit(); return; }
    if (card.timing !== "active") { this.log(`${card.name}은 대응 시점에만 사용할 수 있습니다.`, "system"); this.emit(); return; }
    if (!this.canPay(actor, card.cost)) { this.log(`${actor.name}: ${card.name} 비용이 부족합니다.`, "system"); this.emit(); return; }

    if (card.effect === "redistribute_resources" && this.isHuman(actor)) { this.openRedistributeModal(actor, card); return; }
    if (card.effect === "sell_own_card_to_target_by_price" && this.isHuman(actor) && !options.sellInstanceId) { this.openForcedSaleModal(actor, card, targetId); return; }
    if (card.effect === "replace_one_card_self" && this.isHuman(actor) && !options.replaceInstanceId) { this.openReplaceCardModal(actor, card); return; }

    const initialTarget = targetId ? this.getParticipant(targetId) : actor;
    const target = this.resolveBlurredTarget(actor, initialTarget, card);
    const afterEffect = () => {
      if (!fromImprint) {
        this.removeCardFromHand(actor, card.instanceId);
        this.drawCard(actor);
        if (card.imprint) this.addImprint(actor, card);
      }
      this.finishMainAction(actor);
    };
    const finalizeResolvedEffect = () => { this.payCost(actor, card.cost); this.recordCardUse(actor, card); afterEffect(); };

    if (card.effect === "redistribute_resources") { if (!this.redistributeResources(actor)) { this.emit(); return; } finalizeResolvedEffect(); return; }
    if (card.effect === "reveal_random_target_card_and_buy_by_price") { if (!this.purchaseRandomCard(actor, target, card.instanceId)) { this.emit(); return; } finalizeResolvedEffect(); return; }
    if (card.effect === "sell_own_card_to_target_by_price") { if (!this.forcedSale(actor, target, options.sellInstanceId, card.instanceId)) { this.emit(); return; } finalizeResolvedEffect(); return; }

    this.payCost(actor, card.cost);
    this.recordCardUse(actor, card);
    if (card.category === "weapon") {
      if (this.isAreaAttackCard(card)) { this.performAreaAttack(actor, card, { onComplete: afterEffect }); return; }
      this.performAttack(actor, target, card, { isMagic: false, onComplete: afterEffect }); return;
    }
    this.applyCardEffect(actor, card, target || actor, options, afterEffect);
  }

  performAttack(attacker, defender, card, options = {}) {
    if (!attacker.alive || !defender || !defender.alive) { options.onComplete?.(); return; }
    const damage = this.computeAttackPower(attacker, defender, card, Boolean(options.isMagic));
    const attackData = { attacker, defender, card, baseDamage: Math.max(0, damage), isMagic: Boolean(options.isMagic), isArea: Boolean(options.isArea), onComplete: options.onComplete };
    if (this.isHuman(defender)) { this.openDefenseModal(attackData); return; }
    const defenseCard = this.chooseAIDefense(defender, attackData);
    this.resolveDefense(attackData, defenseCard, false);
  }

  computeAttackPower(attacker, defender, card, isMagic) {
    let damage = card.power;
    if (card.effect === "magic_damage_3") damage = 3;
    if (card.effect === "magic_damage_5") damage = 5;
    if (!isMagic && card.category === "weapon") {
      if (card.effect === "low_hp_bonus_2" && attacker.hp <= 15) damage += 2;
      if (card.effect === "low_hp_bonus_3" && attacker.hp <= 15) damage += 3;
      if (card.effect === "bonus_vs_weakened_2" && defender.statuses.weakened) damage += 2;
      if (attacker.statuses.weakened) { damage -= 2; attacker.statuses.weakened = false; this.log(`${attacker.name}의 위축 효과로 무기 피해가 2 감소했습니다.`); }
      if (attacker.mod.nextWeaponPowerDelta !== 0) { damage += attacker.mod.nextWeaponPowerDelta; this.log(`${attacker.name}의 다음 무기 피해 보정 ${signed(attacker.mod.nextWeaponPowerDelta)} 적용.`); attacker.mod.nextWeaponPowerDelta = 0; }
    }
    return Math.max(0, damage);
  }

  resolveDefense(attackData, defenseCard = null, intentionalForgive = false) {
    const { attacker, defender, card, baseDamage, onComplete } = attackData;
    let guard = 0, usedDefense = null, finalDamageReduction = 0, statusBlockers = new Map();
    if (defenseCard) {
      usedDefense = defenseCard;
      const protectionScript = isProtectionScript(defenseCard);
      guard = protectionScript ? 0 : this.computeGuard(defender, defenseCard, card, attackData);
      finalDamageReduction = protectionScript ? 3 : 0;
      statusBlockers = this.buildDefenseStatusBlockers(defenseCard, card, protectionScript);
      this.recordCardUse(defender, defenseCard);
      this.removeCardFromHand(defender, defenseCard.instanceId);
      this.drawCard(defender);
      if (protectionScript) this.log(`${defender.name}이 ${defenseCard.name}으로 대응. 보호문으로 최종 피해 3 감소.`, "defense");
      else this.log(`${defender.name}이 ${defenseCard.name}으로 대응. 방어값 ${guard}.`, "defense");
    } else if (intentionalForgive) {
      this.recordSpecialPath(defender, "forgive");
      this.log(`${defender.name}이 의도적으로 용서했습니다.`, "defense");
    }
    const pierce = card.effect === "pierce_1" ? 1 : 0;
    let finalDamage = Math.max(0, baseDamage - Math.max(0, guard - pierce));
    if (finalDamageReduction > 0) finalDamage = Math.max(0, finalDamage - finalDamageReduction);
    if (intentionalForgive && defender.primaryPath === "holy") { finalDamage = Math.max(0, finalDamage - 2); this.log(`성법의 길 효과로 용서 피해가 2 감소했습니다.`, "defense"); }
    if (defender.mod.nextDamageReduce > 0) { const reduced = Math.min(finalDamage, defender.mod.nextDamageReduce); finalDamage -= reduced; this.log(`${defender.name}의 피해 감소 보정으로 ${reduced} 감소.`, "defense"); defender.mod.nextDamageReduce = 0; }
    if (defender.statuses.vulnerable && finalDamage > 0) { finalDamage += 2; defender.statuses.vulnerable = false; this.log(`${defender.name}의 취약으로 피해가 2 증가했습니다.`, "status"); }
    this.applyDamage(defender, finalDamage, attacker);
    if (usedDefense) this.applyDefenseAfterEffect(attacker, defender, usedDefense, finalDamage, attackData);
    if (finalDamage > 0) this.applyHitEffect(attacker, defender, card, { statusBlockers });
    this.checkDeaths();
    this.state.pendingRequest = null;
    this.emit();
    onComplete?.();
  }

  computeGuard(defender, defenseCard, attackCard, attackContext = {}) {
    if (isProtectionScript(defenseCard)) return 0;
    let guard = defenseCard.guard;
    if (defenseCard.effect === "low_hp_guard_bonus_2" && defender.hp <= 15) guard += 2;
    if (defenseCard.effect === "random_guard_plus_or_minus_2") guard += Math.random() < 0.5 ? 2 : -2;
    if (defenseCard.effect === "magic_guard_bonus_3" && attackContext.isMagic) guard += 3;
    if (defenseCard.effect === "area_guard_bonus_3" && attackContext.isArea) guard += 3;
    guard += this.emotionDefenseModifier(defenseCard.emotion, attackCard.emotion);
    return Math.max(0, guard);
  }
  defenseMitigationScore(defender, defenseCard, attackData) { return isProtectionScript(defenseCard) ? 3 : this.computeGuard(defender, defenseCard, attackData.card, attackData); }
  buildDefenseStatusBlockers(defenseCard, attackCard, protectionScript) {
    const blockers = new Map();
    if (!defenseCard || protectionScript) return blockers;
    if (defenseCard.effect === "prevent_bleeding_once") blockers.set("bleeding", defenseCard.name);
    if (defenseCard.effect === "prevent_confusion") blockers.set("confusion", defenseCard.name);
    if (defenseCard.emotion === "calm" && attackCard.emotion === "chaos" && !blockers.has("confusion")) blockers.set("confusion", "평온 방어");
    return blockers;
  }
  emotionDefenseModifier(defEmotion, atkEmotion) {
    if (!defEmotion || !atkEmotion || defEmotion === "neutral" || atkEmotion === "neutral") return 0;
    if (beats(defEmotion, atkEmotion)) return 2;
    if (beats(atkEmotion, defEmotion)) return -2;
    return 0;
  }

  /* =========================================================
    효과 처리
  ========================================================= */
  applyCardEffect(actor, card, target, options, done) {
    switch (card.effect) {
      case "magic_damage_3": case "magic_damage_5":
        this.performAttack(actor, target, card, { isMagic: true, onComplete: done }); return;
      case "heal_self_1": this.heal(actor, 1); break;
      case "heal_self_4": this.heal(actor, 4); break;
      case "heal_self_5": this.heal(actor, 5); break;
      case "heal_self_2_remove_bleeding": this.heal(actor, 2); actor.statuses.bleeding = 0; this.log(`${actor.name}의 출혈이 제거되었습니다.`); break;
      case "heal_self_3_disease_down_1": this.heal(actor, 3); this.diseaseDown(actor, 1); break;
      case "disease_down_1_self": this.diseaseDown(actor, 1); break;
      case "remove_minor_status_self": this.removeMinorStatus(actor); break;
      case "remove_seal_or_confusion_self": this.removeSealOrConfusion(actor); break;
      case "replace_one_card_self": this.replaceOneCard(actor, options.replaceInstanceId); break;
      case "next_damage_reduce_1": actor.mod.nextDamageReduce += 1; this.log(`${actor.name}의 다음 피해가 1 감소합니다.`); break;
      case "next_damage_reduce_2": actor.mod.nextDamageReduce += 2; this.log(`${actor.name}의 다음 피해가 2 감소합니다.`); break;
      case "next_damage_reduce_4": actor.mod.nextDamageReduce += 4; this.log(`${actor.name}의 다음 피해가 4 감소합니다.`); break;
      case "next_weapon_power_up_2": actor.mod.nextWeaponPowerDelta += 2; this.log(`${actor.name}의 다음 무기 피해가 2 증가합니다.`); break;
      case "apply_weakened_enemy": this.applyStatus(target, "weakened"); break;
      case "disease_up_1_enemy": this.diseaseUp(target, 1); break;
      case "redistribute_resources": this.redistributeResources(actor); break;
      case "gain_gp_4": actor.gp = clamp(actor.gp + 4, 0, actor.maxGp); this.log(`${actor.name} GP +4.`); break;
      case "gain_mp_4": actor.mp = clamp(actor.mp + 4, 0, actor.maxMp); this.log(`${actor.name} MP +4.`); break;
      case "draw_cards_2": this.drawMany(actor, 2); break;
      case "reveal_random_target_card_and_buy_by_price": this.purchaseRandomCard(actor, target); break;
      case "sell_own_card_to_target_by_price": this.forcedSale(actor, target, options.sellInstanceId, card.instanceId); break;
      case "seal_random_target_card": this.sealRandomCard(target); break;
      case "apply_confusion_enemy": this.applyStatus(target, "confusion"); break;
      case "draw_choice_2_pick_1": this.drawChoice(actor, done); return;
      case "sacrifice_1_or_2_draw_plus_1": this.offeringScript(actor, card.instanceId); break;
      case "remove_one_status_or_disease_down_1":
        if (this.isHuman(actor) && !options.cleanseKey) { this.openCleanseStatusModal(actor, done); return; }
        this.cleanseSelectedStatus(actor, options.cleanseKey); break;
      case "gain_guardian_sigil": this.grantGuardianSigil(actor); break;
      case "choose_guardian_sigil_2":
        if (this.isHuman(actor) && !options.guardianSigilId) { this.openGuardianChoiceModal(actor, done); return; }
        this.grantGuardianSigil(actor, options.guardianSigilId || null); break;
      case "force_guardian_trigger_or_gain": if (actor.guardianSigil) this.forceTriggerGuardianSigil(actor); else this.grantGuardianSigil(actor); break;
      case "prevent_next_rift_event": actor.mod.preventNextRift = true; this.log(`${actor.name}이 다음 균열 현상 1회를 무효화합니다.`, "status"); break;
      case "apply_rift_mark_and_blur_enemy": this.applyStatus(target, "riftMarked"); this.applyStatus(target, "blurred"); break;
      case "prevent_next_status_once": actor.mod.preventNextStatus = true; this.log(`${actor.name}이 다음 상태이상 1회를 무효화합니다.`); break;
      case "none": default: this.log(`${actor.name}이 ${card.name}을 사용했습니다.`); break;
    }
    done();
  }

  applyHitEffect(attacker, defender, card, defenseContext = {}) {
    switch (card.effect) {
      case "bleeding_on_hit": this.applyHitStatus(defender, "bleeding", defenseContext); break;
      case "vulnerable_on_hit": this.applyHitStatus(defender, "vulnerable", defenseContext); break;
      case "weakened_on_hit": this.applyHitStatus(defender, "weakened", defenseContext); break;
      case "next_weapon_power_down_1_on_hit": defender.mod.nextWeaponPowerDelta -= 1; this.log(`${defender.name}의 다음 무기 피해가 1 감소합니다.`, "status"); break;
      case "heal_self_1_on_hit": this.heal(attacker, 1); break;
      case "remove_minor_status_self": this.removeMinorStatus(attacker); break;
      case "next_damage_reduce_1": attacker.mod.nextDamageReduce += 1; this.log(`${attacker.name}의 다음 피해가 1 감소합니다.`, "status"); break;
      case "confusion_50_on_hit": if (Math.random() < 0.5) this.applyHitStatus(defender, "confusion", defenseContext); break;
      case "rift_mark_on_hit": case "area_damage_3_55_rift_mark": this.applyHitStatus(defender, "riftMarked", defenseContext); break;
      default: break;
    }
  }
  applyHitStatus(defender, status, defenseContext = {}) {
    const blocker = defenseContext.statusBlockers?.get(status);
    if (blocker) { this.log(`${blocker}이 ${statusLabel(status)} 부여를 막았습니다.`, "defense"); return false; }
    this.applyStatus(defender, status); return true;
  }
  applyDefenseAfterEffect(attacker, defender, defenseCard, finalDamage, attackData = {}) {
    switch (defenseCard.effect) {
      case "counter_1_if_blocked": if (finalDamage === 0) this.applyDamage(attacker, 1, defender); break;
      case "reflect_weapon_2_if_blocked": if (finalDamage === 0 && !attackData.isMagic) { this.log(`${defender.name}의 ${defenseCard.name}이 무기 공격을 반사했습니다.`, "defense"); this.applyDamage(attacker, 2, defender); } break;
      case "reflect_magic_2_if_blocked": if (finalDamage === 0 && attackData.isMagic) { this.log(`${defender.name}의 ${defenseCard.name}이 기적을 되울렸습니다.`, "defense"); this.applyDamage(attacker, 2, defender); } break;
      case "vulnerable_if_blocked": if (finalDamage === 0) this.applyStatus(attacker, "vulnerable"); break;
      case "next_weapon_power_up_1": defender.mod.nextWeaponPowerDelta += 1; this.log(`${defender.name}의 다음 무기 피해가 1 증가합니다.`); break;
      case "enemy_next_weapon_power_down_1": attacker.mod.nextWeaponPowerDelta -= 1; this.log(`${attacker.name}의 다음 무기 피해가 1 감소합니다.`); break;
      case "remove_weakened_self": defender.statuses.weakened = false; this.log(`${defender.name}의 위축이 제거되었습니다.`); break;
      case "heal_self_1": this.heal(defender, 1); break;
      case "remove_minor_status_self": this.removeMinorStatus(defender); break;
      default: break;
    }
  }
  applyDamage(target, amount, source = null, options = {}) {
    const damage = Math.max(0, Math.floor(amount));
    if (damage <= 0) { this.log(`${target.name}은 피해를 받지 않았습니다.`); return; }
    target.hp -= damage;
    if (source) target.recentAttacker = source.id;
    this.log(`${target.name} HP -${damage}.`);
    if (!options.ignoreGuardianBreak) this.maybeBreakGuardianSigil(target);
  }
  heal(actor, amount) {
    let value = amount;
    if (actor.statuses.disease >= 2) value -= actor.statuses.disease - 1;
    value = Math.max(0, value);
    actor.hp = clamp(actor.hp + value, 0, actor.maxHp);
    this.log(`${actor.name} HP +${value}.`);
  }
  applyStatus(target, status) {
    if (!target || !target.alive) return;
    if (target.mod.preventNextStatus) { target.mod.preventNextStatus = false; this.log(`${target.name}이 상태이상 ${statusLabel(status)}을 무효화했습니다.`); return; }
    if (status === "bleeding") target.statuses.bleeding = Math.max(target.statuses.bleeding, 3);
    if (status === "vulnerable") target.statuses.vulnerable = true;
    if (status === "weakened") target.statuses.weakened = true;
    if (status === "confusion") target.statuses.confusion = true;
    if (status === "riftMarked") target.statuses.riftMarked = true;
    if (status === "blurred") target.statuses.blurred = true;
    this.log(`${target.name}에게 ${statusLabel(status)} 부여.`);
  }
  diseaseUp(target, value) {
    if (target.mod.preventNextStatus) { target.mod.preventNextStatus = false; this.log(`${target.name}이 질병 상승을 무효화했습니다.`); return; }
    if (target.statuses.disease >= 3) { this.applyDamage(target, 5); this.log(`${target.name}은 붕괴열 초과로 즉시 피해를 받았습니다.`); return; }
    target.statuses.disease = clamp(target.statuses.disease + value, 0, 3);
    this.log(`${target.name}의 질병 단계: ${DISEASE_NAME[target.statuses.disease]}.`);
  }
  diseaseDown(actor, value) { actor.statuses.disease = clamp(actor.statuses.disease - value, 0, 3); this.log(`${actor.name}의 질병 단계: ${DISEASE_NAME[actor.statuses.disease]}.`); }
  removeMinorStatus(actor) {
    if (actor.statuses.bleeding > 0) { actor.statuses.bleeding = 0; this.log(`${actor.name}의 출혈이 제거되었습니다.`); }
    else if (actor.statuses.vulnerable) { actor.statuses.vulnerable = false; this.log(`${actor.name}의 취약이 제거되었습니다.`); }
    else if (actor.statuses.weakened) { actor.statuses.weakened = false; this.log(`${actor.name}의 위축이 제거되었습니다.`); }
    else if (actor.statuses.confusion) { actor.statuses.confusion = false; this.log(`${actor.name}의 혼선이 제거되었습니다.`); }
    else if (actor.statuses.blurred) { actor.statuses.blurred = false; this.log(`${actor.name}의 흐림이 제거되었습니다.`); }
    else if (actor.statuses.riftMarked) { actor.statuses.riftMarked = false; this.log(`${actor.name}의 균열표식이 제거되었습니다.`); }
    else { this.log(`${actor.name}에게 제거할 경증 상태가 없습니다.`); }
  }
  removeSealOrConfusion(actor) {
    const sealed = actor.hand.find((c) => c.sealedTurns > 0);
    if (sealed) { sealed.sealedTurns = 0; this.log(`${actor.name}의 카드 봉인이 해제되었습니다.`); }
    else if (actor.statuses.confusion) { actor.statuses.confusion = false; this.log(`${actor.name}의 혼선이 제거되었습니다.`); }
    else { this.log(`${actor.name}에게 제거할 봉인/혼선이 없습니다.`); }
  }
  sealRandomCard(target) {
    const candidates = target.hand.filter((c) => c.sealedTurns <= 0);
    if (candidates.length === 0) { this.log(`${target.name}에게 봉인할 카드가 없습니다.`); return; }
    const card = randomItem(candidates); card.sealedTurns = 1; this.log(`${target.name}의 ${card.name}이 1턴 봉인되었습니다.`);
  }
  replaceOneCard(actor, replaceInstanceId) {
    const candidates = actor.hand.filter((c) => c.instanceId !== replaceInstanceId);
    const targetId = replaceInstanceId || randomItem(candidates)?.instanceId;
    if (!targetId) return;
    const removed = this.removeCardFromHand(actor, targetId);
    if (removed) this.log(`${actor.name}이 ${removed.name}을 정렬하고 새 카드를 받았습니다.`);
    this.drawCard(actor);
  }

  redistributeResources(actor) {
    // AI-only synchronous path (player goes through modal).
    const beforeTotal = actor.hp + actor.mp + actor.gp;
    if (actor.hp < 18 && actor.gp > 0 && actor.hp < actor.maxHp) {
      const transfer = Math.min(4, actor.gp, actor.maxHp - actor.hp);
      actor.gp -= transfer; actor.hp += transfer; this.log(`${actor.name}이 환전으로 GP ${transfer}을 HP로 전환했습니다.`, "trade");
    } else if (actor.mp < 5 && actor.gp > 0 && actor.mp < actor.maxMp) {
      const transfer = Math.min(4, actor.gp, actor.maxMp - actor.mp);
      actor.gp -= transfer; actor.mp += transfer; this.log(`${actor.name}이 환전으로 GP ${transfer}을 MP로 전환했습니다.`, "trade");
    } else { this.log(`${actor.name}은 환전할 필요가 없어 자원을 유지했습니다.`, "trade"); }
    return actor.hp + actor.mp + actor.gp === beforeTotal;
  }

  purchaseRandomCard(actor, target, sourceCardId) {
    if (!target || !target.alive) { this.log("매입 실패: 대상이 올바르지 않습니다.", "trade"); return false; }
    if (target.hand.length === 0) { this.log(`${target.name}에게 매입할 카드가 없습니다.`, "trade"); return false; }
    const sourceExists = actor.hand.some((c) => c.instanceId === sourceCardId);
    const effectiveHandCount = actor.hand.length - (sourceExists ? 1 : 0);
    if (!sourceExists || effectiveHandCount >= STAT.maxHand) { this.log("매입 실패: 손패가 가득 차 카드를 가져올 수 없습니다.", "trade"); return false; }
    const card = randomItem(target.hand);
    const price = actor.primaryPath === "trade" ? Math.max(1, card.price - 1) : card.price;
    this.log(`${actor.name}이 ${target.name}의 ${card.name}을 공개했습니다. 매입가 ${price} GP.`, "trade");
    if (actor.gp < price) { this.log("매입 실패: GP가 부족합니다.", "trade"); return false; }
    const targetCardIndex = target.hand.findIndex((c) => c.instanceId === card.instanceId);
    if (targetCardIndex < 0) { this.log("매입 실패: 카드 이동 조건이 올바르지 않습니다.", "trade"); return false; }
    actor.gp -= price;
    const [movedCard] = target.hand.splice(targetCardIndex, 1);
    actor.hand.push(movedCard);
    this.log(`${actor.name}이 ${target.name}의 ${movedCard.name}을 매입했습니다.`, "trade");
    return true;
  }

  forcedSale(actor, target, sellInstanceId, sourceCardId) {
    if (!target || !target.alive) { this.log("강매 실패: 대상이 올바르지 않습니다.", "trade"); return false; }
    if (target.hand.length >= STAT.maxHand) { this.log("강매 실패: 대상의 손패가 가득 찼습니다.", "trade"); return false; }
    const sellCard = actor.hand.find((c) => c.instanceId === sellInstanceId && c.instanceId !== sourceCardId && !this.isCardSealed(c));
    if (!sellCard) { this.log("강매 실패: 판매할 수 있는 카드가 없습니다.", "trade"); return false; }
    const price = actor.primaryPath === "trade" ? Math.min(8, sellCard.price + 1) : sellCard.price;
    const paid = Math.min(target.gp, price);
    const shortage = price - paid;
    target.gp -= paid;
    if (shortage > 0) this.applyDamage(target, shortage, actor);
    this.removeCardFromHand(actor, sellCard.instanceId);
    target.hand.push(sellCard);
    this.log(`${actor.name}이 ${sellCard.name}을 ${target.name}에게 강매했습니다. 가격 ${price} GP.`, "trade");
    return true;
  }

  drawChoice(actor, done) {
    const choices = [this.drawVirtualCard(actor), this.drawVirtualCard(actor)];
    if (actor.type === "ai") {
      const picked = choices.sort((a, b) => b.price - a.price)[0];
      if (actor.hand.length < STAT.maxHand) actor.hand.push(picked);
      this.log(`${actor.name}이 묵상으로 ${picked.name}을 선택했습니다.`);
      done(); return;
    }
    this._choiceCtx = { actor, choices, done };
    this.state.pendingRequest = { kind: "choice", ownerId: actor.id, title: "묵상", description: "획득할 카드 1장을 선택하세요.", choices };
    this.emit();
  }
  submitChoice(instanceId) {
    const ctx = this._choiceCtx; if (!ctx) return;
    const picked = ctx.choices.find((c) => c.instanceId === instanceId) || ctx.choices[0];
    this._choiceCtx = null; this.state.pendingRequest = null;
    if (ctx.actor.hand.length < STAT.maxHand) ctx.actor.hand.push(picked);
    this.log(`${ctx.actor.name}이 묵상으로 ${picked.name}을 선택했습니다.`);
    ctx.done();
  }

  offeringScript(actor, sourceCardId) {
    const candidates = actor.hand.filter((c) => c.instanceId !== sourceCardId && !this.isCardSealed(c));
    if (candidates.length === 0) { this.log(`${actor.name}은 봉헌할 카드가 없습니다.`); return; }
    const sacrificeCount = Math.min(candidates.length, actor.type === "ai" && actor.aiType === "holy" ? 2 : 1);
    candidates.sort((a, b) => a.price - b.price);
    const removedNames = [];
    for (let i = 0; i < sacrificeCount; i += 1) { const removed = this.removeCardFromHand(actor, candidates[i].instanceId); if (removed) removedNames.push(removed.name); }
    this.drawMany(actor, sacrificeCount + 1);
    this.log(`${actor.name}이 봉헌문으로 ${removedNames.join(", ")}을 바쳤습니다.`);
  }

  /* =========================================================
    AI 로직
  ========================================================= */
  doAITurn(actor, expectedGameId = null) {
    if (!this.state || this.state.gameOver || !actor.alive) return;
    if (expectedGameId !== null && this.state.gameId !== expectedGameId) return;
    const enemies = this.livingParticipants().filter((p) => p.id !== actor.id);
    if (enemies.length === 0) return;
    const healCard = actor.hand.find((c) => c.timing === "active" && c.targetType === "self" && c.effect.includes("heal") && this.canPay(actor, c.cost));
    if (actor.hp <= 12 && healCard) { this.useCard(actor, healCard, actor.id); return; }
    const cureCard = actor.hand.find((c) => c.timing === "active" && (c.effect.includes("disease_down") || c.effect.includes("remove")) && this.canPay(actor, c.cost));
    if (actor.statuses.disease >= 2 && cureCard) { this.useCard(actor, cureCard, actor.id); return; }
    if (actor.aiType === "mage") {
      const attackImprint = actor.imprints.find((c) => c.targetType === "enemy" && this.canPay(actor, c.cost));
      if (attackImprint) { this.useCard(actor, attackImprint, this.chooseAITarget(actor).id, { fromImprint: true }); return; }
    }
    const preferred = this.preferredAICard(actor);
    if (preferred) {
      const target = preferred.targetType === "enemy" ? this.chooseAITarget(actor) : actor;
      const options = {};
      if (preferred.effect === "sell_own_card_to_target_by_price") { const sale = this.chooseSaleCard(actor, preferred.instanceId); if (!sale) return this.doAIPrayerOrOffer(actor); options.sellInstanceId = sale.instanceId; }
      if (preferred.effect === "replace_one_card_self") { const replace = this.chooseLowestCard(actor, preferred.instanceId); if (replace) options.replaceInstanceId = replace.instanceId; }
      this.useCard(actor, preferred, target.id, options); return;
    }
    const usableImprint = actor.imprints.find((c) => this.canPay(actor, c.cost));
    if (usableImprint) { const target = usableImprint.targetType === "enemy" ? this.chooseAITarget(actor) : actor; this.useCard(actor, usableImprint, target.id, { fromImprint: true }); return; }
    this.doAIPrayerOrOffer(actor);
  }
  preferredAICard(actor) {
    const activeCards = actor.hand.filter((c) => c.timing === "active" && !this.isCardSealed(c) && this.canPay(actor, c.cost));
    const byCategory = (cat) => activeCards.find((c) => c.category === cat);
    const weapon = byCategory("weapon"); const trade = byCategory("trade"); const item = byCategory("item");
    const miracle = activeCards.find((c) => c.category === "miracle" && this.canPay(actor, c.cost)); const special = byCategory("special");
    if (actor.aiType === "trader" && trade) return trade;
    if (actor.aiType === "alchemist" && item) return item;
    if (actor.aiType === "holy" && special) return special;
    if (actor.aiType === "mage" && miracle) return miracle;
    if (actor.aiType === "chaotic") return randomItem(activeCards);
    if (weapon) return weapon;
    if (trade && Math.random() < 0.45) return trade;
    if (item) return item;
    if (miracle) return miracle;
    if (special) return special;
    return null;
  }
  chooseAITarget(actor) {
    const enemies = this.livingParticipants().filter((p) => p.id !== actor.id);
    if (actor.aiType === "chaotic") return randomItem(enemies);
    if (actor.aiType === "vengeful") { const recent = this.getParticipant(actor.recentAttacker); if (recent?.alive && recent.id !== actor.id) return recent; }
    return enemies.sort((a, b) => a.hp - b.hp)[0];
  }
  chooseAIDefense(defender, attackData) {
    const baseDamage = attackData.baseDamage;
    const candidates = defender.hand.filter((c) => c.timing === "defense" && !this.isCardSealed(c) && this.canUseDefenseCardAgainst(c, attackData));
    if (candidates.length === 0) return null;
    const scored = candidates.map((card) => ({ card, guard: this.defenseMitigationScore(defender, card, attackData) })).sort((a, b) => b.guard - a.guard);
    const best = scored[0];
    if (defender.hp <= 14 || best.guard >= baseDamage * 0.45 || defender.aiType === "defensive") return best.card;
    return null;
  }
  doAIPrayerOrOffer(actor) {
    const hasWeapon = actor.hand.some((c) => c.category === "weapon");
    if (!hasWeapon) { this.performPrayer(actor); return; }
    const low = this.chooseLowestCard(actor);
    if (low) this.performOffering(actor, low.instanceId); else this.endTurn(actor);
  }
  chooseSaleCard(actor, sourceId) { return actor.hand.filter((c) => c.instanceId !== sourceId && !this.isCardSealed(c)).sort((a, b) => b.price - a.price)[0]; }
  chooseLowestCard(actor, excludeId = null) { return actor.hand.filter((c) => c.instanceId !== excludeId && !this.isCardSealed(c)).sort((a, b) => a.price - b.price)[0]; }

  /* =========================================================
    기본 행동
  ========================================================= */
  performPrayer(actor) {
    if (actor.hand.some((c) => c.category === "weapon")) { this.log(`${actor.name}은 손패에 무기가 있어 기도할 수 없습니다.`); this.emit(); return; }
    this.recordSpecialPath(actor, "pray");
    if (actor.primaryPath === "holy" && this.isHuman(actor)) { this.drawChoice(actor, () => this.finishMainAction(actor)); return; }
    this.drawCard(actor);
    if (actor.primaryPath === "holy") this.drawCard(actor);
    this.log(`${actor.name}이 기도했습니다.`);
    this.finishMainAction(actor);
  }
  performOffering(actor, cardInstanceId) {
    const card = actor.hand.find((c) => c.instanceId === cardInstanceId && !this.isCardSealed(c));
    if (!card) { this.log(`${actor.name}은 바칠 카드를 선택하지 못했습니다.`); this.emit(); return; }
    this.removeCardFromHand(actor, card.instanceId);
    this.recordSpecialPath(actor, "offer");
    this.log(`${actor.name}이 ${card.name}을 바쳤습니다.`);
    if (actor.primaryPath === "holy" && this.isHuman(actor)) { this.drawChoice(actor, () => this.finishMainAction(actor)); return; }
    this.drawCard(actor);
    if (actor.primaryPath === "holy") this.drawCard(actor);
    this.finishMainAction(actor);
  }

  /* =========================================================
    길 / 감정 길
  ========================================================= */
  recordCardUse(actor, card) {
    const gain = PATH_GAIN[card.category];
    if (gain) actor.pathScores[gain.path] += gain.value;
    if (card.emotion !== "neutral" && actor.emotionCounts[card.emotion] !== undefined) actor.emotionCounts[card.emotion] += 1;
  }
  recordSpecialPath(actor, actionKey) { const gain = PATH_GAIN[actionKey]; if (gain) actor.pathScores[gain.path] += gain.value; }
  evaluatePaths(actor) {
    if (!actor.alive) return;
    if (!actor.primaryPath && this.state.round >= 4) {
      const entries = Object.entries(actor.pathScores).sort((a, b) => b[1] - a[1]);
      const [firstPath, firstScore] = entries[0]; const [, secondScore] = entries[1];
      const total = entries.reduce((sum, [, v]) => sum + v, 0);
      if (total >= 6) { actor.primaryPath = firstScore - secondScore >= 1.5 ? firstPath : "balance"; this.log(`${actor.name}이 ${PATH_LABEL[actor.primaryPath]}의 길에 도달했습니다.`); }
    }
    if (actor.primaryPath && !actor.emotionPath && this.state.round >= 7) {
      const entries = Object.entries(actor.emotionCounts).sort((a, b) => b[1] - a[1]);
      const [firstEmotion, firstCount] = entries[0]; const [, secondCount] = entries[1];
      const total = entries.reduce((sum, [, v]) => sum + v, 0);
      if (total >= 6 && firstCount - secondCount >= 2) { actor.emotionPath = firstEmotion; this.log(`${actor.name}이 감정 길: ${EMOTION_LABEL[firstEmotion]}에 도달했습니다.`); }
    }
  }

  /* =========================================================
    플레이어 입력 (서버가 actorId 와 함께 호출 — 좌석 검증 포함)
  ========================================================= */
  playCard(actorId, instanceId) {
    const p = this.getParticipant(actorId); if (!p || this.state.gameOver) return;
    const card = p.hand.find((c) => c.instanceId === instanceId);
    if (!card) return;
    // 바치기(sacrifice)는 현재 행동 중인 본인만.
    if (this.state.phase === "sacrifice" && this.state.currentActorId === actorId) { this.state.phase = "playerAction"; this.performOffering(p, instanceId); return; }
    if (!this.isActorTurn(actorId)) return;
    if (this.isCardSealed(card)) { this.log(`${card.name}은 봉인되어 사용할 수 없습니다.`); this.emit(); return; }
    if (card.timing !== "active") { this.log(`${card.name}은 공격 대응 시점에만 사용할 수 있습니다.`); this.emit(); return; }
    if (!this.canPay(p, card.cost)) { this.log(`${card.name} 비용이 부족합니다.`); this.emit(); return; }
    if (card.targetType === "enemy") { this.state.pendingAction = { kind: "card", actorId: p.id, cardInstanceId: card.instanceId }; this.state.phase = "selectTarget"; this.emit(); return; }
    this.useCard(p, card, p.id);
  }
  selectTarget(actorId, targetId) {
    if (this.state.phase !== "selectTarget" || !this.state.pendingAction) return;
    if (this.state.pendingAction.actorId !== actorId) return;
    const target = this.getParticipant(targetId);
    if (!target || !target.alive) return;
    const p = this.getParticipant(actorId); if (!p) return;
    const pending = this.state.pendingAction;
    this.state.pendingAction = null; this.state.phase = "playerAction";
    if (pending.kind === "card") { const card = p.hand.find((c) => c.instanceId === pending.cardInstanceId); if (!card) return this.emit(); this.useCard(p, card, targetId); }
    if (pending.kind === "imprint") { const imprint = p.imprints.find((c) => c.id === pending.cardId); if (!imprint) return this.emit(); this.useCard(p, imprint, targetId, { fromImprint: true }); }
  }
  cancelTarget(actorId) { if (this.state.phase === "selectTarget" && this.state.pendingAction?.actorId === actorId) { this.state.pendingAction = null; this.state.phase = "playerAction"; this.emit(); } }
  useImprint(actorId, cardId) {
    const p = this.getParticipant(actorId); if (!p || !this.isActorTurn(actorId)) return;
    const card = p.imprints.find((c) => c.id === cardId); if (!card) return;
    if (!this.canPay(p, card.cost)) { this.log(`${card.name} 재사용 비용이 부족합니다.`); this.emit(); return; }
    if (card.targetType === "enemy") { this.state.pendingAction = { kind: "imprint", actorId: p.id, cardId: card.id }; this.state.phase = "selectTarget"; this.emit(); return; }
    this.useCard(p, card, p.id, { fromImprint: true });
  }
  releaseImprint(actorId, cardId) {
    const p = this.getParticipant(actorId); if (!p || !this.isActorTurn(actorId)) return;
    const before = p.imprints.length; p.imprints = p.imprints.filter((c) => c.id !== cardId);
    if (p.imprints.length < before) this.log(`${p.name}이 마법 각인을 해제했습니다.`);
    this.emit();
  }
  pray(actorId) { if (this.isActorTurn(actorId)) this.performPrayer(this.getParticipant(actorId)); }
  startOffer(actorId) { if (!this.isActorTurn(actorId)) return; this.state.phase = "sacrifice"; this.log("바칠 카드를 손패에서 선택하세요."); this.emit(); }
  cancelOffer(actorId) { if (this.state.phase === "sacrifice" && this.state.currentActorId === actorId) { this.state.phase = "playerAction"; this.emit(); } }
  skipTurn(actorId) { if (this.isActorTurn(actorId)) { const p = this.getParticipant(actorId); this.log(`${p.name}이 턴을 넘겼습니다.`, "system"); this.endTurn(p); } }
  playerTimeout(actorId) {
    if (!this.isActorTurn(actorId)) return;
    const p = this.getParticipant(actorId);
    if (!p.hand.some((c) => c.category === "weapon")) { this.log(`시간 초과: ${p.name}이 자동으로 기도합니다.`, "system"); this.performPrayer(p); }
    else { this.log(`시간 초과: ${p.name}의 턴이 자동으로 넘어갑니다.`, "system"); this.endTurn(p); }
  }

  /* ----- 모달 트리거 (pendingRequest.ownerId 로 대상 클라만 표시) ----- */
  openDefenseModal(attackData) {
    const defender = attackData.defender;
    const defenseCards = defender.hand.filter((c) => c.timing === "defense" && !this.isCardSealed(c) && this.canUseDefenseCardAgainst(c, attackData));
    this.state.phase = "defense";
    this.pendingDefense = attackData;
    this.state.pendingRequest = {
      kind: "defense", ownerId: defender.id,
      attackerName: attackData.attacker.name, cardName: attackData.card.name, baseDamage: attackData.baseDamage,
      isMagic: !!attackData.isMagic, isArea: !!attackData.isArea,
      defenseCards: defenseCards.map((c) => ({ ...c, _guardValue: isProtectionScript(c) ? "최종 피해 -3" : `방어 ${this.computeGuard(defender, c, attackData.card, attackData)}` })),
      hasDefense: defenseCards.length > 0,
    };
    this.emit();
  }
  chooseDefense(actorId, instanceId) {
    const pending = this.pendingDefense; if (!pending || pending.defender.id !== actorId) return;
    const card = pending.defender.hand.find((c) => c.instanceId === instanceId); if (!card) return;
    this.pendingDefense = null;
    this.resolveDefense(pending, card, false);
  }
  forgive(actorId) {
    const pending = this.pendingDefense; if (!pending || pending.defender.id !== actorId) return;
    const had = pending.defender.hand.some((c) => c.timing === "defense" && !this.isCardSealed(c));
    this.pendingDefense = null;
    this.resolveDefense(pending, null, had);
  }
  openForcedSaleModal(actor, sourceCard, targetId) {
    const target = this.getParticipant(targetId);
    if (!target || !target.alive) { this.log("강매 실패: 대상이 올바르지 않습니다.", "trade"); this.emit(); return; }
    if (target.hand.length >= STAT.maxHand) { this.log("강매 실패: 대상의 손패가 가득 찼습니다.", "trade"); this.emit(); return; }
    const candidates = actor.hand.filter((c) => c.instanceId !== sourceCard.instanceId && !this.isCardSealed(c));
    if (candidates.length === 0) { this.log("강매 실패: 판매할 수 있는 카드가 없습니다.", "trade"); this.emit(); return; }
    this._saleCtx = { actor, sourceCard, targetId };
    this.state.pendingRequest = {
      kind: "forcedSale", ownerId: actor.id, targetName: target.name,
      candidates: candidates.map((c) => ({ ...c, _saleValue: `판매가 ${actor.primaryPath === "trade" ? Math.min(8, c.price + 1) : c.price} GP` })),
    };
    this.emit();
  }
  submitForcedSale(actorId, sellInstanceId) {
    const ctx = this._saleCtx; if (!ctx || ctx.actor.id !== actorId) return;
    this._saleCtx = null; this.state.pendingRequest = null;
    this.useCard(ctx.actor, ctx.sourceCard, ctx.targetId, { sellInstanceId });
  }
  openReplaceCardModal(actor, sourceCard) {
    const candidates = actor.hand.filter((c) => c.instanceId !== sourceCard.instanceId && !this.isCardSealed(c));
    if (candidates.length === 0) { this.log("정렬할 카드가 없습니다.", "system"); this.emit(); return; }
    this._replaceCtx = { actor, sourceCard };
    this.state.pendingRequest = { kind: "replace", ownerId: actor.id, candidates: candidates.map((c) => ({ ...c, _replaceValue: "버리고 새 카드 1장 획득" })) };
    this.emit();
  }
  submitReplace(actorId, replaceInstanceId) {
    const ctx = this._replaceCtx; if (!ctx || ctx.actor.id !== actorId) return;
    this._replaceCtx = null; this.state.pendingRequest = null;
    this.useCard(ctx.actor, ctx.sourceCard, ctx.actor.id, { replaceInstanceId });
  }
  openRedistributeModal(actor, card) {
    this._redistCtx = { actor, card };
    this.state.pendingRequest = { kind: "redistribute", ownerId: actor.id, hp: actor.hp, mp: actor.mp, gp: actor.gp, total: actor.hp + actor.mp + actor.gp, maxHp: actor.maxHp, maxMp: actor.maxMp, maxGp: actor.maxGp };
    this.emit();
  }
  submitRedistribute(actorId, hp, mp, gp) {
    const ctx = this._redistCtx; if (!ctx || ctx.actor.id !== actorId) return false;
    const actor = ctx.actor; const card = ctx.card; const beforeTotal = actor.hp + actor.mp + actor.gp;
    if (![hp, mp, gp].every((v) => Number.isInteger(v))) { this.log("환전 실패: 입력값이 올바르지 않습니다.", "trade"); return false; }
    if (hp < 1) { this.log("환전 실패: HP는 1 이상이어야 합니다.", "trade"); return false; }
    if (mp < 0 || gp < 0) { this.log("환전 실패: MP와 GP는 0 이상이어야 합니다.", "trade"); return false; }
    if (hp > actor.maxHp || mp > actor.maxMp || gp > actor.maxGp) { this.log("환전 실패: 최대치를 초과할 수 없습니다.", "trade"); return false; }
    if (hp + mp + gp !== beforeTotal) { this.log("환전 실패: HP/MP/GP 총합은 현재 자원 총합과 같아야 합니다.", "trade"); return false; }
    actor.hp = hp; actor.mp = mp; actor.gp = gp;
    this.log(`${actor.name}이 환전으로 자원을 재분배했습니다.`, "trade");
    this._redistCtx = null; this.state.pendingRequest = null;
    this.payCost(actor, card.cost); this.recordCardUse(actor, card);
    this.removeCardFromHand(actor, card.instanceId); this.drawCard(actor);
    this.finishMainAction(actor);
    return true;
  }
  cancelRedistribute(actorId) {
    if (!this._redistCtx || this._redistCtx.actor.id !== actorId) return;
    this._redistCtx = null; this.state.pendingRequest = null;
    this.log("환전이 취소되어 현재 자원을 유지합니다.", "trade");
    this.emit();
  }

  /* =========================================================
    시작 / 유틸
  ========================================================= */
  applyStartTurnEffects(actor) {
    this.triggerGuardianSigil(actor);
    if (actor.statuses.confusion && actor.hand.length > 0) {
      const card = randomItem(actor.hand);
      this.removeCardFromHand(actor, card.instanceId); this.drawCard(actor);
      actor.statuses.confusion = false; this.log(`${actor.name}의 혼선으로 ${card.name}이 무작위 교체되었습니다.`);
    }
  }
  applyEndTurnEffects(actor) {
    if (!actor.alive) return;
    if (actor.statuses.bleeding > 0) { this.applyDamage(actor, 1); actor.statuses.bleeding -= 1; this.log(`${actor.name}이 출혈 피해를 받았습니다.`); }
    if (actor.statuses.disease > 0) { this.applyDamage(actor, actor.statuses.disease); this.log(`${actor.name}이 ${DISEASE_NAME[actor.statuses.disease]} 피해를 받았습니다.`); }
    actor.mod.preventNextStatus = false;
  }
  clearExpiredSeals(actor) { actor.hand.forEach((card) => { if (card.sealedTurns > 0) card.sealedTurns -= 1; }); }
  addImprint(actor, card) {
    if (!card.imprint) return;
    if (actor.imprints.some((c) => c.id === card.id)) { this.log(`${actor.name}: ${card.name}은 이미 각인되어 있습니다.`); return; }
    if (actor.imprints.length >= STAT.maxImprints) { this.log(`${actor.name}: 마법 각인 슬롯이 가득 찼습니다.`); return; }
    actor.imprints.push({ ...card, instanceId: undefined, sealedTurns: 0 });
    this.log(`${actor.name}이 ${card.name}을 마법 각인에 등록했습니다.`);
  }
  removeCardFromHand(actor, instanceId) {
    const index = actor.hand.findIndex((c) => c.instanceId === instanceId);
    if (index < 0) return null;
    return actor.hand.splice(index, 1)[0];
  }
  payCost(actor, cost) { actor.hp -= cost.hp; actor.mp -= cost.mp; actor.gp -= cost.gp; }

  /* =========================================================
    신규 시스템: 수호 각인 / 균열 / 흐림 / 광역 공격 / 정화
  ========================================================= */
  randomEnemy(actor) {
    const enemies = this.livingParticipants().filter((p) => p.id !== actor.id);
    return enemies.length > 0 ? randomItem(enemies) : null;
  }
  resolveBlurredTarget(actor, target, card) {
    if (!actor?.statuses?.blurred || !target || target.id === actor.id || card.targetType !== "enemy") return target;
    actor.statuses.blurred = false;
    if (Math.random() >= 0.5) { this.log(`${actor.name}의 흐림이 걷혔지만 대상 선택은 유지되었습니다.`, "status"); return target; }
    const candidates = this.livingParticipants().filter((p) => p.id !== actor.id);
    if (candidates.length === 0) return target;
    const redirected = randomItem(candidates);
    this.log(`${actor.name}의 흐림으로 ${card.name}의 대상이 ${redirected.name}(으)로 바뀌었습니다.`, "status");
    return redirected;
  }
  checkRiftOpening() {
    if (!this.state || this.state.riftOpened || this.state.round < RIFT_OPEN_ROUND) return;
    this.state.riftOpened = true;
    this.log("금역 개방: 봉인이 약해졌습니다. 이제 카드 획득 시 균열 현상이 발생할 수 있습니다.", "system");
  }
  maybeTriggerRiftEvent(actor) {
    if (!this.state || !this.state.riftOpened || this.state.gameOver || !actor?.alive) return false;
    if (actor.mod.preventNextRift) { actor.mod.preventNextRift = false; this.log(`${actor.name}의 금역나침반이 균열 현상을 무효화했습니다.`, "status"); return false; }
    if (Math.random() >= RIFT_EVENT_RATE) return false;
    const event = randomItem(RIFT_EVENTS);
    this.log(`균열 현상 - ${event.name}: ${event.text}`, "status");
    this.applyRiftEffect(actor, event.effect);
    this.checkDeaths();
    return true;
  }
  applyRiftEffect(actor, effect) {
    switch (effect) {
      case "hp_minus_4": this.applyDamage(actor, 4, null, { ignoreGuardianBreak: true }); break;
      case "mp_minus_2": { const loss = Math.min(actor.mp, 2); actor.mp -= loss; this.log(`${actor.name} MP -${loss}.`, "status"); break; }
      case "seal_card": this.sealRandomCard(actor); break;
      case "remove_card": this.removeRandomCard(actor, "금역의 기억 손실"); break;
      case "hp_plus_3": this.heal(actor, 3); break;
    }
  }
  removeRandomCard(actor, reason) {
    if (!actor.hand.length) return;
    const card = randomItem(actor.hand);
    this.removeCardFromHand(actor, card.instanceId);
    this.log(`${actor.name}의 ${card.name}이(가) ${reason}으로 사라졌습니다.`, "status");
  }
  grantGuardianSigil(actor, preferredSigilId = null) {
    const ownedByOthers = new Set(this.livingParticipants().filter((p) => p.id !== actor.id && p.guardianSigil).map((p) => p.guardianSigil.id));
    const available = GUARDIAN_SIGILS.filter((s) => !ownedByOthers.has(s.id));
    if (available.length === 0) { this.log("수호 각인 획득 실패: 모든 수호 각인이 다른 서약자에게 묶여 있습니다.", "system"); return false; }
    const previous = actor.guardianSigil?.name;
    let sigil = preferredSigilId ? available.find((c) => c.id === preferredSigilId) : null;
    if (!sigil) sigil = randomItem(available);
    if (!preferredSigilId && available.length > 1 && actor.guardianSigil) {
      const nonCurrent = available.filter((c) => c.id !== actor.guardianSigil.id);
      if (nonCurrent.length > 0) sigil = randomItem(nonCurrent);
    }
    actor.guardianSigil = { ...sigil, actions: sigil.actions.map((a) => ({ ...a })) };
    if (previous) this.log(`${actor.name}의 수호 각인이 ${previous}에서 ${sigil.name}(으)로 교체되었습니다.`, "system");
    else this.log(`${actor.name}이 ${sigil.name} 수호 각인을 얻었습니다.`, "system");
    return true;
  }
  guardianActionSummary(sigil) { return sigil.actions?.map((a) => a.text).join(" / ") || sigil.text || ""; }
  pickGuardianAction(sigil) {
    if (Array.isArray(sigil.actions) && sigil.actions.length > 0) {
      const table = Object.fromEntries(sigil.actions.map((a, i) => [String(i), a.weight || 1]));
      return sigil.actions[Number(weightedPick(table))];
    }
    return { effect: sigil.effect, text: sigil.text };
  }
  forceTriggerGuardianSigil(actor) { if (!actor.guardianSigil) return false; return this.triggerGuardianSigil(actor, true); }
  triggerGuardianSigil(actor, force = false) {
    const sigil = actor.guardianSigil;
    if (!sigil || !actor.alive) return false;
    if (!force && Math.random() >= 0.25) return false;
    const action = this.pickGuardianAction(sigil);
    if (!action) return false;
    this.log(`${actor.name}의 ${sigil.name} 발동: ${action.text}`, "system");
    switch (action.effect) {
      case "heal_1": this.heal(actor, 1); break;
      case "gain_mp_1": actor.mp = clamp(actor.mp + 1, 0, actor.maxMp); this.log(`${actor.name} MP +1.`, "heal"); break;
      case "gain_gp_1": actor.gp = clamp(actor.gp + 1, 0, actor.maxGp); this.log(`${actor.name} GP +1.`, "trade"); break;
      case "gain_gp_2": actor.gp = clamp(actor.gp + 2, 0, actor.maxGp); this.log(`${actor.name} GP +2.`, "trade"); break;
      case "remove_bleeding": if (actor.statuses.bleeding > 0) { actor.statuses.bleeding = 0; this.log(`${actor.name}의 출혈이 제거되었습니다.`, "status"); } break;
      case "remove_minor_status": this.removeMinorStatus(actor); break;
      case "next_damage_reduce_1": actor.mod.nextDamageReduce += 1; this.log(`${actor.name}의 다음 피해가 1 감소합니다.`, "defense"); break;
      case "next_weapon_power_up_1": actor.mod.nextWeaponPowerDelta += 1; this.log(`${actor.name}의 다음 무기 피해가 1 증가합니다.`, "attack"); break;
      case "replace_one_card": { if (actor.hand.length === 0) return false; const card = randomItem(actor.hand); this.removeCardFromHand(actor, card.instanceId); this.drawCard(actor); this.log(`${actor.name}의 ${sigil.name}으로 ${card.name}이 교체되었습니다.`, "system"); break; }
      case "seal_random_enemy_card": { const enemies = this.livingParticipants().filter((p) => p.id !== actor.id && p.hand.length > 0); if (enemies.length === 0) return false; this.sealRandomCard(randomItem(enemies)); break; }
      case "random_enemy_damage_1": { const t = this.randomEnemy(actor); if (!t) return false; this.applyDamage(t, 1, actor, { ignoreGuardianBreak: true }); break; }
      case "random_enemy_vulnerable": { const t = this.randomEnemy(actor); if (!t) return false; this.applyStatus(t, "vulnerable"); break; }
      case "random_enemy_gp_minus_1": { const t = this.randomEnemy(actor); if (!t) return false; const loss = Math.min(t.gp, 1); t.gp -= loss; this.log(`${t.name} GP -${loss}.`, "trade"); break; }
      default: return false;
    }
    return true;
  }
  maybeBreakGuardianSigil(actor) {
    if (!actor?.guardianSigil || !actor.alive) return false;
    if (Math.random() >= 0.10) return false;
    const name = actor.guardianSigil.name;
    actor.guardianSigil = null;
    this.log(`${actor.name}의 ${name} 수호 각인이 피해 충격으로 흐려졌습니다.`, "status");
    return true;
  }
  isAreaAttackCard(card) { return card?.effect === "area_damage_2_70" || card?.effect === "area_damage_3_55_rift_mark"; }
  areaHitChance(card) { if (card.effect === "area_damage_2_70") return 0.70; if (card.effect === "area_damage_3_55_rift_mark") return 0.55; return 0; }
  performAreaAttack(attacker, card, options = {}) {
    if (!attacker.alive) { options.onComplete?.(); return; }
    const targets = this.livingParticipants().filter((p) => p.id !== attacker.id);
    this.log(`${attacker.name}이 ${card.name}으로 광역 공격을 펼칩니다.`, "attack");
    this.resolveAreaAttackTarget(attacker, card, targets, 0, options.onComplete);
  }
  resolveAreaAttackTarget(attacker, card, targets, index, onComplete) {
    if (!this.state || this.state.gameOver || !attacker.alive || index >= targets.length) { onComplete?.(); return; }
    const defender = targets[index];
    const next = () => this.resolveAreaAttackTarget(attacker, card, targets, index + 1, onComplete);
    if (!defender.alive) { next(); return; }
    const guaranteed = Boolean(defender.statuses.riftMarked);
    const hit = guaranteed || Math.random() < this.areaHitChance(card);
    if (defender.statuses.riftMarked) { defender.statuses.riftMarked = false; this.log(`${defender.name}의 균열표식으로 광역 공격이 반드시 명중합니다.`, "status"); }
    if (!hit) { this.log(`${card.name}: ${defender.name}에게 빗나갔습니다.`, "attack"); next(); return; }
    const damage = this.computeAttackPower(attacker, defender, card, false);
    const attackData = { attacker, defender, card, baseDamage: Math.max(0, damage), isMagic: false, isArea: true, onComplete: next };
    if (this.isHuman(defender)) { this.openDefenseModal(attackData); return; }
    const defenseCard = this.chooseAIDefense(defender, attackData);
    this.resolveDefense(attackData, defenseCard, false);
  }
  canUseDefenseCardAgainst(defenseCard, attackData) {
    if (!defenseCard || defenseCard.timing !== "defense") return false;
    if (defenseCard.effect === "reflect_magic_2_if_blocked" && !attackData.isMagic) return false;
    return true;
  }
  getCleanseOptions(actor) {
    const o = [];
    if (actor.statuses.bleeding > 0) o.push({ key: "bleeding", label: "출혈 제거", value: `출혈 ${actor.statuses.bleeding}턴` });
    if (actor.statuses.vulnerable) o.push({ key: "vulnerable", label: "취약 제거", value: "다음 피해 +2 방지" });
    if (actor.statuses.weakened) o.push({ key: "weakened", label: "위축 제거", value: "다음 무기 피해 -2 방지" });
    if (actor.statuses.confusion) o.push({ key: "confusion", label: "혼선 제거", value: "손패 교체 방지" });
    if (actor.statuses.blurred) o.push({ key: "blurred", label: "흐림 제거", value: "대상 무작위 변경 방지" });
    if (actor.statuses.riftMarked) o.push({ key: "riftMarked", label: "균열표식 제거", value: "광역 확정 명중 방지" });
    if (actor.statuses.disease > 0) o.push({ key: "disease", label: "질병 단계 1 감소", value: DISEASE_NAME[actor.statuses.disease] });
    return o;
  }
  cleanseSelectedStatus(actor, key = null) {
    const options = this.getCleanseOptions(actor);
    if (options.length === 0) { this.log(`${actor.name}에게 정화할 상태이상이 없습니다.`, "status"); return; }
    const target = options.find((o) => o.key === key) || options[0];
    switch (target.key) {
      case "bleeding": actor.statuses.bleeding = 0; this.log(`${actor.name}의 출혈이 제거되었습니다.`, "status"); break;
      case "vulnerable": actor.statuses.vulnerable = false; this.log(`${actor.name}의 취약이 제거되었습니다.`, "status"); break;
      case "weakened": actor.statuses.weakened = false; this.log(`${actor.name}의 위축이 제거되었습니다.`, "status"); break;
      case "confusion": actor.statuses.confusion = false; this.log(`${actor.name}의 혼선이 제거되었습니다.`, "status"); break;
      case "blurred": actor.statuses.blurred = false; this.log(`${actor.name}의 흐림이 제거되었습니다.`, "status"); break;
      case "riftMarked": actor.statuses.riftMarked = false; this.log(`${actor.name}의 균열표식이 제거되었습니다.`, "status"); break;
      case "disease": this.diseaseDown(actor, 1); break;
    }
  }
  openGuardianChoiceModal(actor, done) {
    const ownedByOthers = new Set(this.livingParticipants().filter((p) => p.id !== actor.id && p.guardianSigil).map((p) => p.guardianSigil.id));
    const available = GUARDIAN_SIGILS.filter((s) => !ownedByOthers.has(s.id));
    const choices = shuffle(available).slice(0, 2);
    if (!this.isHuman(actor) || choices.length === 0) { this.grantGuardianSigil(actor); done(); return; }
    this._guardianCtx = { actor, done };
    this.state.pendingRequest = { kind: "guardian", ownerId: actor.id, choices: choices.map((s) => ({ id: s.id, name: s.name, emotion: s.emotion, summary: this.guardianActionSummary(s) })) };
    this.emit();
  }
  submitGuardianChoice(actorId, sigilId) {
    const ctx = this._guardianCtx; if (!ctx || ctx.actor.id !== actorId) return;
    this._guardianCtx = null; this.state.pendingRequest = null;
    this.grantGuardianSigil(ctx.actor, sigilId || null);
    ctx.done();
  }
  openCleanseStatusModal(actor, done) {
    const options = this.getCleanseOptions(actor);
    if (options.length === 0) { this.cleanseSelectedStatus(actor, null); done(); return; }
    this._cleanseCtx = { actor, done };
    this.state.pendingRequest = { kind: "cleanse", ownerId: actor.id, options };
    this.emit();
  }
  submitCleanse(actorId, key) {
    const ctx = this._cleanseCtx; if (!ctx || ctx.actor.id !== actorId) return;
    this._cleanseCtx = null; this.state.pendingRequest = null;
    this.cleanseSelectedStatus(ctx.actor, key);
    ctx.done();
  }

  checkDeaths() {
    this.state.participants.forEach((p) => {
      if (p.alive && p.hp <= 0) {
        p.hp = 0; p.alive = false;
        if (!this.state.eliminationOrder.includes(p.id)) this.state.eliminationOrder.push(p.id);
        this.log(`${p.name} 탈락.`, "death");
      }
    });
    const alive = this.livingParticipants();
    if (alive.length <= 1) {
      this.state.gameOver = true;
      this.state.phase = "gameOver";
      this.state.winnerId = alive[0] ? alive[0].id : null;
      this.log(`전투 종료: ${alive[0] ? alive[0].name : "-"}이 최후의 생존자입니다.`, "victory");
      this.emit();
    }
  }

  finalRanking() {
    const survivor = this.state.winnerId ? [this.state.winnerId] : [];
    const ranked = [...survivor, ...[...this.state.eliminationOrder].reverse().filter((id) => !survivor.includes(id))];
    return ranked.map((id, i) => ({ rank: i + 1, participant: this.getParticipant(id) }));
  }
}

/* ----- log helpers ----- */
function inferLogType(text) {
  if (text.includes("승리")) return "victory";
  if (text.includes("패배") || text.includes("관전")) return "defeat";
  if (text.includes("탈락")) return "death";
  if (text.includes("HP -") || text.includes("피해")) return "attack";
  if (text.includes("대응") || text.includes("방어") || text.includes("감소")) return "defense";
  if (text.includes("HP +") || text.includes("회복")) return "heal";
  if (text.includes("매입") || text.includes("강매") || text.includes("환전") || text.includes("GP")) return "trade";
  if (text.includes("출혈") || text.includes("취약") || text.includes("위축") || text.includes("혼선") || text.includes("질병") || text.includes("봉인") || text.includes("상태")) return "status";
  return "system";
}
function logTypeLabel(type) {
  return { attack: "공격", defense: "방어", heal: "회복", trade: "거래", status: "상태", system: "시스템", death: "탈락", victory: "승리", defeat: "패배" }[type] || "로그";
}

/* 클라이언트(서버 상태 스냅샷)용 순수 헬퍼 — 엔진 인스턴스 없이 사용 */
function canPayCost(actor, cost) { return actor.hp > cost.hp && actor.mp >= cost.mp && actor.gp >= cost.gp; }
function cardSealed(card) { return card.sealedTurns > 0; }
function isMyTurn(state, myId) { return !!state && state.phase === "playerAction" && state.currentActorId === myId && !state.gameOver; }

/* isomorphic export: 브라우저는 window.GE, 서버(Workers/Node)는 module.exports */
const GE = {
  GameEngine, CARDS, STAT, CATEGORY_LABEL, PATH_LABEL, EMOTION_LABEL, AI_TYPE_LABEL, AI_TYPES, DISEASE_NAME,
  isProtectionScript, signed, clamp, logTypeLabel, canPayCost, cardSealed, isMyTurn,
};
if (typeof window !== "undefined") window.GE = GE;
if (typeof module !== "undefined" && module.exports) module.exports = GE;
