import { cloneDeep } from "lodash";
import { Expr, TreeIndexPath, childAtIndex, hole, isHole, isSExpr, setChildAtIndex } from "./ast";
import { Tree, newTree, removeTree } from "./trees";

export function moveExprInTree(
  { tree: sourceTree, path: sourceIndexPath }: TreeIndexPath,
  { tree: destinationTree, path: destinationIndexPath }: TreeIndexPath
) {
  if (destinationIndexPath.length < 2) {
    // Trying to replace root of a tree
    return;
  }

  const source = exprForIndexPathInTree(sourceTree, sourceIndexPath);

  const destination = exprForIndexPathInTree(destinationTree, destinationIndexPath);
  const destinationParent = exprForIndexPathInTree(
    destinationTree,
    destinationIndexPath.slice(0, -1)
  );
  if (!isSExpr(destinationParent)) throw "invalid index path for tree";

  if (destination === source || destination === destinationTree.root) return;

  if (source === sourceTree.root) {
    removeTree(sourceTree);
  } else {
    const sourceParent = exprForIndexPathInTree(sourceTree, sourceIndexPath.slice(0, -1));
    if (!isSExpr(sourceParent)) throw "invalid index path for tree";

    setChildAtIndex(sourceParent, sourceIndexPath.at(-1)!, hole);
  }

  setChildAtIndex(destinationParent, destinationIndexPath.at(-1)!, source);
  if (!isHole(destination)) newTree(destination);
}

export function copyExprInTree(
  { tree: sourceTree, path: sourceIndexPath }: TreeIndexPath,
  { tree: destinationTree, path: destinationIndexPath }: TreeIndexPath
) {
  if (destinationIndexPath.length < 2) {
    // Trying to replace root of a tree
    return;
  }

  const source = exprForIndexPathInTree(sourceTree, sourceIndexPath);
  if (source === sourceTree.root) {
    removeTree(sourceTree);
  } else {
    const sourceParent = exprForIndexPathInTree(sourceTree, sourceIndexPath.slice(0, -1));
    if (!isSExpr(sourceParent)) throw "invalid index path for tree";

    setChildAtIndex(sourceParent, sourceIndexPath.at(-1)!, hole);
  }

  const destination = exprForIndexPathInTree(destinationTree, destinationIndexPath);
  const destinationParent = exprForIndexPathInTree(
    destinationTree,
    destinationIndexPath.slice(0, -1)
  );
  if (!isSExpr(destinationParent)) throw "invalid index path for tree";

  if (destination === source || destination === destinationTree.root) return;

  setChildAtIndex(destinationParent, destinationIndexPath.at(-1)!, cloneDeep(source));
  if (!isHole(destination)) newTree(destination);
}

export function orphanExpr({ tree, path }: TreeIndexPath) {
  const expr = exprForIndexPathInTree(tree, path);
  const exprParent = exprForIndexPathInTree(tree, path.slice(0, -1));
  if (!isSExpr(exprParent)) {
    // expr is already the root of a tree
    return;
  }

  setChildAtIndex(exprParent, path.at(-1)!, hole);
  if (!isHole(expr)) newTree(expr);
}

function exprForIndexPathInTree({ root }: Tree, indexPath: number[]): Expr {
  indexPath = [...indexPath];
  while (indexPath.length) {
    if (!isSExpr(root)) throw "invalid index path for tree";

    const index = indexPath.shift()!;
    root = childAtIndex(root, index);
  }

  return root;
}
