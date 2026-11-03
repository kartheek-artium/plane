/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
import { observer } from "mobx-react";
// types
import type { TPageNavigationTabs } from "@plane/types";
// components
import { ListLayout } from "@/components/core/list";
// plane web hooks
import type { EPageStoreType } from "@/hooks/store";
import { usePageStore } from "@/hooks/store";
// local imports
import { PageListBlock } from "./block";

type TPagesListRoot = {
  pageType: TPageNavigationTabs;
  storeType: EPageStoreType;
};

type TPageTreeBranchProps = {
  pageId: string;
  pageType: TPageNavigationTabs;
  storeType: EPageStoreType;
  depth: number;
  expandedIds: Set<string>;
  forceExpanded: boolean;
  onToggle: (pageId: string) => void;
  isLastChild?: boolean;
};

const MAX_RENDER_DEPTH = 20;

/**
 * Renders a page row followed by its visible sub-pages (nested pages / folders).
 */
const PageTreeBranch = observer(function PageTreeBranch(props: TPageTreeBranchProps) {
  const { pageId, pageType, storeType, depth, expandedIds, forceExpanded, onToggle, isLastChild = false } = props;
  const { getChildPageIdsByTab } = usePageStore(storeType);
  const childIds = getChildPageIdsByTab(pageId, pageType);
  const hasChildren = childIds.length > 0;
  const isExpanded = forceExpanded || expandedIds.has(pageId);

  return (
    <>
      <PageListBlock
        pageId={pageId}
        storeType={storeType}
        depth={depth}
        hasChildren={hasChildren}
        isExpanded={isExpanded}
        onToggleExpand={() => onToggle(pageId)}
        isDragEnabled={pageType !== "archived"}
        isLastChild={isLastChild}
      />
      {hasChildren &&
        isExpanded &&
        depth < MAX_RENDER_DEPTH &&
        childIds.map((childId, index) => (
          <PageTreeBranch
            key={childId}
            pageId={childId}
            pageType={pageType}
            storeType={storeType}
            depth={depth + 1}
            expandedIds={expandedIds}
            forceExpanded={forceExpanded}
            onToggle={onToggle}
            isLastChild={index === childIds.length - 1}
          />
        ))}
    </>
  );
});

export const PagesListRoot = observer(function PagesListRoot(props: TPagesListRoot) {
  const { pageType, storeType } = props;
  // store hooks
  const { getCurrentProjectRootPageIdsByTab, filters } = usePageStore(storeType);
  // local state: which folders are open
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const handleToggle = useCallback((pageId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  }, []);
  // derived values
  const rootPageIds = getCurrentProjectRootPageIdsByTab(pageType);
  // while searching, show every match in place rather than hiding it under a collapsed parent
  const forceExpanded = (filters.searchQuery ?? "").trim().length > 0;

  if (!rootPageIds) return <></>;
  return (
    <ListLayout>
      {rootPageIds.map((pageId, index) => (
        <PageTreeBranch
          key={pageId}
          pageId={pageId}
          pageType={pageType}
          storeType={storeType}
          depth={0}
          expandedIds={expandedIds}
          forceExpanded={forceExpanded}
          onToggle={handleToggle}
          isLastChild={index === rootPageIds.length - 1}
        />
      ))}
    </ListLayout>
  );
});
