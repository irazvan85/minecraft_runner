
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

export interface RemotePlayer {
  id: string;
  name: string;
  position: Point3D;
  velocity: Point3D;
  isJumping: boolean;
  jumpCount: number;
  colors: { shirt: string; pants: string };
  speed: number;
}

export interface PlayerState {
  id: string;
  position: Point3D;
  velocity: Point3D;
  isJumping: boolean;
  tilt: number; // Camera tilt
  jumpCount: number;
  // Abilities
  phaseActive: boolean;
  phaseTimeRemaining: number;
  phaseCooldown: number;
  // Stats
  lives: number;
  score: number;
  colors: { shirt: string; pants: string };
}

export interface GameState {
  isPlaying: boolean;
  score: number; // Combined or P1 score for backward compatibility
  distance: number;
  speed: number;
  // lives: number; // Deprecated, use player.lives
  gameOver: boolean;
  gameWon: boolean;
  level: number;
  particles: Particle[];
  goldCollected: number;
  levelTarget: number;
  shakeIntensity: number;
  isMultiplayer: boolean;
  player: PlayerState;
  player2?: PlayerState;
}

export interface HighScore {
  name: string;
  score: number;
  difficulty: Difficulty;
  date: string;
}
