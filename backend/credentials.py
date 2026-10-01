import logging

import keyring
from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.models import ConnectionProfile


SERVICE_NAME = "PostGIS Manager"
logger = logging.getLogger(__name__)


def store_profile_password(profile_id: int, password: str) -> None:
    keyring.set_password(SERVICE_NAME, str(profile_id), password)


def get_profile_password(profile: ConnectionProfile) -> str:
    password = keyring.get_password(SERVICE_NAME, str(profile.id))
    if password is None:
        raise HTTPException(
            status_code=503,
            detail=(
                f"No saved credential is available for connection '{profile.name}'. "
                "Delete and recreate this connection to save its password in the OS credential store."
            ),
        )
    return password


def delete_profile_password(profile_id: int) -> None:
    try:
        keyring.delete_password(SERVICE_NAME, str(profile_id))
    except keyring.errors.PasswordDeleteError:
        pass


def migrate_legacy_passwords(db: Session) -> None:
    profiles = (
        db.query(ConnectionProfile)
        .filter(ConnectionProfile.password != "")
        .all()
    )
    if not profiles:
        return

    try:
        for profile in profiles:
            store_profile_password(profile.id, profile.password)
            profile.password = ""
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Could not migrate saved passwords to the operating-system credential store")
        raise RuntimeError(
            "Saved connection passwords could not be migrated to the operating-system credential store. "
            "The legacy database has been left unchanged; resolve the credential-store issue and restart."
        )
