/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
import type { TPage, TPageExtended } from "@plane/types";
import type { CoreRootStore } from "@/store/root.store";
import type { TBasePageServices } from "@/store/pages/base-page";

export type TExtendedPageInstance = TPageExtended & {
  asJSONExtended: TPageExtended;
  /** Move this page under another page (or to the root with `null`). */
  updateParent: (parentId: string | null) => Promise<void>;
  /** Update parent and/or manual position in one request, with optimistic rollback. */
  updateHierarchy: (data: { parent?: string | null; sort_order?: number }) => Promise<void>;
  /** Adjust the cached sub-page count without a refetch. */
  adjustSubPagesCount: (delta: number) => void;
};

/**
 * Page hierarchy (nested pages) for the Community Edition.
 */
export class ExtendedBasePage implements TExtendedPageInstance {
  parent: string | null | undefined;
  sub_pages_count: number;
  sort_order: number | undefined;

  constructor(
    private extendedStore: CoreRootStore,
    page: TPage,
    private extendedServices: TBasePageServices
  ) {
    this.parent = page?.parent ?? null;
    this.sub_pages_count = page?.sub_pages_count ?? 0;
    this.sort_order = page?.sort_order;

    makeObservable(this, {
      parent: observable.ref,
      sub_pages_count: observable.ref,
      sort_order: observable.ref,
      updateParent: action,
      updateHierarchy: action,
      adjustSubPagesCount: action,
    });
  }

  get asJSONExtended(): TExtendedPageInstance["asJSONExtended"] {
    return {
      parent: this.parent,
      sub_pages_count: this.sub_pages_count,
      sort_order: this.sort_order,
    };
  }

  adjustSubPagesCount = (delta: number) => {
    runInAction(() => {
      this.sub_pages_count = Math.max(0, (this.sub_pages_count ?? 0) + delta);
    });
  };

  updateParent = async (parentId: string | null) => this.updateHierarchy({ parent: parentId });

  updateHierarchy = async (data: { parent?: string | null; sort_order?: number }) => {
    const previousParent = this.parent ?? null;
    const previousSortOrder = this.sort_order;
    const parentChanged = data.parent !== undefined && (data.parent ?? null) !== previousParent;
    const sortChanged = data.sort_order !== undefined && data.sort_order !== previousSortOrder;
    if (!parentChanged && !sortChanged) return;
    const nextParent = parentChanged ? (data.parent ?? null) : previousParent;
    const pages = this.extendedStore.projectPages;
    runInAction(() => {
      if (parentChanged) {
        this.parent = nextParent;
        if (previousParent) pages.getPageById(previousParent)?.adjustSubPagesCount(-1);
        if (nextParent) pages.getPageById(nextParent)?.adjustSubPagesCount(1);
      }
      if (sortChanged) this.sort_order = data.sort_order;
    });
    const payload: Partial<TPage> = {};
    if (parentChanged) payload.parent = nextParent;
    if (sortChanged) payload.sort_order = data.sort_order;
    try {
      await this.extendedServices.update(payload);
    } catch (error) {
      runInAction(() => {
        if (parentChanged) {
          this.parent = previousParent;
          if (previousParent) pages.getPageById(previousParent)?.adjustSubPagesCount(1);
          if (nextParent) pages.getPageById(nextParent)?.adjustSubPagesCount(-1);
        }
        if (sortChanged) this.sort_order = previousSortOrder;
      });
      throw error;
    }
  };
}
