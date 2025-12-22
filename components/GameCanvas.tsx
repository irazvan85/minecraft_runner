import React, { useEffect, useRef, useCallback } from 'react';
import { GameEngine } from '../services/engine';
import { COLORS, SKY_COLOR_HEX, hexToRgb, FOG_DISTANCE } from '../constants';
import { Entity, BlockType, Point3D } from '../types';

interface GameCanvasProps {
  engine: GameEngine;
  onGameOver: (score: number) => void;
  inputState: { current: { left: boolean; right: boolean; jump: boolean } };
}

const FOV = 450;
const SKY_RGB = hexToRgb(SKY_COLOR_HEX);

export const GameCanvas: React.FC<GameCanvasProps> = ({ engine, onGameOver, inputState }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const scoreRef = useRef<HTMLDivElement>(null);
  const levelRef = useRef<HTMLDivElement>(null);
  const livesRef = useRef<HTMLDivElement>(null);

  // --- Helpers ---

  // Linear Interpolation
  const lerp = (start: number, end: number, t: number) => start * (1 - t) + end * t;

  // Mix color with Fog
  const applyFog = useCallback((colorHex: string, distance: number) => {
    const rgb = hexToRgb(colorHex);
    // Fog factor: 0 = clear, 1 = full fog
    // Start fog at 5 units away, full at FOG_DISTANCE
    let fogFactor = Math.max(0, Math.min(1, (distance - 5) / (FOG_DISTANCE - 10)));
    
    // Non-linear fog for better look
    fogFactor = fogFactor * fogFactor;

    const r = Math.round(lerp(rgb.r, SKY_RGB.r, fogFactor));
    const g = Math.round(lerp(rgb.g, SKY_RGB.g, fogFactor));
    const b = Math.round(lerp(rgb.b, SKY_RGB.b, fogFactor));
    
    return `rgb(${r},${g},${b})`;
  }, []);

  // Project 3D point to 2D
  const project = useCallback((p: Point3D, camX: number, camY: number, camZ: number, width: number, height: number) => {
    const rx = p.x - camX;
    const ry = p.y - camY;
    const rz = p.z - camZ;

    if (rz <= 0.1) return null;

    const scale = FOV / rz;
    const x2d = (rx * scale) + (width / 2);
    const y2d = (height / 2) - (ry * scale);

    return { x: x2d, y: y2d, scale, dist: rz };
  }, []);

  // --- Drawing Functions ---

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
    p1: any, p2: any, p3: any, p4: any, // Corners: TL, TR, BR, BL
    dist: number
  ) => {
    const baseColor = COLORS[type];
    
    // 1. Draw Base
    const colorKey = face === 'TOP' ? 'top' : (face === 'SIDE' ? 'side' : 'front');
    const color = applyFog(baseColor[colorKey], dist);
    drawQuad(ctx, p1, p2, p3, p4, color);

    // 2. Draw Details based on Type
    
    // GRASS Side: Draw Green Top 1/4
    if (type === BlockType.GRASS && face !== 'TOP') {
        const detailColor = applyFog(baseColor.detail!, dist);
        
        // Interpolate points to find the bottom of the grass layer (25% down)
        const grassH = 0.25;
        const p1_b = { x: lerp(p1.x, p4.x, grassH), y: lerp(p1.y, p4.y, grassH) }; // Left down
        const p2_b = { x: lerp(p2.x, p3.x, grassH), y: lerp(p2.y, p3.y, grassH) }; // Right down

        drawQuad(ctx, p1, p2, p2_b, p1_b, detailColor);
    }

    // TNT Side: Draw White Band and "TNT"
    if (type === BlockType.TNT && face !== 'TOP') {
        const bandColor = applyFog('#FFFFFF', dist);
        
        // Middle 1/3 is white
        const topH = 0.33;
        const botH = 0.66;
        
        const tl_w = { x: lerp(p1.x, p4.x, topH), y: lerp(p1.y, p4.y, topH) };
        const tr_w = { x: lerp(p2.x, p3.x, topH), y: lerp(p2.y, p3.y, topH) };
        const bl_w = { x: lerp(p1.x, p4.x, botH), y: lerp(p1.y, p4.y, botH) };
        const br_w = { x: lerp(p2.x, p3.x, botH), y: lerp(p2.y, p3.y, botH) };

        drawQuad(ctx, tl_w, tr_w, br_w, bl_w, bandColor);

        // Draw "TNT" roughly using black rectangles if close enough
        if (dist < 15) {
             ctx.fillStyle = applyFog('#000000', dist);
             // Center of the white band
             const cx = (tl_w.x + tr_w.x + bl_w.x + br_w.x) / 4;
             const cy = (tl_w.y + tr_w.y + bl_w.y + br_w.y) / 4;
             const w = Math.abs(tr_w.x - tl_w.x) * 0.4;
             const h = Math.abs(bl_w.y - tl_w.y) * 0.6;
             
             ctx.fillRect(cx - w/2, cy - h/2, w, h);
        }
    }

    // TNT Top: Fuse square
    if (type === BlockType.TNT && face === 'TOP') {
        const detailColor = applyFog('#FFFFFF', dist);
        const t1 = 0.33;
        const t2 = 0.66;
        
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

    // Gold: Bevel Effect
    if (type === BlockType.GOLD) {
        const detailColor = applyFog(baseColor.detail!, dist);
        ctx.strokeStyle = detailColor;
        ctx.lineWidth = Math.max(1, 40 / dist); // Thicker line when close
        ctx.stroke(); 

        if (face === 'TOP' || face === 'FRONT') {
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            const cx = (p1.x + p2.x + p3.x + p4.x) / 4;
            const cy = (p1.y + p2.y + p3.y + p4.y) / 4;
            const s = 100 / dist;
            ctx.fillRect(cx, cy, s, s);
        }
    }
    
    // Stone: Noise
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

    // Stroke edges
    ctx.strokeStyle = `rgba(0,0,0,${Math.max(0, 0.1 - dist/100)})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  const drawCube = useCallback((
    ctx: CanvasRenderingContext2D, 
    entity: Entity, 
    camX: number, camY: number, camZ: number, 
    width: number, height: number
  ) => {
    if (entity.collected) return;

    const hs = entity.size / 2;
    const { x, y, z } = entity.position;

    const projC = project({x, y, z}, camX, camY, camZ, width, height);
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
        ft: project(v.ft, camX, camY, camZ, width, height),
        ftr: project(v.ftr, camX, camY, camZ, width, height),
        fb: project(v.fb, camX, camY, camZ, width, height),
        fbr: project(v.fbr, camX, camY, camZ, width, height),
        bt: project(v.bt, camX, camY, camZ, width, height),
        btr: project(v.btr, camX, camY, camZ, width, height),
        bb: project(v.bb, camX, camY, camZ, width, height),
        bbr: project(v.bbr, camX, camY, camZ, width, height),
    };

    if (!p.ft || !p.ftr || !p.fb || !p.fbr || !p.bt || !p.btr) return;

    // Draw Front
    if (z - hs > camZ + 0.1) {
       drawFaceDetails(ctx, entity.type, 'FRONT', p.ft, p.ftr, p.fbr, p.fb, dist);
    }

    // Draw Side
    if (x < camX) {
        if (p.bbr) drawFaceDetails(ctx, entity.type, 'SIDE', p.ftr, p.btr, p.bbr, p.fbr, dist);
    } else {
        if (p.bb) drawFaceDetails(ctx, entity.type, 'SIDE', p.bt, p.ft, p.fb, p.bb, dist);
    }

    // Draw Top
    if (y < camY) {
         drawFaceDetails(ctx, entity.type, 'TOP', p.bt, p.btr, p.ftr, p.ft, dist);
    }

  }, [project, applyFog]);

  const loop = useCallback((time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    engine.update(inputState.current, 16);
    const state = engine.getState();

    if (scoreRef.current) scoreRef.current.innerText = `SCORE: ${state.score}`;
    if (levelRef.current) levelRef.current.innerText = `LEVEL: ${state.level}`;
    if (livesRef.current) {
        let hearts = '';
        for(let i=0; i<state.lives; i++) hearts += '❤️';
        livesRef.current.innerText = hearts;
    }
    if (state.lives <= 0) {
      onGameOver(state.score);
      return; 
    }

    const width = canvas.width;
    const height = canvas.height;
    
    // Draw Sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
    skyGrad.addColorStop(0, '#4ea7d6');
    skyGrad.addColorStop(1, '#87CEEB');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height);

    // Camera
    const bob = Math.sin(time * 0.015) * 0.05 * (state.speed / 0.5);
    const camX = state.player.position.x;
    const camY = state.player.position.y + 1.6 + bob;
    const camZ = state.player.position.z - 0.5;

    // Render
    const sortedEntities = [...state.entities].sort((a, b) => b.position.z - a.position.z);
    
    for (const entity of sortedEntities) {
      drawCube(ctx, entity, camX, camY, camZ, width, height);
    }

    // Speed Lines
    if (state.speed > 0.6) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
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
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width/2 - 8, height/2);
    ctx.lineTo(width/2 + 8, height/2);
    ctx.moveTo(width/2, height/2 - 8);
    ctx.lineTo(width/2, height/2 + 8);
    ctx.stroke();

    requestRef.current = requestAnimationFrame(loop);
  }, [engine, inputState, onGameOver, drawCube]);

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
         <div ref={scoreRef} className="text-yellow-400">SCORE: 0</div>
         <div ref={levelRef} className="text-blue-200 text-2xl">LEVEL: 1</div>
         <div ref={livesRef}>❤️❤️❤️</div>
      </div>
      <div className="absolute top-4 right-4 text-white/70 text-sm font-mono select-none bg-black/30 p-2 rounded">
        WASD to Move • SPACE to Jump
      </div>
    </div>
  );
};