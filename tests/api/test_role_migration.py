"""Exercise the actual Alembic chain over existing users and audit, not just create_all."""
import os
import sqlite3
import subprocess
import sys


def test_legacy_users_and_audit_survive_migration(tmp_path):
    path=tmp_path/'legacy.db'
    env={**os.environ,'PYTHONPATH':'backend','CASECHECK_DATABASE_URL':f'sqlite:///{path}'}
    subprocess.run([sys.executable,'-m','alembic','upgrade','e120_risk_reports'],env=env,check=True,capture_output=True)
    with sqlite3.connect(path) as db:
        for index,role in enumerate(['manager','analyst','risk_officer','credit_committee']):
            db.execute('insert into users(id,username,password_hash,role,team) values(?,?,?,?,?)',(f'u{index}',role,'unused-test-hash',role,'demo'))
        db.execute("insert into audit_events(id,actor_id,action,details,created_at) values('audit1','u0','case.created','{}','2026-10-28 12:00:00')")
    subprocess.run([sys.executable,'-m','alembic','upgrade','head'],env=env,check=True,capture_output=True)
    with sqlite3.connect(path) as db:
        rows=db.execute('select id,role,authority_level,own_cases_only,active from users order by id').fetchall()
        assert rows==[('u0','case_officer',None,1,1),('u1','case_officer',None,0,1),('u2','risk_reviewer','L2',0,1),('u3','risk_reviewer','L3',0,1)]
        assert db.execute("select actor_id from audit_events where id='audit1'").fetchone()==('u0',)
        assert 'superseded_by' in {r[1] for r in db.execute('pragma table_info(documents)')}
