import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.pg_tools import resolve_pg_tool


class PostgreSQLToolsTests(unittest.TestCase):
    def test_configured_client_tools_directory_is_used(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            tool = Path(temp_dir) / "pg_dump.exe"
            tool.write_bytes(b"test executable")
            with patch.dict(os.environ, {"NICKMANAGER_PG_TOOLS_DIR": temp_dir}):
                self.assertEqual(resolve_pg_tool("pg_dump"), str(tool))


if __name__ == "__main__":
    unittest.main()
