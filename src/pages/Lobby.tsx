import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { QRCodeSVG } from 'qrcode.react';
import { Users, Play, Bot, UserPlus, Copy, Check, Tv, ArrowLeft, Trash2 } from 'lucide-react';

export default function Lobby() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { socket, lobby, setPlayer, player } = useGameStore();
  const [name, setName] = useState(localStorage.getItem('playerName') || '');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // If player is not in lobby state yet, attempt auto-join
    if (socket && id) {
      const storedName = localStorage.getItem('playerName') || 'Spieler';
      socket.emit('join_lobby', { lobbyId: id, name: storedName, role: 'player' }, (res: any) => {
        if (res.success) {
          setPlayer(res.player);
        }
      });
    }
  }, [socket, id]);

  useEffect(() => {
    if (lobby?.status === 'playing') {
      navigate(`/game/${id}`);
    }
  }, [lobby?.status, navigate, id]);

  const joinLobby = () => {
    if (!name.trim()) return alert('Bitte gib deinen Namen ein');
    localStorage.setItem('playerName', name);

    socket?.emit('join_lobby', { lobbyId: id, name, role: 'player' }, (res: any) => {
      if (res.success) {
        setPlayer(res.player);
      } else {
        alert(res.error || 'Fehler beim Beitritt');
        navigate('/');
      }
    });
  };

  const addBot = () => {
    socket?.emit('add_bot', { lobbyId: id }, (res: any) => {
      if (!res.success) {
        alert(res.error);
      }
    });
  };

  const removeBot = (botId: string) => {
    socket?.emit('remove_bot', { lobbyId: id, botId });
  };

  const startGame = () => {
    socket?.emit('start_game', { lobbyId: id });
  };

  const copyLink = () => {
    const joinUrl = `${window.location.origin}/lobby/${id}`;
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isHost = socket?.id === lobby?.host;
  const maxPlayers = lobby?.gameType === 'tavla' ? 2 : 4;
  const canStart = (lobby?.players?.length || 0) >= 2;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col p-4 sm:p-6">
      
      {/* Header */}
      <div className="max-w-4xl w-full mx-auto flex items-center justify-between py-4 border-b border-slate-800 mb-6">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Hauptmenü</span>
        </button>

        <div className="text-center">
          <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">Lobby-Code</span>
          <div className="font-mono text-2xl font-black text-amber-400">{id}</div>
        </div>

        <button
          onClick={() => navigate(`/tv/${id}`)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-semibold rounded-lg border border-slate-700"
        >
          <Tv className="w-4 h-4 text-slate-400" />
          <span>TV-Modus</span>
        </button>
      </div>

      {/* Content */}
      <main className="max-w-4xl w-full mx-auto my-auto grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* QR Code & Join Link Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 flex flex-col items-center justify-center text-center shadow-xl">
          <span className="text-xs font-bold uppercase tracking-widest text-red-400 mb-2">
            {lobby?.gameType === 'tavla' ? 'Tavla (Backgammon)' : 'Okey (Steinspiel)'}
          </span>
          <h2 className="text-xl font-bold mb-6">Scanner zum Beitreten</h2>

          <div className="bg-white p-4 rounded-2xl shadow-2xl mb-6 ring-4 ring-slate-800">
            <QRCodeSVG value={`${window.location.origin}/lobby/${id}`} size={180} />
          </div>

          <button
            onClick={copyLink}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700 transition"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
            <span>{copied ? 'Link kopiert!' : 'Einladungslink kopieren'}</span>
          </button>
        </div>

        {/* Players List Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 flex flex-col justify-between shadow-xl">
          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-bold">Mitspieler ({lobby?.players?.length || 0} / {maxPlayers})</h2>
              </div>
              
              {isHost && (lobby?.players?.length || 0) < maxPlayers && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const needed = maxPlayers - (lobby?.players?.length || 0);
                      for (let i = 0; i < needed; i++) addBot();
                    }}
                    className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-amber-950 text-xs font-bold rounded-xl transition shadow"
                  >
                    Bots auffüllen
                  </button>
                  <button
                    onClick={addBot}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-950/50 hover:bg-amber-900/50 text-amber-300 text-xs font-semibold rounded-xl border border-amber-500/40 transition"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    <span>+ Bot</span>
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-3 mb-6">
              {lobby?.players?.map((p: any, idx: number) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/60"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-700 text-slate-200 flex items-center justify-center font-bold text-xs border border-slate-600">
                      {p.isBot ? <Bot className="w-4 h-4 text-amber-400" /> : idx + 1}
                    </div>
                    <div>
                      <div className="font-semibold text-sm flex items-center gap-2">
                        {p.name}
                        {p.id === lobby.host && (
                          <span className="text-[10px] font-bold bg-red-950 text-red-400 border border-red-800 px-2 py-0.5 rounded-full">
                            HOST
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">Elo: {p.elo || 1200}</div>
                    </div>
                  </div>

                  {isHost && p.isBot && (
                    <button
                      onClick={() => removeBot(p.id)}
                      className="p-2 text-slate-500 hover:text-red-400 transition"
                      title="Bot entfernen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Start Button Area */}
          <div>
            {isHost ? (
              <button
                onClick={startGame}
                disabled={!canStart}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white py-4 rounded-2xl font-bold text-base shadow-xl transition"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Spiel Jetzt Starten</span>
              </button>
            ) : (
              <div className="text-center p-4 bg-slate-800/40 border border-slate-700/40 rounded-2xl text-slate-400 text-sm font-medium">
                Warte auf den Host zum Starten...
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}
