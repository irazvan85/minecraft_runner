import { BlockType, Entity, PlayerState, Point3D } from '../types';
import { 
  GRAVITY, 
  JUMP_FORCE, 
  RUN_SPEED_BASE, 
  RUN_SPEED_MAX, 
  SPEED_INCREMENT,
  LEVEL_DISTANCE,
  ACCELERATION, 
  LANE_WIDTH 
} from '../constants';

export class GameEngine {
  public entities: Entity[] = [];
  public player: PlayerState = {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    isJumping: false
  };
  
  private lastGenZ = 10;
  private currentSpeed = RUN_SPEED_BASE;
  private score = 0;
  private lives = 3;
  private level = 1;

  constructor() {
    this.reset();
  }

  reset() {
    this.player = {
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      isJumping: false
    };
    this.entities = [];
    this.currentSpeed = RUN_SPEED_BASE;
    this.lastGenZ = 5;
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    
    // Initial ground generation
    for (let z = 0; z < 20; z++) {
      this.generateSlice(z);
    }
  }

  update(input: { left: boolean; right: boolean; jump: boolean }, deltaTime: number) {
    // 1. Calculate Level & Speed
    // Level up every LEVEL_DISTANCE units
    this.level = Math.floor(Math.max(0, this.player.position.z) / LEVEL_DISTANCE) + 1;
    
    const targetSpeed = Math.min(
      RUN_SPEED_BASE + (this.level - 1) * SPEED_INCREMENT, 
      RUN_SPEED_MAX
    );

    // Smooth acceleration towards target speed
    if (this.currentSpeed < targetSpeed) {
      this.currentSpeed += ACCELERATION;
    }

    // 2. Move Player Forward
    this.player.position.z += this.currentSpeed;

    // 3. Lateral Movement (Strafe)
    // Smoothly interpolate towards target lane or just move raw
    const moveSpeed = 0.15;
    if (input.left) this.player.position.x -= moveSpeed;
    if (input.right) this.player.position.x += moveSpeed;

    // Clamp X
    if (this.player.position.x < -LANE_WIDTH * 1.5) this.player.position.x = -LANE_WIDTH * 1.5;
    if (this.player.position.x > LANE_WIDTH * 1.5) this.player.position.x = LANE_WIDTH * 1.5;

    // 4. Jump & Gravity
    if (input.jump && !this.player.isJumping) {
      this.player.velocity.y = JUMP_FORCE;
      this.player.isJumping = true;
    }

    this.player.velocity.y -= GRAVITY;
    this.player.position.y += this.player.velocity.y;

    // Ground Collision (Simple floor at y=0)
    if (this.player.position.y <= 0) {
      this.player.position.y = 0;
      this.player.velocity.y = 0;
      this.player.isJumping = false;
    }

    // 5. World Generation
    // Generate ahead
    const renderDistance = 25;
    if (this.player.position.z + renderDistance > this.lastGenZ) {
      this.generateSlice(this.lastGenZ);
      this.lastGenZ++;
    }

    // Cleanup behind
    this.entities = this.entities.filter(e => e.position.z > this.player.position.z - 5);

    // 6. Collision Detection
    this.checkCollisions();
  }

  private generateSlice(z: number) {
    // Always ground
    for (let x = -2; x <= 2; x++) {
       this.entities.push({
         id: `ground_${z}_${x}`,
         type: (x + z) % 2 === 0 ? BlockType.GRASS : BlockType.GRASS, // Pattern
         position: { x: x * LANE_WIDTH, y: -1, z },
         size: 1
       });
    }

    // Random Obstacles & Collectibles (only after z > 10)
    if (z > 10) {
      const lane = Math.floor(Math.random() * 3) - 1; // -1, 0, 1
      const xPos = lane * LANE_WIDTH;
      const rand = Math.random();

      // Difficulty scaler: slightly more obstacles as level increases
      const obstacleChance = Math.min(0.15 + (this.level * 0.01), 0.3);

      if (rand < obstacleChance) {
        // Obstacle: TNT or Stone
        const type = Math.random() > 0.5 ? BlockType.TNT : BlockType.STONE;
        this.entities.push({
          id: `obs_${z}`,
          type,
          position: { x: xPos, y: 0, z },
          size: 1
        });
        
        // Sometimes stack them
        if (Math.random() > 0.7) {
           this.entities.push({
            id: `obs_stack_${z}`,
            type,
            position: { x: xPos, y: 1, z },
            size: 1
          });
        }
      } else if (rand > 0.6 && rand < 0.8) {
        // Collectible: Gold
        // Often in a row
        this.entities.push({
          id: `gold_${z}`,
          type: BlockType.GOLD,
          position: { x: xPos, y: 0.5 + (Math.sin(z) * 0.2), z }, // Float slightly
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

      // Simple AABB
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
    } else if (entity.type === BlockType.TNT || entity.type === BlockType.STONE || entity.type === BlockType.LAVA) {
      // Hit obstacle
      this.lives -= 1;
      entity.collected = true; // remove entity to prevent multi-hit
    }
  }

  public getState() {
    return {
      entities: this.entities,
      player: this.player,
      score: this.score,
      lives: this.lives,
      speed: this.currentSpeed,
      level: this.level,
      distance: this.player.position.z,
      isPlaying: this.lives > 0,
      gameOver: this.lives <= 0
    };
  }
}