import React, { useState, useRef, useEffect } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { GameEngine } from './services/engine';
import { COLORS } from './constants';
import { BlockType, Difficulty, HighScore } from './types';
import { audioService } from './services/audio';

enum AppState {
  MENU,
  HELP,
  SETTINGS,
  PLAYING,
  GAME_OVER
}

export default function App() {
  const [appState, setAppState] = useState<AppState>(AppState.MENU);
  const [finalScores, setFinalScores] = useState<{p1: number, p2: number | null}>({p1: 0, p2: null});
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);
  const [playerName, setPlayerName] = useState('Player');
  const [highScores, setHighScores] = useState<HighScore[]>([]);
  
  // Audio Settings State
  const [musicVol, setMusicVol] = useState(audioService.musicVolume);
  const [sfxVol, setSfxVol] = useState(audioService.sfxVolume);

  const engineRef = useRef<GameEngine>(new GameEngine());
  
  const inputStateP1 = useRef({
    left: false,
    right: false,
    jump: false,
    phase: false
  });
  
  const inputStateP2 = useRef({
    left: false,
    right: false,
    jump: false,
    phase: false,
    forward: false // W
  });

  // Start music on mount
  useEffect(() => {
    audioService.startMusic();
  }, []);

  // Sync volume state with service
  const updateMusicVol = (v: number) => {
    setMusicVol(v);
    audioService.musicVolume = v;
  };

  const updateSfxVol = (v: number) => {
    setSfxVol(v);
    audioService.sfxVolume = v;
  };

  // Helper to ensure audio context is resumed on interaction
  const handleInteraction = () => {
    audioService.initialize();
  };

  // Load High Scores
  useEffect(() => {
    const stored = localStorage.getItem('blockyRunnerHighScores');
    if (stored) {
      setHighScores(JSON.parse(stored));
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (appState !== AppState.PLAYING) return;
      
      // P1 Controls (Arrows + Space/Enter)
      switch(e.code) {
        case 'ArrowLeft':
          inputStateP1.current.left = true;
          break;
        case 'ArrowRight':
          inputStateP1.current.right = true;
          break;
        case 'Space':
        case 'ArrowUp':
          inputStateP1.current.jump = true;
          break;
        case 'KeyB':
        case 'Enter':
          inputStateP1.current.phase = true;
          break;
          
        // P2 Controls (WASD + V + Ctrl)
        case 'KeyA':
          inputStateP2.current.left = true;
          break;
        case 'KeyD':
          inputStateP2.current.right = true;
          break;
        case 'KeyW':
          inputStateP2.current.forward = true;
          break;
        case 'KeyV':
          inputStateP2.current.jump = true;
          break;
        case 'ControlLeft':
        case 'ControlRight':
          inputStateP2.current.phase = true;
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch(e.code) {
        // P1
        case 'ArrowLeft':
          inputStateP1.current.left = false;
          break;
        case 'ArrowRight':
          inputStateP1.current.right = false;
          break;
        case 'Space':
        case 'ArrowUp':
          inputStateP1.current.jump = false;
          break;
        case 'KeyB':
        case 'Enter':
          inputStateP1.current.phase = false;
          break;

        // P2
        case 'KeyA':
          inputStateP2.current.left = false;
          break;
        case 'KeyD':
          inputStateP2.current.right = false;
          break;
        case 'KeyW':
          inputStateP2.current.forward = false;
          break;
        case 'KeyV':
          inputStateP2.current.jump = false;
          break;
        case 'ControlLeft':
        case 'ControlRight':
          inputStateP2.current.phase = false;
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [appState]);

  const startGame = (isMultiplayer: boolean = false) => {
    if (!playerName.trim()) {
        alert("Please enter your name!");
        return;
    }
    handleInteraction();
    // Music is always running now, no need to start it here
    engineRef.current.reset(selectedDifficulty, isMultiplayer);
    inputStateP1.current = { left: false, right: false, jump: false, phase: false };
    inputStateP2.current = { left: false, right: false, jump: false, phase: false, forward: false };
    setAppState(AppState.PLAYING);
  };

  const handleGameOver = (scores: {p1: number, p2: number | null}) => {
    // Do not stop music on game over
    setFinalScores(scores);
    const bestScore = scores.p2 !== null ? Math.max(scores.p1, scores.p2) : scores.p1;
    let name = playerName;
    if (scores.p2 !== null && scores.p2 > scores.p1) name = "Player 2";

    const newScore: HighScore = {
      name: name,
      score: bestScore,
      difficulty: selectedDifficulty,
      date: new Date().toLocaleDateString()
    };
    
    const newScores = [...highScores, newScore].sort((a, b) => b.score - a.score).slice(0, 5);
    setHighScores(newScores);
    localStorage.setItem('blockyRunnerHighScores', JSON.stringify(newScores));
    
    const totalScore = scores.p1 + (scores.p2 || 0);
    if (totalScore >= 250) audioService.playWin();
    else audioService.playGameOver();
    setAppState(AppState.GAME_OVER);
  };

  const BlockPreview = ({ type, label, desc }: { type: BlockType, label: string, desc: string }) => {
     const color = COLORS[type];
     return (
       <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 relative transform rotate-6 hover:rotate-12 transition-transform shadow-lg border-2 border-black/20 shrink-0" 
               style={{ backgroundColor: color.front, boxShadow: `4px 4px 0px ${color.side}` }}>
               <div className="absolute top-0 w-full h-1/3" style={{ backgroundColor: color.top }}></div>
               {type === BlockType.TNT && <div className="absolute top-1/3 w-full h-1/3 bg-white/90 text-[8px] flex items-center justify-center font-bold text-black">TNT</div>}
               {type === BlockType.GOLD && <div className="absolute inset-0 flex items-center justify-center"><div className="w-2 h-2 bg-white/50 rounded-full"></div></div>}
          </div>
          <div className="text-left">
            <div className="font-bold text-lg text-white">{label}</div>
            <div className="text-sm text-gray-300 leading-tight">{desc}</div>
          </div>
       </div>
     )
  };

  const setInputP1 = (key: keyof typeof inputStateP1.current, value: boolean) => { inputStateP1.current[key] = value; };

  return (
    <div 
      className="w-full h-screen bg-neutral-900 flex flex-col items-center justify-center relative overflow-hidden touch-none select-none"
      onClick={handleInteraction} // Ensure audio initializes on first interaction
    >
      {appState === AppState.MENU && (
        <div className="z-20 text-center p-10 bg-black/60 backdrop-blur-sm border-4 border-green-600 rounded-lg shadow-[0_0_20px_rgba(0,255,0,0.5)] max-w-lg w-full max-h-screen overflow-y-auto">
          <h1 className="text-6xl mb-2 text-green-400 font-bold tracking-tighter drop-shadow-md">BLOCKY RUNNER</h1>
          <p className="text-xl text-gray-300 mb-6 font-mono">Run fast. Collect Gold. Survive.</p>
          <div className="mb-6 flex flex-col items-center">
             <label className="text-sm text-green-300 mb-1 font-bold">PLAYER NAME</label>
             <input type="text" value={playerName} onChange={(e) => setPlayerName(e.target.value)} maxLength={10} className="bg-black/50 border-2 border-green-600 text-white text-center text-xl p-2 rounded w-48 focus:outline-none focus:border-green-400 font-mono uppercase" />
          </div>
          <div className="mb-8 text-center">
            <div className="text-white text-lg mb-2 font-bold">DIFFICULTY</div>
            <div className="flex gap-2 justify-center">
              {[Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD].map((diff) => (
                <button key={diff} onClick={() => setSelectedDifficulty(diff)} className={`px-4 py-2 border-b-4 font-bold transition-all text-sm ${selectedDifficulty === diff ? 'bg-yellow-500 text-black border-yellow-700 -translate-y-1' : 'bg-gray-700 text-gray-300 border-gray-900 hover:bg-gray-600'}`}>{diff}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <button onClick={() => startGame(false)} className="px-8 py-4 bg-green-600 hover:bg-green-500 text-white text-2xl font-bold border-b-4 border-green-800 active:border-b-0 active:translate-y-1 transition-all rounded">START RUN (1P)</button>
             <button onClick={() => startGame(true)} className="px-8 py-4 bg-purple-600 hover:bg-purple-500 text-white text-xl font-bold border-b-4 border-purple-800 active:border-b-0 active:translate-y-1 transition-all rounded flex items-center justify-center gap-2">2 PLAYERS (Local)</button>
             <div className="flex gap-4 w-full">
                <button onClick={() => setAppState(AppState.SETTINGS)} className="flex-1 py-3 bg-gray-600 hover:bg-gray-500 text-white text-xl font-bold border-b-4 border-gray-800 active:border-b-0 active:translate-y-1 transition-all rounded">SETTINGS</button>
                <button onClick={() => setAppState(AppState.HELP)} className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white text-xl font-bold border-b-4 border-blue-800 active:border-b-0 active:translate-y-1 transition-all rounded">CONTROLS</button>
             </div>
          </div>
          {highScores.length > 0 && (
             <div className="mt-8 bg-black/40 p-4 rounded border border-white/10">
                <h3 className="text-yellow-400 font-bold mb-2 border-b border-white/20 pb-1">TOP SCORES</h3>
                <div className="text-sm font-mono space-y-1">
                   {highScores.map((score, idx) => (
                       <div key={idx} className="flex justify-between text-gray-300"><span>{idx+1}. {score.name}</span><span className="text-white">{score.score}</span></div>
                   ))}
                </div>
             </div>
          )}
        </div>
      )}

      {appState === AppState.SETTINGS && (
        <div className="z-20 p-8 bg-black/80 backdrop-blur-md border-4 border-gray-500 rounded-lg shadow-[0_0_20px_rgba(255,255,255,0.2)] max-w-md w-full text-white">
            <h2 className="text-4xl text-gray-200 mb-6 font-bold text-center border-b-2 border-gray-500/30 pb-4">SETTINGS</h2>
            
            <div className="space-y-8 mb-8">
                <div>
                    <div className="flex justify-between mb-2 font-bold text-yellow-400">
                        <span>MUSIC VOLUME</span>
                        <span>{Math.round(musicVol * 100)}%</span>
                    </div>
                    <input 
                        type="range" min="0" max="1" step="0.05" 
                        value={musicVol} 
                        onChange={(e) => updateMusicVol(parseFloat(e.target.value))}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-400"
                    />
                </div>
                <div>
                    <div className="flex justify-between mb-2 font-bold text-green-400">
                        <span>SFX VOLUME</span>
                        <span>{Math.round(sfxVol * 100)}%</span>
                    </div>
                    <input 
                        type="range" min="0" max="1" step="0.05" 
                        value={sfxVol} 
                        onChange={(e) => updateSfxVol(parseFloat(e.target.value))}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-400"
                    />
                </div>
            </div>

            <button onClick={() => setAppState(AppState.MENU)} className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded border-b-4 border-gray-900 active:border-b-0 active:translate-y-1 transition-all">BACK TO MENU</button>
        </div>
      )}

      {appState === AppState.HELP && (
        <div className="z-20 p-8 bg-black/80 backdrop-blur-md border-4 border-blue-500 rounded-lg shadow-[0_0_20px_rgba(59,130,246,0.5)] max-w-4xl w-full text-white overflow-hidden max-h-[90vh] flex flex-col">
          <h2 className="text-4xl text-blue-400 mb-6 font-bold text-center border-b-2 border-blue-500/30 pb-4 shrink-0">HOW TO PLAY</h2>
          <div className="grid grid-cols-2 gap-8 overflow-y-auto pr-2">
            <div>
              <h3 className="text-xl text-yellow-400 mb-4 font-bold uppercase tracking-wider sticky top-0 bg-black/80 p-2 z-10">Controls</h3>
              <div className="mb-4">
                  <h4 className="text-green-400 font-bold mb-2">PLAYER 1</h4>
                  <div className="space-y-2 font-mono text-lg">
                    <div className="flex items-center gap-3"><span className="bg-gray-700 p-2 rounded border-b-4 border-gray-900">←</span> / <span className="bg-gray-700 p-2 rounded border-b-4 border-gray-900">→</span><span>Move</span></div>
                    <div className="flex items-center gap-3"><span className="bg-gray-700 p-2 px-4 rounded border-b-4 border-gray-900">SPACE</span><span>Multi-Jump (up to 4x)</span></div>
                     <div className="flex items-center gap-3"><span className="bg-gray-700 p-2 px-4 rounded border-b-4 border-gray-900">B</span><span>Phase</span></div>
                  </div>
              </div>
              <div>
                  <h4 className="text-red-400 font-bold mb-2">PLAYER 2</h4>
                  <div className="space-y-2 font-mono text-lg">
                    <div className="flex items-center gap-3"><span className="bg-gray-700 p-2 rounded border-b-4 border-gray-900">A</span> / <span className="bg-gray-700 p-2 rounded border-b-4 border-gray-900">D</span><span>Move</span></div>
                    <div className="flex items-center gap-3"><span className="bg-gray-700 p-2 px-4 rounded border-b-4 border-gray-900">V</span><span>Multi-Jump (up to 4x)</span></div>
                     <div className="flex items-center gap-3"><span className="bg-gray-700 p-2 px-4 rounded border-b-4 border-gray-900">CTRL</span><span>Phase</span></div>
                  </div>
              </div>
            </div>
            <div>
              <h3 className="text-xl text-yellow-400 mb-4 font-bold uppercase tracking-wider sticky top-0 bg-black/80 p-2 z-10">Items</h3>
              <div className="grid grid-cols-1 gap-1">
                  <BlockPreview type={BlockType.GOLD} label="Gold Block" desc="Collect to LEVEL UP! (+10 pts)" />
                  <BlockPreview type={BlockType.TNT} label="TNT" desc="EXPLOSIVE! Avoid at all costs." />
                  <BlockPreview type={BlockType.STONE} label="Stone" desc="Basic obstacle. Do not hit." />
              </div>
            </div>
          </div>
          <button onClick={() => setAppState(AppState.MENU)} className="mt-8 w-full py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded border-b-4 border-gray-900 active:border-b-0 active:translate-y-1 transition-all shrink-0">BACK TO MENU</button>
        </div>
      )}

      {appState === AppState.PLAYING && (
        <>
          <GameCanvas engine={engineRef.current} onGameOver={handleGameOver} inputState={{ current: inputStateP1.current }} inputStateP2={{ current: inputStateP2.current }} />
          <div className="absolute inset-0 pointer-events-none z-30 flex flex-col justify-end p-6 md:p-12 lg:hidden">
            <div className="flex justify-between items-end w-full">
              <div className="flex gap-4 pointer-events-auto">
                <button className="w-16 h-16 bg-black/40 border-4 border-white/30 rounded active:bg-white/20 active:scale-95 transition-all flex items-center justify-center" onTouchStart={(e) => { e.preventDefault(); setInputP1('left', true); }} onTouchEnd={(e) => { e.preventDefault(); setInputP1('left', false); }}><svg viewBox="0 0 24 24" className="w-8 h-8 fill-white"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/></svg></button>
                <button className="w-16 h-16 bg-black/40 border-4 border-white/30 rounded active:bg-white/20 active:scale-95 transition-all flex items-center justify-center" onTouchStart={(e) => { e.preventDefault(); setInputP1('right', true); }} onTouchEnd={(e) => { e.preventDefault(); setInputP1('right', false); }}><svg viewBox="0 0 24 24" className="w-8 h-8 fill-white rotate-180"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/></svg></button>
              </div>
              <div className="flex flex-col gap-4 items-end pointer-events-auto">
                <button className="w-16 h-16 bg-cyan-900/40 border-4 border-cyan-400 rounded active:bg-cyan-400/40 active:scale-95 transition-all flex items-center justify-center font-bold text-cyan-200 text-sm" onTouchStart={(e) => { e.preventDefault(); setInputP1('phase', true); }} onTouchEnd={(e) => { e.preventDefault(); setInputP1('phase', false); }}>PHASE</button>
                <button className="w-24 h-24 bg-black/40 border-4 border-white/30 rounded-full active:bg-white/20 active:scale-95 transition-all flex items-center justify-center font-bold text-white text-lg shadow-lg" onTouchStart={(e) => { e.preventDefault(); setInputP1('jump', true); }} onTouchEnd={(e) => { e.preventDefault(); setInputP1('jump', false); }}>JUMP</button>
              </div>
            </div>
          </div>
        </>
      )}

      {appState === AppState.GAME_OVER && (
        <div className={`z-20 text-center p-8 backdrop-blur-sm border-4 rounded-lg shadow-[0_0_30px_rgba(0,0,0,0.5)] min-w-[300px] ${((finalScores.p1 + (finalScores.p2||0)) >= 250) ? 'bg-green-900/80 border-green-500 shadow-[0_0_30px_rgba(0,255,0,0.5)]' : 'bg-red-900/80 border-red-600 shadow-[0_0_30px_rgba(255,0,0,0.5)]'}`}>
          <h2 className={`text-5xl mb-2 font-bold ${((finalScores.p1 + (finalScores.p2||0)) >= 250) ? 'text-green-200' : 'text-red-200'}`}>{((finalScores.p1 + (finalScores.p2||0)) >= 250) ? 'YOU WIN!' : 'GAME OVER'}</h2>
          <div className="text-xl text-white mb-6">{((finalScores.p1 + (finalScores.p2||0)) >= 250) ? 'Great job' : 'Better luck next time'}</div>
          <div className="mb-8 font-mono bg-black/30 p-4 rounded border-2 border-yellow-600 inline-block min-w-[200px]">
             {finalScores.p2 !== null ? (
                 <>
                    <div className="text-3xl text-yellow-400 mb-2 border-b border-yellow-600/30 pb-2">SCORES</div>
                    <div className="flex justify-between gap-8 text-2xl"><div className="text-cyan-300">P1: {finalScores.p1}</div><div className="text-red-400">P2: {finalScores.p2}</div></div>
                 </>
             ) : ( <div className="text-4xl text-yellow-400">Score: {finalScores.p1}</div> )}
          </div>
          <div className="flex gap-4 justify-center">
            <button onClick={() => startGame(finalScores.p2 !== null)} className="px-8 py-4 bg-gray-100 hover:bg-white text-black text-xl font-bold border-b-4 border-gray-400 active:border-b-0 active:translate-y-1 transition-all rounded">TRY AGAIN</button>
            <button onClick={() => setAppState(AppState.MENU)} className="px-8 py-4 bg-black/50 hover:bg-black/40 text-white text-xl font-bold border-b-4 border-black/70 active:border-b-0 active:translate-y-1 transition-all rounded">MENU</button>
          </div>
        </div>
      )}
      
      {appState !== AppState.PLAYING && (
         <div className="absolute inset-0 -z-10 overflow-hidden opacity-30">
            <div className="absolute w-full h-full bg-[linear-gradient(45deg,#111_25%,transparent_25%,transparent_75%,#111_75%,#111),linear-gradient(45deg,#111_25%,transparent_25%,transparent_75%,#111_75%,#111)] bg-[length:40px_40px] bg-[position:0_0,20px_20px] bg-neutral-800" />
         </div>
      )}
    </div>
  );
}
