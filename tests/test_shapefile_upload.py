import io
import tempfile
import unittest
import zipfile
from pathlib import Path
from fastapi import HTTPException, UploadFile

from backend.routers.shapefile import _stage_shapefile_uploads


class ShapefileUploadTests(unittest.TestCase):
    def _upload(self, filename, content):
        return UploadFile(filename=filename, file=io.BytesIO(content))

    def test_stages_shapefile_components_without_zip(self):
        uploads = [
            self._upload("Parcels.SHP", b"shape"),
            self._upload("parcels.SHX", b"index"),
            self._upload("PARCELS.DBF", b"attributes"),
            self._upload("parcels.prj", b"projection"),
        ]

        with tempfile.TemporaryDirectory() as tmpdir:
            shp_path = Path(_stage_shapefile_uploads(uploads, tmpdir))

            self.assertEqual(shp_path.name, "Parcels.shp")
            self.assertEqual(shp_path.read_bytes(), b"shape")
            self.assertEqual((shp_path.parent / "Parcels.shx").read_bytes(), b"index")
            self.assertEqual((shp_path.parent / "Parcels.dbf").read_bytes(), b"attributes")

    def test_stages_shapefile_from_zip(self):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w") as zip_file:
            zip_file.writestr("folder/parcels.shp", b"shape")
        uploads = [self._upload("parcels.zip", archive.getvalue())]

        with tempfile.TemporaryDirectory() as tmpdir:
            shp_path = Path(_stage_shapefile_uploads(uploads, tmpdir))

            self.assertEqual(shp_path.name, "parcels.shp")
            self.assertEqual(shp_path.read_bytes(), b"shape")

    def test_accepts_shp_alone(self):
        uploads = [self._upload("parcels.shp", b"shape")]

        with tempfile.TemporaryDirectory() as tmpdir:
            shp_path = Path(_stage_shapefile_uploads(uploads, tmpdir))

        self.assertEqual(shp_path.name, "parcels.shp")

    def test_rejects_unrelated_files(self):
        uploads = [self._upload("a.shp", b"x"), self._upload("b.dbf", b"y")]

        with tempfile.TemporaryDirectory() as tmpdir:
            with self.assertRaises(HTTPException):
                _stage_shapefile_uploads(uploads, tmpdir)


if __name__ == "__main__":
    unittest.main()
