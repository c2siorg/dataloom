"""add jobs table

Revision ID: af39a29e48dd
Revises: 13f057cc385b
Create Date: 2026-09-30 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "af39a29e48dd"
down_revision: str | Sequence[str] | None = "13f057cc385b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ACTIVE_EXCLUSIVE_JOB = "is_exclusive AND status IN ('queued', 'running')"


def upgrade() -> None:
    op.create_table(
        "jobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("is_exclusive", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("progress_current", sa.Integer(), nullable=False),
        sa.Column("progress_total", sa.Integer(), nullable=True),
        sa.Column("progress_message", sa.String(length=200), nullable=False),
        sa.Column("params", sa.JSON(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("cancel_requested", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["users.id"],
            name="jobs_owner_id_fkey",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.project_id"],
            name="jobs_project_id_fkey",
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "ux_jobs_active_exclusive_project",
        "jobs",
        ["project_id"],
        unique=True,
        postgresql_where=sa.text(_ACTIVE_EXCLUSIVE_JOB),
        sqlite_where=sa.text(_ACTIVE_EXCLUSIVE_JOB),
    )
    op.create_index("ix_jobs_project_id_status", "jobs", ["project_id", "status"], unique=False)
    op.create_index("ix_jobs_owner_id_status", "jobs", ["owner_id", "status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_jobs_owner_id_status", table_name="jobs")
    op.drop_index("ix_jobs_project_id_status", table_name="jobs")
    op.drop_index("ux_jobs_active_exclusive_project", table_name="jobs")
    op.drop_table("jobs")
