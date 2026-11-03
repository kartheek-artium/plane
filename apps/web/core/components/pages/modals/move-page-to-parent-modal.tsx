/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
// headless ui
import { Combobox } from "@headlessui/react";
// plane imports
import { Logo } from "@plane/propel/emoji-icon-picker";
import { PageIcon, SearchIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn, getPageName } from "@plane/utils";
// hooks
import type { EPageStoreType } from "@/hooks/store";
import { usePageStore } from "@/hooks/store";
// store types
import type { TPageInstance } from "@/store/pages/base-page";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  page: TPageInstance;
  storeType: EPageStoreType;
};

const ROOT_OPTION = "__root__";

/**
 * Pick a new parent page for `page` (nested pages). The page itself, its
 * descendants and archived pages are excluded so no cycles can be created.
 */
export const MovePageToParentModal = observer(function MovePageToParentModal(props: Props) {
  const { isOpen, onClose, page, storeType } = props;
  // store hooks
  const { getCurrentProjectPageIds, getPageById, getPageDescendantIds } = usePageStore(storeType);
  // states
  const [query, setQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // derived values
  const currentParentId = page.parent ?? null;
  const candidateIds = useMemo(() => {
    const projectId = page.project_ids?.[0];
    if (!projectId || !page.id) return [];
    const excluded = new Set<string>([page.id, ...getPageDescendantIds(page.id)]);
    return getCurrentProjectPageIds(projectId).filter((id) => {
      if (excluded.has(id)) return false;
      const candidate = getPageById(id);
      if (!candidate || candidate.archived_at) return false;
      if (!query.trim()) return true;
      return getPageName(candidate.name).toLowerCase().includes(query.trim().toLowerCase());
    });
  }, [page.id, page.project_ids, query, getCurrentProjectPageIds, getPageById, getPageDescendantIds]);

  const handleClose = () => {
    setQuery("");
    onClose();
  };

  const handleSelect = async (value: string | null) => {
    if (value === null || isSubmitting) return;
    const newParentId = value === ROOT_OPTION ? null : value;
    if (newParentId === currentParentId) {
      handleClose();
      return;
    }
    setIsSubmitting(true);
    try {
      await page.updateParent(newParentId);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: newParentId ? "Page moved under the selected page." : "Page moved to the top level.",
      });
      handleClose();
    } catch (error) {
      const message =
        (error as { error?: string } | undefined)?.error || "Page could not be moved. Please try again.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <Combobox value={currentParentId ?? ROOT_OPTION} onChange={handleSelect}>
        <div className="relative m-1">
          <SearchIcon
            className="text-opacity-40 pointer-events-none absolute top-3.5 left-4 h-5 w-5 text-primary"
            aria-hidden="true"
          />
          <Combobox.Input
            className="h-12 w-full border-0 bg-transparent pr-4 pl-11 text-primary outline-none placeholder:text-placeholder focus:ring-0 sm:text-13"
            placeholder="Move under which page?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            displayValue={() => ""}
            autoFocus
          />
        </div>
        <Combobox.Options static className="vertical-scrollbar scrollbar-md max-h-80 scroll-py-2 overflow-y-auto p-2">
          <Combobox.Option
            value={ROOT_OPTION}
            className={({ active, selected }) =>
              cn(
                "my-0.5 flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-13 text-secondary select-none",
                { "bg-layer-1 text-primary": active, "text-primary": selected }
              )
            }
          >
            <PageIcon className="h-4 w-4 text-tertiary" />
            <span className="truncate">Top level (no parent)</span>
            {currentParentId === null && <span className="ml-auto text-11 text-placeholder">current</span>}
          </Combobox.Option>
          {candidateIds.length === 0 && query.trim() && (
            <p className="px-3 py-2 text-13 text-placeholder">No matching pages.</p>
          )}
          {candidateIds.map((id) => {
            const candidate = getPageById(id);
            if (!candidate) return null;
            return (
              <Combobox.Option
                key={id}
                value={id}
                className={({ active, selected }) =>
                  cn(
                    "my-0.5 flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-13 text-secondary select-none",
                    { "bg-layer-1 text-primary": active, "text-primary": selected }
                  )
                }
              >
                {candidate.logo_props?.in_use ? (
                  <Logo logo={candidate.logo_props} size={16} type="lucide" />
                ) : (
                  <PageIcon className="h-4 w-4 text-tertiary" />
                )}
                <span className="truncate">{getPageName(candidate.name)}</span>
                {id === currentParentId && <span className="ml-auto text-11 text-placeholder">current</span>}
              </Combobox.Option>
            );
          })}
        </Combobox.Options>
      </Combobox>
    </ModalCore>
  );
});
