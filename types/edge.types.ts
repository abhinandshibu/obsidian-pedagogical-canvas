// Valid values for edge sides
type EdgeSide = 'top' | 'right' | 'bottom' | 'left';

// Valid values for edge endpoints
type EdgeEnd = 'none' | 'arrow';

// Base edge properties that all edges must have
interface BaseEdge {
    id: string;
    fromNode: string;
    toNode: string;
}

// Complete edge interface with all possible properties
interface CanvasEdge extends BaseEdge {
    fromSide?: EdgeSide;
    fromEnd?: EdgeEnd;
    toSide?: EdgeSide;
    toEnd?: EdgeEnd;
    color?: string;
    label?: string;
}

// Type for creating new edges (without id as it's generated)
type EdgeCreationParams = Omit<CanvasEdge, 'id'>;

export type {
    EdgeSide,
    EdgeEnd,
    CanvasEdge,
    EdgeCreationParams
}; 