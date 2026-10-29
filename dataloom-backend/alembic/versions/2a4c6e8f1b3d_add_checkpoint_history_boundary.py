"""add checkpoint history boundary

Revision ID: 2a4c6e8f1b3d
Revises: eececad1072d
Create Date: 2026-10-09 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "2a4c6e8f1b3d"
down_revision: str | Sequence[str] | None = "eececad1072d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "checkpoints",
        sa.Column("last_change_log_id", sa.Integer(), nullable=True),
    )

    op.execute(
        sa.text("""
            UPDATE checkpoints AS c
            SET last_change_log_id = (
                SELECT MAX(u.change_log_id)
                FROM user_logs AS u
                WHERE u.checkpoint_id = c.id
            )
            WHERE EXISTS (
                SELECT 1
                FROM user_logs AS u
                WHERE u.checkpoint_id = c.id
            )
        """)
    )


def downgrade() -> None:
    op.drop_column("checkpoints", "last_change_log_id")
