"""Authentication & authorization primitives.

Goal 1 - password storage: bcrypt salted hashing (via the `bcrypt` package)
replaces the old plaintext `password` comparison.

Goal 2 - session handling: short-lived signed JWTs (HS256) replace the old
`base64(username)` pseudo-token. Tokens carry the subject (username) and a
role ("inspector" | "admin") plus an expiry.

The `require_inspector` / `require_admin` FastAPI dependencies decode and
validate the bearer token on every protected route - this is what actually
closes the "admin endpoints are wide open" hole, not just the token format.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import get_settings

settings = get_settings()

ROLE_INSPECTOR = "inspector"
ROLE_ADMIN = "admin"

# bcrypt hashes only the first 72 bytes of the input; longer passwords are
# truncated here explicitly (rather than letting the backend raise) so the
# behaviour is deterministic.
_BCRYPT_MAX_BYTES = 72

_bearer = HTTPBearer(auto_error=True)


# --------------------------------------------------------------------------
# Password hashing (Goal 1)
# --------------------------------------------------------------------------
def _truncate(password: str) -> bytes:
    return password.encode("utf-8")[:_BCRYPT_MAX_BYTES]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_truncate(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(_truncate(password), hashed.encode("utf-8"))
    except ValueError:
        # Malformed/legacy (e.g. pre-migration plaintext) hash - treat as no match.
        return False


# --------------------------------------------------------------------------
# JWT issuing / decoding (Goal 2)
# --------------------------------------------------------------------------
def create_access_token(username: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": username,
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="登入已逾期，請重新登入",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="無效的登入憑證",
            headers={"WWW-Authenticate": "Bearer"},
        )


# --------------------------------------------------------------------------
# Route guards
# --------------------------------------------------------------------------
class Principal:
    """The authenticated identity extracted from a valid token."""

    def __init__(self, username: str, role: str) -> None:
        self.username = username
        self.role = role


def _principal_for_role(required_role: str):
    def dependency(
        credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    ) -> Principal:
        payload = _decode_token(credentials.credentials)
        username = payload.get("sub")
        role = payload.get("role")
        if not username or role != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="沒有存取權限",
            )
        return Principal(username=username, role=role)

    return dependency


# Usage: `principal: Principal = Depends(require_inspector)` on a route.
require_inspector = _principal_for_role(ROLE_INSPECTOR)
require_admin = _principal_for_role(ROLE_ADMIN)
