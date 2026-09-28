#!/usr/bin/env python3
"""
SatQuery AI - Stage 6E Segmentation Worker Unit Tests
SIH26167 | ISRO Space Technology

Tests the isolated Segmentation Python inference worker.
"""

import sys
import json
import time
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from worker import SegmentationRuntime, create_server


class TestSegmentationWorker(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.port = 8003
        cls.server = create_server('127.0.0.1', cls.port)
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        time.sleep(0.2)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_01_health_endpoint(self):
        payload = {'status': 'online'}
        req = Request(f'http://127.0.0.1:{self.port}/health', method='POST', data=json.dumps(payload).encode())
        req.add_header('Content-Type', 'application/json')
        with urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data['status'], 'online')
            self.assertIn('model_state', data)

    def test_02_malformed_request_returns_400(self):
        req = Request(f'http://127.0.0.1:{self.port}/v1/segmentation', method='POST', data=b'not-json')
        req.add_header('Content-Type', 'application/json')
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req)
        self.assertEqual(ctx.exception.code, 400)

    def test_03_missing_image_returns_400(self):
        payload = {'task': 'segmentation', 'target': 'roads'}
        req = Request(f'http://127.0.0.1:{self.port}/v1/segmentation', method='POST', data=json.dumps(payload).encode())
        req.add_header('Content-Type', 'application/json')
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req)
        self.assertEqual(ctx.exception.code, 400)

    def test_04_invalid_image_returns_400(self):
        payload = {'task': 'segmentation', 'target': 'roads', 'image': {'name': 'x.png'}}
        req = Request(f'http://127.0.0.1:{self.port}/v1/segmentation', method='POST', data=json.dumps(payload).encode())
        req.add_header('Content-Type', 'application/json')
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req)
        self.assertEqual(ctx.exception.code, 400)

    def test_05_missing_target_returns_400(self):
        payload = {'task': 'segmentation', 'image': {'dataUri': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='}}
        req = Request(f'http://127.0.0.1:{self.port}/v1/segmentation', method='POST', data=json.dumps(payload).encode())
        req.add_header('Content-Type', 'application/json')
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req)
        self.assertEqual(ctx.exception.code, 400)

    def test_06_empty_target_returns_400(self):
        payload = {'task': 'segmentation', 'target': '   ', 'image': {'dataUri': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='}}
        req = Request(f'http://127.0.0.1:{self.port}/v1/segmentation', method='POST', data=json.dumps(payload).encode())
        req.add_header('Content-Type', 'application/json')
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req)
        self.assertEqual(ctx.exception.code, 400)

    def test_07_unloaded_model_returns_503(self):
        payload = {'task': 'segmentation', 'target': 'roads', 'image': {'dataUri': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='}}
        req = Request(f'http://127.0.0.1:{self.port}/v1/segmentation', method='POST', data=json.dumps(payload).encode())
        req.add_header('Content-Type', 'application/json')
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req)
        self.assertEqual(ctx.exception.code, 503)
        err = json.loads(ctx.exception.read().decode())
        self.assertIn('Segmentation model not loaded', err['error'])

    def test_08_response_schema_has_required_fields(self):
        runtime = SegmentationRuntime()
        health = runtime.get_health_status()
        self.assertIn('model_state', health)
        self.assertIn('model_loaded', health)
        self.assertIn('model_id', health)
        self.assertIn('checkpoint', health)

    def test_09_no_fake_output(self):
        runtime = SegmentationRuntime()
        status, err = runtime.load_model()
        self.assertFalse(status)
        self.assertIn('CUDA', err)

    def test_10_get_health_endpoint(self):
        req = Request(f'http://127.0.0.1:{self.port}/health', method='GET')
        with urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data['status'], 'online')

    def test_11_readiness_endpoint(self):
        req = Request(f'http://127.0.0.1:{self.port}/v1/readiness', method='GET')
        with urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data['status'], 'online')
            self.assertIn('readinessState', data)

    def test_12_load_model_endpoint_cpu_returns_503(self):
        req = Request(f'http://127.0.0.1:{self.port}/v1/load-model', method='POST', data=b'{}')
        req.add_header('Content-Type', 'application/json')
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req)
        self.assertEqual(ctx.exception.code, 503)

    def test_13_unsupported_path_returns_404(self):
        req = Request(f'http://127.0.0.1:{self.port}/nonexistent', method='GET')
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req)
        self.assertEqual(ctx.exception.code, 404)


if __name__ == '__main__':
    unittest.main()
