/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { unset, set } from "lodash-es";
import { makeObservable, observable, runInAction, action, reaction, computed } from "mobx";
import { computedFn } from "mobx-utils";
// types
import { EUserPermissions } from "@plane/constants";
import type { InstructionType, TPage, TPageFilters, TPageNavigationTabs } from "@plane/types";
import { EUserProjectRoles } from "@plane/types";
// helpers
import { filterPagesByPageType, getPageName, orderPages, shouldFilterPage } from "@plane/utils";
// plane web constants
// plane web store
// services
import { ProjectPageService } from "@/services/page";
// store
import type { CoreRootStore } from "../root.store";
import type { TProjectPage } from "./project-page";
import { ProjectPage } from "./project-page";

type TLoader = "init-loader" | "mutation-loader" | undefined;

type TError = { title: string; description: string };

export const ROLE_PERMISSIONS_TO_CREATE_PAGE = [
  EUserPermissions.ADMIN,
  EUserPermissions.MEMBER,
  EUserProjectRoles.ADMIN,
  EUserProjectRoles.MEMBER,
];

export interface IProjectPageStore {
  // observables
  loader: TLoader;
  data: Record<string, TProjectPage>; // pageId => Page
  error: TError | undefined;
  filters: TPageFilters;
  // computed
  isAnyPageAvailable: boolean;
  canCurrentUserCreatePage: boolean;
  // helper actions
  getCurrentProjectPageIdsByTab: (pageType: TPageNavigationTabs) => string[] | undefined;
  getCurrentProjectPageIds: (projectId: string) => string[];
  getCurrentProjectFilteredPageIdsByTab: (pageType: TPageNavigationTabs) => string[] | undefined;
  // hierarchy helpers
  getCurrentProjectRootPageIdsByTab: (pageType: TPageNavigationTabs) => string[] | undefined;
  getChildPageIdsByTab: (parentId: string, pageType: TPageNavigationTabs) => string[];
  getPageAncestorIds: (pageId: string) => string[];
  getPageDescendantIds: (pageId: string) => string[];
  getManualOrderedChildIds: (parentId: string | null, projectId: string) => string[];
  getPageById: (pageId: string) => TProjectPage | undefined;
  updateFilters: <T extends keyof TPageFilters>(filterKey: T, filterValue: TPageFilters[T]) => void;
  clearAllFilters: () => void;
  // actions
  fetchPagesList: (
    workspaceSlug: string,
    projectId: string,
    pageType?: TPageNavigationTabs
  ) => Promise<TPage[] | undefined>;
  fetchPageDetails: (
    workspaceSlug: string,
    projectId: string,
    pageId: string,
    options?: { trackVisit?: boolean }
  ) => Promise<TPage | undefined>;
  createPage: (pageData: Partial<TPage>) => Promise<TPage | undefined>;
  removePage: (params: { pageId: string; shouldSync?: boolean }) => Promise<void>;
  movePage: (workspaceSlug: string, projectId: string, pageId: string, newProjectId: string) => Promise<void>;
  reorderPage: (params: {
    sourceId: string;
    targetId: string;
    instruction: InstructionType;
  }) => Promise<void>;
}

const SORT_ORDER_GAP = 10000;

export class ProjectPageStore implements IProjectPageStore {
  // observables
  loader: TLoader = "init-loader";
  data: Record<string, TProjectPage> = {}; // pageId => Page
  error: TError | undefined = undefined;
  filters: TPageFilters = {
    searchQuery: "",
    sortKey: "sort_order",
    sortBy: "asc",
  };
  // service
  service: ProjectPageService;
  rootStore: CoreRootStore;

  constructor(private store: CoreRootStore) {
    makeObservable(this, {
      // observables
      loader: observable.ref,
      data: observable,
      error: observable,
      filters: observable,
      // computed
      isAnyPageAvailable: computed,
      canCurrentUserCreatePage: computed,
      // helper actions
      updateFilters: action,
      clearAllFilters: action,
      // actions
      fetchPagesList: action,
      fetchPageDetails: action,
      createPage: action,
      removePage: action,
      movePage: action,
      reorderPage: action,
    });
    this.rootStore = store;
    // service
    this.service = new ProjectPageService();
    // initialize display filters of the current project
    reaction(
      () => this.store.router.projectId,
      (projectId) => {
        if (!projectId) return;
        this.filters.searchQuery = "";
      }
    );
  }

  /**
   * @description check if any page is available
   */
  get isAnyPageAvailable() {
    if (this.loader) return true;
    return Object.keys(this.data).length > 0;
  }

