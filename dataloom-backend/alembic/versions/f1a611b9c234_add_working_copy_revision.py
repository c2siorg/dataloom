"""add persisted working-copy revisions

Revision ID: f1a611b9c234
Revises: c2f49b1e7a6d
Create Date: 2026-10-29 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f1a611b9c234"
down_revision: str | Sequence[str] | None = "c2f49b1e7a6d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Initialize existing projects at revision zero."""
    op.add_column(
        "projects",
        sa.Column("working_copy_revision", sa.Integer(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("projects", "working_copy_revision")
