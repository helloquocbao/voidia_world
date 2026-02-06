/**
 * Area of Interest (AOI) Grid System
 * 
 * Divides the game world into cells for efficient entity tracking.
 * Only sends updates to players for entities within their interest area.
 * 
 * This significantly reduces bandwidth and CPU usage when scaling to 100+ players.
 */

// ============================================
// Configuration
// ============================================

export interface AOIConfig {
  /** Cell size in world units (default: 256 pixels) */
  cellSize: number;
  /** Number of cells to include around the center cell (default: 1 = 3x3 grid) */
  viewDistance: number;
  /** Maximum entities per cell before warning */
  maxEntitiesPerCell: number;
}

const DEFAULT_CONFIG: AOIConfig = {
  cellSize: 256,
  viewDistance: 1,
  maxEntitiesPerCell: 50,
};

// ============================================
// Types
// ============================================

export interface Position {
  x: number;
  y: number;
}

export interface CellCoord {
  cx: number;
  cy: number;
}

export interface Entity {
  id: string;
  x: number;
  y: number;
  type: 'player' | 'boss' | 'projectile' | 'effect';
}

// ============================================
// AOI Cell
// ============================================

export class AOICell {
  public readonly cx: number;
  public readonly cy: number;
  public readonly entities: Map<string, Entity> = new Map();

  constructor(cx: number, cy: number) {
    this.cx = cx;
    this.cy = cy;
  }

  public add(entity: Entity): void {
    this.entities.set(entity.id, entity);
  }

  public remove(entityId: string): boolean {
    return this.entities.delete(entityId);
  }

  public has(entityId: string): boolean {
    return this.entities.has(entityId);
  }

  public get(entityId: string): Entity | undefined {
    return this.entities.get(entityId);
  }

  public get size(): number {
    return this.entities.size;
  }

  public getKey(): string {
    return `${this.cx},${this.cy}`;
  }
}

// ============================================
// AOI Grid
// ============================================

export class AOIGrid {
  private cells: Map<string, AOICell> = new Map();
  private entityCells: Map<string, CellCoord> = new Map();
  private config: AOIConfig;
  private observers: Map<string, CellCoord> = new Map(); // Player positions for view calculation
  
  // Callback hooks for entity movement
  public onEntityEnterCell?: (entityId: string, cell: CellCoord, observers: string[]) => void;
  public onEntityLeaveCell?: (entityId: string, cell: CellCoord, observers: string[]) => void;

