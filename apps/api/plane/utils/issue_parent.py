# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Helpers for validating parent / sub work item relationships.

A parent work item may live in a different project from its child, as long as
both are in the same workspace and the acting user is a member of the parent's
project. Cycles (an issue becoming its own ancestor) are rejected.
"""

# Third party imports
from rest_framework import serializers

# Module imports
from plane.db.models import Issue, Project, ProjectMember

# Guest role value (kept local to avoid importing plane.app from plane.utils)
GUEST_ROLE = 5

MAX_PARENT_DEPTH = 100


def get_ancestor_ids(issue_id):
    """Return the set of ancestor issue ids of ``issue_id`` (excluding itself)."""
    ancestors = set()
    current_id = issue_id
    for _ in range(MAX_PARENT_DEPTH):
        parent_id = Issue.objects.filter(pk=current_id).values_list("parent_id", flat=True).first()
        if parent_id is None or parent_id in ancestors:
            break
        ancestors.add(parent_id)
        current_id = parent_id
    return ancestors


def get_descendant_ids(issue_id):
    """Return the set of all descendant issue ids of ``issue_id`` (excluding itself)."""
    descendants = set()
    frontier = [issue_id]
    for _ in range(MAX_PARENT_DEPTH):
        if not frontier:
            break
        children = list(Issue.objects.filter(parent_id__in=frontier).values_list("id", flat=True))
        children = [c for c in children if c not in descendants]
        descendants.update(children)
        frontier = children
    return descendants


def validate_parent_issue(parent, project_id, user_id=None, instance=None):
    """
    Validate that ``parent`` can be the parent of a work item in ``project_id``.

    Rules:
    - The parent must exist in the same workspace as ``project_id``.
    - If the parent is in another project, ``user_id`` (when given) must be an
      active, non-guest member of that project.
    - A work item cannot be its own parent or the descendant of itself.
    """
    if parent is None:
        return

    project = Project.objects.filter(pk=project_id).values("workspace_id").first()
    if project is None:
        raise serializers.ValidationError("Project is not valid")

    parent_row = Issue.objects.filter(pk=parent.id).values("project_id", "workspace_id").first()
    if parent_row is None or str(parent_row["workspace_id"]) != str(project["workspace_id"]):
        raise serializers.ValidationError("Parent is not valid issue_id please pass a valid issue_id")

    # Cross-project parent: acting user must be a non-guest member of the parent's project
    if (
        user_id is not None
        and str(parent_row["project_id"]) != str(project_id)
        and not ProjectMember.objects.filter(
            project_id=parent_row["project_id"],
            member_id=user_id,
            is_active=True,
            role__gt=GUEST_ROLE,
        ).exists()
    ):
        raise serializers.ValidationError("Parent is not valid issue_id please pass a valid issue_id")

    # Cycle detection (only meaningful when updating an existing work item)
    if instance is not None:
        if str(parent.id) == str(instance.id):
            raise serializers.ValidationError("A work item cannot be its own parent")
        if str(instance.id) in {str(i) for i in get_ancestor_ids(parent.id)}:
            raise serializers.ValidationError("Cannot set a sub work item as the parent of its own ancestor")
