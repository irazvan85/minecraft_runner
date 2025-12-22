import React, { useState, useRef, useEffect } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { GameEngine } from './services/engine';
import { COLORS } from './constants';
import { BlockType } from './types';

enum AppState {
  MENU,
  HELP,
  PLAYING,
  GAME_OVER
}

export default function App() {
  const [appState, setAppState] = useState<AppState>(AppState.MENU);
  const [finalScore, setFinalScore] = useState(0);
  const engineRef = useRef<GameEngine>(new GameEngine());
  
  // We store input in a Ref so the game loop reads it without triggering React renders
  const inputState = useRef({
    left: false,
    right: false,
    jump: false
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (appState !== AppState.PLAYING) return;
      
      switch(e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          inputState.current.left = true;
          break;
        case 'ArrowRight':
        case 'KeyD':
          inputState.current.right = true;
          break;
        case 'Space':
        case 'ArrowUp':
        case 'KeyW':
          inputState.current.jump = true;
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch(e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          inputState.current.left = false;
          break;
        case 'ArrowRight':
        case 'KeyD':
          inputState.current.right = false;
          break;
        case 'Space':
        case 'ArrowUp':
        case 'KeyW':
          inputState.current.jump = false;
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

  const startGame = () => {
    engineRef.current.reset();
    inputState.current = { left: false, right: false, jump: false };
    setAppState(AppState.PLAYING);
  };

  const handleGameOver = (score: number) => {
    setFinalScore(score);
    setAppState(AppState.GAME_OVER);
  };

  // Helper to render a block preview
  const BlockPreview = ({ type, label, desc }: { type: BlockType, label: string, desc: string }) => {
     const color = COLORS[type];
     return (
       <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 relative transform rotate-6 hover:rotate-12 transition-transform shadow-lg border-2 border-black/20" 
               style={{ backgroundColor: color.front, boxShadow: `4px 4px 0px ${color.side}` }}>
               <div className="absolute top-0 w-full h-1/3" style={{ backgroundColor: color.top }}></div>
               {type === BlockType.TNT && <div className="absolute top-1/3 w-full h-1/3 bg-white/90 text-[8px] flex items-center justify-center font-bold text-black">TNT</div>}
               {type === BlockType.GOLD && <div className="absolute inset-0 flex items-center justify-center"><div className="w-2 h-2 bg-white/50 rounded-full"></div></div>}
          </div>
          <div className="text-left">
            <div className="font-bold text-lg text-white">{label}</div>
            <div className="text-sm text-gray-300">{desc}</div>
          </div>
       </div>
     )
  };

  return (
    <div className="w-full h-screen bg-neutral-900 flex flex-col items-center justify-center relative overflow-hidden">
      
      {/* Menu Screen */}
      {appState === AppState.MENU && (
        <div className="z-10 text-center p-10 bg-black/60 backdrop-blur-sm border-4 border-green-600 rounded-lg shadow-[0_0_20px_rgba(0,255,0,0.5)] max-w-lg w-full">
          <h1 className="text-6xl mb-4 text-green-400 font-bold tracking-tighter drop-shadow-md">BLOCKY RUNNER</h1>
          <p className="text-xl text-gray-300 mb-8 font-mono">Run fast. Collect Gold. Survive.</p>
          <div className="flex flex-col gap-4">
            <button 
              onClick={startGame}
              className="px-8 py-4 bg-green-600 hover:bg-green-500 text-white text-2xl font-bold border-b-4 border-green-800 active:border-b-0 active:translate-y-1 transition-all rounded"
            >
              START RUN
            </button>
            <button 
              onClick={() => setAppState(AppState.HELP)}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white text-xl font-bold border-b-4 border-blue-800 active:border-b-0 active:translate-y-1 transition-all rounded"
            >
              HOW TO PLAY
            </button>
          </div>
        </div>
      )}

      {/* Help Screen */}
      {appState === AppState.HELP && (
        <div className="z-10 p-8 bg-black/80 backdrop-blur-md border-4 border-blue-500 rounded-lg shadow-[0_0_20px_rgba(59,130,246,0.5)] max-w-2xl w-full text-white">
          <h2 className="text-4xl text-blue-400 mb-6 font-bold text-center border-b-2 border-blue-500/30 pb-4">HOW TO PLAY</h2>
          
          <div className="grid grid-cols-2 gap-8">
            <div>
              <h3 className="text-xl text-yellow-400 mb-4 font-bold uppercase tracking-wider">Controls</h3>
              <div className="space-y-4 font-mono text-lg">
                <div className="flex items-center gap-3">
                  <span className="bg-gray-700 p-2 rounded border-b-4 border-gray-900">A</span> / <span className="bg-gray-700 p-2 rounded border-b-4 border-gray-900">←</span> 
                  <span>Move Left</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="bg-gray-700 p-2 rounded border-b-4 border-gray-900">D</span> / <span className="bg-gray-700 p-2 rounded border-b-4 border-gray-900">→</span> 
                  <span>Move Right</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="bg-gray-700 p-2 px-4 rounded border-b-4 border-gray-900">SPACE</span> 
                  <span>Jump</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xl text-yellow-400 mb-4 font-bold uppercase tracking-wider">Blocks</h3>
              <BlockPreview type={BlockType.GOLD} label="Gold Block" desc="Collect for +10 Score" />
              <BlockPreview type={BlockType.TNT} label="TNT" desc="Avoid! -1 Life" />
              <BlockPreview type={BlockType.STONE} label="Stone" desc="Obstacle. -1 Life" />
            </div>
          </div>

          <button 
            onClick={() => setAppState(AppState.MENU)}
            className="mt-8 w-full py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded border-b-4 border-gray-900 active:border-b-0 active:translate-y-1 transition-all"
          >
            BACK TO MENU
          </button>
        </div>
      )}

      {/* Game Canvas */}
      {appState === AppState.PLAYING && (
        <GameCanvas 
          engine={engineRef.current} 
          onGameOver={handleGameOver} 
          inputState={inputState}
        />
      )}

      {/* Game Over Screen */}
      {appState === AppState.GAME_OVER && (
        <div className="z-10 text-center p-8 bg-red-900/80 backdrop-blur-sm border-4 border-red-600 rounded-lg shadow-[0_0_30px_rgba(255,0,0,0.5)]">
          <h2 className="text-5xl text-red-200 mb-2 font-bold">GAME OVER</h2>
          <div className="text-3xl text-yellow-400 mb-8">Score: {finalScore}</div>
          <div className="flex gap-4 justify-center">
            <button 
              onClick={startGame}
              className="px-8 py-4 bg-gray-100 hover:bg-white text-black text-xl font-bold border-b-4 border-gray-400 active:border-b-0 active:translate-y-1 transition-all rounded"
            >
              TRY AGAIN
            </button>
            <button 
              onClick={() => setAppState(AppState.MENU)}
              className="px-8 py-4 bg-black/50 hover:bg-black/40 text-white text-xl font-bold border-b-4 border-black/70 active:border-b-0 active:translate-y-1 transition-all rounded"
            >
              MENU
            </button>
          </div>
        </div>
      )}
      
      {/* Background decoration for menu */}
      {appState !== AppState.PLAYING && (
         <div className="absolute inset-0 -z-10 overflow-hidden opacity-30">
            <div className="absolute w-full h-full bg-[linear-gradient(45deg,#111_25%,transparent_25%,transparent_75%,#111_75%,#111),linear-gradient(45deg,#111_25%,transparent_25%,transparent_75%,#111_75%,#111)] bg-[length:40px_40px] bg-[position:0_0,20px_20px] bg-neutral-800" />
         </div>
      )}
    </div>
  );
}