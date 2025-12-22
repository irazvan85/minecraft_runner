export enum BlockType {
  GRASS = 'GRASS',
  DIRT = 'DIRT',
  STONE = 'STONE',
  WOOD = 'WOOD',
  LEAVES = 'LEAVES',
  GOLD = 'GOLD', // Collectible
  TNT = 'TNT',   // Obstacle
  LAVA = 'LAVA'
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Entity {
  id: string;
  type: BlockType;
  position: Point3D;
  size: number;
  collected?: boolean;
  rotation?: number; // For gold blocks
}

export interface GameState {
  isPlaying: boolean;
  score: number;
  distance: number;
  speed: number;
  lives: number;
  gameOver: boolean;
  level: number;
}

export interface PlayerState {
  position: Point3D;
  velocity: Point3D;
  isJumping: boolean;
}