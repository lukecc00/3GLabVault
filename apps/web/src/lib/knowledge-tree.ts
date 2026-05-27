import type { KnowledgeSpaceDetail } from "@/lib/contracts";

export type KnowledgeTreePage = KnowledgeSpaceDetail["pages"][number];

export interface KnowledgeTreeNode {
  page: KnowledgeTreePage;
  children: KnowledgeTreeNode[];
}

export function buildKnowledgePageTree(pages: KnowledgeTreePage[]) {
  const nodes = new Map<string, KnowledgeTreeNode>();
  const roots: KnowledgeTreeNode[] = [];

  for (const page of pages) {
    nodes.set(page.id, {
      page,
      children: [],
    });
  }

  for (const node of nodes.values()) {
    if (node.page.parentId && nodes.has(node.page.parentId)) {
      nodes.get(node.page.parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return sortKnowledgeTreeNodes(roots);
}

export function flattenKnowledgeTree(nodes: KnowledgeTreeNode[]) {
  const flattened: Array<{ page: KnowledgeTreePage; depth: number }> = [];

  function walk(currentNodes: KnowledgeTreeNode[], depth: number) {
    for (const node of currentNodes) {
      flattened.push({ page: node.page, depth });
      walk(node.children, depth + 1);
    }
  }

  walk(nodes, 0);

  return flattened;
}

function sortKnowledgeTreeNodes(nodes: KnowledgeTreeNode[]) {
  nodes.sort(compareKnowledgePages);

  for (const node of nodes) {
    sortKnowledgeTreeNodes(node.children);
  }

  return nodes;
}

function compareKnowledgePages(a: KnowledgeTreeNode, b: KnowledgeTreeNode) {
  if (a.page.sortOrder !== b.page.sortOrder) {
    return a.page.sortOrder - b.page.sortOrder;
  }

  return new Date(a.page.createdAt).getTime() - new Date(b.page.createdAt).getTime();
}
