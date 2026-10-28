"""Record which document pages were transcribed by OCR"""
from alembic import op
import sqlalchemy as sa

revision = 'd7a3b1c0e5f2'
down_revision = 'c41f2a9d7e10'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('documents', sa.Column('ocr_pages', sa.JSON(), nullable=False, server_default=sa.text("'[]'")))


def downgrade():
    op.drop_column('documents', 'ocr_pages')
