import "./app.css";
import "tippy.js/dist/tippy.css";
import { SyntheticEvent, useState } from "react";
import { Point, newTree, trees } from "./trees/trees";
import Editor from "./Editor";
import AppMenuBar from "./ui/menus/AppMenuBar";
import HelpDialog from "./ui/HelpDialog";
import { Parser } from "../expr/parse";
import { ContextMenu, ContextMenuItem } from "rctx-contextmenu";
import MenuItemSeparator from "./ui/menus/MenuItemSeparator";
import { deleteExpr, moveExprInTree, orphanExpr } from "./trees/mutate";
import {
  TreeIndexPath,
  extendIndexPath,
  hole,
  isHole,
  nodeAtIndexPath,
  parentIndexPath,
  referencesToBinding,
} from "./trees/tree";
import LoadDialog from "./projects/LoadDialog";
import SaveDialog from "./projects/SaveDialog";
import { Define, NameBinding, Var } from "../expr/expr";
import { Evaluator } from "../evaluator/evaluate";
import { Datum } from "../datum/datum";
import { Defines } from "../evaluator/defines";
import { Cell } from "./library/environments";
import { Value } from "../evaluator/value";
import { Any } from "../typechecker/type";

function App() {
  const [renderCounter, setRenderCounter] = useState(0);
  function rerender() {
    setRenderCounter(renderCounter + 1);
  }

  const [blockContextMenuSubject, setBlockContextMenuSubject] = useState<TreeIndexPath>();
  const [codeEditorSubject, setCodeEditorSubject] = useState<TreeIndexPath>();

  const [showLoadDialog, setShowLoadDialog] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);

  function onBlockContextMenu(indexPath: TreeIndexPath) {
    setBlockContextMenuSubject(indexPath);
  }

  function mouseCursorLocation(event: SyntheticEvent): Point {
    const clickEvent = event.nativeEvent as MouseEvent;
    const blocksArea = document.querySelector(".blocks");
    return {
      x: clickEvent.clientX + (blocksArea?.scrollLeft ?? 0),
      y: clickEvent.clientY + (blocksArea?.scrollTop ?? 0),
    };
  }

  function renameContextMenuSubject(event: SyntheticEvent) {
    if (!blockContextMenuSubject) return;

    const binding = nodeAtIndexPath(blockContextMenuSubject);
    if (binding.kind !== "name-binding") return;

    const references: Var[] = referencesToBinding(
      binding.id,
      parentIndexPath(blockContextMenuSubject)
    );

    const newName = prompt("Enter variable name:");
    if (!newName) return;

    binding.id = newName;
    references.forEach((ref) => {
      ref.id = newName;
    });
    rerender();
  }

  function nameContextMenuSubject(event: SyntheticEvent) {
    if (!blockContextMenuSubject) return;

    const nameHole = nodeAtIndexPath(blockContextMenuSubject);
    if (!isHole(nameHole)) return;

    const newName = prompt("Enter variable name:");
    if (!newName) return;

    const location = mouseCursorLocation(event);
    const newBinding = newTree(
      {
        kind: "name-binding",
        id: newName,
      },
      location
    );
    moveExprInTree({ tree: newBinding, path: [] }, blockContextMenuSubject, location);
    rerender();
  }

  function typeAnnotateContextMenuSubject(event: SyntheticEvent) {
    if (!blockContextMenuSubject) return;

    const nameBinding = nodeAtIndexPath(blockContextMenuSubject);
    if (nameBinding.kind !== "name-binding") return;

    nameBinding.type = Any;
    rerender();
  }

  function typeUnannotateContextMenuSubject(event: SyntheticEvent) {
    if (!blockContextMenuSubject) return;

    const nameBinding = nodeAtIndexPath(blockContextMenuSubject);
    if (nameBinding.kind !== "name-binding") return;

    delete nameBinding.type;
    rerender();
  }

  function applyContextMenuSubject(event: SyntheticEvent) {
    if (!blockContextMenuSubject) return;

    const variable = nodeAtIndexPath(blockContextMenuSubject);
    if (variable.kind !== "var") return;

    const location = mouseCursorLocation(event);
    const call = newTree({ kind: "call", called: hole, args: [] }, location);
    moveExprInTree(blockContextMenuSubject, { tree: call, path: [0] }, location);
    rerender();
  }

  function unapplyContextMenuSubject(event: SyntheticEvent) {
    if (!blockContextMenuSubject) return;

    const call = nodeAtIndexPath(blockContextMenuSubject);
    if (call.kind !== "call") return;

    const location = mouseCursorLocation(event);
    orphanExpr(extendIndexPath(blockContextMenuSubject, 0), location, false);
    rerender();
  }

  function textEditBlockContextMenuSubject(event: SyntheticEvent) {
    setCodeEditorSubject(blockContextMenuSubject);
  }

  function duplicateBlockContextMenuSubject(event: SyntheticEvent) {
    if (blockContextMenuSubject) {
      const location = mouseCursorLocation(event);
      orphanExpr(blockContextMenuSubject, location, true);
      rerender();
    }
  }

  function deleteBlockContextMenuSubject() {
    if (blockContextMenuSubject) {
      deleteExpr(blockContextMenuSubject);
      rerender();
    }
  }

  function evaluateContextMenuSubject(event: SyntheticEvent) {
    if (!blockContextMenuSubject) return;

    const subject = nodeAtIndexPath(blockContextMenuSubject);

    const defines = new Defines();
    const evaluator = new Evaluator(defines);

    defines.addAll(
      trees()
        .filter((tree) => tree.root.kind === "define" && tree.root.name.kind === "name-binding")
        .map((tree) => {
          const define = tree.root as Define;
          const name = define.name as NameBinding;
          return [
            name.id,
            (): Cell<Value> => {
              const evaluator = new Evaluator();
              evaluator.defines = defines;
              evaluator.eval(define);
              return defines.get(name.id)!;
            },
          ];
        })
    );

    const result = evaluator.eval(subject);

    const location = mouseCursorLocation(event);
    // FIXME: builtin function representation
    newTree(result as Datum, location);
    rerender();
  }

  const [loadResolve, setLoadResolve] = useState<(source: string | undefined) => void>();
  const [saveResolve, setSaveResolve] = useState<() => void>();

  const commonContextMenu = (
    <>
      <ContextMenuItem onClick={textEditBlockContextMenuSubject}>Edit as Text</ContextMenuItem>
      <MenuItemSeparator />
      <ContextMenuItem onClick={duplicateBlockContextMenuSubject}>Duplicate</ContextMenuItem>
      <ContextMenuItem onClick={deleteBlockContextMenuSubject}>Delete</ContextMenuItem>
      <MenuItemSeparator />
      <ContextMenuItem onClick={evaluateContextMenuSubject}>Evaluate</ContextMenuItem>
    </>
  );

  return (
    <>
      <AppMenuBar
        onShowLoad={() =>
          new Promise((resolve) => {
            setShowLoadDialog(true);
            setLoadResolve(() => resolve);
          })
        }
        onShowSave={() =>
          new Promise((resolve) => {
            setShowSaveDialog(true);
            setSaveResolve(() => resolve);
          })
        }
        onShowHelp={() => setShowHelpDialog(true)}
        rerender={rerender}
      />

      <Editor
        trees={trees()}
        onBlockContextMenu={onBlockContextMenu}
        codeEditorSubject={codeEditorSubject}
        setCodeEditorSubject={setCodeEditorSubject}
        rerender={rerender}
        renderCounter={renderCounter}
      />

      <LoadDialog
        show={showLoadDialog}
        onHide={(source) => {
          setShowLoadDialog(false);
          loadResolve?.(source);
        }}
      />
      <SaveDialog
        show={showSaveDialog}
        onHide={() => {
          setShowSaveDialog(false);
          saveResolve?.();
        }}
      />
      <HelpDialog show={showHelpDialog} onHide={() => setShowHelpDialog(false)} />

      <ContextMenu id="block-menu" hideOnLeave={false}>
        {commonContextMenu}
      </ContextMenu>

      <ContextMenu id="block-menu-namebinding" hideOnLeave={false}>
        <ContextMenuItem onClick={typeAnnotateContextMenuSubject}>
          Annotate Variable Type
        </ContextMenuItem>
        <ContextMenuItem onClick={renameContextMenuSubject}>Rename Variable</ContextMenuItem>
        {commonContextMenu}
      </ContextMenu>

      <ContextMenu id="block-menu-namebinding-annotated" hideOnLeave={false}>
        <ContextMenuItem onClick={typeUnannotateContextMenuSubject}>
          Remove Type Annotation
        </ContextMenuItem>
        <ContextMenuItem onClick={renameContextMenuSubject}>Rename Variable</ContextMenuItem>
        {commonContextMenu}
      </ContextMenu>

      <ContextMenu id="block-menu-namehole" hideOnLeave={false}>
        <ContextMenuItem onClick={nameContextMenuSubject}>Name Variable</ContextMenuItem>
        {commonContextMenu}
      </ContextMenu>

      <ContextMenu id="block-menu-var" hideOnLeave={false}>
        <ContextMenuItem onClick={applyContextMenuSubject}>Apply</ContextMenuItem>
        {commonContextMenu}
      </ContextMenu>

      <ContextMenu id="block-menu-call" hideOnLeave={false}>
        <ContextMenuItem onClick={unapplyContextMenuSubject}>Unapply</ContextMenuItem>
        {commonContextMenu}
      </ContextMenu>

      <ContextMenu id="block-menu-apply" hideOnLeave={false}>
        {commonContextMenu}
      </ContextMenu>
    </>
  );
}

export default App;
