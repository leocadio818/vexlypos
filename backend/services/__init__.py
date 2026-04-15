"""
Fernet encryption utilities for sensitive data (Multiprod tokens, etc.)
"""
import os
from cryptography.fernet import Fernet

_key = os.environ.get("ECF_ENCRYPTION_KEY")
_fernet = Fernet(_key.encode()) if _key else None


def encrypt_value(plaintext: str) -> str:
    if not _fernet:
        raise RuntimeError("ECF_ENCRYPTION_KEY not configured")
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    if not _fernet:
        raise RuntimeError("ECF_ENCRYPTION_KEY not configured")
    return _fernet.decrypt(ciphertext.encode()).decode()


def mask_value(value: str, visible_chars: int = 4) -> str:
    if not value or len(value) <= visible_chars:
        return "***"
    return "*" * (len(value) - visible_chars) + value[-visible_chars:]
