import React, { useEffect, useRef, useCallback } from 'react';
import { GameEngine, InputMap } from '../services/engine';
import { COLORS, SKY_COLOR_HEX, hexToRgb, FOG_DISTANCE } from '../constants';
import { Entity, BlockType, Point3D } from '../types';

interface GameCanvasProps {
  engine: GameEngine;
  onGameOver: (scores: { p1: number, p2: number | null }) => void;
  inputState: { current: InputMap };
  inputStateP2?: { current: InputMap };
}

const FOV = 450;
const SKY_RGB = hexToRgb(SKY_COLOR_HEX);

export const GameCanvas: React.FC<GameCanvasProps> = ({ engine, onGameOver, inputState, inputStateP2 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const scoreRef = useRef<HTMLDivElement>(null);
  const levelRef = useRef<HTMLDivElement>(null);
  const goldRef = useRef<HTMLDivElement>(null);
  const livesRef = useRef<HTMLDivElement>(null);
  const abilitiesRef = useRef<HTMLDivElement>(null);

  const lerp = (start: number, end: number, t: number) => start * (1 - t) + end * t;

  const applyFog = useCallback((colorHex: string, distance: number) => {
    const rgb = hexToRgb(colorHex);
    const fogStart = FOG_DISTANCE / 3;
    let fogFactor = Math.max(0, Math.min(1, (distance - fogStart) / (FOG_DISTANCE - fogStart)));
    fogFactor = fogFactor * fogFactor;

    const r = Math.round(lerp(rgb.r, SKY_RGB.r, fogFactor));
    const g = Math.round(lerp(rgb.g, SKY_RGB.g, fogFactor));
    const b = Math.round(lerp(rgb.b, SKY_RGB.b, fogFactor));
    
    return `rgb(${r},${g},${b})`;
  }, []);

  const project = useCallback((p: Point3D, camX: number, camY: number, camZ: number, width: number, height: number, tilt: number, pitch: number) => {
    let rx = p.x - camX;
    let ry = p.y - camY;
    let rz = p.z - camZ;

    if (tilt !== 0) {
        const cos = Math.cos(tilt);
        const sin = Math.sin(tilt);
        const nx = rx * cos - ry * sin;
        const ny = rx * sin + ry * cos;
        rx = nx;
        ry = ny;
    }

    if (pitch !== 0) {
        const cos = Math.cos(pitch);
        const sin = Math.sin(pitch);
        const ny = ry * cos + rz * sin;
        const nz = -ry * sin + rz * cos;
        ry = ny;
        rz = nz;
    }

    if (rz <= 0.1) return null;

    const scale = FOV / rz;
    const x2d = (rx * scale) + (width / 2);
    const y2d = (height / 2) - (ry * scale);

    return { x: x2d, y: y2d, scale, dist: rz };
  }, []);

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

  const drawStevePart = (
      ctx: CanvasRenderingContext2D,
      p: Point3D,
      size: { w: number, h: number, d: number },
      colors: { front: string, back: string, top: string, bottom: string, left: string, right: string },
      rotation: { x: number, y: number, z: number },
      partType: 'HEAD' | 'TORSO' | 'ARM' | 'LEG',
      camX: number, camY: number, camZ: number, tilt: number, pitch: number,
      width: number, height: number,
      phaseActive: boolean
  ) => {
      const hw = size.w / 2;
      const hh = size.h / 2;
      const hd = size.d / 2;

      const verts = [
          { x: -hw, y: hh, z: -hd }, { x: hw, y: hh, z: -hd }, { x: hw, y: -hh, z: -hd }, { x: -hw, y: -hh, z: -hd },
          { x: -hw, y: hh, z: hd },  { x: hw, y: hh, z: hd },  { x: hw, y: -hh, z: hd },  { x: -hw, y: -hh, z: hd }
      ];

      const worldVerts = verts.map(v => {
          let y1 = v.y * Math.cos(rotation.x) - v.z * Math.sin(rotation.x);
          let z1 = v.y * Math.sin(rotation.x) + v.z * Math.cos(rotation.x);
          let x2 = v.x * Math.cos(rotation.z) - y1 * Math.sin(rotation.z);
          let y2 = v.x * Math.sin(rotation.z) + y1 * Math.cos(rotation.z);
          return { x: x2 + p.x, y: y2 + p.y, z: z1 + p.z };
      });

      const projVerts = worldVerts.map(v => project(v, camX, camY, camZ, width, height, tilt, pitch));
      const dist = Math.sqrt(Math.pow(p.x - camX, 2) + Math.pow(p.y - camY, 2) + Math.pow(p.z - camZ, 2));
      
      if (phaseActive) ctx.globalAlpha = 0.6;

      const drawFace = (idxs: number[], color: string, normal: 'FRONT' | 'BACK' | 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT') => {
          if (idxs.some(i => !projVerts[i])) return;
          const ps = idxs.map(i => projVerts[i]!);
          const v1 = { x: ps[1].x - ps[0].x, y: ps[1].y - ps[0].y };
          const v2 = { x: ps[2].x - ps[1].x, y: ps[2].y - ps[1].y };
          const cross = v1.x * v2.y - v1.y * v2.x;
          if (cross > 0) return;
          drawQuad(ctx, ps[0], ps[1], ps[2], ps[3], applyFog(color, dist));

          const mapUV = (u: number, v: number) => {
            const topX = lerp(ps[0].x, ps[1].x, u); const topY = lerp(ps[0].y, ps[1].y, u);
            const botX = lerp(ps[3].x, ps[2].x, u); const botY = lerp(ps[3].y, ps[2].y, u);
            return { x: lerp(topX, botX, v), y: lerp(topY, botY, v) };
          }
          const drawRect = (u: number, v: number, w: number, h: number, c: string) => {
             const tl = mapUV(u, v); const tr = mapUV(u+w, v); const br = mapUV(u+w, v+h); const bl = mapUV(u, v+h);
             drawQuad(ctx, tl, tr, br, bl, applyFog(c, dist));
          }

          if (partType === 'HEAD' && normal === 'FRONT') {
             drawRect(0, 0, 1, 0.25, '#2A1D13');
             drawRect(0.125, 0.5, 0.125, 0.125, '#FFFFFF');
             drawRect(0.25, 0.5, 0.125, 0.125, '#493C7B');
             drawRect(0.625, 0.5, 0.125, 0.125, '#FFFFFF');
             drawRect(0.75, 0.5, 0.125, 0.125, '#493C7B');
             drawRect(0.4375, 0.625, 0.125, 0.0625, '#A57356');
             drawRect(0.375, 0.75, 0.25, 0.125, '#784732');
          }
          if (partType === 'HEAD' && (normal === 'LEFT' || normal === 'RIGHT' || normal === 'BACK')) {
              drawRect(0, 0, 1, 0.25, '#2A1D13');
          }
          if (partType === 'ARM' && normal !== 'TOP' && normal !== 'BOTTOM') {
              drawRect(0, 0, 1, 0.35, colors.front);
          }
          if (partType === 'LEG' && normal !== 'TOP' && normal !== 'BOTTOM') {
              drawRect(0, 0.85, 1, 0.15, '#555555');
          }
      };

      drawFace([0,1,2,3], colors.front, 'FRONT');
      drawFace([5,4,7,6], colors.back, 'BACK');
      drawFace([4,5,1,0], colors.top, 'TOP');
      drawFace([3,2,6,7], colors.bottom, 'BOTTOM');
      drawFace([4,0,3,7], colors.left, 'LEFT');
      drawFace([1,5,6,2], colors.right, 'RIGHT');
      ctx.globalAlpha = 1.0;
  };

  const drawSteve = (
      ctx: CanvasRenderingContext2D,
      pos: Point3D,
      camX: number, camY: number, camZ: number, tilt: number, pitch: number,
      width: number, height: number,
      phaseActive: boolean,
      time: number,
      isJumping: boolean,
      customColors: { shirt: string, pants: string } = { shirt: '#00AAAA', pants: '#3B3696' }
  ) => {
      const runFreq = 0.0175; const runAmp = 1.2; const animPhase = time * runFreq;
      const swing = Math.sin(animPhase) * runAmp; const bob = isJumping ? 0 : Math.abs(Math.sin(animPhase)) * 0.1;
      const steveY = pos.y + bob;

      const skinColor = '#E3A581'; const shirtColor = customColors.shirt; const pantsColor = customColors.pants; const hairColor = '#2A1D13';
      const legW = 0.22; const legH = 0.7; const legD = 0.22; const torsoW = 0.5; const torsoH = 0.65; const torsoD = 0.25;
      const headS = 0.45; const armW = 0.2; const armH = 0.7; const armD = 0.22;

      const hipY = steveY + legH; const shoulderY = hipY + torsoH; const neckY = shoulderY;
      const leftLegRot = -swing; const rightLegRot = swing; const leftArmRot = swing; const rightArmRot = -swing; 

      drawStevePart(ctx, { x: pos.x - 0.13, y: steveY + legH/2, z: pos.z }, { w: legW, h: legH, d: legD }, 
          { front: pantsColor, back: pantsColor, top: pantsColor, bottom: pantsColor, left: pantsColor, right: pantsColor },
          { x: leftLegRot, y: 0, z: 0 }, 'LEG', camX, camY, camZ, tilt, pitch, width, height, phaseActive);
      drawStevePart(ctx, { x: pos.x + 0.13, y: steveY + legH/2, z: pos.z }, { w: legW, h: legH, d: legD }, 
          { front: pantsColor, back: pantsColor, top: pantsColor, bottom: pantsColor, left: pantsColor, right: pantsColor },
          { x: rightLegRot, y: 0, z: 0 }, 'LEG', camX, camY, camZ, tilt, pitch, width, height, phaseActive);
      drawStevePart(ctx, { x: pos.x, y: hipY + torsoH/2, z: pos.z }, { w: torsoW, h: torsoH, d: torsoD }, 
          { front: shirtColor, back: shirtColor, top: shirtColor, bottom: shirtColor, left: shirtColor, right: shirtColor },
          { x: 0, y: 0, z: 0 }, 'TORSO', camX, camY, camZ, tilt, pitch, width, height, phaseActive);
      drawStevePart(ctx, { x: pos.x, y: neckY + headS/2, z: pos.z }, { w: headS, h: headS, d: headS }, 
          { front: skinColor, back: hairColor, top: hairColor, bottom: skinColor, left: skinColor, right: skinColor },
          { x: 0, y: 0, z: 0 }, 'HEAD', camX, camY, camZ, tilt, pitch, width, height, phaseActive);
      drawStevePart(ctx, { x: pos.x - 0.36, y: shoulderY - armH/2 + 0.1, z: pos.z }, { w: armW, h: armH, d: armD }, 
          { front: skinColor, back: skinColor, top: shirtColor, bottom: skinColor, left: skinColor, right: skinColor },
          { x: leftArmRot, y: 0, z: 0 }, 'ARM', camX, camY, camZ, tilt, pitch, width, height, phaseActive);
      drawStevePart(ctx, { x: pos.x + 0.36, y: shoulderY - armH/2 + 0.1, z: pos.z }, { w: armW, h: armH, d: armD }, 
          { front: skinColor, back: skinColor, top: shirtColor, bottom: skinColor, left: skinColor, right: skinColor },
          { x: rightArmRot, y: 0, z: 0 }, 'ARM', camX, camY, camZ, tilt, pitch, width, height, phaseActive);
  }

  const drawFaceDetails = (ctx: CanvasRenderingContext2D, type: BlockType, face: 'TOP' | 'SIDE' | 'FRONT', p1: any, p2: any, p3: any, p4: any, dist: number, phaseActive: boolean) => {
    const baseColor = COLORS[type];
    const colorKey = face === 'TOP' ? 'top' : (face === 'SIDE' ? 'side' : 'front');
    const color = applyFog(baseColor[colorKey], dist);
    if (phaseActive && type !== BlockType.GOLD) ctx.globalAlpha = 0.5;
    drawQuad(ctx, p1, p2, p3, p4, color);
    if (type === BlockType.TNT && face !== 'TOP') {
        const bandColor = applyFog('#FFFFFF', dist);
        const topH = 0.33; const botH = 0.66;
        const tl_w = { x: lerp(p1.x, p4.x, topH), y: lerp(p1.y, p4.y, topH) };
        const tr_w = { x: lerp(p2.x, p3.x, topH), y: lerp(p2.y, p3.y, topH) };
        const bl_w = { x: lerp(p1.x, p4.x, botH), y: lerp(p1.y, p4.y, botH) };
        const br_w = { x: lerp(p2.x, p3.x, botH), y: lerp(p2.y, p3.y, botH) };
        drawQuad(ctx, tl_w, tr_w, br_w, bl_w, bandColor);
    }
    ctx.strokeStyle = `rgba(0,0,0,${Math.max(0, 0.1 - dist/100)})`; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1.0; 
  };

  const drawCube = useCallback((ctx: CanvasRenderingContext2D, entity: Entity, camX: number, camY: number, camZ: number, tilt: number, pitch: number, width: number, height: number, phaseActive: boolean) => {
    if (entity.collected) return;
    const hs = entity.size / 2; const { x, y, z } = entity.position;
    const projC = project({x, y, z}, camX, camY, camZ, width, height, tilt, pitch);
    if (!projC || projC.dist > FOG_DISTANCE) return;
    const dist = projC.dist;
    const v = {
      ft: {x: x - hs, y: y + hs, z: z - hs}, ftr: {x: x + hs, y: y + hs, z: z - hs}, fb: {x: x - hs, y: y - hs, z: z - hs}, fbr: {x: x + hs, y: y - hs, z: z - hs}, 
      bt: {x: x - hs, y: y + hs, z: z + hs}, btr: {x: x + hs, y: y + hs, z: z + hs}, bb: {x: x - hs, y: y - hs, z: z + hs}, bbr: {x: x + hs, y: y - hs, z: z + hs}, 
    };
    const p = {
        ft: project(v.ft, camX, camY, camZ, width, height, tilt, pitch), ftr: project(v.ftr, camX, camY, camZ, width, height, tilt, pitch),
        fb: project(v.fb, camX, camY, camZ, width, height, tilt, pitch), fbr: project(v.fbr, camX, camY, camZ, width, height, tilt, pitch),
        bt: project(v.bt, camX, camY, camZ, width, height, tilt, pitch), btr: project(v.btr, camX, camY, camZ, width, height, tilt, pitch),
        bb: project(v.bb, camX, camY, camZ, width, height, tilt, pitch), bbr: project(v.bbr, camX, camY, camZ, width, height, tilt, pitch),
    };
    if (!p.ft || !p.ftr || !p.fb || !p.fbr || !p.bt || !p.btr) return;
    if (z - hs > camZ + 0.1) drawFaceDetails(ctx, entity.type, 'FRONT', p.ft, p.ftr, p.fbr, p.fb, dist, phaseActive);
    if (x < camX) { if (p.bbr) drawFaceDetails(ctx, entity.type, 'SIDE', p.ftr, p.btr, p.bbr, p.fbr, dist, phaseActive); } 
    else { if (p.bb) drawFaceDetails(ctx, entity.type, 'SIDE', p.bt, p.ft, p.fb, p.bb, dist, phaseActive); }
    if (y < camY) drawFaceDetails(ctx, entity.type, 'TOP', p.bt, p.btr, p.ftr, p.ft, dist, phaseActive);
  }, [project, applyFog]);

  const loop = useCallback((time: number) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    engine.update(inputState.current, inputStateP2?.current || { left: false, right: false, jump: false }, 16);
    const state = engine.getState();

    if (scoreRef.current) scoreRef.current.innerText = state.player2 ? `P1: ${state.player.score}  P2: ${state.player2.score}` : `SCORE: ${state.player.score}`;
    if (levelRef.current) levelRef.current.innerText = `LEVEL: ${state.level}`;
    if (goldRef.current) goldRef.current.innerText = `GOLD: ${state.goldCollected} / ${state.levelTarget}`;
    if (livesRef.current) {
        const getHearts = (lives: number) => '❤️'.repeat(Math.max(0, lives));
        livesRef.current.innerHTML = `<div class="text-green-300">P1: ${getHearts(state.player.lives)}</div>` + (state.player2 ? `<div class="text-red-400">P2: ${getHearts(state.player2.lives)}</div>` : '');
    }
    if (abilitiesRef.current) {
        const phaseCD = Math.ceil(state.player.phaseCooldown / 1000);
        const jumpAvailable = state.player.jumpCount < 4; // Updated to 4
        let html = `<div class="flex flex-col items-center"><div class="w-10 h-10 border-2 ${jumpAvailable ? 'border-green-400 bg-green-900/50' : 'border-gray-500 bg-gray-900/50'} flex items-center justify-center text-xs font-bold relative">${4 - state.player.jumpCount}</div><span class="text-[10px] mt-1 text-gray-400">JUMP</span></div>`;
        html += `<div class="flex flex-col items-center"><div class="w-10 h-10 border-2 ${state.player.phaseActive ? 'border-cyan-400 bg-cyan-900/50 animate-pulse' : (phaseCD <= 0 ? 'border-green-400 bg-green-900/50' : 'border-red-400 bg-red-900/50')} flex items-center justify-center text-xs font-bold relative">PH</div><span class="text-[10px] mt-1 text-gray-400">"B"</span></div>`;
        abilitiesRef.current.innerHTML = html;
    }

    if (state.gameOver || state.gameWon) { onGameOver({ p1: state.player.score, p2: state.player2 ? state.player2.score : null }); return; }

    const { width, height } = canvas;
    const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
    if (state.player.phaseActive) { skyGrad.addColorStop(0, '#004455'); skyGrad.addColorStop(1, '#0088AA'); } 
    else { skyGrad.addColorStop(0, '#4ea7d6'); skyGrad.addColorStop(1, '#87CEEB'); }
    ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, width, height);

    let camX = state.player.position.x; let camZ = state.player.position.z;
    if (state.player2 && state.player2.lives > 0) {
        if (state.player.lives > 0) { camX = (state.player.position.x + state.player2.position.x) / 2; camZ = (state.player.position.z + state.player2.position.z) / 2; }
        else { camX = state.player2.position.x; camZ = state.player2.position.z; }
    } else if (state.player.lives <= 0 && state.player2) { camX = state.player2.position.x; camZ = state.player2.position.z; }

    const bob = Math.sin(time * 0.015) * 0.05 * (state.speed / 0.5);
    camX *= 0.8; let camY = 7.5 + bob; camZ -= 5.5; const pitch = 0.6; 
    if (state.shakeIntensity > 0) { camX += (Math.random() - 0.5) * state.shakeIntensity; camY += (Math.random() - 0.5) * state.shakeIntensity; }

    const sortedEntities = [...state.entities].sort((a, b) => b.position.z - a.position.z);
    const playersToDraw = [];
    if (state.player.lives > 0) playersToDraw.push({ type: 'PLAYER', z: state.player.position.z, obj: state.player, isP2: false });
    if (state.player2 && state.player2.lives > 0) playersToDraw.push({ type: 'PLAYER', z: state.player2.position.z, obj: state.player2, isP2: true });

    const allDrawables = [...sortedEntities.map(e => ({ type: 'ENTITY', z: e.position.z, obj: e })), ...playersToDraw].sort((a, b) => b.z - a.z);

    for (const item of allDrawables) {
        if (!(item.z > camZ + 0.5)) continue;
        if (item.type === 'ENTITY') drawCube(ctx, item.obj as Entity, camX, camY, camZ, 0, pitch, width, height, state.player.phaseActive);
        else if (item.type === 'PLAYER') {
            const p = item.obj as any; const headPos = { x: p.position.x, y: p.position.y + 1.8, z: p.position.z };
            const proj = project(headPos, camX, camY, camZ, width, height, 0, pitch);
            drawSteve(ctx, p.position, camX, camY, camZ, 0, pitch, width, height, p.phaseActive, time, p.isJumping, p.colors);
            if (proj) {
               ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(proj.x - 10, proj.y - 15, 20, 12);
               ctx.fillStyle = p.id === 'p2' ? '#FF5555' : '#00AAAA'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.fillText(p.id === 'p2' ? "P2" : "P1", proj.x, proj.y - 5);
            }
        }
    }

    for (const p of state.particles) {
        const proj = project(p.position, camX, camY, camZ, width, height, 0, pitch);
        if (proj) {
            ctx.fillStyle = p.color; ctx.globalAlpha = p.life;
            const size = proj.scale * p.size; ctx.fillRect(proj.x - size/2, proj.y - size/2, size, size); ctx.globalAlpha = 1.0;
        }
    }

    if (state.speed > 0.6) {
      ctx.strokeStyle = state.player.phaseActive ? 'rgba(0, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.15)'; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const x = Math.random() * width; const y = Math.random() * height; const len = Math.random() * 50 + 20;
        const cx = width/2; const cy = height/2; const angle = Math.atan2(y-cy, x-cx);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(angle)*len, y + Math.sin(angle)*len); ctx.stroke();
      }
    }
    requestRef.current = requestAnimationFrame(loop);
  }, [engine, inputState, inputStateP2, onGameOver, drawCube, project]);

  useEffect(() => {
    const handleResize = () => { if(canvasRef.current) { canvasRef.current.width = window.innerWidth; canvasRef.current.height = window.innerHeight; } };
    window.addEventListener('resize', handleResize); handleResize();
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
         <div ref={livesRef}></div>
      </div>
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex gap-6 text-white" ref={abilitiesRef}></div>
    </div>
  );
};
