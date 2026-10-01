import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import app_paths


class AppPathsTests(unittest.TestCase):
    def test_windows_data_dir_uses_local_app_data(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch.dict(os.environ, {"LOCALAPPDATA": temp_dir}, clear=True):
                with patch("backend.app_paths.sys.platform", "win32"):
                    with patch("backend.app_paths.migrate_legacy_database"):
                        self.assertEqual(
                            app_paths.data_dir(),
                            Path(temp_dir) / "PostGISManager",
                        )

    def test_legacy_database_is_copied_without_removing_original(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            legacy = root / "data" / "app.db"
            destination = root / "new-data" / "app.db"
            legacy.parent.mkdir()
            destination.parent.mkdir()
            legacy.write_bytes(b"legacy database")

            with patch("backend.app_paths.resource_dir", return_value=root):
                app_paths.migrate_legacy_database(destination)

            self.assertEqual(destination.read_bytes(), b"legacy database")
            self.assertTrue(legacy.is_file())

    def test_existing_database_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            legacy = root / "data" / "app.db"
            destination = root / "app.db"
            legacy.parent.mkdir()
            legacy.write_bytes(b"legacy")
            destination.write_bytes(b"current")

            with patch("backend.app_paths.resource_dir", return_value=root):
                app_paths.migrate_legacy_database(destination)

            self.assertEqual(destination.read_bytes(), b"current")


if __name__ == "__main__":
    unittest.main()
