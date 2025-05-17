// Base node properties that all nodes must have
export interface BaseNode {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	color?: string;
}

// Text node
export interface TextNode extends BaseNode {
	type: "text";
	text: string;
}

// File node
export interface FileNode extends BaseNode {
	type: "file";
	file: string;
	subpath?: string;
}

// Link node
export interface LinkNode extends BaseNode {
	type: "link";
	url: string;
}

// Group node
export interface GroupNode extends BaseNode {
	type: "group";
	label?: string;
	background?: string;
	backgroundStyle?: "cover" | "ratio" | "repeat";
}

// Union type for all possible nodes
export type CanvasNode = TextNode | FileNode | LinkNode | GroupNode;

// Type for creating new nodes (without id as it's generated)
export type NodeCreationParams = 
	| Omit<TextNode, 'id'>
	| Omit<FileNode, 'id'>
	| Omit<LinkNode, 'id'>
	| Omit<GroupNode, 'id'>;