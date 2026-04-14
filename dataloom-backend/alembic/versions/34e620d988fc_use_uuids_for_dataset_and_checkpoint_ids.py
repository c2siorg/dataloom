"""use_uuids_for_dataset_and_checkpoint_ids

Revision ID: 34e620d988fc
Revises:
Create Date: 2026-02-22 10:52:35.360767

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "34e620d988fc"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if "datasets" not in existing_tables:
        # Fresh database: create tables directly with UUID primary keys
        op.create_table(
            "datasets",
            sa.Column("dataset_id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("file_path", sa.String(), nullable=False),
            sa.Column("upload_date", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("last_modified", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("description", sa.String(), nullable=True),
            sa.PrimaryKeyConstraint("dataset_id"),
        )
        op.create_table(
            "checkpoints",
            sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
            sa.Column("dataset_id", sa.Uuid(), nullable=False),
            sa.Column("message", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["dataset_id"], ["datasets.dataset_id"]),
        )
        op.create_table(
            "user_logs",
            sa.Column("change_log_id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("dataset_id", sa.Uuid(), nullable=False),
            sa.Column("action_type", sa.String(50), nullable=False),
            sa.Column("action_details", sa.JSON(), nullable=False),
            sa.Column("timestamp", sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column("checkpoint_id", sa.Uuid(), nullable=True),
            sa.Column("applied", sa.Boolean(), server_default="false", nullable=False),
            sa.PrimaryKeyConstraint("change_log_id"),
            sa.ForeignKeyConstraint(["dataset_id"], ["datasets.dataset_id"]),
            sa.ForeignKeyConstraint(["checkpoint_id"], ["checkpoints.id"]),
        )
    else:
        # Existing database: alter tables from integer IDs to UUIDs
        op.drop_constraint(op.f("checkpoints_dataset_id_fkey"), "checkpoints", type_="foreignkey")
        op.drop_constraint(op.f("user_logs_dataset_id_fkey"), "user_logs", type_="foreignkey")
        op.drop_constraint(op.f("user_logs_checkpoint_id_fkey"), "user_logs", type_="foreignkey")
        op.drop_index(op.f("ix_checkpoints_id"), table_name="checkpoints")
        op.drop_index(op.f("ix_datasets_dataset_id"), table_name="datasets")
        op.alter_column("datasets", "dataset_id", server_default=None)
        op.alter_column("checkpoints", "id", server_default=None)
        op.alter_column(
            "datasets",
            "dataset_id",
            existing_type=sa.INTEGER(),
            type_=sa.Uuid(),
            existing_nullable=False,
            postgresql_using="gen_random_uuid()",
        )
        op.alter_column(
            "checkpoints",
            "id",
            existing_type=sa.INTEGER(),
            type_=sa.Uuid(),
            existing_nullable=False,
            postgresql_using="gen_random_uuid()",
        )
        op.alter_column("datasets", "dataset_id", server_default=sa.text("gen_random_uuid()"))
        op.alter_column("checkpoints", "id", server_default=sa.text("gen_random_uuid()"))
        op.alter_column(
            "checkpoints",
            "dataset_id",
            existing_type=sa.INTEGER(),
            type_=sa.Uuid(),
            existing_nullable=False,
            postgresql_using="gen_random_uuid()",
        )
        op.alter_column(
            "user_logs",
            "dataset_id",
            existing_type=sa.INTEGER(),
            type_=sa.Uuid(),
            existing_nullable=False,
            postgresql_using="gen_random_uuid()",
        )
        op.alter_column(
            "user_logs",
            "checkpoint_id",
            existing_type=sa.INTEGER(),
            type_=sa.Uuid(),
            existing_nullable=True,
            postgresql_using="checkpoint_id::text::uuid",
        )
        op.alter_column("datasets", "name", existing_type=sa.VARCHAR(), nullable=False)
        op.alter_column("datasets", "file_path", existing_type=sa.VARCHAR(), nullable=False)
        op.create_foreign_key(None, "checkpoints", "datasets", ["dataset_id"], ["dataset_id"])
        op.create_foreign_key(None, "user_logs", "datasets", ["dataset_id"], ["dataset_id"])
        op.create_foreign_key(None, "user_logs", "checkpoints", ["checkpoint_id"], ["id"])


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    if "datasets" in existing_tables:
        op.drop_table("user_logs")
        op.drop_table("checkpoints")
        op.drop_table("datasets")
