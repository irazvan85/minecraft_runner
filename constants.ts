import { BlockType } from './types';

// World Configuration
export const CHUNK_SIZE = 20; 
export const BLOCK_SIZE = 100;
export const LANE_WIDTH = 1.2;
export const GRAVITY = 0.045;
export const JUMP_FORCE = 0.65;
export const MOVE_SPEED = 0.15;

// Progression
export const RUN_SPEED_BASE = 0.18; // Slower start (was 0.3)
export const RUN_SPEED_MAX = 0.8;
export const SPEED_INCREMENT = 0.05; // Speed increase per level
export const LEVEL_DISTANCE = 100; // Distance units per level
export const ACCELERATION = 0.0005; // How fast we adapt to new target speed

// Visuals
export const SKY_COLOR_HEX = '#87CEEB';
export const FOG_DISTANCE = 25;

// Helper to mix colors for Fog
export const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

export const COLORS: Record<BlockType, { top: string; side: string; front: string; detail?: string }> = {
  [BlockType.GRASS]: { 
    top: '#7CBD38',  // Vivid Grass Green
    side: '#8B5E3C', // Dirt Brown
    front: '#8B5E3C',
    detail: '#7CBD38' // Grass overhang color
  },
  [BlockType.DIRT]: { 
    top: '#8B5E3C', 
    side: '#8B5E3C', 
    front: '#8B5E3C' 
  },
  [BlockType.STONE]: { 
    top: '#7D7D7D', 
    side: '#7D7D7D', 
    front: '#7D7D7D',
    detail: '#666666'
  },
  [BlockType.WOOD]: { 
    top: '#A07851', 
    side: '#A07851', 
    front: '#A07851' 
  },
  [BlockType.LEAVES]: { 
    top: '#3ea329', 
    side: '#3ea329', 
    front: '#3ea329' 
  },
  [BlockType.GOLD]: { 
    top: '#FCEE4B', // Gold block yellow
    side: '#FCEE4B', 
    front: '#FCEE4B',
    detail: '#E6C62C' // Darker gold for bevel
  },
  [BlockType.TNT]: { 
    top: '#DB3625', // TNT Red
    side: '#DB3625', 
    front: '#DB3625',
    detail: '#FFFFFF' // The white band
  },
  [BlockType.LAVA]: { 
    top: '#CF1020', 
    side: '#CF1020', 
    front: '#FF4500' 
  },
};