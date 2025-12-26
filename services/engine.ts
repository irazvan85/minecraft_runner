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

export class GameEngine {
  public entities: Entity[] = [];
  public particles: Particle[] = [];
  public player: PlayerState = {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    isJumping: false,
    tilt: 0,
    jumpCount: 0,
    phaseActive: false,
    phaseTimeRemaining: 0,
    phaseCooldown: 0
  };
  
  private lastGenZ = 10;
  private currentSpeed = 0;
  private score = 0;
  private lives = 3;
  private level = 1;
  private difficulty: Difficulty = Difficulty.MEDIUM;
  private particleIdCounter = 0;
  private goldCollectedInLevel = 0;
  private levelTarget = BASE_LEVEL_TARGET;
  private gameWon = false;
  private shakeIntensity = 0;
  private lastJumpInput = false;
  private lastPhaseInput = false;

  constructor() {
    this.reset(Difficulty.MEDIUM);
  }

  reset(difficulty: Difficulty) {
    this.difficulty = difficulty;
    const settings = DIFFICULTY_SETTINGS[difficulty];

    this.player = {
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      isJumping: false,
      tilt: 0,
      jumpCount: 0,
      phaseActive: false,
      phaseTimeRemaining: 0,
      phaseCooldown: 0
    };
    this.entities = [];
    this.particles = [];
    this.currentSpeed = settings.startSpeed;
    this.lastGenZ = 5;
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.goldCollectedInLevel = 0;
    this.levelTarget = BASE_LEVEL_TARGET;
    this.gameWon = false;
    this.shakeIntensity = 0;
    this.lastJumpInput = false;
    this.lastPhaseInput = false;
    
    // Initial ground generation
    for (let z = 0; z < 25; z++) {
      this.generateSlice(z);
    }
  }

  update(input: { left: boolean; right: boolean; jump: boolean; phase?: boolean }, deltaTime: number) {
    if (this.gameWon) return;

    // Decay Shake
    if (this.shakeIntensity > 0.001) {
        this.shakeIntensity *= 0.85; // Decay factor
    } else {
        this.shakeIntensity = 0;
    }

    // Update Abilities
    if (this.player.phaseTimeRemaining > 0) {
        this.player.phaseTimeRemaining -= deltaTime;
        if (this.player.phaseTimeRemaining <= 0) this.player.phaseActive = false;
    }
    if (this.player.phaseCooldown > 0) {
        this.player.phaseCooldown -= deltaTime;
    }

    // Activate Phase
    const phasePressed = input.phase && !this.lastPhaseInput;
    this.lastPhaseInput = !!input.phase;

    if (phasePressed && this.player.phaseCooldown <= 0) {
        this.player.phaseActive = true;
        this.player.phaseTimeRemaining = 5000; // 5 seconds duration
        this.player.phaseCooldown = 10000; // 5s duration + 5s cooldown
        // Visual cue for activation
        this.spawnParticles(this.player.position, '#00FFFF', 20, 1.5);
    }

    const settings = DIFFICULTY_SETTINGS[this.difficulty];

    // 1. Leveling Logic (Gold Based)
    if (this.goldCollectedInLevel >= this.levelTarget) {
        this.level++;
        this.goldCollectedInLevel = 0;
        this.levelTarget += LEVEL_TARGET_INCREMENT;
        
        // Boost speed slightly on level up ONLY if not Easy
        if (this.difficulty !== Difficulty.EASY) {
             this.currentSpeed = Math.min(this.currentSpeed + 0.05, settings.maxSpeed + 0.2); 
        }
    }
    
    // Calculate target speed
    let targetSpeed = settings.startSpeed;
    
    if (this.difficulty !== Difficulty.EASY) {
        // Increase speed with level for Medium/Hard
        targetSpeed = Math.min(
          settings.startSpeed + (this.level - 1) * 0.04, 
          settings.maxSpeed
        );
    }

    // Smooth acceleration to target speed
    if (this.currentSpeed < targetSpeed) {
      this.currentSpeed += settings.accel;
    }

    // 2. Move Player Forward
    this.player.position.z += this.currentSpeed;

    // 3. Lateral Physics (Inertia-based)
    if (input.left) {
        this.player.velocity.x -= MOVE_ACCEL_X;
    }
    if (input.right) {
        this.player.velocity.x += MOVE_ACCEL_X;
    }
    
    // Apply Friction
    this.player.velocity.x *= FRICTION_X;

    // Clamp Velocity
    if (this.player.velocity.x > MAX_SPEED_X) this.player.velocity.x = MAX_SPEED_X;
    if (this.player.velocity.x < -MAX_SPEED_X) this.player.velocity.x = -MAX_SPEED_X;

    // Apply Position
    this.player.position.x += this.player.velocity.x;

    // Tilt Effect
    this.player.tilt = -this.player.velocity.x * CAMERA_TILT_FACTOR;

    // Clamp X Position (Walls)
    const MAX_X = LANE_WIDTH * 1.8;
    if (this.player.position.x < -MAX_X) {
        this.player.position.x = -MAX_X;
        this.player.velocity.x = 0;
    }
    if (this.player.position.x > MAX_X) {
        this.player.position.x = MAX_X;
        this.player.velocity.x = 0;
    }

    // 4. Jump & Gravity (Double Jump Logic)
    const jumpPressed = input.jump && !this.lastJumpInput;
    this.lastJumpInput = input.jump;

    if (jumpPressed) {
        if (!this.player.isJumping) {
            // First Jump
            this.player.velocity.y = JUMP_FORCE;
            this.player.isJumping = true;
            this.player.jumpCount = 1;
            audioService.playJump();
        } else if (this.player.jumpCount < 2) {
            // Double Jump (Always available if count < 2)
            this.player.velocity.y = JUMP_FORCE * 0.9;
            this.player.jumpCount = 2;
            audioService.playJump();
            // Visual feedback: puff
            this.spawnParticles(this.player.position, '#FFFFFF', 8, 0.5);
        }
    }

    this.player.velocity.y -= GRAVITY;
    this.player.position.y += this.player.velocity.y;

    // Ground Collision
    if (this.player.position.y <= 0) {
      this.player.position.y = 0;
      this.player.velocity.y = 0;
      this.player.isJumping = false;
      this.player.jumpCount = 0; // Reset jumps
    }

    // 5. World Generation
    const renderDistance = 25;
    if (this.player.position.z + renderDistance > this.lastGenZ) {
      this.generateSlice(this.lastGenZ);
      this.lastGenZ++;
    }

    // Cleanup behind
    this.entities = this.entities.filter(e => e.position.z > this.player.position.z - 5);
    
    // 6. Collision Detection
    this.checkCollisions();

    // 7. Update Particles
    this.updateParticles();
  }