  /**
   * @description returns true if the current logged in user can create a page
   */
  get canCurrentUserCreatePage() {
    const { workspaceSlug, projectId } = this.store.router;
    const currentUserProjectRole = this.store.user.permission.getProjectRoleByWorkspaceSlugAndProjectId(
      workspaceSlug?.toString() || "",
      projectId?.toString() || ""
    );
    return !!currentUserProjectRole && ROLE_PERMISSIONS_TO_CREATE_PAGE.includes(currentUserProjectRole);
  }

  /**
   * @description get the current project page ids based on the pageType
   * @param {TPageNavigationTabs} pageType
   */
  getCurrentProjectPageIdsByTab = computedFn((pageType: TPageNavigationTabs) => {
    const { projectId } = this.store.router;
    if (!projectId) return undefined;
    // helps to filter pages based on the pageType
    let pagesByType = filterPagesByPageType(pageType, Object.values(this?.data || {}));
    pagesByType = pagesByType.filter((p) => p.project_ids?.includes(projectId));

    const pages = (pagesByType.map((page) => page.id) as string[]) || undefined;

    return pages ?? undefined;
  });

  /**
   * @description get the current project page ids
   * @param {string} projectId
   */
  getCurrentProjectPageIds = computedFn((projectId: string) => {
    if (!projectId) return [];
    const pages = Object.values(this?.data || {}).filter((page) => page.project_ids?.includes(projectId));
    return pages.map((page) => page.id) as string[];
  });

  /**
   * @description get the current project filtered page ids based on the pageType
   * @param {TPageNavigationTabs} pageType
   */
  getCurrentProjectFilteredPageIdsByTab = computedFn((pageType: TPageNavigationTabs) => {
    const { projectId } = this.store.router;
    if (!projectId) return undefined;

    // helps to filter pages based on the pageType
    const pagesByType = filterPagesByPageType(pageType, Object.values(this?.data || {}));
    let filteredPages = pagesByType.filter(
      (p) =>
        p.project_ids?.includes(projectId) &&
        getPageName(p.name).toLowerCase().includes(this.filters.searchQuery.toLowerCase()) &&
        shouldFilterPage(p, this.filters.filters)
    );
    filteredPages = orderPages(filteredPages, this.filters.sortKey, this.filters.sortBy);

    const pages = (filteredPages.map((page) => page.id) as string[]) || undefined;

    return pages ?? undefined;
  });

  /**
   * @description top-level ids for the tree view: visible pages whose parent is not itself visible
   * (so sub-pages of a hidden/unmatched parent still surface, e.g. while searching)
   * @param {TPageNavigationTabs} pageType
   */
  getCurrentProjectRootPageIdsByTab = computedFn((pageType: TPageNavigationTabs) => {
    const visibleIds = this.getCurrentProjectFilteredPageIdsByTab(pageType);
    if (!visibleIds) return undefined;
    const visible = new Set(visibleIds);
    return visibleIds.filter((id) => {
      const parentId = this.data?.[id]?.parent;
      return !parentId || !visible.has(parentId);
    });
  });

  /**
   * @description visible direct children of a page, honouring the current tab, filters and sort
   * @param {string} parentId
   * @param {TPageNavigationTabs} pageType
   */
  getChildPageIdsByTab = computedFn((parentId: string, pageType: TPageNavigationTabs) => {
    const visibleIds = this.getCurrentProjectFilteredPageIdsByTab(pageType) ?? [];
    return visibleIds.filter((id) => this.data?.[id]?.parent === parentId);
  });

  /**
   * @description ancestor ids from the root down to the direct parent (only pages present in the store)
   * @param {string} pageId
   */
  getPageAncestorIds = computedFn((pageId: string) => {
    const chain: string[] = [];
    const seen = new Set<string>([pageId]);
    let current = this.data?.[pageId]?.parent ?? null;
    while (current && !seen.has(current) && this.data?.[current]) {
      chain.unshift(current);
      seen.add(current);
      current = this.data?.[current]?.parent ?? null;
    }
    return chain;
  });

  /**
   * @description every page below the given page (only pages present in the store)
   * @param {string} pageId
   */
  getPageDescendantIds = computedFn((pageId: string) => {
    const result: string[] = [];
    const queue = [pageId];
    const seen = new Set<string>([pageId]);
    while (queue.length) {
      const current = queue.shift() as string;
      for (const page of Object.values(this.data ?? {})) {
        if (page.parent === current && page.id && !seen.has(page.id)) {
          seen.add(page.id);
          result.push(page.id);
          queue.push(page.id);
        }
      }
    }
    return result;
  });

  /**
   * @description non-archived children of a parent (null = top level) in manual order, regardless of tab/filters
   * @param {string | null} parentId
   * @param {string} projectId
   */
  getManualOrderedChildIds = computedFn((parentId: string | null, projectId: string) => {
    const siblings = Object.values(this.data ?? {}).filter(
      (p) => !!p.id && !p.archived_at && (p.parent ?? null) === parentId && p.project_ids?.includes(projectId)
    );
    return orderPages(siblings, "sort_order", "asc").map((p) => p.id as string);
  });

