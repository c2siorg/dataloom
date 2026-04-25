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


def _ensure_pgcrypto_extension() -> None:
    """Ensure PostgreSQL UUID generation function is available."""
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(sa.text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))


def _bootstrap_fresh_uuid_schema() -> None:
    """Create baseline schema for fresh installs.

    This revision historically migrated legacy integer-key tables to UUIDs.
    On a brand-new database those legacy tables do not exist, so we create
    the post-upgrade schema directly.
    """
    op.create_table(
        "datasets",
        sa.Column("dataset_id", sa.Uuid(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("file_path", sa.String(), nullable=False),
        sa.Column("upload_date", sa.DateTime(), nullable=True, server_default=sa.text("now()")),
        sa.Column("last_modified", sa.DateTime(), nullable=True, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("dataset_id"),
    )

    op.create_table(
        "checkpoints",
        sa.Column("id", sa.Uuid(), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("dataset_id", sa.Uuid(), nullable=False),
        sa.Column("message", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(
            ["dataset_id"],
            ["datasets.dataset_id"],
            name="checkpoints_dataset_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "user_logs",
        sa.Column("change_log_id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("dataset_id", sa.Uuid(), nullable=False),
        sa.Column("action_type", sa.String(length=50), nullable=False),
        sa.Column("action_details", sa.JSON(), nullable=False),
        sa.Column("timestamp", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("checkpoint_id", sa.Uuid(), nullable=True),
        sa.Column("applied", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.ForeignKeyConstraint(
            ["checkpoint_id"],
            ["checkpoints.id"],
            name="user_logs_checkpoint_id_fkey",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["dataset_id"],
            ["datasets.dataset_id"],
            name="user_logs_dataset_id_fkey",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("change_log_id"),
    )

    # Keep legacy index names so later downgrade/references remain consistent.
    op.create_index(op.f("ix_datasets_dataset_id"), "datasets", ["dataset_id"], unique=False)
    op.create_index(op.f("ix_checkpoints_id"), "checkpoints", ["id"], unique=False)


def upgrade() -> None:
    """Upgrade schema."""
    _ensure_pgcrypto_extension()

    inspector = sa.inspect(op.get_bind())
    legacy_tables = {"datasets", "checkpoints", "user_logs"}
    existing_legacy_tables = {table for table in legacy_tables if inspector.has_table(table)}

    if not existing_legacy_tables:
        _bootstrap_fresh_uuid_schema()
        return

    if existing_legacy_tables != legacy_tables:
        found = ", ".join(sorted(existing_legacy_tables))
        expected = ", ".join(sorted(legacy_tables))
        raise RuntimeError(
            "Partial legacy schema detected; refusing unsafe auto-migration. "
            f"Found [{found}] but expected [{expected}]."
        )

    # Step 1: Drop all foreign keys that reference columns being altered
    op.drop_constraint(op.f("checkpoints_dataset_id_fkey"), "checkpoints", type_="foreignkey")
    op.drop_constraint(op.f("user_logs_dataset_id_fkey"), "user_logs", type_="foreignkey")
    op.drop_constraint(op.f("user_logs_checkpoint_id_fkey"), "user_logs", type_="foreignkey")

    # Step 2: Drop indexes on columns being altered
    op.drop_index(op.f("ix_checkpoints_id"), table_name="checkpoints")
    op.drop_index(op.f("ix_datasets_dataset_id"), table_name="datasets")

    # Step 3: Drop serial defaults before type change (nextval can't cast to UUID)
    op.alter_column("datasets", "dataset_id", server_default=None)
    op.alter_column("checkpoints", "id", server_default=None)

    # Step 4: Alter all primary key columns first (referenced by FKs)
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

    # Step 5: Set new UUID defaults
    op.alter_column("datasets", "dataset_id", server_default=sa.text("gen_random_uuid()"))
    op.alter_column("checkpoints", "id", server_default=sa.text("gen_random_uuid()"))

    # Step 6: Alter all foreign key columns to match
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

    # Step 7: Alter non-FK columns
    op.alter_column("datasets", "name", existing_type=sa.VARCHAR(), nullable=False)
    op.alter_column("datasets", "file_path", existing_type=sa.VARCHAR(), nullable=False)

    # Step 8: Recreate all foreign keys
    op.create_foreign_key(None, "checkpoints", "datasets", ["dataset_id"], ["dataset_id"])
    op.create_foreign_key(None, "user_logs", "datasets", ["dataset_id"], ["dataset_id"])
    op.create_foreign_key(None, "user_logs", "checkpoints", ["checkpoint_id"], ["id"])


def downgrade() -> None:
    """Downgrade schema."""
    # Step 1: Drop all foreign keys
    op.drop_constraint(None, "user_logs", type_="foreignkey")
    op.drop_constraint(None, "user_logs", type_="foreignkey")
    op.drop_constraint(None, "checkpoints", type_="foreignkey")

    # Step 2: Revert FK columns back to INTEGER
    op.alter_column("user_logs", "checkpoint_id", existing_type=sa.Uuid(), type_=sa.INTEGER(), existing_nullable=True)
    op.alter_column("user_logs", "dataset_id", existing_type=sa.Uuid(), type_=sa.INTEGER(), existing_nullable=False)
    op.alter_column("checkpoints", "dataset_id", existing_type=sa.Uuid(), type_=sa.INTEGER(), existing_nullable=False)

    # Step 3: Revert PK columns back to INTEGER
    op.alter_column("datasets", "dataset_id", existing_type=sa.Uuid(), type_=sa.INTEGER(), existing_nullable=False)
    op.alter_column("checkpoints", "id", existing_type=sa.Uuid(), type_=sa.INTEGER(), existing_nullable=False)

    # Step 4: Revert non-FK column changes
    op.alter_column("datasets", "file_path", existing_type=sa.VARCHAR(), nullable=True)
    op.alter_column("datasets", "name", existing_type=sa.VARCHAR(), nullable=True)

    # Step 5: Recreate indexes
    op.create_index(op.f("ix_datasets_dataset_id"), "datasets", ["dataset_id"], unique=False)
    op.create_index(op.f("ix_checkpoints_id"), "checkpoints", ["id"], unique=False)

    # Step 6: Recreate foreign keys
    op.create_foreign_key(
        op.f("checkpoints_dataset_id_fkey"),
        "checkpoints",
        "datasets",
        ["dataset_id"],
        ["dataset_id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        op.f("user_logs_checkpoint_id_fkey"), "user_logs", "checkpoints", ["checkpoint_id"], ["id"], ondelete="SET NULL"
    )
    op.create_foreign_key(
        op.f("user_logs_dataset_id_fkey"), "user_logs", "datasets", ["dataset_id"], ["dataset_id"], ondelete="CASCADE"
    )
