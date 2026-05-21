export interface TreeNodeInfo {
  id: string;
  name: string;
  active: boolean;
  children: TreeNodeInfo[];
}

export function getNodeId(node: cc.Node): string {
  return node.uuid || (node as { _id?: string })._id || '';
}

export function buildTreeInfo(root: cc.Node): TreeNodeInfo {
  const children = [...(root.children ?? [])]
    .filter(Boolean)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map((child) => buildTreeInfo(child));

  return {
    id: getNodeId(root),
    name: root.name || '(unnamed)',
    active: root.active !== false,
    children,
  };
}

export function hashTree(node: TreeNodeInfo): string {
  const parts: string[] = [
    node.id,
    node.name,
    node.active ? '1' : '0',
    String(node.children.length),
  ];

  for (const child of node.children) {
    parts.push(hashTree(child));
  }

  return parts.join('|');
}

export function getSceneRoot(): cc.Node | null {
  return window.cc?.director?.getScene?.() ?? null;
}