  constructor(config: Partial<AOIConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==================== Cell Management ====================

  /**
   * Get cell coordinate from world position
   */
  public getCellCoord(x: number, y: number): CellCoord {
    return {
      cx: Math.floor(x / this.config.cellSize),
      cy: Math.floor(y / this.config.cellSize),
    };
  }

  /**
   * Get cell key from coordinates
   */
  private getCellKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  /**
   * Get or create a cell
   */
  private getOrCreateCell(cx: number, cy: number): AOICell {
    const key = this.getCellKey(cx, cy);
    let cell = this.cells.get(key);
    
    if (!cell) {
      cell = new AOICell(cx, cy);
      this.cells.set(key, cell);
    }
    
    return cell;
  }

  /**
   * Get cell if it exists
   */
  private getCell(cx: number, cy: number): AOICell | undefined {
    return this.cells.get(this.getCellKey(cx, cy));
  }

  // ==================== Entity Management ====================

  /**
   * Add an entity to the grid
   */
  public addEntity(entity: Entity): void {
    const coord = this.getCellCoord(entity.x, entity.y);
    const cell = this.getOrCreateCell(coord.cx, coord.cy);
    
    cell.add(entity);
    this.entityCells.set(entity.id, coord);

    // Notify observers
    if (this.onEntityEnterCell) {
      const observers = this.getObserversForCell(coord);
      if (observers.length > 0) {
        this.onEntityEnterCell(entity.id, coord, observers);
      }
    }

    // Warn if cell is getting crowded
    if (cell.size > this.config.maxEntitiesPerCell) {
      console.warn(`[AOI] Cell (${coord.cx}, ${coord.cy}) has ${cell.size} entities`);
    }
  }

  /**
   * Remove an entity from the grid
   */
  public removeEntity(entityId: string): boolean {
    const coord = this.entityCells.get(entityId);
    if (!coord) return false;

    const cell = this.getCell(coord.cx, coord.cy);
    if (cell) {
      // Notify observers before removal
      if (this.onEntityLeaveCell) {
        const observers = this.getObserversForCell(coord);
        if (observers.length > 0) {
          this.onEntityLeaveCell(entityId, coord, observers);
        }
      }

      cell.remove(entityId);
      
      // Clean up empty cells
      if (cell.size === 0) {
        this.cells.delete(cell.getKey());
      }
    }

    this.entityCells.delete(entityId);
    this.observers.delete(entityId);
    return true;
  }

  /**
   * Update entity position
   * Returns true if the entity changed cells
   */
  public updateEntityPosition(entityId: string, x: number, y: number): boolean {
    const oldCoord = this.entityCells.get(entityId);
    if (!oldCoord) return false;

    const newCoord = this.getCellCoord(x, y);
    
    // Check if cell changed
    if (oldCoord.cx === newCoord.cx && oldCoord.cy === newCoord.cy) {
      // Same cell, just update position in existing entity
      const cell = this.getCell(oldCoord.cx, oldCoord.cy);
      if (cell) {
        const entity = cell.get(entityId);
        if (entity) {
          entity.x = x;
          entity.y = y;
        }
      }
      return false;
    }

    // Cell changed - remove from old, add to new
    const oldCell = this.getCell(oldCoord.cx, oldCoord.cy);
    const entity = oldCell?.get(entityId);
    
    if (!entity) return false;

    // Update position
    entity.x = x;
    entity.y = y;

    // Notify observers of leave (before move)
    if (this.onEntityLeaveCell) {
      const leavingObservers = this.getObserversForCell(oldCoord);
      // Only notify observers who won't see the new position
      const newObservers = new Set(this.getObserversForCell(newCoord));
      const leavingOnly = leavingObservers.filter(id => !newObservers.has(id));
      if (leavingOnly.length > 0) {
        this.onEntityLeaveCell(entityId, oldCoord, leavingOnly);
      }
    }

    // Remove from old cell
    oldCell!.remove(entityId);
    if (oldCell!.size === 0) {
      this.cells.delete(oldCell!.getKey());
    }

    // Add to new cell
    const newCell = this.getOrCreateCell(newCoord.cx, newCoord.cy);
    newCell.add(entity);
    this.entityCells.set(entityId, newCoord);

    // Notify observers of enter (after move)
    if (this.onEntityEnterCell) {
      const enteringObservers = this.getObserversForCell(newCoord);
      const oldObservers = new Set(this.getObserversForCell(oldCoord));
      const enteringOnly = enteringObservers.filter(id => !oldObservers.has(id));
      if (enteringOnly.length > 0) {
        this.onEntityEnterCell(entityId, newCoord, enteringOnly);
      }
    }

    return true;
  }

  // ==================== Observer Management ====================

  /**
   * Register a player as an observer at their position
   */
  public setObserver(playerId: string, x: number, y: number): void {
    const coord = this.getCellCoord(x, y);
    this.observers.set(playerId, coord);
  }

  /**
   * Update observer position
   * Returns cells that entered/left their view
   */
  public updateObserverPosition(playerId: string, x: number, y: number): {
    entered: CellCoord[];
    left: CellCoord[];
  } {
    const oldCoord = this.observers.get(playerId);
    const newCoord = this.getCellCoord(x, y);
    
    this.observers.set(playerId, newCoord);

    if (!oldCoord || (oldCoord.cx === newCoord.cx && oldCoord.cy === newCoord.cy)) {
      return { entered: [], left: [] };
    }

    // Calculate cells in old and new view
    const oldCells = this.getCellsInView(oldCoord.cx, oldCoord.cy);
    const newCells = this.getCellsInView(newCoord.cx, newCoord.cy);

    const oldSet = new Set(oldCells.map(c => this.getCellKey(c.cx, c.cy)));
    const newSet = new Set(newCells.map(c => this.getCellKey(c.cx, c.cy)));

    const entered = newCells.filter(c => !oldSet.has(this.getCellKey(c.cx, c.cy)));
    const left = oldCells.filter(c => !newSet.has(this.getCellKey(c.cx, c.cy)));

    return { entered, left };
  }

  /**
   * Get all observers that can see a cell
   */
  private getObserversForCell(cell: CellCoord): string[] {
    const result: string[] = [];
    
    for (const [playerId, observerCoord] of this.observers) {
      if (this.isCellInView(observerCoord, cell)) {
        result.push(playerId);
      }
    }
    
    return result;
  }

  /**
   * Check if a cell is within an observer's view
   */
  private isCellInView(observer: CellCoord, cell: CellCoord): boolean {
    const dx = Math.abs(cell.cx - observer.cx);
    const dy = Math.abs(cell.cy - observer.cy);
    return dx <= this.config.viewDistance && dy <= this.config.viewDistance;
  }

  /**
   * Get all cells in an observer's view
   */
  public getCellsInView(cx: number, cy: number): CellCoord[] {
    const cells: CellCoord[] = [];
    const d = this.config.viewDistance;
    
    for (let dx = -d; dx <= d; dx++) {
      for (let dy = -d; dy <= d; dy++) {
        cells.push({ cx: cx + dx, cy: cy + dy });
      }
    }
    
    return cells;
  }

  // ==================== Query Methods ====================

  /**
   * Get all entities visible to an observer
   */
  public getEntitiesInView(playerId: string): Entity[] {
    const observerCoord = this.observers.get(playerId);
    if (!observerCoord) return [];

    const entities: Entity[] = [];
    const viewCells = this.getCellsInView(observerCoord.cx, observerCoord.cy);

    for (const cellCoord of viewCells) {
      const cell = this.getCell(cellCoord.cx, cellCoord.cy);
      if (cell) {
        for (const entity of cell.entities.values()) {
          entities.push(entity);
        }
      }
    }

    return entities;
  }

  /**
   * Get entities in a specific cell
   */
  public getEntitiesInCell(cx: number, cy: number): Entity[] {
    const cell = this.getCell(cx, cy);
    return cell ? Array.from(cell.entities.values()) : [];
  }

  /**
   * Get all entities in the grid
   */
  public getAllEntities(): Entity[] {
    const entities: Entity[] = [];
    for (const cell of this.cells.values()) {
      for (const entity of cell.entities.values()) {
        entities.push(entity);
      }
    }
    return entities;
  }

  /**
   * Get entities within a radius of a point
   */
  public getEntitiesInRadius(x: number, y: number, radius: number): Entity[] {
    const center = this.getCellCoord(x, y);
    const cellRadius = Math.ceil(radius / this.config.cellSize);
    const radiusSq = radius * radius;
    const entities: Entity[] = [];

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dy = -cellRadius; dy <= cellRadius; dy++) {
        const cell = this.getCell(center.cx + dx, center.cy + dy);
        if (cell) {
          for (const entity of cell.entities.values()) {
            const distSq = (entity.x - x) ** 2 + (entity.y - y) ** 2;
            if (distSq <= radiusSq) {
              entities.push(entity);
            }
          }
        }
      }
    }

