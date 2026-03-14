import { BlockType, Difficulty, Entity, Particle, PlayerState, Point3D } from '../types';
import { 
  GRAVITY, 
  JUMP_FORCE, 
  DIFFICULTY_SETTINGS,
  LANE_WIDTH,
  MOVE_ACCEL_X,
  FRICTION_X,
  MAX_SPEED_X,
  CAMERA_TILT_FACTOR,
  BASE_LEVEL_TARGET,
  LEVEL_TARGET_INCREMENT
} from '../constants';
import { audioService } from './audio';

export interface InputMap {
  left: boolean;
  right: boolean;
  jump: boolean;
  phase?: boolean;
  forward?: boolean; // P2 W key
}

export class GameEngine {
  public entities: Entity[] = [];
  public particles: Particle[] = [];
  
  public player: PlayerState;
  public player2?: PlayerState;
  
  private lastGenZ = 10;
  private currentSpeed = 0;
  private level = 1;
  private difficulty: Difficulty = Difficulty.MEDIUM;
  private particleIdCounter = 0;
  private goldCollectedInLevel = 0;
  private levelTarget = BASE_LEVEL_TARGET;
  private gameWon = false;
  private shakeIntensity = 0;
  private score = 0;
  
  // Input tracking for edge detection
  private lastJumpInputP1 = false;
  private lastPhaseInputP1 = false;
  private lastJumpInputP2 = false;
  private lastPhaseInputP2 = false;

  private isMultiplayer = false;

  constructor() {
    this.player = this.createPlayer('p1', { shirt: '#00AAAA', pants: '#3B3696' });
    this.reset(Difficulty.MEDIUM, false);
  }

  private createPlayer(id: string, colors: { shirt: string, pants: string }): PlayerState {
    return {
      id,
      position: { x: id === 'p2' ? 1.5 : -1.5, y: 0, z: 0 }, // Offset start positions
      velocity: { x: 0, y: 0, z: 0 },
      isJumping: false,
      tilt: 0,
      jumpCount: 0,
      phaseActive: false,
      phaseTimeRemaining: 0,
      phaseCooldown: 0,
      lives: 3,
      score: 0,
      colors
    };
  }

  reset(difficulty: Difficulty, isMultiplayer: boolean = false) {
    this.difficulty = difficulty;
    this.isMultiplayer = isMultiplayer;
    const settings = DIFFICULTY_SETTINGS[difficulty];

    this.player = this.createPlayer('p1', { shirt: '#00AAAA', pants: '#3B3696' }); // Teal/Blue
    
    if (this.isMultiplayer) {
       this.player2 = this.createPlayer('p2', { shirt: '#FF5555', pants: '#222222' }); // Red/Black
       // Start them side by side
       this.player.position.x = -1.0;
       this.player2.position.x = 1.0;
    } else {
       this.player2 = undefined;
       this.player.position.x = 0;
    }

    this.entities = [];
    this.particles = [];
    this.currentSpeed = settings.startSpeed;
    this.level = 1;
    this.goldCollectedInLevel = 0;
    this.levelTarget = BASE_LEVEL_TARGET;
    this.gameWon = false;
    this.shakeIntensity = 0;
    this.score = 0;
    this.lastJumpInputP1 = false;
    this.lastPhaseInputP1 = false;
    this.lastJumpInputP2 = false;
    this.lastPhaseInputP2 = false;
    
    // Initial ground generation
    const initialDistance = 60;
    this.lastGenZ = initialDistance;
    for (let z = 0; z < initialDistance; z++) {
      this.generateSlice(z);
    }
  }

