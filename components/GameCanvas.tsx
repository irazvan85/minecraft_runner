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

  const project = useCallback((p: Point3D, camX: number, camY: number, camZ: number, width: number, height: number, tilt: number, pitch: number) => {
    // 1. Translate
    let rx = p.x - camX;
    let ry = p.y - camY;
    let rz = p.z - camZ;

    // 2. Rotate (Tilt - Z roll)
    if (tilt !== 0) {
        const cos = Math.cos(tilt);
        const sin = Math.sin(tilt);
        const nx = rx * cos - ry * sin;
        const ny = rx * sin + ry * cos;
        rx = nx;
        ry = ny;
    }

    // 3. Rotate (Pitch - X axis)
    if (pitch !== 0) {
        const cos = Math.cos(pitch);
        const sin = Math.sin(pitch);
        const ny = ry * cos + rz * sin;
        const nz = -ry * sin + rz * cos;
        ry = ny;
        rz = nz;
    }

    if (rz <= 0.1) return null;

    // 4. Project
    const scale = FOV / rz;
    const x2d = (rx * scale) + (width / 2);
    const y2d = (height / 2) - (ry * scale);

    return { x: x2d, y: y2d, scale, dist: rz };
  }, []);

  // --- Drawing Primitives ---

  const drawQuad = (ctx: CanvasRenderingContext2D, p1: any, p2: any, p3: any, p4: any, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    ctx.fill();
    // ctx.stroke(); // Debug outline
  };

  // --- Steve Drawing ---
  const drawStevePart = (
      ctx: CanvasRenderingContext2D,
      p: Point3D, // Center position
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

      // Local vertices
      const verts = [
          { x: -hw, y: hh, z: -hd }, { x: hw, y: hh, z: -hd }, { x: hw, y: -hh, z: -hd }, { x: -hw, y: -hh, z: -hd }, // Front
          { x: -hw, y: hh, z: hd },  { x: hw, y: hh, z: hd },  { x: hw, y: -hh, z: hd },  { x: -hw, y: -hh, z: hd }   // Back
      ];

      // Rotate and Translate
      const worldVerts = verts.map(v => {
          // X Rotation (Pitch)
          let y1 = v.y * Math.cos(rotation.x) - v.z * Math.sin(rotation.x);
          let z1 = v.y * Math.sin(rotation.x) + v.z * Math.cos(rotation.x);
          
          // Z Rotation (Roll)
          let x2 = v.x * Math.cos(rotation.z) - y1 * Math.sin(rotation.z);
          let y2 = v.x * Math.sin(rotation.z) + y1 * Math.cos(rotation.z);

          // Translate
          return {
              x: x2 + p.x,
              y: y2 + p.y,
              z: z1 + p.z
          };
      });

      // Project
      const projVerts = worldVerts.map(v => project(v, camX, camY, camZ, width, height, tilt, pitch));

      // Calculate Center Dist for Fog
      const dist = Math.sqrt(Math.pow(p.x - camX, 2) + Math.pow(p.y - camY, 2) + Math.pow(p.z - camZ, 2));
      
      if (phaseActive) ctx.globalAlpha = 0.6;

      const drawFace = (idxs: number[], color: string, normal: 'FRONT' | 'BACK' | 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT') => {
          if (idxs.some(i => !projVerts[i])) return;
          const ps = idxs.map(i => projVerts[i]!);
          
          // Simple normal check (cross product z)
          const v1 = { x: ps[1].x - ps[0].x, y: ps[1].y - ps[0].y };
          const v2 = { x: ps[2].x - ps[1].x, y: ps[2].y - ps[1].y };
          const cross = v1.x * v2.y - v1.y * v2.x;
          
          if (cross > 0) return; // Backface culling in 2D space
          
          drawQuad(ctx, ps[0], ps[1], ps[2], ps[3], applyFog(color, dist));

          // --- DETAILS ---
          const mapUV = (u: number, v: number) => {
            const topX = lerp(ps[0].x, ps[1].x, u); const topY = lerp(ps[0].y, ps[1].y, u);
            const botX = lerp(ps[3].x, ps[2].x, u); const botY = lerp(ps[3].y, ps[2].y, u);
            return { x: lerp(topX, botX, v), y: lerp(topY, botY, v) };
          }
          const drawRect = (u: number, v: number, w: number, h: number, c: string) => {
             const tl = mapUV(u, v);
             const tr = mapUV(u+w, v);
             const br = mapUV(u+w, v+h);
             const bl = mapUV(u, v+h);
             drawQuad(ctx, tl, tr, br, bl, applyFog(c, dist));
          }

          // FACE
          if (partType === 'HEAD' && normal === 'FRONT') {
             // Hair
             drawRect(0, 0, 1, 0.25, '#2A1D13');
             // Eyes
             drawRect(0.125, 0.5, 0.125, 0.125, '#FFFFFF'); // L Sclera
             drawRect(0.25, 0.5, 0.125, 0.125, '#493C7B'); // L Pupil
             drawRect(0.625, 0.5, 0.125, 0.125, '#FFFFFF'); // R Sclera
             drawRect(0.75, 0.5, 0.125, 0.125, '#493C7B'); // R Pupil
             // Nose
             drawRect(0.4375, 0.625, 0.125, 0.0625, '#A57356');
             // Mouth/Beard
             drawRect(0.375, 0.75, 0.25, 0.125, '#784732');
          }
          // SIDE HAIR
          if (partType === 'HEAD' && (normal === 'LEFT' || normal === 'RIGHT' || normal === 'BACK')) {
              drawRect(0, 0, 1, 0.25, '#2A1D13');
          }
          
          // SLEEVES
          if (partType === 'ARM' && normal !== 'TOP' && normal !== 'BOTTOM') {
              drawRect(0, 0, 1, 0.35, colors.front); // Use shirt color
          }

          // SHOES
          if (partType === 'LEG' && normal !== 'TOP' && normal !== 'BOTTOM') {
              drawRect(0, 0.85, 1, 0.15, '#555555');
          }
      };

      // Indices for CCW winding
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
      // Animation Config
      const runFreq = 0.0175; 
      const runAmp = 1.2; 

      const animPhase = time * runFreq;
      const rawSwing = Math.sin(animPhase);
      
      // Minecraft-style: Continue running animation in mid-air (Sprint Jumping)
      const swing = rawSwing * runAmp; 

      // Smoother bobbing (Only on ground)
      const bob = isJumping ? 0 : Math.abs(Math.sin(animPhase)) * 0.1;
      
      const steveY = pos.y + bob;

      // Steve Colors
      const skinColor = '#E3A581'; // Lighter, rosier skin
      const shirtColor = customColors.shirt;
      const pantsColor = customColors.pants;
      const hairColor = '#2A1D13'; // Dark Brown
      
      // Dimensions
      const legW = 0.22; const legH = 0.7; const legD = 0.22;
      const torsoW = 0.5; const torsoH = 0.65; const torsoD = 0.25;
      const headS = 0.45;
      const armW = 0.2; const armH = 0.7; const armD = 0.22;

      const hipY = steveY + legH;
      const shoulderY = hipY + torsoH;
      const neckY = shoulderY;

      const leftLegRot = -swing; 
      const rightLegRot = swing;
      const leftArmRot = swing; 
      const rightArmRot = -swing; 

      // Left Leg
      drawStevePart(
          ctx, 
          { x: pos.x - 0.13, y: steveY + legH/2, z: pos.z }, 
          { w: legW, h: legH, d: legD }, 
          { front: pantsColor, back: pantsColor, top: pantsColor, bottom: pantsColor, left: pantsColor, right: pantsColor },
          { x: leftLegRot, y: 0, z: 0 },
          'LEG',
          camX, camY, camZ, tilt, pitch, width, height, phaseActive
      );
      
      // Right Leg
      drawStevePart(
          ctx, 
          { x: pos.x + 0.13, y: steveY + legH/2, z: pos.z }, 
          { w: legW, h: legH, d: legD }, 
          { front: pantsColor, back: pantsColor, top: pantsColor, bottom: pantsColor, left: pantsColor, right: pantsColor },
          { x: rightLegRot, y: 0, z: 0 },
          'LEG',
          camX, camY, camZ, tilt, pitch, width, height, phaseActive
      );

      // Torso
      drawStevePart(
          ctx, 
          { x: pos.x, y: hipY + torsoH/2, z: pos.z }, 
          { w: torsoW, h: torsoH, d: torsoD }, 
          { front: shirtColor, back: shirtColor, top: shirtColor, bottom: shirtColor, left: shirtColor, right: shirtColor },
          { x: 0, y: 0, z: 0 },
          'TORSO',
          camX, camY, camZ, tilt, pitch, width, height, phaseActive
      );

      // Head
      drawStevePart(
          ctx, 
          { x: pos.x, y: neckY + headS/2, z: pos.z }, 
          { w: headS, h: headS, d: headS }, 
          { front: skinColor, back: hairColor, top: hairColor, bottom: skinColor, left: skinColor, right: skinColor },
          { x: 0, y: 0, z: 0 },
          'HEAD',
          camX, camY, camZ, tilt, pitch, width, height, phaseActive
      );

      // Left Arm
      drawStevePart(
          ctx, 
          { x: pos.x - 0.36, y: shoulderY - armH/2 + 0.1, z: pos.z }, 
          { w: armW, h: armH, d: armD }, 
          { front: skinColor, back: skinColor, top: shirtColor, bottom: skinColor, left: skinColor, right: skinColor },
          { x: leftArmRot, y: 0, z: 0 },
          'ARM',
          camX, camY, camZ, tilt, pitch, width, height, phaseActive
      );

      // Right Arm
      drawStevePart(
          ctx, 
          { x: pos.x + 0.36, y: shoulderY - armH/2 + 0.1, z: pos.z }, 
          { w: armW, h: armH, d: armD }, 
          { front: skinColor, back: skinColor, top: shirtColor, bottom: skinColor, left: skinColor, right: skinColor },
          { x: rightArmRot, y: 0, z: 0 },
          'ARM',
          camX, camY, camZ, tilt, pitch, width, height, phaseActive
      );
  }

  // --- World Drawing ---

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
        const eyeW = 0.2; const eyeH = 0.2;
        const e1x = 0.2; const e1y = 0.25;
        const e2x = 0.6; const e2y = 0.25;
        
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

        drawRect(e1x, e1y, eyeW, eyeH); 
        drawRect(e2x, e2y, eyeW, eyeH); 
        drawRect(0.35, 0.45, 0.3, 0.25); 
        drawRect(0.25, 0.6, 0.1, 0.2); 
        drawRect(0.65, 0.6, 0.1, 0.2); 
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
    camX: number, camY: number, camZ: number, tilt: number, pitch: number,
    width: number, height: number,
    phaseActive: boolean
  ) => {
    if (entity.collected) return;

    const hs = entity.size / 2;
    const { x, y, z } = entity.position;

    const projC = project({x, y, z}, camX, camY, camZ, width, height, tilt, pitch);
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
        ft: project(v.ft, camX, camY, camZ, width, height, tilt, pitch),
        ftr: project(v.ftr, camX, camY, camZ, width, height, tilt, pitch),
        fb: project(v.fb, camX, camY, camZ, width, height, tilt, pitch),
        fbr: project(v.fbr, camX, camY, camZ, width, height, tilt, pitch),
        bt: project(v.bt, camX, camY, camZ, width, height, tilt, pitch),
        btr: project(v.btr, camX, camY, camZ, width, height, tilt, pitch),
        bb: project(v.bb, camX, camY, camZ, width, height, tilt, pitch),
        bbr: project(v.bbr, camX, camY, camZ, width, height, tilt, pitch),
    };

    if (!p.ft || !p.ftr || !p.fb || !p.fbr || !p.bt || !p.btr) return;

    if (z - hs > camZ + 0.1) {
       drawFaceDetails(ctx, entity.type, 'FRONT', p.ft, p.ftr, p.fbr, p.fb, dist, phaseActive);
    }
    
    // Side
    if (x < camX) {
        if (p.bbr) drawFaceDetails(ctx, entity.type, 'SIDE', p.ftr, p.btr, p.bbr, p.fbr, dist, phaseActive);
    } else {
        if (p.bb) drawFaceDetails(ctx, entity.type, 'SIDE', p.bt, p.ft, p.fb, p.bb, dist, phaseActive);
    }
    
    // Top / Bottom
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
    
    if (abilitiesRef.current) {
        const phaseCD = Math.ceil(state.player.phaseCooldown / 1000);
        const phaseRemaining = Math.ceil(state.player.phaseTimeRemaining / 1000);
        const jumpAvailable = state.player.jumpCount < 2;
        let html = '';
        html += `<div class="flex flex-col items-center"><div class="w-10 h-10 border-2 ${jumpAvailable ? 'border-green-400 bg-green-900/50' : 'border-gray-500 bg-gray-900/50'} flex items-center justify-center text-xs font-bold relative">DJ</div><span class="text-[10px] mt-1 text-gray-400">JUMP</span></div>`;
        html += `<div class="flex flex-col items-center"><div class="w-10 h-10 border-2 ${state.player.phaseActive ? 'border-cyan-400 bg-cyan-900/50 animate-pulse' : (phaseCD <= 0 ? 'border-green-400 bg-green-900/50' : 'border-red-400 bg-red-900/50')} flex items-center justify-center text-xs font-bold relative">PH${state.player.phaseActive ? `<div class="absolute inset-0 flex items-center justify-center text-cyan-200 text-sm">${phaseRemaining}</div>` : ''}${!state.player.phaseActive && phaseCD > 0 ? `<div class="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-sm">${phaseCD}</div>` : ''}</div><span class="text-[10px] mt-1 text-gray-400">"B"</span></div>`;
        abilitiesRef.current.innerHTML = html;
    }

    if (state.lives <= 0 || state.gameWon) {
      onGameOver(state.score);
      return; 
    }

    const width = canvas.width;
    const height = canvas.height;
    
    // Sky
    const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
    if (state.player.phaseActive) {
         skyGrad.addColorStop(0, '#004455');
         skyGrad.addColorStop(1, '#0088AA');
    } else {
         skyGrad.addColorStop(0, '#4ea7d6');
         skyGrad.addColorStop(1, '#87CEEB');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height);

    // Camera Configuration (High-Angle / Top-Down view)
    const bob = Math.sin(time * 0.015) * 0.05 * (state.speed / 0.5);
    
    // Increased Y height and angled pitch down for "from above" view
    let camX = state.player.position.x * 0.8; 
    let camY = state.player.position.y + 7.5 + bob; 
    let camZ = state.player.position.z - 5.5; 
    const tilt = state.player.tilt;
    const pitch = 0.6; // ~35 degrees looking down

    if (state.shakeIntensity > 0) {
       camX += (Math.random() - 0.5) * state.shakeIntensity;
       camY += (Math.random() - 0.5) * state.shakeIntensity;
    }

    // Sort Entities: Far to Near (Painter's Algorithm)
    const sortedEntities = [...state.entities].sort((a, b) => b.position.z - a.position.z);
    
    // Helper to check if item is behind camera
    const isVisible = (z: number) => z > camZ + 0.5;

    let steveDrawn = false;
    
    // Render Bots & Entities Mixed
    const allDrawables = [
        ...sortedEntities.map(e => ({ type: 'ENTITY', z: e.position.z, obj: e })),
        { type: 'PLAYER', z: state.player.position.z, obj: state.player },
        ...(state.isMultiplayer ? state.otherPlayers.map(p => ({ type: 'BOT', z: p.position.z, obj: p })) : [])
    ].sort((a, b) => b.z - a.z); // Draw furthest first

    for (const item of allDrawables) {
        if (!isVisible(item.z)) continue;

        if (item.type === 'ENTITY') {
            const e = item.obj as Entity;
            drawCube(ctx, e, camX, camY, camZ, tilt, pitch, width, height, state.player.phaseActive);
        } else if (item.type === 'PLAYER') {
            drawSteve(ctx, state.player.position, camX, camY, camZ, tilt, pitch, width, height, state.player.phaseActive, time, state.player.isJumping);
        } else if (item.type === 'BOT') {
            const bot = item.obj as any;
            drawSteve(ctx, bot.position, camX, camY, camZ, tilt, pitch, width, height, false, time + parseInt(bot.id.split('_')[1])*500, bot.isJumping, bot.colors);
            
            // Draw Name Tag
            const headPos = { x: bot.position.x, y: bot.position.y + 1.8, z: bot.position.z };
            const p = project(headPos, camX, camY, camZ, width, height, tilt, pitch);
            if (p) {
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                const textWidth = ctx.measureText(bot.name).width;
                ctx.fillRect(p.x - 20, p.y - 15, 40, 15);
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '10px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(bot.name, p.x, p.y - 4);
            }
        }
    }

    // Particles
    for (const p of state.particles) {
        const proj = project(p.position, camX, camY, camZ, width, height, tilt, pitch);
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
      for (let i = 0; i < 4; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const len = Math.random() * 50 + 20;
        const cx = width/2; const cy = height/2;
        const angle = Math.atan2(y-cy, x-cx);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle)*len, y + Math.sin(angle)*len);
        ctx.stroke();
      }
    }

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
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex gap-6 text-white" ref={abilitiesRef}></div>
      <div className="absolute top-4 right-4 text-white/70 text-sm font-mono select-none bg-black/30 p-2 rounded">
        WASD to Move • SPACE to Jump • B to Phase
      </div>
    </div>
  );
};
