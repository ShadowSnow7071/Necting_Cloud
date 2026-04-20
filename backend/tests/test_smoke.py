import unittest

from backend.app import app


class BackendSmokeTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_favicon_returns_no_content(self):
        response = self.client.get("/favicon.ico")
        self.assertEqual(response.status_code, 204)

    def test_index_is_served(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"<!DOCTYPE HTML>", response.data.upper())


if __name__ == "__main__":
    unittest.main()