  update(inputP1: InputMap, inputP2: InputMap, deltaTime: number) {
    if (this.gameWon) return;

    // Decay Shake
    if (this.shakeIntensity > 0.001) {
        this.shakeIntensity *= 0.85; 
    } else {
        this.shakeIntensity = 0;
    }

    const settings = DIFFICULTY_SETTINGS[this.difficulty];

    // Leveling Logic (Shared progress or P1 driven? Let's make it shared based on gold)
    if (this.goldCollectedInLevel >= this.levelTarget) {
        this.level++;
        this.goldCollectedInLevel = 0;
        this.levelTarget += LEVEL_TARGET_INCREMENT;
        if (this.difficulty !== Difficulty.EASY) {
             this.currentSpeed = Math.min(this.currentSpeed + 0.05, settings.maxSpeed + 0.2); 
        }
    }

    // Speed Calculation
    let targetSpeed = settings.startSpeed;
    if (this.difficulty !== Difficulty.EASY) {
        targetSpeed = Math.min(settings.startSpeed + (this.level - 1) * 0.04, settings.maxSpeed);
    }
    if (this.currentSpeed < targetSpeed) {
      this.currentSpeed += settings.accel;
    }

    // Update Player 1
    this.updatePlayerPhysics(this.player, inputP1, this.lastJumpInputP1, this.lastPhaseInputP1, deltaTime);
    this.lastJumpInputP1 = inputP1.jump;
    this.lastPhaseInputP1 = !!inputP1.phase;

    // Update Player 2
    if (this.isMultiplayer && this.player2) {
        this.updatePlayerPhysics(this.player2, inputP2, this.lastJumpInputP2, this.lastPhaseInputP2, deltaTime);
        this.lastJumpInputP2 = inputP2.jump;
        this.lastPhaseInputP2 = !!inputP2.phase;
    }

    // World Generation based on leading player
    const leadZ = this.player2 ? Math.max(this.player.position.z, this.player2.position.z) : this.player.position.z;
    const renderDistance = 60;
    if (leadZ + renderDistance > this.lastGenZ) {
      this.generateSlice(this.lastGenZ);
      this.lastGenZ++;
    }

    // Cleanup behind lagging player
    const lagZ = this.player2 ? Math.min(this.player.position.z, this.player2.position.z) : this.player.position.z;
    this.entities = this.entities.filter(e => e.position.z > lagZ - 5);
    
    // Check Collisions
    this.checkCollisions(this.player);
    if (this.isMultiplayer && this.player2) {
        this.checkCollisions(this.player2);
    }

    // Update Particles
    this.updateParticles();
  }

  private updatePlayerPhysics(p: PlayerState, input: InputMap, lastJump: boolean, lastPhase: boolean, deltaTime: number) {
      if (p.lives <= 0) return; // Dead players don't move

      // Abilities
      if (p.phaseTimeRemaining > 0) {
          p.phaseTimeRemaining -= deltaTime;
          if (p.phaseTimeRemaining <= 0) p.phaseActive = false;
      }
      if (p.phaseCooldown > 0) p.phaseCooldown -= deltaTime;

      const phasePressed = input.phase && !lastPhase;
      if (phasePressed && p.phaseCooldown <= 0) {
          p.phaseActive = true;
          p.phaseTimeRemaining = 5000;
          p.phaseCooldown = 10000;
          this.spawnParticles(p.position, '#00FFFF', 20, 1.5);
      }

      // Forward Movement
      p.position.z += this.currentSpeed;
      
      // Lateral Movement
      if (input.left) p.velocity.x -= MOVE_ACCEL_X;
      if (input.right) p.velocity.x += MOVE_ACCEL_X;
      p.velocity.x *= FRICTION_X;
      
      if (p.velocity.x > MAX_SPEED_X) p.velocity.x = MAX_SPEED_X;
      if (p.velocity.x < -MAX_SPEED_X) p.velocity.x = -MAX_SPEED_X;

      p.position.x += p.velocity.x;
      p.tilt = -p.velocity.x * CAMERA_TILT_FACTOR;

      // Walls
      const MAX_X = LANE_WIDTH * 1.8;
      if (p.position.x < -MAX_X) { p.position.x = -MAX_X; p.velocity.x = 0; }
      if (p.position.x > MAX_X) { p.position.x = MAX_X; p.velocity.x = 0; }

      // Jump (Triple and Quadruple Jump support)
      const jumpPressed = input.jump && !lastJump;
      if (jumpPressed) {
          if (!p.isJumping) {
              p.velocity.y = JUMP_FORCE;
              p.isJumping = true;
              p.jumpCount = 1;
              audioService.playJump();
          } else if (p.jumpCount < 4) { // Increased from 2 to 4 for Quadruple Jump
              // Each successive jump is slightly weaker but still significant
              p.velocity.y = JUMP_FORCE * (0.9 - (p.jumpCount * 0.05));
              p.jumpCount++;
              audioService.playJump();
              this.spawnParticles(p.position, '#FFFFFF', 8, 0.5);
          }
      }

      // Gravity
      p.velocity.y -= GRAVITY;
      p.position.y += p.velocity.y;

      if (p.position.y <= 0) {
          p.position.y = 0;
          p.velocity.y = 0;
          p.isJumping = false;
          p.jumpCount = 0;
      }
  }

