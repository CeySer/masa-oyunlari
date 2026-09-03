import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { QRCodeSVG } from 'qrcode.react';
import { Tv, Trophy, Bot, Users, Sparkles, Activity, Play, PlusCircle } from 'lucide-react';

export default function TV() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { socket, lobby, publicGameState } = useGameStore();
  const [lobbyIdInput, setLobbyIdInput] = useState(id || '');
  const [gameType, setGameType] = useState<'okey' | 'tavla'>('okey');
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (socket && id) {
      socket.emit('join_lobby', { lobbyId: id, role: 'tv' }, (res: any) => {
        if (res.success) {
          setConnected(true);
        }
      });
    }
  }, [socket, id]);

  const joinAsTV = () => {
    if (!lobbyIdInput) return;
    socket?.emit('join_lobby', { lobbyId: lobbyIdInput.toUpperCase(), role: 'tv' }, (res: any) => {
      if (res.success) {
        setConnected(true);
        if (!id) navigate(`/tv/${lobbyIdInput.toUpperCase()}`, { replace: true });
      } else {
        alert(res.error || 'Lobby nicht gefunden!');
      }
    });
  };

  const createTVLobby = () => {
    socket?.emit('create_tv_lobby', { gameType }, (res: any) => {
      if (res.success) {
        setConnected(true);
        navigate(`/tv/${res.lobbyId}`, { replace: true });
      }
    });
  };

  const addBot = () => {
    if (!lobby?.id) return;
    socket?.emit('add_bot', { lobbyId: lobby.id });
  };

  const startGameFromTV = () => {
    if (!lobby?.id) return;
    socket?.emit('start_game', { lobbyId: lobby.id });
  };

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-6 font-sans">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-8 space-y-6">
          <div className="text-center">
            <Tv className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h2 className="text-2xl font-bold">TV / Monitor Modus</h2>
            <p className="text-xs text-slate-400 mt-1">Öffentlicher Großbildschirm für TV & Tablets</p>
          </div>

          {/* Quick Create TV Lobby */}
          <div className="space-y-3 bg-slate-800/50 p-4 rounded-2xl border border-slate-700/60">
            <label className="block text-xs font-bold uppercase text-amber-400">
              1. Neue TV-Lobby Erstellen
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setGameType('okey')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition border ${
                  gameType === 'okey' ? 'bg-red-600 border-red-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                Okey
              </button>
              <button
                type="button"
                onClick={() => setGameType('tavla')}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition border ${
                  gameType === 'tavla' ? 'bg-amber-600 border-amber-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                Tavla
              </button>
            </div>
            <button
              onClick={createTVLobby}
              className="w-full bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white py-3.5 rounded-xl font-bold transition shadow-xl flex items-center justify-center gap-2"
            >
              <PlusCircle className="w-5 h-5" />
              <span>Neue TV-Lobby Erstellen</span>
            </button>
          </div>

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-slate-900 text-slate-500 uppercase tracking-widest font-semibold">Oder</span>
            </div>
          </div>

          {/* Join Existing Lobby */}
          <div className="space-y-3">
            <label className="block text-xs font-bold uppercase text-slate-400">
              2. Bestehender Lobby Beitreten
            </label>
            <input
              type="text"
              value={lobbyIdInput}
              onChange={(e) => setLobbyIdInput(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white font-mono text-center text-lg font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="z.B. ABC123"
            />
            <button
              onClick={joinAsTV}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl font-bold border border-slate-700 transition"
            >
              Lobby Öffnen
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Waiting Room View on TV
  if (lobby?.status === 'waiting') {
    const joinUrl = `${window.location.origin}/lobby/${lobby.id}`;
    const maxRequired = lobby.gameType === 'tavla' ? 2 : 4;

    return (
      <div className="min-h-screen bg-emerald-950 text-white flex flex-col items-center justify-between p-8 select-none font-sans">
        
        {/* Header */}
        <div className="text-center mt-4">
          <div className="inline-flex items-center gap-2 bg-emerald-900/80 border border-emerald-700 px-5 py-1.5 rounded-full text-xs font-bold text-emerald-300 uppercase tracking-widest mb-2 shadow-lg">
            <Tv className="w-4 h-4 text-amber-400" /> TV / GROSSBILDSCHIRM LOBBY
          </div>
          <h1 className="text-5xl sm:text-6xl font-black text-amber-400 tracking-tight mb-1">
            {lobby.gameType === 'tavla' ? 'Tavla (Backgammon)' : 'Okey Table'}
          </h1>
          <p className="text-lg text-emerald-300">Scanne den QR-Code mit deinem Smartphone, um mitzuspielen</p>
        </div>

        {/* QR Code & Join Info */}
        <div className="bg-slate-900/95 border-4 border-slate-800 p-8 rounded-3xl shadow-2xl flex items-center gap-10 max-w-2xl w-full my-auto">
          <div className="bg-white p-4 rounded-2xl shadow-xl flex-shrink-0">
            <QRCodeSVG value={joinUrl} size={200} />
          </div>

          <div className="flex flex-col gap-4 text-left flex-1">
            <h2 className="text-2xl font-bold text-white">Jetzt Beitreten!</h2>
            <p className="text-slate-400 text-sm">Öffne den Link auf deinem Handy oder scanne den QR-Code.</p>
            <div className="bg-slate-800 px-5 py-3 rounded-2xl border border-slate-700 font-mono text-3xl font-black text-amber-400 inline-block shadow-inner">
              Code: {lobby.id}
            </div>

            {/* START GAME BUTTON directly on TV */}
            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={startGameFromTV}
                className="w-full py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-black text-lg rounded-2xl shadow-2xl transition flex items-center justify-center gap-2 animate-bounce"
              >
                <Play className="w-6 h-6 fill-current" />
                <span>Spiel Jetzt Starten</span>
              </button>
              <p className="text-[11px] text-slate-400 text-center italic">
                Fehlende Plätze werden automatisch mit KI-Bots aufgefüllt!
              </p>
            </div>
          </div>
        </div>

        {/* Player slots */}
        <div className="w-full max-w-4xl mb-4">
          <div className="flex items-center justify-between mb-3 px-2">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
              Beigetretene Spieler ({lobby.players.length} / {maxRequired})
            </span>

            {lobby.players.length < maxRequired && (
              <button
                onClick={addBot}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-950/80 hover:bg-amber-900 text-amber-300 text-xs font-bold rounded-xl border border-amber-500/40 transition shadow"
              >
                <Bot className="w-4 h-4 text-amber-400" />
                <span>+ Bot Hinzufügen</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-4 gap-4">
            {lobby.players.map((p: any) => (
              <div
                key={p.id}
                className="bg-slate-900 border border-slate-800 p-4 rounded-2xl text-center font-bold flex flex-col items-center justify-center gap-1 shadow-lg"
              >
                {p.isBot ? (
                  <Bot className="w-7 h-7 text-amber-400 mb-1" />
                ) : (
                  <Users className="w-7 h-7 text-emerald-400 mb-1" />
                )}
                <span className="text-sm font-bold text-white truncate max-w-full">{p.name}</span>
                <span className="text-[10px] text-slate-500 font-mono">Elo: {p.elo || 1200}</span>
              </div>
            ))}

            {Array.from({ length: maxRequired - lobby.players.length }).map((_, idx) => (
              <div
                key={idx}
                className="bg-slate-900/40 border-2 border-dashed border-slate-800 p-4 rounded-2xl text-center text-slate-600 flex flex-col items-center justify-center gap-1"
              >
                <Users className="w-7 h-7 text-slate-700 mb-1" />
                <span className="text-xs font-semibold">Freier Platz</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Active Game State on TV
  if (lobby?.status === 'playing' && publicGameState) {
    const currentPlayer = lobby.players[publicGameState.turnIndex];
    const logs = publicGameState.logs || [];

    return (
      <div className="min-h-screen bg-slate-950 text-white p-6 flex flex-col justify-between select-none font-sans">
        
        {/* TV Top Bar */}
        <div className="flex items-center justify-between bg-slate-900 border border-slate-800 px-8 py-4 rounded-2xl shadow-xl">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-ping" />
            <h1 className="text-2xl font-black tracking-tight text-amber-400">
              {publicGameState.gameType === 'tavla' ? 'Tavla (Backgammon)' : 'Okey Table Live'}
            </h1>
          </div>

          <div className="flex items-center gap-3 px-6 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-amber-950 rounded-full font-black text-lg shadow-xl animate-pulse">
            <Activity className="w-5 h-5" />
            <span>Am Zug: {currentPlayer?.name}</span>
          </div>

          <div className="font-mono text-sm font-bold text-slate-400">
            Lobby-Code: <span className="text-amber-400 font-black">{lobby.id}</span>
          </div>
        </div>

        {/* Board View */}
        <div className="flex-1 my-6 flex items-center justify-center relative">
          
          {publicGameState.gameType === 'okey' ? (
            /* Okey TV Layout */
            <div className="w-full max-w-6xl h-full min-h-[460px] bg-emerald-950/70 border-4 border-emerald-900/80 rounded-3xl p-8 relative flex flex-col items-center justify-center shadow-2xl">
              
              {/* Central Draw Pile & Gösterge */}
              <div className="flex items-center gap-10 bg-slate-900/90 border border-slate-800 px-10 py-8 rounded-3xl shadow-2xl z-10">
                
                {/* Pile count */}
                <div className="flex flex-col items-center">
                  <div className="w-24 h-32 bg-gradient-to-br from-amber-100 to-amber-200 text-amber-950 rounded-2xl shadow-xl border-4 border-amber-300 flex items-center justify-center font-black text-4xl">
                    {publicGameState.pileCount}
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-2">Rest-Stapel</span>
                </div>

                {/* Gösterge Indicator Tile */}
                {publicGameState.indicator && (
                  <div className="flex flex-col items-center border-l border-slate-800 pl-10">
                    <div className="w-24 h-32 bg-slate-100 rounded-2xl shadow-xl border-4 border-amber-400 flex flex-col items-center justify-center">
                      <span className={`text-4xl font-black ${
                        publicGameState.indicator.color === 'red' ? 'text-red-600' :
                        publicGameState.indicator.color === 'green' ? 'text-emerald-600' :
                        publicGameState.indicator.color === 'blue' ? 'text-blue-600' :
                        publicGameState.indicator.color === 'yellow' ? 'text-amber-500' : 'text-slate-900'
                      }`}>
                        {publicGameState.indicator.value}
                      </span>
                      <span className={`w-3 h-3 rounded-full mt-1 ${
                        publicGameState.indicator.color === 'red' ? 'bg-red-500' :
                        publicGameState.indicator.color === 'green' ? 'bg-emerald-500' :
                        publicGameState.indicator.color === 'blue' ? 'bg-blue-500' :
                        publicGameState.indicator.color === 'yellow' ? 'bg-amber-500' : 'bg-slate-800'
                      }`} />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest text-amber-400 mt-2">Gösterge (Okey-Indikator)</span>
                  </div>
                )}

              </div>

              {/* 4 Seating Positions Around Table */}
              {lobby.players.map((p: any, i: number) => {
                const isTurn = i === publicGameState.turnIndex;
                const positions = [
                  "bottom-4 left-1/2 -translate-x-1/2 flex-col-reverse",
                  "top-1/2 right-6 -translate-y-1/2 flex-row",
                  "top-4 left-1/2 -translate-x-1/2 flex-col",
                  "top-1/2 left-6 -translate-y-1/2 flex-row-reverse"
                ];

                const discardList = publicGameState.discardPiles[p.id] || [];
                const topDiscard = discardList[discardList.length - 1];

                return (
                  <div key={p.id} className={`absolute ${positions[i % 4]} flex items-center gap-4`}>
                    
                    {/* Player Badge */}
                    <div className={`px-5 py-2.5 rounded-2xl font-bold text-base transition-all flex items-center gap-2.5 shadow-xl ${
                      isTurn
                        ? 'bg-amber-400 text-amber-950 ring-4 ring-amber-400/50 scale-105'
                        : 'bg-slate-900 text-white border border-slate-800'
                    }`}>
                      {p.isBot ? <Bot className="w-5 h-5 text-amber-950" /> : <Users className="w-5 h-5 text-emerald-400" />}
                      <span>{p.name}</span>
                    </div>

                    {/* Discard Pile Slot */}
                    <div className="w-20 h-28 bg-slate-900/90 rounded-2xl border-2 border-slate-700/80 flex flex-col items-center justify-center relative shadow-xl">
                      {topDiscard ? (
                        <div className="absolute inset-0 bg-slate-100 rounded-2xl border-2 border-amber-300 flex flex-col items-center justify-center shadow-md">
                          <span className={`text-3xl font-black ${
                            topDiscard.color === 'red' ? 'text-red-600' :
                            topDiscard.color === 'green' ? 'text-emerald-600' :
                            topDiscard.color === 'blue' ? 'text-blue-600' :
                            topDiscard.color === 'yellow' ? 'text-amber-500' : 'text-slate-900'
                          }`}>
                            {topDiscard.color === 'fake' ? '★' : topDiscard.value}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Ablage</span>
                      )}
                    </div>

                  </div>
                );
              })}

            </div>
          ) : (
            /* Tavla TV Board View */
            <div className="w-full max-w-5xl bg-amber-950 border-4 border-amber-900 rounded-3xl p-8 shadow-2xl text-center">
              <h2 className="text-3xl font-black text-amber-200 mb-6">Tavla Board Live</h2>
              <div className="flex justify-center gap-6 mb-6">
                {publicGameState.dice.length > 0 ? (
                  publicGameState.dice.map((d: number, idx: number) => (
                    <div key={idx} className="w-16 h-16 bg-amber-100 text-amber-950 font-black text-4xl rounded-2xl flex items-center justify-center border-4 border-amber-300 shadow-xl">
                      {d}
                    </div>
                  ))
                ) : (
                  <div className="text-amber-400/80 italic text-lg">Warte auf Würfe...</div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Live Activity Ticker / Match Logs Footer */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400 min-w-max border-r border-slate-800 pr-4">
            <Activity className="w-4 h-4 text-emerald-400" /> Live Match Ticker
          </div>

          <div className="flex-1 overflow-hidden h-6">
            {logs.length > 0 ? (
              <div className="flex items-center gap-3 text-sm font-semibold text-slate-200 animate-fade-in">
                <span className="text-xs font-mono text-slate-500">[{logs[0].time}]</span>
                <span>{logs[0].text}</span>
              </div>
            ) : (
              <span className="text-xs text-slate-500 italic">Keine Aktionen bisher...</span>
            )}
          </div>
        </div>

      </div>
    );
  }

  // Finished Game Screen on TV
  if (lobby?.status === 'finished') {
    return (
      <div className="min-h-screen bg-emerald-950 text-white flex flex-col items-center justify-center p-8 select-none font-sans">
        <Trophy className="w-24 h-24 text-amber-400 mb-4 animate-bounce" />
        <h1 className="text-6xl font-black text-amber-400 mb-8">Spiel Beendet!</h1>
        <div className="bg-slate-900 border border-slate-800 text-white p-8 rounded-3xl shadow-2xl w-full max-w-lg">
          <h2 className="text-2xl font-bold mb-6 border-b border-slate-800 pb-4">Endergebnis & Leaderboard</h2>
          <ul className="space-y-4">
            {lobby.players
              .sort((a: any, b: any) => b.score - a.score)
              .map((p: any, idx: number) => (
                <li key={p.id} className="flex justify-between items-center text-xl">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-amber-400">#{idx + 1}</span>
                    <span>{p.name}</span>
                  </div>
                  <span className="font-black text-emerald-400">{p.score} Pkt</span>
                </li>
              ))}
          </ul>
        </div>
      </div>
    );
  }

  return null;
}