    return entities;
  }

  /**
   * Get all players that need to receive updates about an entity
   */
  public getReceiversForEntity(entityId: string): string[] {
    const coord = this.entityCells.get(entityId);
    if (!coord) return [];
    return this.getObserversForCell(coord);
  }

  // ==================== Statistics ====================

  /**
   * Get grid statistics
   */
  public getStats(): {
    totalCells: number;
    totalEntities: number;
    totalObservers: number;
    avgEntitiesPerCell: number;
    maxEntitiesInCell: number;
  } {
    let totalEntities = 0;
    let maxEntitiesInCell = 0;

    for (const cell of this.cells.values()) {
      totalEntities += cell.size;
      maxEntitiesInCell = Math.max(maxEntitiesInCell, cell.size);
    }

    return {
      totalCells: this.cells.size,
      totalEntities,
      totalObservers: this.observers.size,
      avgEntitiesPerCell: this.cells.size > 0 ? totalEntities / this.cells.size : 0,
      maxEntitiesInCell,
    };
  }

  /**
   * Clear all entities and cells
   */
  public clear(): void {
    this.cells.clear();
    this.entityCells.clear();
    this.observers.clear();
  }
}

// ============================================
// Export singleton factory
// ============================================

export function createAOIGrid(config?: Partial<AOIConfig>): AOIGrid {
  return new AOIGrid(config);
}