  private generateSlice(z: number) {
    const settings = DIFFICULTY_SETTINGS[this.difficulty];
    // Always ground
    for (let x = -2; x <= 2; x++) {
       this.entities.push({
         id: `ground_${z}_${x}`,
         type: BlockType.GRASS,
         position: { x: x * LANE_WIDTH, y: -1, z },
         size: 1
       });
    }

    if (z > 10) {
      const lane = Math.floor(Math.random() * 3) - 1; 
      const xPos = lane * LANE_WIDTH;
      const rand = Math.random();
      const obstacleChance = Math.min(settings.obstacleChance + (this.level * 0.01), 0.4);

      if (rand < obstacleChance) {
        let availableObstacles = [BlockType.STONE, BlockType.TNT];
        if (this.level >= 2) availableObstacles.push(BlockType.CREEPER);
        if (this.level >= 3) availableObstacles.push(BlockType.SKELETON);

        const type = availableObstacles[Math.floor(Math.random() * availableObstacles.length)];
        this.entities.push({
          id: `obs_${z}`,
          type,
          position: { x: xPos, y: 0, z },
          size: 1
        });
        
        if (Math.random() > 0.7 && type !== BlockType.CREEPER && type !== BlockType.SKELETON) {
           this.entities.push({
            id: `obs_stack_${z}`,
            type: Math.random() > 0.5 ? BlockType.TNT : BlockType.STONE,
            position: { x: xPos, y: 1, z },
            size: 1
          });
        }
      } else if (rand > 0.5 && rand < 0.8) { 
        this.entities.push({
          id: `gold_${z}`,
          type: BlockType.GOLD,
          position: { x: xPos, y: 0.5 + (Math.sin(z) * 0.2), z },
          size: 0.5,
          rotation: 0
        });
      }
    }
  }

  private checkCollisions(p: PlayerState) {
    if (p.lives <= 0) return;

    const playerBox = {
      x: p.position.x,
      y: p.position.y,
      z: p.position.z,
      w: 0.6, h: 0.9, d: 0.6
    };

    for (const entity of this.entities) {
      if (entity.collected) continue;

      const dx = Math.abs(playerBox.x - entity.position.x);
      const dy = Math.abs(playerBox.y - entity.position.y);
      const dz = Math.abs(playerBox.z - entity.position.z);

      const minDistX = (playerBox.w + entity.size) / 2;
      const minDistY = (playerBox.h + entity.size) / 2;
      const minDistZ = (playerBox.d + entity.size) / 2;

      if (dx < minDistX && dy < minDistY && dz < minDistZ) {
        this.handleCollision(p, entity);
      }
    }
  }

  private handleCollision(p: PlayerState, entity: Entity) {
    if (entity.type === BlockType.GOLD) {
      entity.collected = true;
      p.score += 10;
      this.score += 10; 
      this.goldCollectedInLevel++;
      this.spawnParticles(entity.position, '#FCEE4B', 10);
      audioService.playCollect();
      if (this.score >= 250) this.gameWon = true;

    } else {
      // Obstacle Hit
      if (p.phaseActive) return;

      if (!entity.collected) { 
          p.lives -= 1;
          entity.collected = true; 
          
          if (entity.type === BlockType.TNT) {
              this.shakeIntensity = 0.5;
              this.spawnParticles(entity.position, '#DB3625', 20, 2.0); 
              this.spawnParticles(entity.position, '#FF8C00', 20, 1.8);
              this.spawnParticles(entity.position, '#FFFF00', 15, 1.5);
          } else {
              let color = '#7D7D7D';
              if (entity.type === BlockType.CREEPER) color = '#0DA70D';
              if (entity.type === BlockType.SKELETON) color = '#E3E3E3';
              this.spawnParticles(entity.position, color, 20);
          }
          audioService.playHit();
      }
    }
  }

  private spawnParticles(pos: Point3D, color: string, count: number, speedMult: number = 1.0) {
      for(let i=0; i<count; i++) {
          this.particles.push({
              id: `p_${this.particleIdCounter++}`,
              position: { x: pos.x, y: pos.y, z: pos.z },
              velocity: { 
                  x: (Math.random() - 0.5) * 0.4 * speedMult, 
                  y: (Math.random()) * 0.4 * speedMult, 
                  z: (Math.random() - 0.5) * 0.4 * speedMult
              },
              life: 1.0,
              color: color,
              size: Math.random() * 0.2 + 0.05
          });
      }
  }

  private updateParticles() {
      for (const p of this.particles) {
          p.position.x += p.velocity.x;
          p.position.y += p.velocity.y;
          p.position.z += p.velocity.z;
          p.velocity.y -= 0.02; 
          p.life -= 0.05;
      }
      this.particles = this.particles.filter(p => p.life > 0);
  }

  public getState() {
    const p1Dead = this.player.lives <= 0;
    const p2Dead = this.isMultiplayer && this.player2 ? this.player2.lives <= 0 : true;
    const allDead = this.isMultiplayer ? (p1Dead && p2Dead) : p1Dead;

    return {
      entities: this.entities,
      particles: this.particles,
      player: this.player,
      player2: this.player2,
      score: this.score, 
      lives: this.player.lives,
      speed: this.currentSpeed,
      level: this.level,
      distance: this.player.position.z,
      isPlaying: !allDead && !this.gameWon,
      gameOver: allDead,
      gameWon: this.gameWon,
      goldCollected: this.goldCollectedInLevel,
      levelTarget: this.levelTarget,
      shakeIntensity: this.shakeIntensity,
      isMultiplayer: this.isMultiplayer,
      otherPlayers: [] 
    };
  }
}
