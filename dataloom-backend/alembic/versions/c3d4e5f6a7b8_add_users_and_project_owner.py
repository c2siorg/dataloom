"""add users and project owner

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-13 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: str | Sequence[str] | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TEST_USER_ID = "00000000-0000-0000-0000-000000000000"
TEST_USER_EMAIL = "test@test.com"
# bcrypt hash of the dev/demo password "testpassword"
TEST_USER_PASSWORD_HASH = "$2b$12$k2JX0ZPiDxcNXl78OB4eiOxxek9ii7JD64cnWCvyCZVSOysil7rkm"


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=1024), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    bind = op.get_bind()
    bind.execute(
        sa.text("INSERT INTO users (id, email, password_hash, created_at) VALUES (:id, :email, :password_hash, now())"),
        {
            "id": TEST_USER_ID,
            "email": TEST_USER_EMAIL,
            "password_hash": TEST_USER_PASSWORD_HASH,
        },
    )

    op.add_column("projects", sa.Column("owner_id", sa.Uuid(), nullable=True))
    bind.execute(
        sa.text("UPDATE projects SET owner_id = :owner_id WHERE owner_id IS NULL"),
        {"owner_id": TEST_USER_ID},
    )
    op.alter_column("projects", "owner_id", nullable=False)
    op.create_index(op.f("ix_projects_owner_id"), "projects", ["owner_id"], unique=False)
    op.create_foreign_key(
        "projects_owner_id_fkey",
        "projects",
        "users",
        ["owner_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("projects_owner_id_fkey", "projects", type_="foreignkey")
    op.drop_index(op.f("ix_projects_owner_id"), table_name="projects")
    op.drop_column("projects", "owner_id")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
