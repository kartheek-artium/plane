/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Plus } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { PageIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { getPageName } from "@plane/utils";
// hooks
import { EPageStoreType, usePageStore } from "@/hooks/store";
import { useAppRouter } from "@/hooks/use-app-router";
// store
import type { TPageInstance } from "@/store/pages/base-page";

type Props = {
  page: TPageInstance;
};

/**
 * Lists the direct sub-pages of the current page and lets the user add one.
 */
export const PageNavigationPaneSubPagesTabPanel = observer(function PageNavigationPaneSubPagesTabPanel(
  props: Props
) {
  const { page } = props;
  // navigation
  const { workspaceSlug, projectId } = useParams();
  const router = useAppRouter();
  // translation
  const { t } = useTranslation();
  // store
  const { getManualOrderedChildIds, getPageById, createPage, canCurrentUserCreatePage } = usePageStore(
    EPageStoreType.PROJECT
  );
  // state
  const [isCreating, setIsCreating] = useState(false);
  // derived values
  const resolvedProjectId = projectId?.toString() ?? page.project_ids?.[0] ?? "";
  const childIds = page.id ? getManualOrderedChildIds(page.id, resolvedProjectId) : [];
  const canAdd = canCurrentUserCreatePage && !page.archived_at;

  const handleAdd = async () => {
    if (!page.id || isCreating) return;
    setIsCreating(true);
    try {
      const created = await createPage({ parent: page.id, access: page.access });
      if (created?.id && workspaceSlug && resolvedProjectId)
        router.push(`/${workspaceSlug}/projects/${resolvedProjectId}/pages/${created.id}`);
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: (error as { error?: string } | undefined)?.error || "Sub-page could not be created. Please try again.",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 px-3">
      {canAdd && (
        <div>
          <Button variant="secondary" size="sm" prependIcon={<Plus className="size-3" />} onClick={handleAdd} loading={isCreating}>
            {t("page_navigation_pane.tabs.sub_pages.add_button")}
          </Button>
        </div>
      )}
      {childIds.length === 0 ? (
        <div className="flex flex-col gap-1 py-6 text-center">
          <p className="text-13 font-medium text-primary">{t("page_navigation_pane.tabs.sub_pages.empty_state.title")}</p>
          <p className="text-11 text-tertiary">{t("page_navigation_pane.tabs.sub_pages.empty_state.description")}</p>
        </div>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          {childIds.map((id) => {
            const child = getPageById(id);
            if (!child) return null;
            return (
              <li key={id}>
                <Link
                  href={`/${workspaceSlug}/projects/${resolvedProjectId}/pages/${id}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-13 text-secondary hover:bg-layer-transparent-hover hover:text-primary"
                >
                  {child.logo_props?.in_use ? (
                    <Logo logo={child.logo_props} size={14} type="lucide" />
                  ) : (
                    <PageIcon className="size-3.5 flex-shrink-0 text-tertiary" />
                  )}
                  <span className="truncate">{getPageName(child.name)}</span>
                  {!!child.sub_pages_count && child.sub_pages_count > 0 && (
                    <span className="ml-auto text-10 text-placeholder">{child.sub_pages_count}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});
