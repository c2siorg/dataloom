"""initial_schema

Revision ID: 000000000000
Revises:
Create Date: 2026-01-01 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "000000000000"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # datasets
    op.create_table(
        "datasets",
        sa.Column("dataset_id", sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column("name", sa.VARCHAR(), autoincrement=False, nullable=True),
        sa.Column("description", sa.VARCHAR(), autoincrement=False, nullable=True),
        sa.Column("upload_date", sa.DateTime(), server_default=sa.text("now()"), autoincrement=False, nullable=True),
        sa.Column("last_modified", sa.DateTime(), server_default=sa.text("now()"), autoincrement=False, nullable=True),
        sa.Column("file_path", sa.VARCHAR(), autoincrement=False, nullable=True),
        sa.PrimaryKeyConstraint("dataset_id", name="datasets_pkey"),
    )
    op.create_index("ix_datasets_dataset_id", "datasets", ["dataset_id"], unique=False)
    op.create_index("ix_datasets_name", "datasets", ["name"], unique=False)

    # checkpoints
    op.create_table(
        "checkpoints",
        sa.Column("id", sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column("dataset_id", sa.INTEGER(), autoincrement=False, nullable=False),
        sa.Column("message", sa.VARCHAR(), autoincrement=False, nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), autoincrement=False, nullable=True),
        sa.ForeignKeyConstraint(
            ["dataset_id"], ["datasets.dataset_id"], name="checkpoints_dataset_id_fkey", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="checkpoints_pkey"),
    )
    op.create_index("ix_checkpoints_id", "checkpoints", ["id"], unique=False)

    # user_logs
    op.create_table(
        "user_logs",
        sa.Column("change_log_id", sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column("dataset_id", sa.INTEGER(), autoincrement=False, nullable=False),
        sa.Column("action_type", sa.VARCHAR(length=50), autoincrement=False, nullable=False),
        sa.Column("action_details", sa.JSON(), autoincrement=False, nullable=False),
        sa.Column("timestamp", sa.DateTime(), server_default=sa.text("now()"), autoincrement=False, nullable=False),
        sa.Column("checkpoint_id", sa.INTEGER(), autoincrement=False, nullable=True),
        sa.Column("applied", sa.BOOLEAN(), server_default=sa.text("false"), autoincrement=False, nullable=False),
        sa.ForeignKeyConstraint(
            ["checkpoint_id"], ["checkpoints.id"], name="user_logs_checkpoint_id_fkey", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["dataset_id"], ["datasets.dataset_id"], name="user_logs_dataset_id_fkey", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("change_log_id", name="user_logs_pkey"),
    )


def downgrade() -> None:
    op.drop_table("user_logs")
    op.drop_index("ix_checkpoints_id", table_name="checkpoints")
    op.drop_table("checkpoints")
    op.drop_index("ix_datasets_name", table_name="datasets")
    op.drop_index("ix_datasets_dataset_id", table_name="datasets")
    op.drop_table("datasets")
