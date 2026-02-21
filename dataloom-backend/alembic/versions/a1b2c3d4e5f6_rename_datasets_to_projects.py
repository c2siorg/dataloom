"""rename datasets to projects

Revision ID: a1b2c3d4e5f6
Revises: 34e620d988fc
Create Date: 2026-02-22 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "34e620d988fc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Step 1: Drop foreign keys referencing datasets.dataset_id
    op.drop_constraint("checkpoints_dataset_id_fkey", "checkpoints", type_="foreignkey")
    op.drop_constraint("user_logs_dataset_id_fkey", "user_logs", type_="foreignkey")

    # Step 2: Rename the table
    op.rename_table("datasets", "projects")

    # Step 3: Rename PK column datasets.dataset_id → projects.project_id
    op.alter_column("projects", "dataset_id", new_column_name="project_id")

    # Step 4: Rename FK columns in child tables
    op.alter_column("checkpoints", "dataset_id", new_column_name="project_id")
    op.alter_column("user_logs", "dataset_id", new_column_name="project_id")

    # Step 5: Recreate foreign keys pointing to projects.project_id
    op.create_foreign_key(None, "checkpoints", "projects", ["project_id"], ["project_id"])
    op.create_foreign_key(None, "user_logs", "projects", ["project_id"], ["project_id"])


def downgrade() -> None:
    # Step 1: Drop foreign keys referencing projects.project_id
    op.drop_constraint("checkpoints_project_id_fkey", "checkpoints", type_="foreignkey")
    op.drop_constraint("user_logs_project_id_fkey", "user_logs", type_="foreignkey")

    # Step 2: Rename FK columns back
    op.alter_column("user_logs", "project_id", new_column_name="dataset_id")
    op.alter_column("checkpoints", "project_id", new_column_name="dataset_id")

    # Step 3: Rename PK column back
    op.alter_column("projects", "project_id", new_column_name="dataset_id")

    # Step 4: Rename the table back
    op.rename_table("projects", "datasets")

    # Step 5: Recreate foreign keys pointing to datasets.dataset_id
    op.create_foreign_key(None, "checkpoints", "datasets", ["dataset_id"], ["dataset_id"])
    op.create_foreign_key(None, "user_logs", "datasets", ["dataset_id"], ["dataset_id"])
