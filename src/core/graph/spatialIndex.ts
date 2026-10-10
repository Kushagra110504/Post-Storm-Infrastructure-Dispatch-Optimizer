import { CityEdge, CityGraph, CityNode } from '../model/schema';

/** Distance in meters squared from a point (px, py) to a line segment (ax, ay)-(bx, by). */
function distToSegmentSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const dpx = px - ax;
    const dpy = py - ay;
    return dpx * dpx + dpy * dpy;
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  const ex = px - projX;
  const ey = py - projY;
  return ex * ex + ey * ey;
}

/**
 * A spatial grid index for fast nearest-node and nearest-edge lookups in O(1) average case.
 * Viewport is divided into a uniform grid of cells.
 */
export class SpatialIndex {
  private readonly nodeGrid: Map<number, string[]>;
  private readonly edgeGrid: Map<number, string[]>;
  private readonly cellW: number;
  private readonly cellH: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly nodes: Record<string, CityNode>;
  private readonly edges: Map<string, CityEdge>;
  private readonly edgePolylines: Map<string, Array<{ x: number; y: number }>>;
  public readonly maxX: number;
  public readonly maxY: number;

  constructor(graph: CityGraph, gridSize = 50) {
    this.nodes = graph.nodes;
    this.maxX = graph.bbox.maxX;
    this.maxY = graph.bbox.maxY;
    this.cols = gridSize;
    this.rows = gridSize;
    this.cellW = Math.max(this.maxX / gridSize, 1);
    this.cellH = Math.max(this.maxY / gridSize, 1);
    this.nodeGrid = new Map();
    this.edgeGrid = new Map();
    this.edges = new Map();
    this.edgePolylines = new Map();

    // 1. Index nodes
    for (const [id, node] of Object.entries(graph.nodes)) {
      const key = this.cellKey(node.x, node.y);
      let cell = this.nodeGrid.get(key);
      if (!cell) {
        cell = [];
        this.nodeGrid.set(key, cell);
      }
      cell.push(id);
    }

    // 2. Pre-project edge polylines and index edges into grid
    const toRad = Math.PI / 180;
    const lat0 = ((graph.bbox.minLat + graph.bbox.maxLat) / 2) * toRad;
    const earthR = 6371000;

    for (const edge of graph.edges) {
      this.edges.set(edge.id, edge);

      // Convert geometry [lat, lon] to [x, y]
      const pts: Array<{ x: number; y: number }> = [];
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      if (edge.geometry.length > 0) {
        for (const [lat, lon] of edge.geometry) {
          const x = (lon - graph.bbox.minLon) * toRad * Math.cos(lat0) * earthR;
          const y = (graph.bbox.maxLat - lat) * toRad * earthR;
          pts.push({ x, y });
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      } else {
        const fn = graph.nodes[edge.from];
        const tn = graph.nodes[edge.to];
        if (fn && tn) {
          pts.push({ x: fn.x, y: fn.y }, { x: tn.x, y: tn.y });
          minX = Math.min(fn.x, tn.x);
          maxX = Math.max(fn.x, tn.x);
          minY = Math.min(fn.y, tn.y);
          maxY = Math.max(fn.y, tn.y);
        }
      }

      this.edgePolylines.set(edge.id, pts);

      if (minX !== Infinity) {
        const minCol = Math.max(0, Math.min(this.cols - 1, Math.floor(minX / this.cellW)));
        const maxCol = Math.max(0, Math.min(this.cols - 1, Math.floor(maxX / this.cellW)));
        const minRow = Math.max(0, Math.min(this.rows - 1, Math.floor(minY / this.cellH)));
        const maxRow = Math.max(0, Math.min(this.rows - 1, Math.floor(maxY / this.cellH)));

        for (let r = minRow; r <= maxRow; r++) {
          for (let c = minCol; c <= maxCol; c++) {
            const cellKey = r * this.cols + c;
            let cell = this.edgeGrid.get(cellKey);
            if (!cell) {
              cell = [];
              this.edgeGrid.set(cellKey, cell);
            }
            cell.push(edge.id);
          }
        }
      }
    }
  }

  private cellKey(x: number, y: number): number {
    const col = Math.min(Math.max(Math.floor(x / this.cellW), 0), this.cols - 1);
    const row = Math.min(Math.max(Math.floor(y / this.cellH), 0), this.rows - 1);
    return row * this.cols + col;
  }

  /** Returns the id of the graph node nearest to screen point (x, y) in projected metres. */
  nearestNode(x: number, y: number): string | null {
    let bestId: string | null = null;
    let bestDist = Infinity;

    const col = Math.min(Math.max(Math.floor(x / this.cellW), 0), this.cols - 1);
    const row = Math.min(Math.max(Math.floor(y / this.cellH), 0), this.rows - 1);

    for (let radius = 0; radius <= Math.max(this.cols, this.rows); radius++) {
      const rMin = Math.max(row - radius, 0);
      const rMax = Math.min(row + radius, this.rows - 1);
      const cMin = Math.max(col - radius, 0);
      const cMax = Math.min(col + radius, this.cols - 1);

      for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
          if (radius > 0 && r > rMin && r < rMax && c > cMin && c < cMax) continue;

          const cell = this.nodeGrid.get(r * this.cols + c);
          if (!cell) continue;

          for (const id of cell) {
            const node = this.nodes[id];
            if (!node) continue;
            const dx = node.x - x;
            const dy = node.y - y;
            const dist = dx * dx + dy * dy;
            if (dist < bestDist) {
              bestDist = dist;
              bestId = id;
            }
          }
        }
      }

      if (bestId !== null && radius > 0) {
        const searchRadius = Math.min(this.cellW, this.cellH) * radius;
        if (searchRadius * searchRadius > bestDist) break;
      }
    }

