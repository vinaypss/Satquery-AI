#!/usr/bin/env python3
import json
import unittest
import threading
import urllib.request
import urllib.error
import sys

sys.path.insert(0, '.')
from worker import runtime, create_server


class TestChangeAnalysisWorker(unittest.TestCase):
    def setUp(self):
        self.server = create_server('127.0.0.1', 8765)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    def post_json(self, path, payload):
        req = urllib.request.Request(f'http://127.0.0.1:8765{path}', data=json.dumps(payload).encode('utf-8'), method='POST')
        req.add_header('Content-Type', 'application/json')
        try:
            with urllib.request.urlopen(req, timeout=2) as resp:
                return resp.status, json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as exc:
            return exc.code, json.loads(exc.read().decode('utf-8'))

    def test_health_endpoint(self):
        status, body = self.post_json('/health', {'status': 'online'})
        self.assertEqual(status, 200)
        self.assertEqual(body['status'], 'online')

    def test_malformed_request(self):
        req = urllib.request.Request('http://127.0.0.1:8765/v1/change-analysis', data=b'not-json', method='POST')
        req.add_header('Content-Type', 'application/json')
        try:
            urllib.request.urlopen(req, timeout=2)
        except urllib.error.HTTPError as exc:
            self.assertIn('Malformed', exc.read().decode('utf-8'))

    def test_missing_image1(self):
        status, body = self.post_json('/v1/change-analysis', {
            'task': 'change_analysis',
            'image2': {'dataUri': 'data:image/png;base64,AAAA'},
            'acquisitionDate1': '2024-01-01',
            'acquisitionDate2': '2024-02-01',
            'parameters': {}
        })
        self.assertEqual(status, 400)
        self.assertIn('image1', body['error'])

    def test_missing_image2(self):
        status, body = self.post_json('/v1/change-analysis', {
            'task': 'change_analysis',
            'image1': {'dataUri': 'data:image/png;base64,AAAA'},
            'acquisitionDate1': '2024-01-01',
            'acquisitionDate2': '2024-02-01',
            'parameters': {}
        })
        self.assertEqual(status, 400)
        self.assertIn('image2', body['error'])

    def test_invalid_image(self):
        status, body = self.post_json('/v1/change-analysis', {
            'task': 'change_analysis',
            'image1': {'path': ''},
            'image2': {'dataUri': 'data:image/png;base64,AAAA'},
            'acquisitionDate1': '2024-01-01',
            'acquisitionDate2': '2024-02-01',
            'parameters': {}
        })
        self.assertEqual(status, 400)

    def test_missing_acquisition_metadata(self):
        status, body = self.post_json('/v1/change-analysis', {
            'task': 'change_analysis',
            'image1': {'dataUri': 'data:image/png;base64,AAAA'},
            'image2': {'dataUri': 'data:image/png;base64,AAAA'},
            'parameters': {}
        })
        self.assertEqual(status, 400)

    def test_unloaded_model(self):
        # Worker is intentionally not loaded here; it must return the truth.
        status, body = self.post_json('/v1/change-analysis', {
            'task': 'change_analysis',
            'image1': {'dataUri': 'data:image/png;base64,AAAA'},
            'image2': {'dataUri': 'data:image/png;base64,AAAA'},
            'acquisitionDate1': '2024-01-01',
            'acquisitionDate2': '2024-02-01',
            'geographicArea': 'Rajasthan',
            'parameters': {'coordinateConvention': 'pixel_xyxy'}
        })
        self.assertEqual(status, 503)
        self.assertIn('not loaded', body['error'].lower())

    def test_get_health_endpoint(self):
        req = urllib.request.Request('http://127.0.0.1:8765/health', method='GET')
        with urllib.request.urlopen(req, timeout=2) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode('utf-8'))
            self.assertEqual(data['status'], 'online')

    def test_readiness_endpoint(self):
        req = urllib.request.Request('http://127.0.0.1:8765/v1/readiness', method='GET')
        with urllib.request.urlopen(req, timeout=2) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode('utf-8'))
            self.assertIn('readinessState', data)

    def test_load_model_cpu_returns_503(self):
        status, body = self.post_json('/v1/load-model', {})
        self.assertEqual(status, 503)


if __name__ == '__main__':
    unittest.main()
