"""merge the checkpoint history and jobs migration heads

Revision ID: 7c1f95a42d10
Revises: 2a4c6e8f1b3d, af39a29e48dd
Create Date: 2026-10-28 00:00:00.000000

"""

from collections.abc import Sequence

revision: str = "7c1f95a42d10"
down_revision: str | Sequence[str] | None = ("2a4c6e8f1b3d", "af39a29e48dd")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Join the independent jobs and dtype metadata histories."""


def downgrade() -> None:
    """A merge revision has no schema changes to reverse."""
