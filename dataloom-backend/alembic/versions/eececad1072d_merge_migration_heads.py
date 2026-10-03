"""merge migration heads

Revision ID: eececad1072d
Revises: a19a22f63da8, 19e241eafa69
Create Date: 2026-10-03 18:22:14.330279

"""

from collections.abc import Sequence

revision: str = "eececad1072d"
down_revision: str | Sequence[str] | None = ("a19a22f63da8", "19e241eafa69")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Merge the migration heads."""
    pass


def downgrade() -> None:
    """Split the migration heads."""
    pass
