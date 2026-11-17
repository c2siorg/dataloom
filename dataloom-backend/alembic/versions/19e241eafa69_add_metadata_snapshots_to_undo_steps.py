"""add metadata snapshots to undo steps

Revision ID: 19e241eafa69
Revises: a19a22f63da8
Create Date: 2026-10-03 18:13:15.729272

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "19e241eafa69"
down_revision: str | Sequence[str] | None = "a19a22f63da8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add optional dtype metadata snapshots to undo steps."""
    op.add_column(
        "undo_steps",
        sa.Column("metadata_before", sa.JSON(), nullable=True),
    )
    op.add_column(
        "undo_steps",
        sa.Column("metadata_after", sa.JSON(), nullable=True),
    )
    op.add_column("checkpoints", sa.Column("metadata_snapshot", sa.JSON(), nullable=True))


def downgrade() -> None:
    """Remove dtype metadata snapshots from undo steps."""
    op.drop_column("checkpoints", "metadata_snapshot")
    op.drop_column("undo_steps", "metadata_after")
    op.drop_column("undo_steps", "metadata_before")
