/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { attachInstruction, extractInstruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { ChevronRightIcon, PageIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// plane imports
import type { InstructionType } from "@plane/types";
import { DropIndicator } from "@plane/ui";
import { cn, getPageName } from "@plane/utils";
// components
import { ListItem } from "@/components/core/list";
import { BlockItemAction } from "@/components/pages/list/block-item-action";
// hooks
import { usePlatformOS } from "@/hooks/use-platform-os";
// plane web hooks
import type { EPageStoreType } from "@/hooks/store";
import { usePage, usePageStore } from "@/hooks/store";

type TPageListBlock = {
  pageId: string;
  storeType: EPageStoreType;
  /** nesting level in the pages tree; 0 for top-level pages */
  depth?: number;
  hasChildren?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  /** drag-and-drop is only offered for live (non-archived) pages */
  isDragEnabled?: boolean;
  /** last visible sibling in its group; enables dropping after the group */
  isLastChild?: boolean;
};

export const PAGE_DND_TYPE = "PAGE";
const INDENT_PX = 24;

export type TPageDragData = { id: string; type: typeof PAGE_DND_TYPE; parentId: string | null; projectId: string };

export const PageListBlock = observer(function PageListBlock(props: TPageListBlock) {
  const {
    pageId,
    storeType,
    depth = 0,
    hasChildren = false,
    isExpanded = false,
    onToggleExpand,
    isDragEnabled = false,
    isLastChild = false,
  } = props;
  // refs
  const parentRef = useRef<HTMLDivElement>(null);
  // states
  const [isDragging, setIsDragging] = useState(false);
  const [instruction, setInstruction] = useState<InstructionType | undefined>(undefined);
  // hooks
  const page = usePage({
    pageId,
    storeType,
  });
  const { reorderPage, getPageDescendantIds, canCurrentUserCreatePage } = usePageStore(storeType);
  const { isMobile } = usePlatformOS();

  // drag and drop (nest by dropping on a row, reorder by dropping between rows)
  useEffect(() => {
    const element = parentRef.current;
    if (!element || !isDragEnabled || !canCurrentUserCreatePage || !page?.id) return;
    const projectId = page.project_ids?.[0] ?? "";
    const dragData: TPageDragData = { id: page.id, type: PAGE_DND_TYPE, parentId: page.parent ?? null, projectId };
    const canDrop = (sourceData: Record<string, unknown>) => {
      if (sourceData.type !== PAGE_DND_TYPE || sourceData.projectId !== projectId) return false;
      const sourceId = sourceData.id as string;
      if (sourceId === page.id) return false;
      // cannot drop a page inside its own subtree
      return !getPageDescendantIds(sourceId).includes(page.id as string);
    };
    return combine(
      draggable({
        element,
        canDrag: () => !page.is_locked,
        getInitialData: () => dragData,
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => canDrop(source.data),
        getData: ({ input, element: el }) =>
          attachInstruction(dragData, {
            input,
            element: el,
            currentLevel: depth,
            indentPerLevel: INDENT_PX,
            mode: hasChildren && isExpanded ? "expanded" : isLastChild ? "last-in-group" : "standard",
          }),
        onDrag: ({ self }) => {
          const next = extractInstruction(self.data)?.type;
          setInstruction(next === "instruction-blocked" || next === "reparent" ? undefined : next);
        },
        onDragLeave: () => setInstruction(undefined),
        onDrop: async ({ self, source }) => {
          setInstruction(undefined);
          const type = extractInstruction(self.data)?.type;
          const sourceId = source.data.id as string;
          if (!type || type === "instruction-blocked" || type === "reparent" || !sourceId) return;
          try {
            await reorderPage({ sourceId, targetId: page.id as string, instruction: type });
          } catch (error) {
            setToast({
              type: TOAST_TYPE.ERROR,
              title: "Error!",
              message: (error as { error?: string } | undefined)?.error || "Page could not be moved. Please try again.",
            });
          }
        },
      })
    );
  }, [
    isDragEnabled,
    canCurrentUserCreatePage,
    page?.id,
    page?.parent,
    page?.is_locked,
    page?.project_ids,
    depth,
    hasChildren,
    isExpanded,
    isLastChild,
    reorderPage,
    getPageDescendantIds,
  ]);

  // handle page check
  if (!page) return null;
  // derived values
  const { name, logo_props, getRedirectionLink, sub_pages_count } = page;
  const childCount = hasChildren ? undefined : sub_pages_count;

  return (
    <div className={cn("relative", { "opacity-50": isDragging })}>
      <DropIndicator isVisible={instruction === "reorder-above"} />
      <ListItem
        className={cn({ "bg-layer-transparent-active": instruction === "make-child" })}
        prependTitleElement={
          <span className="flex items-center gap-1" style={{ paddingLeft: depth * INDENT_PX }}>
            {hasChildren ? (
              <button
                type="button"
                aria-label={isExpanded ? "Collapse sub-pages" : "Expand sub-pages"}
                aria-expanded={isExpanded}
                className="flex size-5 flex-shrink-0 items-center justify-center rounded-sm text-placeholder hover:bg-layer-1 hover:text-tertiary"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleExpand?.();
                }}
              >
                <ChevronRightIcon className={cn("size-3.5 transition-transform", { "rotate-90": isExpanded })} />
              </button>
            ) : (
              <span className="size-5 flex-shrink-0" />
            )}
            {logo_props?.in_use ? (
              <Logo logo={logo_props} size={16} type="lucide" />
            ) : (
              <PageIcon className="h-4 w-4 text-tertiary" />
            )}
          </span>
        }
        title={getPageName(name)}
        appendTitleElement={
          !!childCount && childCount > 0 ? (
            <span className="ml-2 rounded-sm bg-layer-1 px-1.5 py-0.5 text-10 text-tertiary">{childCount}</span>
          ) : undefined
        }
        itemLink={getRedirectionLink()}
        actionableItems={<BlockItemAction page={page} parentRef={parentRef} storeType={storeType} />}
        isMobile={isMobile}
        parentRef={parentRef}
      />
      <DropIndicator isVisible={instruction === "reorder-below"} />
    </div>
  );
});
