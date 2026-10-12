import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { CityGraph, CityEdge, Place, PlaceType, Incident, Team } from '../core/model/schema';
import { SpatialIndex } from '../core/graph/spatialIndex';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ViewTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
}

export interface MapRendererProps {
  graph: CityGraph;
  places: Place[];
  spatialIndex: SpatialIndex;
  incidents?: Incident[];
  teams?: Team[];
  blockedEdgeIds?: Set<string>;
  selectedNodeId?: string | null;
  selectedEdgeId?: string | null;
  selectedIncidentId?: string | null;
  selectedTeamId?: string | null;
  filterPlaceType?: PlaceType | 'all';
  onNodeClick?: (nodeId: string) => void;
  onEdgeClick?: (edge: CityEdge) => void;
  onEdgeToggle?: (edgeId: string) => void;
  onPlaceClick?: (place: Place) => void;
  onIncidentClick?: (incident: Incident) => void;
  onTeamClick?: (team: Team) => void;
  width?: number;
  height?: number;
}

// ─── Styling & LOD Configuration ────────────────────────────────────────────

const HIGHWAY_PRIORITY: Record<string, number> = {
  motorway: 0,
  trunk: 0,
  primary: 1,
  secondary: 2,
  tertiary: 3,
  residential: 4,
  unclassified: 4,
  service: 4,
};

function isEdgeVisibleAtScale(edge: CityEdge, scale: number): boolean {
  const priority = HIGHWAY_PRIORITY[edge.highwayType ?? 'unclassified'] ?? 4;
  if (scale < 0.22) return priority <= 1; // Major arterials only
  if (scale < 0.5) return priority <= 2;  // Up to secondary
  if (scale < 1.1) return priority <= 3;  // Up to tertiary
  return true;                            // All roads
}

const HIGHWAY_STYLE: Record<string, { color: string; width: number; zIndex: number }> = {
  motorway:    { color: '#f59e0b', width: 3.5, zIndex: 10 },
  trunk:       { color: '#f59e0b', width: 3.2, zIndex: 9 },
  primary:     { color: '#3b82f6', width: 2.4, zIndex: 8 },
  secondary:   { color: '#818cf8', width: 1.8, zIndex: 7 },
  tertiary:    { color: '#64748b', width: 1.2, zIndex: 6 },
  residential: { color: '#334155', width: 0.9, zIndex: 5 },
  unclassified:{ color: '#334155', width: 0.9, zIndex: 4 },
  service:     { color: '#1e293b', width: 0.7, zIndex: 3 },
};

export const PLACE_CONFIG: Record<PlaceType, { icon: string; color: string; label: string }> = {
  hospital:         { icon: '🏥', color: '#10b981', label: 'Hospital' },
  water_facility:   { icon: '💧', color: '#06b6d4', label: 'Water Facility' },
  power_substation: { icon: '⚡', color: '#f59e0b', label: 'Power Substation' },
  telecom_mast:     { icon: '📡', color: '#8b5cf6', label: 'Telecom Mast' },
  fire_station:     { icon: '🚒', color: '#ef4444', label: 'Fire Station' },
  police:           { icon: '🚓', color: '#3b82f6', label: 'Police HQ' },
  townhall:         { icon: '🏛️', color: '#94a3b8', label: 'Town Hall' },
};

export const INCIDENT_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  power: { icon: '⚡', color: '#f59e0b', label: 'Power Outage' },
  water: { icon: '💧', color: '#06b6d4', label: 'Water Rupture' },
  comms: { icon: '📡', color: '#8b5cf6', label: 'Comms Failure' },
  road:  { icon: '🚧', color: '#ef4444', label: 'Road Blockage' },
};

// ─── MapRenderer Component ──────────────────────────────────────────────────