  private generateSlice(z: number) {
    const settings = DIFFICULTY_SETTINGS[this.difficulty];

    // Always ground
    for (let x = -2; x <= 2; x++) {
       this.entities.push({
         id: `ground_${z}_${x}`,
         type: (x + z) % 2 === 0 ? BlockType.GRASS : BlockType.GRASS,
         position: { x: x * LANE_WIDTH, y: -1, z },
         size: 1
       });
    }

    if (z > 10) {
      const lane = Math.floor(Math.random() * 3) - 1; 
      const xPos = lane * LANE_WIDTH;
      const rand = Math.random();

      // Difficulty-based spawn rate
      const obstacleChance = Math.min(settings.obstacleChance + (this.level * 0.01), 0.4);

      if (rand < obstacleChance) {
        // Obstacle Selection based on Level
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
        
        // Stack logic (less likely for mobs)
        if (Math.random() > 0.7 && type !== BlockType.CREEPER && type !== BlockType.SKELETON) {
           this.entities.push({
            id: `obs_stack_${z}`,
            type: Math.random() > 0.5 ? BlockType.TNT : BlockType.STONE,
            position: { x: xPos, y: 1, z },
            size: 1
          });
        }
      } else if (rand > 0.5 && rand < 0.8) { 
        // Higher chance for gold to help players progress
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

  private checkCollisions() {
    const playerBox = {
      x: this.player.position.x,
      y: this.player.position.y,
      z: this.player.position.z,
      w: 0.6,
      h: 0.9,
      d: 0.6
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
        this.handleCollision(entity);
      }
    }
  }

  private handleCollision(entity: Entity) {
    if (entity.type === BlockType.GOLD) {
      entity.collected = true;
      this.score += 10;
      this.goldCollectedInLevel++;
      this.spawnParticles(entity.position, '#FCEE4B', 10);
      audioService.playCollect();
      
      // WIN CONDITION
      if (this.score >= 250) {
        this.gameWon = true;
      }

    } else {
      // Obstacle Hit
      if (this.player.phaseActive) return; // IGNORE OBSTACLE COLLISIONS IF PHASED

      if (!entity.collected) { // Prevent double hits per frame
          this.lives -= 1;
          entity.collected = true;
          
          if (entity.type === BlockType.TNT) {
              // TNT EXPLOSION
              this.shakeIntensity = 0.5; // High shake amplitude
              
              // Multiple colored bursts for explosion
              this.spawnParticles(entity.position, '#DB3625', 20, 2.0); // Red core
              this.spawnParticles(entity.position, '#FF8C00', 20, 1.8); // Orange mid
              this.spawnParticles(entity.position, '#FFFF00', 15, 1.5); // Yellow outer
              this.spawnParticles(entity.position, '#FFFFFF', 10, 2.5); // White sparks
          } else {
              // Standard obstacle particles
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
      // Move particles
      for (const p of this.particles) {
          p.position.x += p.velocity.x;
          p.position.y += p.velocity.y;
          p.position.z += p.velocity.z;
          p.velocity.y -= 0.02; // Gravity for particles
          p.life -= 0.05;
      }
      // Remove dead particles
      this.particles = this.particles.filter(p => p.life > 0);
  }

  public getState() {
    return {
      entities: this.entities,
      particles: this.particles,
      player: this.player,
      score: this.score,
      lives: this.lives,
      speed: this.currentSpeed,
      level: this.level,
      distance: this.player.position.z,
      isPlaying: this.lives > 0 && !this.gameWon,
      gameOver: this.lives <= 0,
      gameWon: this.gameWon,
      goldCollected: this.goldCollectedInLevel,
      levelTarget: this.levelTarget,
      shakeIntensity: this.shakeIntensity
    };
  }
}