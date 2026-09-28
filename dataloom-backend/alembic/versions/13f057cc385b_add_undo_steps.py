"""add undo steps

Revision ID: 13f057cc385b
Revises: d5e6f7a8b9c0
Create Date: 2026-09-28 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "13f057cc385b"
down_revision: str | Sequence[str] | None = "d5e6f7a8b9c0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "undo_steps",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("entries", sa.JSON(), nullable=False),
        sa.Column("before_path", sa.String(), nullable=True),
        sa.Column("after_path", sa.String(), nullable=True),
        sa.Column("undone_seq", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.project_id"],
            name="undo_steps_project_id_fkey",
            ondelete="CASCADE",
        ),
    )
    op.create_index(op.f("ix_undo_steps_project_id"), "undo_steps", ["project_id"], unique=False)

    # Existing rows predate undo steps and keep NULL; undo replays them.
    op.add_column("user_logs", sa.Column("undo_step_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "user_logs_undo_step_id_fkey",
        "user_logs",
        "undo_steps",
        ["undo_step_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(op.f("ix_user_logs_undo_step_id"), "user_logs", ["undo_step_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_user_logs_undo_step_id"), table_name="user_logs")
    op.drop_constraint("user_logs_undo_step_id_fkey", "user_logs", type_="foreignkey")
    op.drop_column("user_logs", "undo_step_id")
    op.drop_index(op.f("ix_undo_steps_project_id"), table_name="undo_steps")
    op.drop_table("undo_steps")
