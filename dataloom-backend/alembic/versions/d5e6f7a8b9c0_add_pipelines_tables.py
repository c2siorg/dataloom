"""add pipelines tables

Revision ID: d5e6f7a8b9c0
Revises: 0264244c1240
Create Date: 2026-07-18 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d5e6f7a8b9c0"
down_revision: str | Sequence[str] | None = "0264244c1240"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "pipelines",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["users.id"],
            name="pipelines_owner_id_fkey",
            ondelete="CASCADE",
        ),
    )
    op.create_index(op.f("ix_pipelines_owner_id"), "pipelines", ["owner_id"], unique=False)

    op.create_table(
        "pipeline_steps",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("pipeline_id", sa.Uuid(), nullable=False),
        sa.Column("step_order", sa.Integer(), nullable=False),
        sa.Column("action_type", sa.String(length=50), nullable=False),
        sa.Column("action_details", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["pipeline_id"],
            ["pipelines.id"],
            name="pipeline_steps_pipeline_id_fkey",
            ondelete="CASCADE",
        ),
    )
    op.create_index(op.f("ix_pipeline_steps_pipeline_id"), "pipeline_steps", ["pipeline_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_pipeline_steps_pipeline_id"), table_name="pipeline_steps")
    op.drop_table("pipeline_steps")
    op.drop_index(op.f("ix_pipelines_owner_id"), table_name="pipelines")
    op.drop_table("pipelines")
