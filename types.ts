export enum BlockType {
  GRASS = 'GRASS',
  DIRT = 'DIRT',
  STONE = 'STONE',
  WOOD = 'WOOD',
  LEAVES = 'LEAVES',
  GOLD = 'GOLD', // Collectible
  TNT = 'TNT',   // Obstacle
  LAVA = 'LAVA',
  CREEPER = 'CREEPER',   // Mob Obstacle
  SKELETON = 'SKELETON'  // Mob Obstacle
}

export enum Difficulty {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD'
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

export interface Particle {
  id: string;
  position: Point3D;
  velocity: Point3D;
  life: number; // 0 to 1
  color: string;
  size: number;
}

export interface GameState {
  isPlaying: boolean;
  score: number;
  distance: number;
  speed: number;
  lives: number;
  gameOver: boolean;
  gameWon: boolean;
  level: number;
  particles: Particle[];
  goldCollected: number;
  levelTarget: number;
}

export interface PlayerState {
  position: Point3D;
  velocity: Point3D;
  isJumping: boolean;
  tilt: number; // Camera tilt
}

export interface HighScore {
  name: string;
  score: number;
  difficulty: Difficulty;
  date: string;
}