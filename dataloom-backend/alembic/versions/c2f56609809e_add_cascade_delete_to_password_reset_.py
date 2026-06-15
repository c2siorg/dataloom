"""add cascade delete to password reset tokens

Revision ID: c2f56609809e
Revises: 3185ec76af85
Create Date: 2026-06-15 17:38:22.422079

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c2f56609809e"
down_revision: str | Sequence[str] | None = "3185ec76af85"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FK_NAME = "password_reset_tokens_user_id_fkey"


def upgrade() -> None:
    op.drop_constraint(FK_NAME, "password_reset_tokens", type_="foreignkey")
    op.create_foreign_key(
        FK_NAME,
        "password_reset_tokens",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(FK_NAME, "password_reset_tokens", type_="foreignkey")
    op.create_foreign_key(
        FK_NAME,
        "password_reset_tokens",
        "users",
        ["user_id"],
        ["id"],
    )
