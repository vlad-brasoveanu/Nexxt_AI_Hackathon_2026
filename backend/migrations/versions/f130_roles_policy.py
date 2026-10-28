"""Three roles, independent authority, auditable demo exceptions and versioned policies."""
from alembic import op
import sqlalchemy as sa
revision='f130_roles_policy'
down_revision='e120_risk_reports'
branch_labels=None
depends_on=None


def upgrade():
    op.add_column('users',sa.Column('active',sa.Boolean(),nullable=False,server_default=sa.true()))
    op.add_column('users',sa.Column('authority_level',sa.String(4),nullable=True))
    op.add_column('users',sa.Column('own_cases_only',sa.Boolean(),nullable=False,server_default=sa.false()))
    op.add_column('users',sa.Column('revision',sa.Integer(),nullable=False,server_default='1'))
    op.execute("UPDATE users SET authority_level=CASE role WHEN 'credit_analyst' THEN 'L1' WHEN 'risk_officer' THEN 'L2' WHEN 'credit_committee' THEN 'L3' END")
    op.execute("UPDATE users SET own_cases_only=true WHERE role='manager'")
    op.execute("UPDATE users SET role=CASE WHEN role IN ('manager','analyst') THEN 'case_officer' ELSE 'risk_reviewer' END WHERE role IN ('manager','analyst','supervisor','credit_analyst','risk_officer','credit_committee')")
    op.add_column('credit_decisions',sa.Column('demo_exception',sa.Boolean(),nullable=False,server_default=sa.false()))
    op.create_table('policy_versions',sa.Column('id',sa.String(36),primary_key=True),sa.Column('team',sa.String(80),nullable=False),
        sa.Column('version',sa.String(80),nullable=False),sa.Column('parent_version',sa.String(80),nullable=False),
        sa.Column('policy',sa.JSON(),nullable=False),sa.Column('published_by',sa.String(36),sa.ForeignKey('users.id'),nullable=False),
        sa.Column('reason',sa.Text(),nullable=False),sa.Column('created_at',sa.DateTime(timezone=True),nullable=False),
        sa.UniqueConstraint('team','version'),sa.UniqueConstraint('team','parent_version'))
    # Existing sessions must re-authenticate under the migrated permissions.
    op.execute('DELETE FROM sessions')


def downgrade():
    op.drop_table('policy_versions')
    op.drop_column('credit_decisions','demo_exception')
    for name in ('revision','own_cases_only','authority_level','active'):
        op.drop_column('users',name)
