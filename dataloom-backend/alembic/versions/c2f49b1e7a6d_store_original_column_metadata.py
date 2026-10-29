"""store upload-time column metadata for project reset

Revision ID: c2f49b1e7a6d
Revises: 7c1f95a42d10
Create Date: 2026-10-28 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c2f49b1e7a6d"
down_revision: str | Sequence[str] | None = "7c1f95a42d10"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add an optional immutable semantic dtype snapshot to each project."""
    op.add_column("projects", sa.Column("original_column_metadata", sa.JSON(), nullable=True))


def downgrade() -> None:
    """Remove upload-time semantic dtype snapshots."""
    op.drop_column("projects", "original_column_metadata")
