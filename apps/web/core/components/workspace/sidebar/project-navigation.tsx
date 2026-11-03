/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { EUserPermissionsLevel, EUserPermissions } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { ChevronRightIcon, CycleIcon, IntakeIcon, ModuleIcon, PageIcon, ViewsIcon, WorkItemsIcon } from "@plane/propel/icons";
import { cn } from "@plane/utils";
import type { EUserProjectRoles } from "@plane/types";
// plane ui
// components
import { SidebarNavItem } from "@/components/sidebar/sidebar-navigation";
import { PAGE_DND_TYPE } from "@/components/pages/list/block";
import { ProjectPagesTree } from "@/components/workspace/sidebar/project-pages-tree";
import { EPageStoreType, usePageStore } from "@/hooks/store";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";

export type TNavigationItem = {
  name: string;
  href: string;
  icon: React.ElementType;
  access: EUserPermissions[] | EUserProjectRoles[];
  shouldRender: boolean;
  sortOrder: number;
  i18n_key: string;
  key: string;
};

type TProjectItemsProps = {
  workspaceSlug: string;
  projectId: string;
  additionalNavigationItems?: (workspaceSlug: string, projectId: string) => TNavigationItem[];
};

export const ProjectNavigation = observer(function ProjectNavigation(props: TProjectItemsProps) {
  const { workspaceSlug, projectId, additionalNavigationItems } = props;
  const { workItem: workItemIdentifierFromRoute } = useParams();
  // store hooks
  const { t } = useTranslation();
  const { isExtendedProjectSidebarOpened, toggleExtendedProjectSidebar, toggleSidebar } = useAppTheme();
  const { getPartialProjectById } = useProject();
  const { allowPermissions } = useUserPermissions();
  const {
    issue: { getIssueIdByIdentifier, getIssueById },
  } = useIssueDetail();
  // pathname
  const pathname = usePathname();
  // nested pages tree under the "Pages" entry; open by default while browsing pages
  const isOnPages = pathname.includes(`/projects/${projectId}/pages`);
  const [isPagesTreeOpen, setIsPagesTreeOpen] = useState<boolean | null>(null);
  const showPagesTree = isPagesTreeOpen ?? isOnPages;
  // derived values
  const workItemId = workItemIdentifierFromRoute
    ? getIssueIdByIdentifier(workItemIdentifierFromRoute?.toString())
    : undefined;
  const workItem = workItemId ? getIssueById(workItemId) : undefined;
  const project = getPartialProjectById(projectId);
  // dropping a page on the "Pages" entry moves it to the top level
  const pagesNavRef = useRef<HTMLDivElement>(null);
  const [isPageDropOver, setIsPageDropOver] = useState(false);
  const { getPageById } = usePageStore(EPageStoreType.PROJECT);
  useEffect(() => {
    const element = pagesNavRef.current;
    if (!element) return;
    return dropTargetForElements({
      element,
      canDrop: ({ source }) =>
        source.data.type === PAGE_DND_TYPE &&
        source.data.projectId === projectId &&
        !!getPageById(source.data.id as string)?.parent,
      onDragEnter: () => setIsPageDropOver(true),
      onDragLeave: () => setIsPageDropOver(false),
      onDrop: ({ source }) => {
        setIsPageDropOver(false);
        getPageById(source.data.id as string)?.updateParent(null);
      },
    });
  }, [getPageById, projectId, project?.page_view]);
  // handlers
  const handleProjectClick = () => {
    if (window.innerWidth < 768) {
      toggleSidebar();
    }
    // close the extended sidebar if it is open
    if (isExtendedProjectSidebarOpened) {
      toggleExtendedProjectSidebar(false);
    }
  };

  const baseNavigation = useCallback(
    (workspaceSlug: string, projectId: string): TNavigationItem[] => [
      {
        i18n_key: "sidebar.work_items",
        key: "work_items",
        name: "Work items",
        href: `/${workspaceSlug}/projects/${projectId}/issues`,
        icon: WorkItemsIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
        shouldRender: true,
        sortOrder: 1,
      },
      {
        i18n_key: "sidebar.cycles",
        key: "cycles",
        name: "Cycles",
        href: `/${workspaceSlug}/projects/${projectId}/cycles`,
        icon: CycleIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
        shouldRender: project?.cycle_view ?? false,
        sortOrder: 2,
      },
      {
        i18n_key: "sidebar.modules",
        key: "modules",
        name: "Modules",
        href: `/${workspaceSlug}/projects/${projectId}/modules`,
        icon: ModuleIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
        shouldRender: project?.module_view ?? false,
        sortOrder: 3,
      },
      {
        i18n_key: "sidebar.views",
        key: "views",
        name: "Views",
        href: `/${workspaceSlug}/projects/${projectId}/views`,
        icon: ViewsIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
        shouldRender: project?.issue_views_view ?? false,
        sortOrder: 4,
      },
      {
        i18n_key: "sidebar.pages",
        key: "pages",
        name: "Pages",
        href: `/${workspaceSlug}/projects/${projectId}/pages`,
        icon: PageIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
        shouldRender: project?.page_view ?? false,
        sortOrder: 5,
      },
      {
        i18n_key: "sidebar.intake",
        key: "intake",
        name: "Intake",
        href: `/${workspaceSlug}/projects/${projectId}/intake`,
        icon: IntakeIcon,
        access: [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
        shouldRender: project?.inbox_view ?? false,
        sortOrder: 6,
      },
    ],
    [project]
  );

  // memoized navigation items and adding additional navigation items
  const navigationItemsMemo = useMemo(() => {
    const navigationItems = (workspaceSlug: string, projectId: string): TNavigationItem[] => {
      const navItems = baseNavigation(workspaceSlug, projectId);

      if (additionalNavigationItems) {
        navItems.push(...additionalNavigationItems(workspaceSlug, projectId));
      }

      return navItems;
    };

    // sort navigation items by sortOrder
    const sortedNavigationItems = navigationItems(workspaceSlug, projectId).sort(
      (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)
    );

    return sortedNavigationItems;
  }, [workspaceSlug, projectId, baseNavigation, additionalNavigationItems]);

  const isActive = useCallback(
    (item: TNavigationItem) => {
      // work item condition
      const workItemCondition = workItemId && workItem && !workItem?.is_epic && workItem?.project_id === projectId;
      // epic condition
      const epicCondition = workItemId && workItem && workItem?.is_epic && workItem?.project_id === projectId;
      // is active
      const isWorkItemActive = item.key === "work_items" && workItemCondition;
      const isEpicActive = item.key === "epics" && epicCondition;
      // pathname condition
      const isPathnameActive = pathname.includes(item.href);
      // return
      return isWorkItemActive || isEpicActive || isPathnameActive;
    },
    [pathname, workItem, workItemId, projectId]
  );

  if (!project) return null;

  return (
    <>
      {navigationItemsMemo.map((item) => {
        if (!item.shouldRender) return;

        const hasAccess = allowPermissions(item.access, EUserPermissionsLevel.PROJECT, workspaceSlug, project.id);
        if (!hasAccess) return null;

        const shouldShowCount = item.key === "intake" && (project.intake_count ?? 0) > 0;
        const isPagesItem = item.key === "pages";

        return (
          <React.Fragment key={item.key}>
            <Link href={item.href} onClick={handleProjectClick}>
              <div ref={isPagesItem ? pagesNavRef : undefined}>
              <SidebarNavItem
                isActive={!!isActive(item)}
                className={cn({ "ring-1 ring-accent-strong": isPagesItem && isPageDropOver })}
              >
                <div className="flex w-full items-center justify-between gap-1.5 py-[1px]">
                  <div className="flex items-center gap-1.5">
                    <item.icon
                      className={`size-4 flex-shrink-0 ${item.name === "Intake" ? "stroke-1" : "stroke-[1.5]"}`}
                    />
                    <span className="text-11 font-medium">{t(item.i18n_key)}</span>
                  </div>
                  {shouldShowCount && (
                    <span className="text-11 font-medium text-tertiary">{project.intake_count}</span>
                  )}
                  {isPagesItem && (
                    <button
                      type="button"
                      aria-label={showPagesTree ? "Hide pages" : "Show pages"}
                      aria-expanded={showPagesTree}
                      className="flex size-4 flex-shrink-0 items-center justify-center rounded-sm text-placeholder opacity-0 hover:bg-layer-1 hover:text-tertiary group-hover:opacity-100"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsPagesTreeOpen(!showPagesTree);
                      }}
                    >
                      <ChevronRightIcon
                        className={cn("size-3 transition-transform", { "rotate-90": showPagesTree })}
                      />
                    </button>
                  )}
                </div>
              </SidebarNavItem>
              </div>
            </Link>
            {isPagesItem && showPagesTree && (
              <ProjectPagesTree workspaceSlug={workspaceSlug} projectId={projectId} onNavigate={handleProjectClick} />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
});
