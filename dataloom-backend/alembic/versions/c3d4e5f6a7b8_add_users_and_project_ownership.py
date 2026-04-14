"""add users and project ownership

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-03-10 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: str | Sequence[str] | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEMO_USER_ID = "11111111-1111-1111-1111-111111111111"
DEMO_USER_EMAIL = "demo@dataloom.local"
DEMO_USER_HASH = "$argon2id$v=19$m=65536,t=3,p=4$JyowYfsr9vV8h+JSMJaT3A$zO618iuyCpJf+kMQU/oId6+VNGfAYaDtdjdzGncMJfg"


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("hashed_password", sa.String(length=1024), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_superuser", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.add_column("projects", sa.Column("owner_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_projects_owner_id"), "projects", ["owner_id"], unique=False)
    op.create_foreign_key("projects_owner_id_fkey", "projects", "users", ["owner_id"], ["id"], ondelete="CASCADE")

    bind = op.get_bind()
    bind.execute(
        sa.text(
            "INSERT INTO users (id, email, hashed_password, is_active, is_superuser, is_verified) "
            "VALUES (:id, :email, :hashed_password, true, false, true)"
        ),
        {
            "id": DEMO_USER_ID,
            "email": DEMO_USER_EMAIL,
            "hashed_password": DEMO_USER_HASH,
        },
    )
    bind.execute(sa.text("UPDATE projects SET owner_id = :owner_id WHERE owner_id IS NULL"), {"owner_id": DEMO_USER_ID})

    op.alter_column("projects", "owner_id", nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("projects_owner_id_fkey", "projects", type_="foreignkey")
    op.drop_index(op.f("ix_projects_owner_id"), table_name="projects")
    op.drop_column("projects", "owner_id")

    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