export const MapRenderer: React.FC<MapRendererProps> = ({
  graph,
  places,
  spatialIndex,
  incidents = [],
  teams = [],
  blockedEdgeIds = new Set<string>(),
  selectedNodeId = null,
  selectedEdgeId = null,
  selectedIncidentId = null,
  selectedTeamId = null,
  filterPlaceType = 'all',
  onNodeClick,
  onEdgeClick,
  onEdgeToggle,
  onPlaceClick,
  onIncidentClick,
  onTeamClick,
  width = 900,
  height = 650,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  // Initial transform: fit the full city bbox into the view with comfortable padding
  const [view, setView] = useState<ViewTransform>(() => {
    const scaleX = (width * 0.94) / Math.max(graph.bbox.maxX, 1);
    const scaleY = (height * 0.94) / Math.max(graph.bbox.maxY, 1);
    const scale = Math.min(scaleX, scaleY);
    const offsetX = (width - graph.bbox.maxX * scale) / 2;
    const offsetY = (height - graph.bbox.maxY * scale) / 2;
    return { offsetX, offsetY, scale };
  });

  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null);
  const [hoveredIncidentId, setHoveredIncidentId] = useState<string | null>(null);
  const [hoveredTeamId, setHoveredTeamId] = useState<string | null>(null);

  const isPanning = useRef(false);
  const hasMovedWhilePanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  // ── Pan Handlers ──────────────────────────────────────────────────────────

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isPanning.current = true;
    hasMovedWhilePanning.current = false;
    panStart.current = { x: e.clientX, y: e.clientY, ox: view.offsetX, oy: view.offsetY };
  }, [view]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - panStart.current.x;
    const dy = e.clientY - panStart.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasMovedWhilePanning.current = true;
    }
    setView(v => ({ ...v, offsetX: panStart.current.ox + dx, offsetY: panStart.current.oy + dy }));
  }, []);

  const onMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  // ── Zoom Handler (Centered on cursor) ─────────────────────────────────────

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const zoomFactor = e.deltaY < 0 ? 1.18 : 1 / 1.18;

    setView(v => {
      const newScale = Math.min(Math.max(v.scale * zoomFactor, 0.08), 15);
      return {
        scale: newScale,
        offsetX: cx - (cx - v.offsetX) * (newScale / v.scale),
        offsetY: cy - (cy - v.offsetY) * (newScale / v.scale),
      };
    });
  }, []);

  // ── Keyboard Navigation ───────────────────────────────────────────────────

  const resetView = useCallback(() => {
    const scaleX = (width * 0.94) / Math.max(graph.bbox.maxX, 1);
    const scaleY = (height * 0.94) / Math.max(graph.bbox.maxY, 1);
    const scale = Math.min(scaleX, scaleY);
    setView({
      scale,
      offsetX: (width - graph.bbox.maxX * scale) / 2,
      offsetY: (height - graph.bbox.maxY * scale) / 2,
    });
  }, [width, height, graph.bbox.maxX, graph.bbox.maxY]);

  const zoomIn = useCallback(() => {
    setView(v => {
      const newScale = Math.min(v.scale * 1.25, 15);
      const cx = width / 2;
      const cy = height / 2;
      return {
        scale: newScale,
        offsetX: cx - (cx - v.offsetX) * (newScale / v.scale),
        offsetY: cy - (cy - v.offsetY) * (newScale / v.scale),
      };
    });
  }, [width, height]);

  const zoomOut = useCallback(() => {
    setView(v => {
      const newScale = Math.max(v.scale / 1.25, 0.08);
      const cx = width / 2;
      const cy = height / 2;
      return {
        scale: newScale,
        offsetX: cx - (cx - v.offsetX) * (newScale / v.scale),
        offsetY: cy - (cy - v.offsetY) * (newScale / v.scale),
      };
    });
  }, [width, height]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      const PAN_STEP = 50;
      switch (e.key) {
        case 'ArrowLeft':
          setView(v => ({ ...v, offsetX: v.offsetX + PAN_STEP }));
          break;
        case 'ArrowRight':
          setView(v => ({ ...v, offsetX: v.offsetX - PAN_STEP }));
          break;
        case 'ArrowUp':
          setView(v => ({ ...v, offsetY: v.offsetY + PAN_STEP }));
          break;
        case 'ArrowDown':
          setView(v => ({ ...v, offsetY: v.offsetY - PAN_STEP }));
          break;
        case '+':
        case '=':
          zoomIn();
          break;
        case '-':
        case '_':
          zoomOut();
          break;
        case '0':
          resetView();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [zoomIn, zoomOut, resetView]);

  // ── Canvas Click: Picking nearest node or nearest road ────────────────────

  const onSvgClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (hasMovedWhilePanning.current) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const mx = (sx - view.offsetX) / view.scale;
    const my = (sy - view.offsetY) / view.scale;

    // Check if clicked near an edge (within 28 screen pixels)
    const pickRadiusMetres = Math.max(28 / view.scale, 15);
    const edge = spatialIndex.nearestEdge(mx, my, pickRadiusMetres);
    if (edge) {
      onEdgeClick?.(edge);
      onEdgeToggle?.(edge.id);
      return;
    }

    // Pick nearest node (within 35 screen pixels)
    const nodePickRadiusMetres = Math.max(35 / view.scale, 20);
    const nearestId = spatialIndex.nearestNode(mx, my);
    if (nearestId) {
      const node = graph.nodes[nearestId];
      if (node) {
        const dx = node.x - mx;
        const dy = node.y - my;
        if (dx * dx + dy * dy <= nodePickRadiusMetres * nodePickRadiusMetres) {
          onNodeClick?.(nearestId);
        }
      }
    }
  }, [view, spatialIndex, graph.nodes, onEdgeClick, onEdgeToggle, onNodeClick]);

  // ── Pre-projected Edge Path Generator in Meters ───────────────────────────

  const toRad = Math.PI / 180;
  const lat0 = ((graph.bbox.minLat + graph.bbox.maxLat) / 2) * toRad;
  const earthR = 6371000;

  const edgePaths = useMemo(() => {
    return graph.edges.map(edge => {
      let d = '';
      let midX = 0;
      let midY = 0;

      if (edge.geometry.length >= 2) {
        const pts: Array<{ x: number; y: number }> = edge.geometry.map(([lat, lon]) => {
          const x = (lon - graph.bbox.minLon) * toRad * Math.cos(lat0) * earthR;
          const y = (graph.bbox.maxLat - lat) * toRad * earthR;
          return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
        });

        d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
        const midIdx = Math.floor(pts.length / 2);
        const midPt = pts[midIdx] ?? pts[0];
        if (midPt) {
          midX = midPt.x;
          midY = midPt.y;
        }
      } else {
        const fn = graph.nodes[edge.from];
        const tn = graph.nodes[edge.to];
        if (fn && tn) {
          d = `M${fn.x},${fn.y} L${tn.x},${tn.y}`;
          midX = (fn.x + tn.x) / 2;
          midY = (fn.y + tn.y) / 2;
        }
      }

      return {
        edge,
        d,
        midX,
        midY,
      };
    });
  }, [graph.edges, graph.nodes, graph.bbox, lat0, toRad, earthR]);

  // ── Render Roads with LOD and interactive hit target ───────────────────────

  const renderedRoads = useMemo(() => {
    return edgePaths.map(({ edge, d, midX, midY }) => {
      if (!d) return null;
      const isBlocked = blockedEdgeIds.has(edge.id);
      const isSelected = selectedEdgeId === edge.id;
      const isHovered = hoveredEdgeId === edge.id;

      if (!isBlocked && !isSelected && !isEdgeVisibleAtScale(edge, view.scale)) {
        return null;
      }

      const defaultStyle = HIGHWAY_STYLE[edge.highwayType ?? 'unclassified'] ?? HIGHWAY_STYLE.unclassified!;
      let strokeColor = defaultStyle.color;
      let strokeWidth = defaultStyle.width;
      let strokeOpacity = 0.8;

      if (isBlocked) {
        strokeColor = '#ef4444';
        strokeWidth = 3.5;
        strokeOpacity = 1.0;
      } else if (isSelected) {
        strokeColor = '#38bdf8';
        strokeWidth = 3.5;
        strokeOpacity = 1.0;
      } else if (isHovered) {
        strokeColor = '#facc15';
        strokeOpacity = 1.0;
      }

      return (
        <g key={edge.id} id={`edge-${edge.id}`}>
          {/* Invisible wide hit target for effortless road clicking */}
          <path
            d={d}
            stroke="transparent"
            strokeWidth={18}
            vectorEffect="non-scaling-stroke"
            fill="none"
            style={{ cursor: 'pointer' }}
            onMouseEnter={() => setHoveredEdgeId(edge.id)}
            onMouseLeave={() => setHoveredEdgeId(null)}
            onClick={(e) => {
              e.stopPropagation();
              onEdgeClick?.(edge);
              onEdgeToggle?.(edge.id);
            }}
          />

          {/* Blocked glow halo */}
          {isBlocked && (
            <path
              d={d}
              stroke="rgba(239, 68, 68, 0.4)"
              strokeWidth={8}
              vectorEffect="non-scaling-stroke"
              fill="none"
              strokeLinecap="round"
            />
          )}

          {/* Core road line */}
          <path
            d={d}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeOpacity={strokeOpacity}
            strokeDasharray={isBlocked ? '6,4' : undefined}
            vectorEffect="non-scaling-stroke"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ pointerEvents: 'none' }}
          />

          {/* Blocked warning badge on road center */}
          {isBlocked && (
            <g
              transform={`translate(${midX}, ${midY}) scale(${1 / view.scale})`}
              style={{ pointerEvents: 'none' }}
            >
              <circle r={7} fill="#ef4444" stroke="#ffffff" strokeWidth={1.5} />
              <line x1={-3.5} y1={-3.5} x2={3.5} y2={3.5} stroke="#ffffff" strokeWidth={1.8} strokeLinecap="round" />
              <line x1={3.5} y1={-3.5} x2={-3.5} y2={3.5} stroke="#ffffff" strokeWidth={1.8} strokeLinecap="round" />
            </g>
          )}
        </g>
      );
    });
  }, [
    edgePaths,
    blockedEdgeIds,
    selectedEdgeId,
    hoveredEdgeId,
    view.scale,
    onEdgeClick,
    onEdgeToggle,
  ]);

  // ── Render Places / Facilities ─────────────────────────────────────────────

  const filteredPlaces = useMemo(() => {
    return places.filter(p => {
      if (filterPlaceType !== 'all' && p.type !== filterPlaceType) return false;
      return true;
    });
  }, [places, filterPlaceType]);

  const renderedPlaces = useMemo(() => {
    if (view.scale < 0.22) return null;
    const showLabels = view.scale >= 0.75;

    return filteredPlaces.map(place => {
      const node = graph.nodes[place.nearestNodeId];
      if (!node) return null;

      const conf = PLACE_CONFIG[place.type] ?? { icon: '📍', color: '#94a3b8', label: 'Facility' };
      const isHovered = hoveredPlaceId === place.id;

      return (
        <g
          key={place.id}
          transform={`translate(${node.x}, ${node.y}) scale(${1 / view.scale})`}
          style={{ cursor: 'pointer' }}
          onMouseEnter={() => setHoveredPlaceId(place.id)}
          onMouseLeave={() => setHoveredPlaceId(null)}
          onClick={(e) => {
            e.stopPropagation();
            onPlaceClick?.(place);
            onNodeClick?.(place.nearestNodeId);
          }}
        >
          {/* Outer halo */}
          <circle
            r={isHovered ? 14 : 10}
            fill={conf.color}
            fillOpacity={isHovered ? 0.35 : 0.2}
            stroke={conf.color}
            strokeWidth={isHovered ? 2 : 1}
          />
          {/* Inner badge */}
          <circle r={8} fill="#0f172a" stroke={conf.color} strokeWidth={1.5} />
          {/* Icon */}
          <text
            x={0}
            y={0.5}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={9}
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            {conf.icon}
          </text>

          {/* Place name label */}
          {(showLabels || isHovered) && (
            <g transform="translate(0, 16)" style={{ pointerEvents: 'none' }}>
              <rect
                x={-Math.min(place.name.length * 3.5 + 6, 80)}
                y={-8}
                width={Math.min(place.name.length * 7 + 12, 160)}
                height={16}
                rx={3}
                fill="rgba(15, 23, 42, 0.9)"
                stroke={conf.color}
                strokeWidth={0.8}
              />
              <text
                x={0}
                y={0}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={9}
                fontWeight={600}
                fill="#f1f5f9"
                style={{ userSelect: 'none' }}
              >
                {place.name.length > 24 ? place.name.slice(0, 22) + '…' : place.name}
              </text>
            </g>
          )}
        </g>
      );
    });
  }, [filteredPlaces, graph.nodes, view.scale, hoveredPlaceId, onPlaceClick, onNodeClick]);

  // ── Render Simulated Incidents (Phase 3) ───────────────────────────────────

  const renderedIncidents = useMemo(() => {
    return incidents.map(inc => {
      const node = graph.nodes[inc.node];
      if (!node) return null;

      const conf = INCIDENT_CONFIG[inc.type] ?? { icon: '⚠️', color: '#ef4444', label: 'Incident' };
      const isSelected = selectedIncidentId === inc.id;
      const isHovered = hoveredIncidentId === inc.id;

      return (
        <g
          key={inc.id}
          transform={`translate(${node.x}, ${node.y}) scale(${1 / view.scale})`}
          style={{ cursor: 'pointer' }}
          onMouseEnter={() => setHoveredIncidentId(inc.id)}
          onMouseLeave={() => setHoveredIncidentId(null)}
          onClick={(e) => {
            e.stopPropagation();
            onIncidentClick?.(inc);
            onNodeClick?.(inc.node);
          }}
        >
          {/* Pulsing outer aura */}
          <circle
            r={isSelected ? 18 : isHovered ? 15 : 12}
            fill={conf.color}
            fillOpacity={isSelected ? 0.45 : 0.25}
            stroke={conf.color}
            strokeWidth={isSelected ? 2.5 : 1.5}
          />

          {/* Diamond hazard marker */}
          <polygon
            points="0,-10 10,0 0,10 -10,0"
            fill="#1e1b4b"
            stroke={conf.color}
            strokeWidth={2}
          />

          {/* Icon */}
          <text
            x={0}
            y={0.5}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={9}
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            {conf.icon}
          </text>

          {/* Severity badge pill */}
          <g transform="translate(10, -10)" style={{ pointerEvents: 'none' }}>
            <circle r={5.5} fill="#ef4444" stroke="#ffffff" strokeWidth={1} />
            <text
              x={0}
              y={0.5}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={7}
              fontWeight={800}
              fill="#ffffff"
            >
              {inc.severity}
            </text>
          </g>

          {/* Incident label */}
          {(view.scale >= 0.7 || isSelected || isHovered) && (
            <g transform="translate(0, -16)" style={{ pointerEvents: 'none' }}>
              <rect
                x={-Math.min(inc.placeName.length * 3.5 + 8, 85)}
                y={-8}
                width={Math.min(inc.placeName.length * 7 + 16, 170)}
                height={16}
                rx={3}
                fill="rgba(239, 68, 68, 0.9)"
                stroke="#ffffff"
                strokeWidth={0.8}
              />
              <text
                x={0}
                y={0}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={8.5}
                fontWeight={700}
                fill="#ffffff"
                style={{ userSelect: 'none' }}
              >
                {inc.placeName.length > 22 ? inc.placeName.slice(0, 20) + '…' : inc.placeName}
              </text>
            </g>
          )}
        </g>
      );
    });
  }, [incidents, graph.nodes, view.scale, selectedIncidentId, hoveredIncidentId, onIncidentClick, onNodeClick]);

  // ── Render Team Depots (Phase 3) ──────────────────────────────────────────

  const renderedTeams = useMemo(() => {
    return teams.map(team => {
      const node = graph.nodes[team.depotNode];
      if (!node) return null;

      const isSelected = selectedTeamId === team.id;
      const isHovered = hoveredTeamId === team.id;

      const vehicleIcon =
        team.vehicleType === 'bucket-truck' ? '🚛' :
        team.vehicleType === 'pump-van' ? '🚐' :
        team.vehicleType === 'comms-van' ? '🚙' : '🚜';

      return (
        <g
          key={team.id}
          transform={`translate(${node.x}, ${node.y}) scale(${1 / view.scale})`}
          style={{ cursor: 'pointer' }}
          onMouseEnter={() => setHoveredTeamId(team.id)}
          onMouseLeave={() => setHoveredTeamId(null)}
          onClick={(e) => {
            e.stopPropagation();
            onTeamClick?.(team);
            onNodeClick?.(team.depotNode);
          }}
        >
          <circle
            r={isSelected ? 13 : 9}
            fill="#0284c7"
            fillOpacity={0.85}
            stroke="#ffffff"
            strokeWidth={isSelected ? 2 : 1}
          />
          <text
            x={0}
            y={0.5}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={7}
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            {vehicleIcon}
          </text>

          {/* Team label on hover/select */}
          {(isHovered || isSelected) && (
            <g transform="translate(0, 14)" style={{ pointerEvents: 'none' }}>
              <rect
                x={-50}
                y={-7}
                width={100}
                height={14}
                rx={3}
                fill="rgba(2, 132, 199, 0.9)"
                stroke="#38bdf8"
                strokeWidth={0.8}
              />
              <text
                x={0}
                y={0}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={8}
                fontWeight={600}
                fill="#ffffff"
              >
                {team.name}
              </text>
            </g>
          )}
        </g>
      );
    });
  }, [teams, graph.nodes, view.scale, selectedTeamId, hoveredTeamId, onTeamClick, onNodeClick]);

  // ── Selected Node Highlight ───────────────────────────────────────────────

  const renderedSelectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    const node = graph.nodes[selectedNodeId];
    if (!node) return null;

    return (
      <g
        transform={`translate(${node.x}, ${node.y}) scale(${1 / view.scale})`}
        style={{ pointerEvents: 'none' }}
      >
        <circle r={16} fill="rgba(249, 115, 22, 0.25)" stroke="#f97316" strokeWidth={2} />
        <circle r={5} fill="#f97316" />
      </g>
    );
  }, [selectedNodeId, graph.nodes, view.scale]);

  // ── Scale Bar (Bottom-Left) ───────────────────────────────────────────────

  const scaleBar = useMemo(() => {
    let barMeters = 500;
    if (view.scale < 0.2) barMeters = 2000;
    else if (view.scale < 0.5) barMeters = 1000;
    else if (view.scale > 2.0) barMeters = 200;
    else if (view.scale > 5.0) barMeters = 100;

    const barPixelWidth = barMeters * view.scale;
    const x = 20;
    const y = height - 26;
    const label = barMeters >= 1000 ? `${barMeters / 1000} km` : `${barMeters} m`;

    return (
      <g className="map-scale-bar" style={{ userSelect: 'none', pointerEvents: 'none' }}>
        <line x1={x} y1={y} x2={x + barPixelWidth} y2={y} stroke="#94a3b8" strokeWidth={2.5} />
        <line x1={x} y1={y - 5} x2={x} y2={y + 5} stroke="#94a3b8" strokeWidth={2.5} />
        <line x1={x + barPixelWidth} y1={y - 5} x2={x + barPixelWidth} y2={y + 5} stroke="#94a3b8" strokeWidth={2.5} />
        <text
          x={x + barPixelWidth / 2}
          y={y - 8}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fill="#cbd5e1"
        >
          {label}
        </text>
      </g>
    );
  }, [view.scale, height]);

  return (
    <div className="relative overflow-hidden select-none" style={{ width, height, position: 'relative' }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{
          background: 'radial-gradient(ellipse at center, #1e293b 0%, #0f172a 75%, #020617 100%)',
          cursor: isPanning.current ? 'grabbing' : 'grab',
          display: 'block',
          borderRadius: '8px',
          outline: 'none',
        }}
        tabIndex={0}
        aria-label="Interactive Jaipur infrastructure map. Pan with drag or arrow keys, zoom with wheel or +/-."
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        onClick={onSvgClick}
      >
        {/* Hardware-accelerated map container */}
        <g transform={`translate(${view.offsetX.toFixed(1)}, ${view.offsetY.toFixed(1)}) scale(${view.scale.toFixed(4)})`}>
          {/* Roads Layer */}
          <g id="layer-roads">{renderedRoads}</g>

          {/* Selected Junction Node */}
          {renderedSelectedNode}

          {/* Real Place/Facility Markers */}
          <g id="layer-places">{renderedPlaces}</g>

          {/* Team Depots */}
          <g id="layer-teams">{renderedTeams}</g>

          {/* Simulated Incidents Layer */}
          <g id="layer-incidents">{renderedIncidents}</g>
        </g>

        {/* UI Overlay: Scale bar */}
        {scaleBar}
      </svg>

      {/* On-screen Pan / Zoom Controls Overlay */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          background: 'rgba(15, 23, 42, 0.85)',
          padding: '6px',
          borderRadius: '6px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(4px)',
          zIndex: 20,
        }}
      >
        <button
          onClick={zoomIn}
          title="Zoom In (+)"
          style={{
            width: '32px',
            height: '32px',
            background: '#1e293b',
            color: '#f8fafc',
            border: '1px solid #334155',
            borderRadius: '4px',
            fontSize: '16px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          +
        </button>
        <button
          onClick={zoomOut}
          title="Zoom Out (-)"
          style={{
            width: '32px',
            height: '32px',
            background: '#1e293b',
            color: '#f8fafc',
            border: '1px solid #334155',
            borderRadius: '4px',
            fontSize: '16px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          -
        </button>
        <button
          onClick={resetView}
          title="Reset View to Full City (0)"
          style={{
            width: '32px',
            height: '32px',
            background: '#1e293b',
            color: '#38bdf8',
            border: '1px solid #334155',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          ⟲
        </button>
      </div>

      {/* Legend Overlay at Bottom-Right */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          right: '12px',
          background: 'rgba(15, 23, 42, 0.9)',
          padding: '8px 12px',
          borderRadius: '6px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          fontSize: '11px',
          color: '#cbd5e1',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          pointerEvents: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>⚡ Power</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>💧 Water</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>📡 Comms</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>🚧 Road Block</span>
        </div>
      </div>
    </div>
  );
};

export default MapRenderer;