  /**
   * @description get the page store by id
   * @param {string} pageId
   */
  getPageById = computedFn((pageId: string) => this.data?.[pageId] || undefined);

  updateFilters = <T extends keyof TPageFilters>(filterKey: T, filterValue: TPageFilters[T]) => {
    runInAction(() => {
      set(this.filters, [filterKey], filterValue);
    });
  };

  /**
   * @description clear all the filters
   */
  clearAllFilters = () =>
    runInAction(() => {
      set(this.filters, ["filters"], {});
    });

  /**
   * @description fetch all the pages
   */
  fetchPagesList = async (workspaceSlug: string, projectId: string, pageType?: TPageNavigationTabs) => {
    try {
      if (!workspaceSlug || !projectId) return undefined;

      const currentPageIds = pageType ? this.getCurrentProjectPageIdsByTab(pageType) : undefined;
      runInAction(() => {
        this.loader = currentPageIds && currentPageIds.length > 0 ? `mutation-loader` : `init-loader`;
        this.error = undefined;
      });

      const pages = await this.service.fetchAll(workspaceSlug, projectId);
      runInAction(() => {
        for (const page of pages) {
          if (page?.id) {
            const existingPage = this.getPageById(page.id);
            if (existingPage) {
              // If page already exists, update all fields except name

              const { name, ...otherFields } = page;
              existingPage.mutateProperties(otherFields, false);
            } else {
              // If new page, create a new instance with all data
              set(this.data, [page.id], new ProjectPage(this.store, page));
            }
          }
        }
        this.loader = undefined;
      });

      return pages;
    } catch (error) {
      runInAction(() => {
        this.loader = undefined;
        this.error = {
          title: "Failed",
          description: "Failed to fetch the pages, Please try again later.",
        };
      });
      throw error;
    }
  };

  /**
   * @description fetch the details of a page
   * @param {string} pageId
   */
  fetchPageDetails = async (...args: Parameters<IProjectPageStore["fetchPageDetails"]>) => {
    const [workspaceSlug, projectId, pageId, options] = args;
    const { trackVisit } = options || {};
    try {
      if (!workspaceSlug || !projectId || !pageId) return undefined;

      const currentPageId = this.getPageById(pageId);
      runInAction(() => {
        this.loader = currentPageId ? `mutation-loader` : `init-loader`;
        this.error = undefined;
      });

      const page = await this.service.fetchById(workspaceSlug, projectId, pageId, trackVisit ?? true);

      runInAction(() => {
        if (page?.id) {
          const pageInstance = this.getPageById(page.id);
          if (pageInstance) {
            pageInstance.mutateProperties(page, false);
          } else {
            set(this.data, [page.id], new ProjectPage(this.store, page));
          }
        }
        this.loader = undefined;
      });

      return page;
    } catch (error) {
      runInAction(() => {
        this.loader = undefined;
        this.error = {
          title: "Failed",
          description: "Failed to fetch the page, Please try again later.",
        };
      });
      throw error;
    }
  };

  /**
   * @description create a page
   * @param {Partial<TPage>} pageData
   */
  createPage = async (pageData: Partial<TPage>) => {
    try {
      const { workspaceSlug, projectId } = this.store.router;
      if (!workspaceSlug || !projectId) return undefined;

      runInAction(() => {
        this.loader = "mutation-loader";
        this.error = undefined;
      });

      // place the new page after its siblings in manual order
      if (pageData.sort_order === undefined) {
        const siblingIds = this.getManualOrderedChildIds(pageData.parent ?? null, projectId);
        const last = siblingIds.length ? this.getPageById(siblingIds[siblingIds.length - 1]) : undefined;
        pageData = { ...pageData, sort_order: (last?.sort_order ?? 0) + SORT_ORDER_GAP };
      }

      const page = await this.service.create(workspaceSlug, projectId, pageData);
      runInAction(() => {
        if (page?.id) set(this.data, [page.id], new ProjectPage(this.store, page));
        if (page?.parent) this.getPageById(page.parent)?.adjustSubPagesCount(1);
        this.loader = undefined;
      });

      return page;
    } catch (error) {
      runInAction(() => {
        this.loader = undefined;
        this.error = {
          title: "Failed",
          description: "Failed to create a page, Please try again later.",
        };
      });
      throw error;
    }
  };

