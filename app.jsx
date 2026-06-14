/* =========================================================
  멀티 카드 결투 — useRoom (PartyKit 실시간) · useGame · App
  Phase 1: 로비/접속/준비/채팅/끊김은 PartyKit 서버로 진짜 멀티.
  전투는 각 클라이언트의 로컬 엔진에서 "자기 자신" 좌석으로 진행한다.
  (전투 동기화는 Phase 2에서 서버 권위 엔진으로 전환)
========================================================= */
const { useState: useA, useEffect: useEA, useRef: useRA, useCallback: useCA } = React;
const GA = window.GE;

function genCode() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => a[Math.floor(Math.random() * a.length)]).join("");
}

/* PartySocket 이 아직 로드되지 않았을 수 있으므로 준비될 때까지 대기 */
function whenPartySocketReady(cb) {
  if (window.PartySocket) { cb(); return; }
  window.addEventListener("partysocket-ready", cb, { once: true });
}

function useRoom({ onStart, onBackToRoom }) {
  const [room, setRoom] = useA(null);
  const [chat, setChat] = useA([]);
  const selfId = useRA(null);
  const sockRef = useRA(null);

  const send = (obj) => { const s = sockRef.current; if (s && s.readyState === 1) s.send(JSON.stringify(obj)); };

  const connect = useCA((code, nickname, count) => {
    if (sockRef.current) { try { sockRef.current.close(); } catch (e) {} sockRef.current = null; }
    setRoom(null); setChat([]); selfId.current = null;

    whenPartySocketReady(() => {
      const socket = new window.PartySocket({ host: window.PARTYKIT_HOST, party: "card-duel", room: code });
      sockRef.current = socket;

      socket.addEventListener("open", () => {
        socket.send(JSON.stringify({ type: "join", nickname, maxPlayers: count }));
      });
      socket.addEventListener("message", (ev) => {
        let data; try { data = JSON.parse(ev.data); } catch (e) { return; }
        if (data.type === "history") { selfId.current = data.selfId; setChat(data.chat || []); }
        else if (data.type === "room") setRoom(data.room);
        else if (data.type === "chat") setChat((c) => [...c, data.message]);
        else if (data.type === "start") onStart && onStart(data.roster, selfId.current);
        else if (data.type === "backToRoom") onBackToRoom && onBackToRoom();
      });
    });
  }, [onStart, onBackToRoom]);

  const createRoom = (nickname, count) => connect(genCode(), nickname, count);
  const joinRoom = (code, nickname, count) => connect((code || genCode()).slice(0, 6).toUpperCase(), nickname, count);
  const toggleReady = () => send({ type: "ready" });
  const setMax = (value) => send({ type: "setMax", value });
  const addBot = () => send({ type: "addBot" });
  const removeBot = (id) => send({ type: "removeBot", id });
  const requestStart = () => send({ type: "start" });
  const requestBackToRoom = () => send({ type: "backToRoom" });
  const sendChat = (text) => send({ type: "chat", text });
  const leaveRoom = () => {
    if (sockRef.current) { try { sockRef.current.close(); } catch (e) {} sockRef.current = null; }
    setRoom(null); setChat([]); selfId.current = null;
  };

  useEA(() => () => { if (sockRef.current) { try { sockRef.current.close(); } catch (e) {} } }, []);

  const me = room && selfId.current ? room.players.find((p) => p.id === selfId.current) : null;
  return { room, chat, me, selfId: selfId.current, createRoom, joinRoom, toggleReady, setMax, addBot, removeBot, requestStart, requestBackToRoom, sendChat, leaveRoom };
}

function useGame() {
  const ref = useRA(null);
  if (!ref.current) ref.current = new GA.GameEngine();
  const [, force] = useA(0);
  useEA(() => ref.current.subscribe(() => force((v) => v + 1)), []);
  return ref.current;
}

