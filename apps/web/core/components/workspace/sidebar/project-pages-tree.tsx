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
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { Logo } from "@plane/propel/emoji-icon-picker";
import { ChevronRightIcon, PageIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { InstructionType } from "@plane/types";
import { DropIndicator } from "@plane/ui";
import { cn, getPageName, orderPages } from "@plane/utils";
// components
import { PageActions } from "@/components/pages/dropdowns";
import { SidebarNavItem } from "@/components/sidebar/sidebar-navigation";
// hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";
// local imports
import { PAGE_DND_TYPE } from "@/components/pages/list/block";

type Props = {
  workspaceSlug: string;
  projectId: string;
  onNavigate?: () => void;
};

const INDENT_PX = 14;
const MAX_DEPTH = 20;

/**
 * Nested page tree shown under the "Pages" entry of the project sidebar.
 * Lists non-archived pages the user can see, nested by parent.
 */
export const ProjectPagesTree = observer(function ProjectPagesTree(props: Props) {
  const { workspaceSlug, projectId, onNavigate } = props;
  const { pageId: activePageId } = useParams();
  // store hooks
  const {
    getCurrentProjectPageIds,
    getPageById,
    getPageAncestorIds,
    getPageDescendantIds,
    fetchPagesList,
    reorderPage,
    canCurrentUserCreatePage,
  } = usePageStore(EPageStoreType.PROJECT);
  // load pages for this project (cached by SWR, shared with the pages list)
  useSWR(
    workspaceSlug && projectId ? `PROJECT_PAGES_${projectId}` : null,
    workspaceSlug && projectId ? () => fetchPagesList(workspaceSlug, projectId) : null,
    { revalidateOnFocus: false }
  );
  // expanded folders
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  // auto-expand the ancestors of the page being viewed
  const activeId = activePageId?.toString();
  const activeAncestors = activeId ? getPageAncestorIds(activeId) : [];
  const activeAncestorsKey = activeAncestors.join("|");
  useEffect(() => {
    if (!activeAncestorsKey) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      activeAncestorsKey.split("|").forEach((id) => next.add(id));
      return next;
    });
  }, [activeAncestorsKey]);

  // build children map from the store (cheap; recomputed on every observer render so
  // parent/archive/name changes are reflected immediately)
  const buildTree = () => {
    const ids = getCurrentProjectPageIds(projectId);
    const visible = new Set<string>();
    const map: Record<string, string[]> = {};
    const roots: string[] = [];
    const live = ids
      .map((id) => getPageById(id))
      .filter((p): p is NonNullable<typeof p> => !!p && !!p.id && !p.archived_at);
    // same manual order as the pages list
    const sorted = orderPages(live, "sort_order", "asc") as typeof live;
    sorted.forEach((p) => visible.add(p.id as string));
    sorted.forEach((p) => {
      const id = p.id as string;
      const parent = p.parent ?? null;
      if (parent && visible.has(parent)) (map[parent] ||= []).push(id);
      else roots.push(id);
    });
    return { childrenOf: map, rootIds: roots };
  };
  const { childrenOf, rootIds } = buildTree();

  const toggle = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleDrop = async (sourceId: string, targetId: string, instruction: InstructionType) => {
    try {
      await reorderPage({ sourceId, targetId, instruction });
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: (error as { error?: string } | undefined)?.error || "Page could not be moved. Please try again.",
      });
    }
  };

  const renderNode = (id: string, depth: number, isLastChild: boolean): React.ReactNode => {
    const page = getPageById(id);
    if (!page) return null;
    const children = childrenOf[id] ?? [];
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(id);
    const isActive = id === activeId;
    return (
      <div key={id}>
        <SidebarPageRow
          pageId={id}
          parentId={page.parent ?? null}
          projectId={projectId}
          depth={depth}
          isExpandedGroup={hasChildren && isExpanded}
          isLastChild={isLastChild}
          isDragEnabled={canCurrentUserCreatePage && !page.is_locked}
          canAccept={(sourceId) => sourceId !== id && !getPageDescendantIds(sourceId).includes(id)}
          onDropPage={(sourceId, instruction) => handleDrop(sourceId, id, instruction)}
        >
        <SidebarNavItem isActive={isActive} className="py-0.5 pr-1">
          <Link
            href={`/${workspaceSlug}/projects/${projectId}/pages/${id}`}
            onClick={onNavigate}
            // anchors are draggable by default and would swallow the drag; the row wrapper is the draggable
            draggable={false}
            className="flex min-w-0 flex-1 items-center gap-1 truncate"
            style={{ paddingLeft: depth * INDENT_PX }}
          >
              {hasChildren ? (
                <button
                  type="button"
                  aria-label={isExpanded ? "Collapse" : "Expand"}
                  className="flex size-4 flex-shrink-0 items-center justify-center rounded-sm text-placeholder hover:bg-layer-1 hover:text-tertiary"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggle(id);
                  }}
                >
                  <ChevronRightIcon className={cn("size-3 transition-transform", { "rotate-90": isExpanded })} />
                </button>
              ) : (
                <span className="size-4 flex-shrink-0" />
              )}
              {page.logo_props?.in_use ? (
                <Logo logo={page.logo_props} size={12} type="lucide" />
              ) : (
                <PageIcon className="size-3.5 flex-shrink-0 text-tertiary" />
              )}
              <span className="truncate text-11">{getPageName(page.name)}</span>
          </Link>
          <span
            className="flex flex-shrink-0 items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <PageActions
              optionsOrder={[
                "add-sub-page",
                "move-to-page",
                "open-in-new-tab",
                "copy-link",
                "make-a-copy",
                "toggle-lock",
                "toggle-access",
                "archive-restore",
                "delete",
              ]}
              page={page}
              storeType={EPageStoreType.PROJECT}
            />
          </span>
        </SidebarNavItem>
        </SidebarPageRow>
        {hasChildren &&
          isExpanded &&
          depth < MAX_DEPTH &&
          children.map((childId, index) => renderNode(childId, depth + 1, index === children.length - 1))}
      </div>
    );
  };

  if (rootIds.length === 0) return null;
  return (
    <div className="ml-3 flex flex-col border-l border-subtle pl-1">
      {rootIds.map((id, index) => renderNode(id, 0, index === rootIds.length - 1))}
    </div>
  );
});

