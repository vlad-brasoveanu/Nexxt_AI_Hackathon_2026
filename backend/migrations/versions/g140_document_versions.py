"""Keep replaced source bytes while excluding obsolete documents from new analyses."""
from alembic import op
import sqlalchemy as sa
revision='g140_document_versions'
down_revision='f130_roles_policy'
branch_labels=None
depends_on=None


def upgrade():
    # Logical self-reference; no delete operation is exposed by the application.
    op.add_column('documents',sa.Column('superseded_by',sa.String(36),nullable=True))


def downgrade():
    op.drop_column('documents','superseded_by')
