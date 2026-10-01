import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from backend.credentials import get_profile_password, migrate_legacy_passwords
from backend.database import Base
from backend.models import ConnectionProfile
from backend.routers.connections import ConnectionProfileCreate, ConnectionProfileResponse, create_connection


class CredentialTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.session = Session(self.engine)
        self.profile = ConnectionProfile(
            name="Local",
            host="localhost",
            port=5432,
            db_name="gis",
            user="gis",
            password="secret",
        )
        self.session.add(self.profile)
        self.session.commit()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def test_legacy_password_moves_to_credential_store(self):
        with patch("backend.credentials.store_profile_password") as store:
            migrate_legacy_passwords(self.session)

        store.assert_called_once_with(self.profile.id, "secret")
        self.session.refresh(self.profile)
        self.assertEqual(self.profile.password, "")

    def test_missing_os_credential_has_actionable_error(self):
        self.profile.password = ""
        with patch("backend.credentials.keyring.get_password", return_value=None):
            with self.assertRaises(HTTPException) as error:
                get_profile_password(self.profile)

        self.assertEqual(error.exception.status_code, 503)
        self.assertIn("OS credential store", error.exception.detail)

    def test_new_profiles_keep_password_out_of_sqlite_and_api_response(self):
        payload = ConnectionProfileCreate(
            name="Remote",
            host="db.example.test",
            port=5432,
            db_name="gis",
            user="gis",
            password="another-secret",
        )
        with patch("backend.routers.connections.store_profile_password") as store:
            profile = create_connection(payload, self.session)

        store.assert_called_once_with(profile.id, "another-secret")
        self.assertEqual(profile.password, "")
        response = ConnectionProfileResponse.model_validate(profile).model_dump()
        self.assertNotIn("password", response)


if __name__ == "__main__":
    unittest.main()