type TSidebarPageRowProps = {
  pageId: string;
  parentId: string | null;
  projectId: string;
  depth: number;
  isExpandedGroup: boolean;
  isLastChild: boolean;
  isDragEnabled: boolean;
  canAccept: (sourceId: string) => boolean;
  onDropPage: (sourceId: string, instruction: InstructionType) => void;
  children: React.ReactNode;
};

/**
 * Wraps a sidebar page row so it can be dragged and can accept a page dropped onto it (nesting).
 */
function SidebarPageRow(props: TSidebarPageRowProps) {
  const { pageId, parentId, projectId, depth, isExpandedGroup, isLastChild, isDragEnabled, canAccept, onDropPage, children } =
    props;
  const ref = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [instruction, setInstruction] = useState<InstructionType | undefined>(undefined);
  // keep latest callbacks without re-registering the drag handlers on every render
  const callbacks = useRef({ canAccept, onDropPage });
  callbacks.current = { canAccept, onDropPage };

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return combine(
      draggable({
        element,
        canDrag: () => isDragEnabled,
        getInitialData: () => ({ id: pageId, type: PAGE_DND_TYPE, parentId, projectId }),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) =>
          isDragEnabled &&
          source.data.type === PAGE_DND_TYPE &&
          source.data.projectId === projectId &&
          callbacks.current.canAccept(source.data.id as string),
        getData: ({ input, element: el }) =>
          attachInstruction(
            { id: pageId, type: PAGE_DND_TYPE, parentId, projectId },
            {
              input,
              element: el,
              currentLevel: depth,
              indentPerLevel: INDENT_PX,
              mode: isExpandedGroup ? "expanded" : isLastChild ? "last-in-group" : "standard",
            }
          ),
        onDrag: ({ self }) => {
          const next = extractInstruction(self.data)?.type;
          setInstruction(next === "instruction-blocked" || next === "reparent" ? undefined : next);
        },
        onDragLeave: () => setInstruction(undefined),
        onDrop: ({ self, source }) => {
          setInstruction(undefined);
          const type = extractInstruction(self.data)?.type;
          if (!type || type === "instruction-blocked" || type === "reparent") return;
          callbacks.current.onDropPage(source.data.id as string, type);
        },
      })
    );
  }, [pageId, parentId, projectId, depth, isExpandedGroup, isLastChild, isDragEnabled]);

  return (
    <div className="relative">
      <DropIndicator isVisible={instruction === "reorder-above"} />
      <div
        ref={ref}
        className={cn("rounded-md", {
          "opacity-50": isDragging,
          "ring-1 ring-accent-strong": instruction === "make-child",
        })}
      >
        {children}
      </div>
      <DropIndicator isVisible={instruction === "reorder-below"} />
    </div>
  );
}