/* 서버 roster 를 로컬 엔진용으로 변환:
   - 내 좌석을 index 0(플레이어)으로 이동
   - 나머지는 모두 AI. aiType 이 "human"(다른 사람) 이면 로컬 시뮬레이션용 AI 타입 부여 */
function buildLocalRoster(roster, myId) {
  const aiTypes = GA.AI_TYPES;
  const mine = roster.find((r) => r.id === myId);
  const others = roster.filter((r) => r.id !== myId);
  const ordered = (mine ? [mine] : []).concat(others);
  return ordered.map((r, i) => {
    if (i === 0) return { ...r, aiType: "human" };
    const aiType = (!r.aiType || r.aiType === "human") ? aiTypes[i % aiTypes.length] : r.aiType;
    return { ...r, aiType };
  });
}

function App() {
  const engine = useGame();
  const [screen, setScreen] = useA("lobby");
  const [nickname, setNickname] = useA("결투자");
  const [playerCount, setPlayerCount] = useA(8);
  const [spectateAck, setSpectateAck] = useA(false);

  const onStart = useCA((roster, myId) => {
    setSpectateAck(false);
    engine.newGame(buildLocalRoster(roster, myId));
    setScreen("game");
  }, [engine]);
  const onBackToRoom = useCA(() => { setSpectateAck(false); setScreen("room"); }, []);

  const roomApi = useRoom({ onStart, onBackToRoom });

  const create = (nick, count) => { roomApi.createRoom(nick, count); setScreen("room"); };
  const join = (code, nick, count) => { roomApi.joinRoom(code, nick, count); setScreen("room"); };
  const start = () => roomApi.requestStart();          // 서버가 start 브로드캐스트 → onStart 에서 전환
  const rematch = () => roomApi.requestBackToRoom();   // 방장이 대기실로 (서버가 전원 전환)
  const toLobby = () => { roomApi.leaveRoom(); setScreen("lobby"); };

  const st = engine.state;
  useEA(() => { window.__cardDuel = { engine, room: roomApi }; }, [engine, st]);
  const onlineById = {};
  if (roomApi.room) roomApi.room.players.forEach((p) => { onlineById[p.id] = p.isOnline; });
  const offlineNames = (screen === "game" && st && roomApi.room)
    ? roomApi.room.players.filter((p) => !p.isOnline).filter((p) => { const ep = engine.getParticipant(p.id); return ep && ep.alive; }).map((p) => p.nickname)
    : [];

  return (
    <div className="app-shell">
      {screen === "lobby" && (
        <LobbyScreen nickname={nickname} setNickname={setNickname} playerCount={playerCount} setPlayerCount={setPlayerCount} onCreate={create} onJoin={join} />
      )}
      {screen === "room" && roomApi.room && (
        <RoomScreen room={roomApi.room} chat={roomApi.chat} me={roomApi.me}
          onToggleReady={roomApi.toggleReady} onSetMax={roomApi.setMax}
          onAddBot={roomApi.addBot} onRemoveBot={roomApi.removeBot}
          onStart={start} onSend={roomApi.sendChat} onLeave={toLobby} />
      )}
      {screen === "room" && !roomApi.room && (
        <div className="center-stage"><div className="parchment-card"><div className="title-xl">연결 중…</div><div className="subtitle">방에 접속하고 있습니다.</div></div></div>
      )}
      {screen === "game" && st && (
        <>
          <GameScreen engine={engine} onlineById={onlineById} offlineNames={offlineNames} />
          {st.gameOver && (
            <GameOverOverlay engine={engine} ranking={engine.finalRanking()} playerWon={st.winnerId === engine.player().id} onRematch={rematch} onLobby={toLobby} />
          )}
          {!st.gameOver && st.playerEliminated && !spectateAck && (
            <EliminationOverlay engine={engine} survivors={engine.livingParticipants()} onSpectate={() => setSpectateAck(true)} />
          )}
        </>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
