import React, { useEffect, useRef, useCallback } from 'react';
import { GameEngine } from '../services/engine';
import { COLORS, SKY_COLOR_HEX, hexToRgb, FOG_DISTANCE } from '../constants';
import { Entity, BlockType, Point3D } from '../types';

interface GameCanvasProps {
  engine: GameEngine;
  onGameOver: (score: number) => void;
  inputState: { current: { left: boolean; right: boolean; jump: boolean; phase?: boolean } };
}

const FOV = 450;
const SKY_RGB = hexToRgb(SKY_COLOR_HEX);

export const GameCanvas: React.FC<GameCanvasProps> = ({ engine, onGameOver, inputState }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const scoreRef = useRef<HTMLDivElement>(null);
  const levelRef = useRef<HTMLDivElement>(null);
  const goldRef = useRef<HTMLDivElement>(null);
  const livesRef = useRef<HTMLDivElement>(null);
  const abilitiesRef = useRef<HTMLDivElement>(null);

  // --- Helpers ---

  const lerp = (start: number, end: number, t: number) => start * (1 - t) + end * t;

  const applyFog = useCallback((colorHex: string, distance: number) => {
    const rgb = hexToRgb(colorHex);
    let fogFactor = Math.max(0, Math.min(1, (distance - 5) / (FOG_DISTANCE - 10)));
    fogFactor = fogFactor * fogFactor;

    const r = Math.round(lerp(rgb.r, SKY_RGB.r, fogFactor));
    const g = Math.round(lerp(rgb.g, SKY_RGB.g, fogFactor));
    const b = Math.round(lerp(rgb.b, SKY_RGB.b, fogFactor));
    
    return `rgb(${r},${g},${b})`;
  }, []);

  const project = useCallback((p: Point3D, camX: number, camY: number, camZ: number, width: number, height: number, tilt: number) => {
    // 1. Translate
    let rx = p.x - camX;
    let ry = p.y - camY;
    const rz = p.z - camZ;

    if (rz <= 0.1) return null;

    // 2. Rotate (Tilt - Z roll)
    if (tilt !== 0) {
        const cos = Math.cos(tilt);
        const sin = Math.sin(tilt);
        const nx = rx * cos - ry * sin;
        const ny = rx * sin + ry * cos;
        rx = nx;
        ry = ny;
    }

    // 3. Project
    const scale = FOV / rz;
    const x2d = (rx * scale) + (width / 2);
    const y2d = (height / 2) - (ry * scale);

    return { x: x2d, y: y2d, scale, dist: rz };
  }, []);

  // --- Drawing ---

  const drawQuad = (ctx: CanvasRenderingContext2D, p1: any, p2: any, p3: any, p4: any, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    ctx.fill();
  };

  const drawFaceDetails = (
    ctx: CanvasRenderingContext2D, 
    type: BlockType, 
    face: 'TOP' | 'SIDE' | 'FRONT', 
    p1: any, p2: any, p3: any, p4: any, 
    dist: number,
    phaseActive: boolean
  ) => {
    const baseColor = COLORS[type];
    
    // Base
    const colorKey = face === 'TOP' ? 'top' : (face === 'SIDE' ? 'side' : 'front');
    const color = applyFog(baseColor[colorKey], dist);
    
    if (phaseActive && type !== BlockType.GOLD) {
       ctx.globalAlpha = 0.5; // Ghostly
    }

    drawQuad(ctx, p1, p2, p3, p4, color);

    // Details 
    
    // GRASS
    if (type === BlockType.GRASS && face !== 'TOP') {
        const detailColor = applyFog(baseColor.detail!, dist);
        const grassH = 0.25;
        const p1_b = { x: lerp(p1.x, p4.x, grassH), y: lerp(p1.y, p4.y, grassH) }; 
        const p2_b = { x: lerp(p2.x, p3.x, grassH), y: lerp(p2.y, p3.y, grassH) }; 

        drawQuad(ctx, p1, p2, p2_b, p1_b, detailColor);
    }

    // TNT
    if (type === BlockType.TNT && face !== 'TOP') {
        const bandColor = applyFog('#FFFFFF', dist);
        const topH = 0.33;
        const botH = 0.66;
        
        const tl_w = { x: lerp(p1.x, p4.x, topH), y: lerp(p1.y, p4.y, topH) };
        const tr_w = { x: lerp(p2.x, p3.x, topH), y: lerp(p2.y, p3.y, topH) };
        const bl_w = { x: lerp(p1.x, p4.x, botH), y: lerp(p1.y, p4.y, botH) };
        const br_w = { x: lerp(p2.x, p3.x, botH), y: lerp(p2.y, p3.y, botH) };

        drawQuad(ctx, tl_w, tr_w, br_w, bl_w, bandColor);

        if (dist < 15) {
             ctx.fillStyle = applyFog('#000000', dist);
             const cx = (tl_w.x + tr_w.x + bl_w.x + br_w.x) / 4;
             const cy = (tl_w.y + tr_w.y + bl_w.y + br_w.y) / 4;
             const w = Math.abs(tr_w.x - tl_w.x) * 0.4;
             const h = Math.abs(bl_w.y - tl_w.y) * 0.6;
             ctx.fillRect(cx - w/2, cy - h/2, w, h);
        }
    }
    // TNT Top
    if (type === BlockType.TNT && face === 'TOP') {
        const detailColor = applyFog('#FFFFFF', dist);
        const t1 = 0.33; const t2 = 0.66;
        const te1 = { x: lerp(p1.x, p2.x, t1), y: lerp(p1.y, p2.y, t1) };
        const te2 = { x: lerp(p1.x, p2.x, t2), y: lerp(p1.y, p2.y, t2) };
        const be1 = { x: lerp(p4.x, p3.x, t1), y: lerp(p4.y, p3.y, t1) };
        const be2 = { x: lerp(p4.x, p3.x, t2), y: lerp(p4.y, p3.y, t2) };
        const c1 = { x: lerp(te1.x, be1.x, t1), y: lerp(te1.y, be1.y, t1) };
        const c2 = { x: lerp(te2.x, be2.x, t1), y: lerp(te2.y, be2.y, t1) };
        const c3 = { x: lerp(te2.x, be2.x, t2), y: lerp(te2.y, be2.y, t2) };
        const c4 = { x: lerp(te1.x, be1.x, t2), y: lerp(te1.y, be1.y, t2) };
        drawQuad(ctx, c1, c2, c3, c4, detailColor);
    }

    // CREEPER FACE
    if (type === BlockType.CREEPER && face === 'FRONT' && dist < 20) {
        ctx.fillStyle = applyFog('#000000', dist);
        // Map 2D face features to the quad p1..p4 (TL, TR, BR, BL)
        // Eyes
        const eyeW = 0.2; const eyeH = 0.2;
        const e1x = 0.2; const e1y = 0.25;
        const e2x = 0.6; const e2y = 0.25;
        
        // Helper to map UV to XY
        const mapUV = (u: number, v: number) => {
            const topX = lerp(p1.x, p2.x, u); const topY = lerp(p1.y, p2.y, u);
            const botX = lerp(p4.x, p3.x, u); const botY = lerp(p4.y, p3.y, u);
            return { x: lerp(topX, botX, v), y: lerp(topY, botY, v) };
        }
        
        // Draw Eyes
        const drawRect = (u: number, v: number, w: number, h: number) => {
             const tl = mapUV(u, v);
             const tr = mapUV(u+w, v);
             const br = mapUV(u+w, v+h);
             const bl = mapUV(u, v+h);
             drawQuad(ctx, tl, tr, br, bl, ctx.fillStyle as string);
        }

        drawRect(e1x, e1y, eyeW, eyeH); // Left Eye
        drawRect(e2x, e2y, eyeW, eyeH); // Right Eye
        drawRect(0.35, 0.45, 0.3, 0.25); // Nose
        drawRect(0.25, 0.6, 0.1, 0.2); // Mouth L
        drawRect(0.65, 0.6, 0.1, 0.2); // Mouth R
    }

    // SKELETON FACE
    if (type === BlockType.SKELETON && face === 'FRONT' && dist < 20) {
        ctx.fillStyle = applyFog('#555555', dist);
        const mapUV = (u: number, v: number) => {
            const topX = lerp(p1.x, p2.x, u); const topY = lerp(p1.y, p2.y, u);
            const botX = lerp(p4.x, p3.x, u); const botY = lerp(p4.y, p3.y, u);
            return { x: lerp(topX, botX, v), y: lerp(topY, botY, v) };
        }
        const drawRect = (u: number, v: number, w: number, h: number) => {
             const tl = mapUV(u, v);
             const tr = mapUV(u+w, v);
             const br = mapUV(u+w, v+h);
             const bl = mapUV(u, v+h);
             drawQuad(ctx, tl, tr, br, bl, ctx.fillStyle as string);
        }
        
        drawRect(0.2, 0.3, 0.2, 0.15); // Eye L
        drawRect(0.6, 0.3, 0.2, 0.15); // Eye R
        drawRect(0.45, 0.55, 0.1, 0.05); // Nose
        drawRect(0.2, 0.7, 0.6, 0.05); // Mouth Line
    }


    // GOLD
    if (type === BlockType.GOLD) {
        const detailColor = applyFog(baseColor.detail!, dist);
        ctx.strokeStyle = detailColor;
        ctx.lineWidth = Math.max(1, 40 / dist); 
        ctx.stroke(); 

        if (face === 'TOP' || face === 'FRONT') {
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            const cx = (p1.x + p2.x + p3.x + p4.x) / 4;
            const cy = (p1.y + p2.y + p3.y + p4.y) / 4;
            const s = 100 / dist;
            ctx.fillRect(cx, cy, s, s);
        }
    }
    
    // STONE NOISE
    if (type === BlockType.STONE && dist < 20) {
        ctx.fillStyle = applyFog(baseColor.detail!, dist);
        const seed = Math.floor(p1.x + p1.y); 
        const rnd = (i: number) => Math.abs(Math.sin(seed + i));
        for(let i=0; i<3; i++) {
           const u = 0.2 + rnd(i)*0.6;
           const v = 0.2 + rnd(i+10)*0.6;
           const topX = lerp(p1.x, p2.x, u); const topY = lerp(p1.y, p2.y, u);
           const botX = lerp(p4.x, p3.x, u); const botY = lerp(p4.y, p3.y, u);
           const px = lerp(topX, botX, v);
           const py = lerp(topY, botY, v);
           const size = Math.max(2, 20/dist);
           ctx.fillRect(px, py, size, size);
        }
    }

    ctx.strokeStyle = `rgba(0,0,0,${Math.max(0, 0.1 - dist/100)})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    
    ctx.globalAlpha = 1.0; // Reset Alpha
  };

  const drawCube = useCallback((
    ctx: CanvasRenderingContext2D, 
    entity: Entity, 
    camX: number, camY: number, camZ: number, tilt: number,
    width: number, height: number,
    phaseActive: boolean
  ) => {
    if (entity.collected) return;

    const hs = entity.size / 2;
    const { x, y, z } = entity.position;

    const projC = project({x, y, z}, camX, camY, camZ, width, height, tilt);
    if (!projC) return;
    
    const dist = projC.dist;
    if (dist > FOG_DISTANCE) return; 

    // Vertices
    const v = {
      ft: {x: x - hs, y: y + hs, z: z - hs}, 
      ftr: {x: x + hs, y: y + hs, z: z - hs}, 
      fb: {x: x - hs, y: y - hs, z: z - hs}, 
      fbr: {x: x + hs, y: y - hs, z: z - hs}, 
      bt: {x: x - hs, y: y + hs, z: z + hs}, 
      btr: {x: x + hs, y: y + hs, z: z + hs}, 
      bb: {x: x - hs, y: y - hs, z: z + hs}, 
      bbr: {x: x + hs, y: y - hs, z: z + hs}, 
    };

    const p = {
        ft: project(v.ft, camX, camY, camZ, width, height, tilt),
        ftr: project(v.ftr, camX, camY, camZ, width, height, tilt),
        fb: project(v.fb, camX, camY, camZ, width, height, tilt),
        fbr: project(v.fbr, camX, camY, camZ, width, height, tilt),
        bt: project(v.bt, camX, camY, camZ, width, height, tilt),
        btr: project(v.btr, camX, camY, camZ, width, height, tilt),
        bb: project(v.bb, camX, camY, camZ, width, height, tilt),
        bbr: project(v.bbr, camX, camY, camZ, width, height, tilt),
    };

    if (!p.ft || !p.ftr || !p.fb || !p.fbr || !p.bt || !p.btr) return;

    if (z - hs > camZ + 0.1) {
       drawFaceDetails(ctx, entity.type, 'FRONT', p.ft, p.ftr, p.fbr, p.fb, dist, phaseActive);
    }
    if (x < camX) {
        if (p.bbr) drawFaceDetails(ctx, entity.type, 'SIDE', p.ftr, p.btr, p.bbr, p.fbr, dist, phaseActive);
    } else {
        if (p.bb) drawFaceDetails(ctx, entity.type, 'SIDE', p.bt, p.ft, p.fb, p.bb, dist, phaseActive);
    }
    if (y < camY) {
         drawFaceDetails(ctx, entity.type, 'TOP', p.bt, p.btr, p.ftr, p.ft, dist, phaseActive);
    }
  }, [project, applyFog]);

  const loop = useCallback((time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    engine.update(inputState.current, 16);
    const state = engine.getState();

    // UI Updates
    if (scoreRef.current) scoreRef.current.innerText = `SCORE: ${state.score} / 250`;
    if (levelRef.current) levelRef.current.innerText = `LEVEL: ${state.level}`;
    if (goldRef.current) goldRef.current.innerText = `GOLD: ${state.goldCollected} / ${state.levelTarget}`;
    if (livesRef.current) {
        let hearts = '';
        for(let i=0; i<state.lives; i++) hearts += '❤️';
        livesRef.current.innerText = hearts;
    }
    
    // HUD - Abilities
    if (abilitiesRef.current) {
        const phaseCD = Math.ceil(state.player.phaseCooldown / 1000);
        const jumpCD = Math.ceil(state.player.doubleJumpCooldown / 1000);
        const phaseRemaining = Math.ceil(state.player.phaseTimeRemaining / 1000);

        let html = '';
        
        // Double Jump
        html += `<div class="flex flex-col items-center">
                   <div class="w-10 h-10 border-2 ${jumpCD <= 0 ? 'border-green-400 bg-green-900/50' : 'border-red-400 bg-red-900/50'} flex items-center justify-center text-xs font-bold relative">
                       DJ
                       ${jumpCD > 0 ? `<div class="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-sm">${jumpCD}</div>` : ''}
                   </div>
                   <span class="text-[10px] mt-1 text-gray-400">JUMP</span>
                 </div>`;
        
        // Phase
        html += `<div class="flex flex-col items-center">
                   <div class="w-10 h-10 border-2 ${state.player.phaseActive ? 'border-cyan-400 bg-cyan-900/50 animate-pulse' : (phaseCD <= 0 ? 'border-green-400 bg-green-900/50' : 'border-red-400 bg-red-900/50')} flex items-center justify-center text-xs font-bold relative">
                       PH
                       ${state.player.phaseActive ? `<div class="absolute inset-0 flex items-center justify-center text-cyan-200 text-sm">${phaseRemaining}</div>` : ''}
                       ${!state.player.phaseActive && phaseCD > 0 ? `<div class="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-sm">${phaseCD}</div>` : ''}
                   </div>
                   <span class="text-[10px] mt-1 text-gray-400">"B"</span>
                 </div>`;

        abilitiesRef.current.innerHTML = html;
    }

    
    // Game Over / Win Condition
    if (state.lives <= 0 || state.gameWon) {
      onGameOver(state.score);
      return; 
    }

    const width = canvas.width;
    const height = canvas.height;
    
    // Sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
    if (state.player.phaseActive) {
         // Tint sky cyan when phased
         skyGrad.addColorStop(0, '#004455');
         skyGrad.addColorStop(1, '#0088AA');
    } else {
         skyGrad.addColorStop(0, '#4ea7d6');
         skyGrad.addColorStop(1, '#87CEEB');
    }
    
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height);

    // Camera State
    const bob = Math.sin(time * 0.015) * 0.05 * (state.speed / 0.5);
    let camX = state.player.position.x;
    let camY = state.player.position.y + 1.6 + bob;
    let camZ = state.player.position.z - 0.5;
    const tilt = state.player.tilt;

    // Apply Screen Shake
    if (state.shakeIntensity > 0) {
       camX += (Math.random() - 0.5) * state.shakeIntensity;
       camY += (Math.random() - 0.5) * state.shakeIntensity;
    }

    // Entities
    const sortedEntities = [...state.entities].sort((a, b) => b.position.z - a.position.z);
    for (const entity of sortedEntities) {
      drawCube(ctx, entity, camX, camY, camZ, tilt, width, height, state.player.phaseActive);
    }

    // Particles
    for (const p of state.particles) {
        const proj = project(p.position, camX, camY, camZ, width, height, tilt);
        if (proj) {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life;
            const size = proj.scale * p.size;
            ctx.fillRect(proj.x - size/2, proj.y - size/2, size, size);
            ctx.globalAlpha = 1.0;
        }
    }

    // Speed Lines
    if (state.speed > 0.6) {
      ctx.strokeStyle = state.player.phaseActive ? 'rgba(0, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const len = Math.random() * 80 + 20;
        const cx = width/2; const cy = height/2;
        const angle = Math.atan2(y-cy, x-cx);
        
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle)*len, y + Math.sin(angle)*len);
        ctx.stroke();
      }
    }

    // Crosshair
    ctx.strokeStyle = state.player.phaseActive ? 'rgba(0, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width/2 - 8, height/2);
    ctx.lineTo(width/2 + 8, height/2);
    ctx.moveTo(width/2, height/2 - 8);
    ctx.lineTo(width/2, height/2 + 8);
    ctx.stroke();

    requestRef.current = requestAnimationFrame(loop);
  }, [engine, inputState, onGameOver, drawCube, project]);

  useEffect(() => {
    const handleResize = () => {
        if(canvasRef.current) {
            canvasRef.current.width = window.innerWidth;
            canvasRef.current.height = window.innerHeight;
        }
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    requestRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [loop]);

  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} className="block w-full h-full" />
      <div className="absolute top-4 left-4 text-4xl text-white font-bold tracking-widest drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)] select-none pointer-events-none flex flex-col gap-2">
         <div ref={scoreRef} className="text-yellow-400">SCORE: 0 / 250</div>
         <div ref={levelRef} className="text-blue-200 text-2xl">LEVEL: 1</div>
         <div ref={goldRef} className="text-yellow-200 text-xl font-mono">GOLD: 0/0</div>
         <div ref={livesRef}>❤️❤️❤️</div>
      </div>
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex gap-6 text-white" ref={abilitiesRef}>
         {/* HUD Injected by JS */}
      </div>
      <div className="absolute top-4 right-4 text-white/70 text-sm font-mono select-none bg-black/30 p-2 rounded">
        WASD to Move • SPACE to Jump • B to Phase
      </div>
    </div>
  );
};