from hashlib import sha256

from pwdlib import PasswordHash

passwords = PasswordHash.recommended()
DUMMY_HASH = passwords.hash("invalid-login-placeholder")
SESSION_COOKIE = "casecheck_session"


def token_hash(token: str) -> str:
    return sha256(token.encode()).hexdigest()