  /**
   * @description delete a page
   * @param {string} pageId
   */
  removePage = async ({ pageId, shouldSync: _shouldSync = true }: { pageId: string; shouldSync?: boolean }) => {
    try {
      const { workspaceSlug, projectId } = this.store.router;
      if (!workspaceSlug || !projectId || !pageId) return undefined;

      await this.service.remove(workspaceSlug, projectId, pageId);
      runInAction(() => {
        const removed = this.data?.[pageId];
        // the backend re-roots direct children of a deleted page; mirror that locally
        Object.values(this.data ?? {}).forEach((page) => {
          if (page.parent === pageId) page.parent = null;
        });
        if (removed?.parent) this.getPageById(removed.parent)?.adjustSubPagesCount(-1);
        unset(this.data, [pageId]);
        if (this.rootStore.favorite.entityMap[pageId]) this.rootStore.favorite.removeFavoriteFromStore(pageId);
      });
    } catch (error) {
      runInAction(() => {
        this.loader = undefined;
        this.error = {
          title: "Failed",
          description: "Failed to delete a page, Please try again later.",
        };
      });
      throw error;
    }
  };

  /**
   * @description drag-and-drop handler: nest `source` under `target` (make-child) or place it
   * directly above/below `target` among the target's siblings. Persists parent and sort_order.
   */
  reorderPage = async ({
    sourceId,
    targetId,
    instruction,
  }: {
    sourceId: string;
    targetId: string;
    instruction: InstructionType;
  }) => {
    const source = this.getPageById(sourceId);
    const target = this.getPageById(targetId);
    const projectId = this.store.router.projectId ?? source?.project_ids?.[0];
    if (!projectId || !source || !target || sourceId === targetId) return;
    // pages can only be nested within the same project
    if (!target.project_ids?.includes(projectId) || !source.project_ids?.includes(projectId)) return;
    // never nest a page inside its own subtree
    if (this.getPageDescendantIds(sourceId).includes(targetId)) return;

    const newParentId = instruction === "make-child" ? targetId : (target.parent ?? null);
    const siblingIds = this.getManualOrderedChildIds(newParentId, projectId).filter((id) => id !== sourceId);

    // desired final order of the siblings including the source
    let insertAt = siblingIds.length;
    if (instruction !== "make-child") {
      const targetIndex = siblingIds.indexOf(targetId);
      insertAt = targetIndex < 0 ? siblingIds.length : instruction === "reorder-above" ? targetIndex : targetIndex + 1;
    }
    const ordered = [...siblingIds.slice(0, insertAt), sourceId, ...siblingIds.slice(insertAt)];

    const getSort = (id: string) => this.getPageById(id)?.sort_order;
    const prev = insertAt > 0 ? getSort(ordered[insertAt - 1]) : undefined;
    const next = insertAt < ordered.length - 1 ? getSort(ordered[insertAt + 1]) : undefined;

    let newSortOrder: number | undefined;
    if (prev === undefined && next === undefined) newSortOrder = source.sort_order ?? SORT_ORDER_GAP;
    else if (prev === undefined && next !== undefined) newSortOrder = next - SORT_ORDER_GAP;
    else if (next === undefined && prev !== undefined) newSortOrder = prev + SORT_ORDER_GAP;
    else if (prev !== undefined && next !== undefined && next - prev > 1) newSortOrder = (prev + next) / 2;

    // manual order should be what the user sees after dropping
    if (this.filters.sortKey !== "sort_order") this.updateFilters("sortKey", "sort_order");
    if (this.filters.sortBy !== "asc") this.updateFilters("sortBy", "asc");

    if (newSortOrder !== undefined) {
      await source.updateHierarchy({ parent: newParentId, sort_order: newSortOrder });
      return;
    }
    // neighbours are tied or too close (e.g. all still on the default value): renormalise the whole sibling list.
    // Locked siblings can't be PATCHed (server returns 400), so leave them where they are.
    const results = await Promise.allSettled(
      ordered.map((id, index) => {
        const page = this.getPageById(id);
        if (!page || (page.is_locked && id !== sourceId)) return Promise.resolve();
        const desired = (index + 1) * SORT_ORDER_GAP;
        return page.updateHierarchy(
          id === sourceId ? { parent: newParentId, sort_order: desired } : { sort_order: desired }
        );
      })
    );
    const sourceResult = results[ordered.indexOf(sourceId)];
    if (sourceResult && sourceResult.status === "rejected") throw sourceResult.reason;
  };

  /**
   * @description move a page to a new project
   * @param {string} workspaceSlug
   * @param {string} projectId
   * @param {string} pageId
   * @param {string} newProjectId
   */
  movePage = async (workspaceSlug: string, projectId: string, pageId: string, newProjectId: string) => {
    try {
      await this.service.move(workspaceSlug, projectId, pageId, newProjectId);
      runInAction(() => {
        unset(this.data, [pageId]);
      });
    } catch (error) {
      console.error("Unable to move page", error);
      throw error;
    }
  };
}
