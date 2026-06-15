/* =========================================================
  멀티 카드 결투 — useRoom (실시간) · App
  Phase 2: 로비/전투 모두 "서버 권위". 클라는 서버가 보낸 상태(sync)를 받아 렌더하고,
  입력은 action 메시지로 서버에 보낸다(엔진은 서버 Durable Object 에서 구동).
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

function useRoom() {
  const [room, setRoom] = useA(null);
  const [chat, setChat] = useA([]);
  const [game, setGame] = useA(null);       // 서버 전투 상태(sync)
  const [ranking, setRanking] = useA(null);  // gameOver 시 최종 순위 [{rank,id}]
  const [screen, setScreen] = useA("lobby"); // lobby | room | game
  const selfId = useRA(null);
  const sockRef = useRA(null);

  const send = (obj) => { const s = sockRef.current; if (s && s.readyState === 1) s.send(JSON.stringify(obj)); };

  const closeSock = () => { if (sockRef.current) { try { sockRef.current.close(); } catch (e) {} sockRef.current = null; } };

  const connect = useCA((code, nickname, count) => {
    closeSock();
    setRoom(null); setChat([]); setGame(null); setRanking(null); selfId.current = null;

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
        else if (data.type === "sync") { setGame(data.state); setRanking(data.ranking || null); }
        else if (data.type === "start") setScreen("game");
        else if (data.type === "backToRoom") { setGame(null); setRanking(null); setScreen("room"); }
      });
    });
  }, []);

  const createRoom = (nickname, count) => { connect(genCode(), nickname, count); setScreen("room"); };
  const joinRoom = (code, nickname, count) => { connect((code || genCode()).slice(0, 6).toUpperCase(), nickname, count); setScreen("room"); };
  const toggleReady = () => send({ type: "ready" });
  const setMax = (value) => send({ type: "setMax", value });
  const setRift = (value) => send({ type: "setRift", value });
  const addBot = () => send({ type: "addBot" });
  const removeBot = (id) => send({ type: "removeBot", id });
  const requestStart = () => send({ type: "start" });
  const requestBackToRoom = () => send({ type: "backToRoom" });
  const sendChat = (text) => send({ type: "chat", text });
  const sendAction = (action, ...args) => send({ type: "action", action, args });
  const leaveRoom = () => { closeSock(); setRoom(null); setChat([]); setGame(null); setRanking(null); selfId.current = null; setScreen("lobby"); };

  useEA(() => () => closeSock(), []);

  const me = room && selfId.current ? room.players.find((p) => p.id === selfId.current) : null;
  return {
    screen, room, chat, game, ranking, me, myId: selfId.current,
    createRoom, joinRoom, toggleReady, setMax, setRift, addBot, removeBot,
    requestStart, requestBackToRoom, sendChat, sendAction, leaveRoom,
  };
}

function App() {
  const r = useRoom();
  const [nickname, setNickname] = useA("결투자");
  const [playerCount, setPlayerCount] = useA(8);
  const [spectateAck, setSpectateAck] = useA(false);

  const st = r.game;
  const meP = st ? st.participants.find((p) => p.id === r.myId) : null;
  const isHost = !!(r.room && r.room.hostId === r.myId);

  // 새 게임이 시작되면 관전 확인 초기화
  useEA(() => { if (st && !st.gameOver && meP && meP.alive) setSpectateAck(false); }, [st && st.gameId]);
  useEA(() => { window.__cardDuel = { room: r }; }, [r.game]);

  const create = (nick, count) => r.createRoom(nick, count);
  const join = (code, nick, count) => r.joinRoom(code, nick, count);
  const toLobby = () => r.leaveRoom();

  const onlineById = {};
  if (r.room) r.room.players.forEach((p) => { onlineById[p.id] = p.isOnline; });
  const offlineNames = (r.screen === "game" && st && r.room)
    ? r.room.players.filter((p) => !p.isOnline)
        .filter((p) => { const ep = st.participants.find((x) => x.id === p.id); return ep && ep.alive; })
        .map((p) => p.nickname)
    : [];
  const survivors = st ? st.participants.filter((p) => p.alive) : [];
  const spectating = !!(meP && meP.alive === false);

  return (
    <div className="app-shell">
      {r.screen === "lobby" && (
        <LobbyScreen nickname={nickname} setNickname={setNickname} playerCount={playerCount} setPlayerCount={setPlayerCount} onCreate={create} onJoin={join} />
      )}
      {r.screen === "room" && r.room && (
        <RoomScreen room={r.room} chat={r.chat} me={r.me}
          onToggleReady={r.toggleReady} onSetMax={r.setMax} onSetRift={r.setRift}
          onAddBot={r.addBot} onRemoveBot={r.removeBot}
          onStart={r.requestStart} onSend={r.sendChat} onLeave={toLobby} />
      )}
      {r.screen === "room" && !r.room && (
        <div className="center-stage"><div className="parchment-card"><div className="title-xl">연결 중…</div><div className="subtitle">방에 접속하고 있습니다.</div></div></div>
      )}
      {r.screen === "game" && st && (
        <>
          <GameScreen state={st} myId={r.myId} sendAction={r.sendAction} onlineById={onlineById} offlineNames={offlineNames} onLeave={toLobby} />
          {st.gameOver && (
            <GameOverOverlay state={st} myId={r.myId} ranking={r.ranking} playerWon={st.winnerId === r.myId} isHost={isHost} onRematch={r.requestBackToRoom} onLobby={toLobby} />
          )}
          {!st.gameOver && spectating && !spectateAck && (
            <EliminationOverlay survivors={survivors} onSpectate={() => setSpectateAck(true)} />
          )}
        </>
      )}
      {r.screen === "game" && !st && (
        <div className="center-stage"><div className="parchment-card"><div className="title-xl">전투 동기화 중…</div><div className="subtitle">서버에서 결투 상태를 받아오고 있습니다.</div></div></div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
