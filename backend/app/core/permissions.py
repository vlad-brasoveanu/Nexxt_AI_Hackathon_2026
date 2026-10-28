"""Three business roles; signing authority is an independent attribute."""
LEGACY = {'manager':'case_officer','analyst':'case_officer','supervisor':'risk_reviewer',
          'credit_analyst':'risk_reviewer','risk_officer':'risk_reviewer','credit_committee':'risk_reviewer'}
LEGACY_LEVEL = {'credit_analyst':'L1','risk_officer':'L2','credit_committee':'L3'}
ROLES = {'case_officer','risk_reviewer','admin'}


def role(user):
    return LEGACY.get(user.role,user.role)


def authority(user):
    return user.authority_level or LEGACY_LEVEL.get(user.role)


def permissions(user):
    return {'edit_case':role(user) in {'case_officer','admin'}, 'review_facts':role(user) in {'case_officer','admin'},
            'decide':role(user) in {'risk_reviewer','admin'} and authority(user) is not None,
            'admin':role(user)=='admin','resolve_risk':role(user) in {'risk_reviewer','admin'}}
