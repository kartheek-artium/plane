/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Page hierarchy (nested pages). A page with a `parent` is a sub-page; a page
 * with `sub_pages_count > 0` acts as a folder in the pages list.
 */
export type TPageExtended = {
  parent?: string | null;
  sub_pages_count?: number;
  sort_order?: number;
};

/** Minimal ancestor shape returned by the `parents/` endpoint, used for breadcrumbs. */
export type TPageAncestor = {
  id: string;
  name: string;
  logo_props: Record<string, unknown>;
  access: number;
  archived_at: string | null;
};
