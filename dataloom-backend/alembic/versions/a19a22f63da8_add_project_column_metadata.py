"""add project column metadata

Revision ID: a19a22f63da8
Revises: d5e6f7a8b9c0
Create Date: 2026-09-16 17:46:33.240355

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = "a19a22f63da8"
down_revision: Union[str, Sequence[str], None] = "d5e6f7a8b9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "project_column_metadata",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "project_id",
            sa.Uuid(),
            nullable=False,
        ),
        sa.Column(
            "column_name",
            sqlmodel.sql.sqltypes.AutoString(length=255),
            nullable=False,
        ),
        sa.Column(
            "column_dtype",
            sqlmodel.sql.sqltypes.AutoString(length=50),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.project_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "project_id",
            "column_name",
            name="uq_project_column_metadata_project_column",
        ),
    )

    op.create_index(
        op.f("ix_project_column_metadata_project_id"),
        "project_column_metadata",
        ["project_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        op.f("ix_project_column_metadata_project_id"),
        table_name="project_column_metadata",
    )
    op.drop_table("project_column_metadata")