    return bestId;
  }

  /** Returns all node ids within `radiusMetres` of (x, y). */
  nodesWithinRadius(x: number, y: number, radiusMetres: number): string[] {
    const r2 = radiusMetres * radiusMetres;
    const colsSpan = Math.ceil(radiusMetres / this.cellW);
    const rowsSpan = Math.ceil(radiusMetres / this.cellH);
    const col = Math.min(Math.max(Math.floor(x / this.cellW), 0), this.cols - 1);
    const row = Math.min(Math.max(Math.floor(y / this.cellH), 0), this.rows - 1);
    const result: string[] = [];

    for (let r = Math.max(row - rowsSpan, 0); r <= Math.min(row + rowsSpan, this.rows - 1); r++) {
      for (let c = Math.max(col - colsSpan, 0); c <= Math.min(col + colsSpan, this.cols - 1); c++) {
        const cell = this.nodeGrid.get(r * this.cols + c);
        if (!cell) continue;
        for (const id of cell) {
          const node = this.nodes[id];
          if (!node) continue;
          const dx = node.x - x;
          const dy = node.y - y;
          if (dx * dx + dy * dy <= r2) result.push(id);
        }
      }
    }

    return result;
  }

  /** Returns the CityEdge nearest to point (x, y) if within `maxDistanceMetres`. */
  nearestEdge(x: number, y: number, maxDistanceMetres = 60): CityEdge | null {
    const r2 = maxDistanceMetres * maxDistanceMetres;
    const colsSpan = Math.ceil(maxDistanceMetres / this.cellW);
    const rowsSpan = Math.ceil(maxDistanceMetres / this.cellH);
    const col = Math.min(Math.max(Math.floor(x / this.cellW), 0), this.cols - 1);
    const row = Math.min(Math.max(Math.floor(y / this.cellH), 0), this.rows - 1);

    const checkedEdges = new Set<string>();
    let bestEdge: CityEdge | null = null;
    let bestDistSq = r2;

    for (let r = Math.max(row - rowsSpan, 0); r <= Math.min(row + rowsSpan, this.rows - 1); r++) {
      for (let c = Math.max(col - colsSpan, 0); c <= Math.min(col + colsSpan, this.cols - 1); c++) {
        const cell = this.edgeGrid.get(r * this.cols + c);
        if (!cell) continue;

        for (const edgeId of cell) {
          if (checkedEdges.has(edgeId)) continue;
          checkedEdges.add(edgeId);

          const edge = this.edges.get(edgeId);
          const pts = this.edgePolylines.get(edgeId);
          if (!edge || !pts || pts.length < 2) continue;

          for (let i = 0; i < pts.length - 1; i++) {
            const p1 = pts[i];
            const p2 = pts[i + 1];
            if (!p1 || !p2) continue;
            const dSq = distToSegmentSq(x, y, p1.x, p1.y, p2.x, p2.y);
            if (dSq < bestDistSq) {
              bestDistSq = dSq;
              bestEdge = edge;
            }
          }
        }
      }
    }

    return bestEdge;
  }
}
