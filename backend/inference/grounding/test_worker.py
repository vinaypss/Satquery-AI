#!/usr/bin/env python3
"""
SatQuery AI - Phase 8 Grounding DINO Tiny Worker Unit Tests
SIH26167 | ISRO Space Technology

Tests the isolated Grounding DINO Python inference worker:
1. Worker initialization and diagnostic hardware inspection.
2. GET /health endpoint responses (IDEA-Research/grounding-dino-tiny).
3. Invalid routes return 404.
4. Malformed JSON returns 400.
5. Missing or invalid task returns 400.
6. Missing target query returns 400.
7. Whitespace-only target query returns 400.
8. Missing image object returns 400.
9. Missing dataUri/path returns 400.
10. Unloaded model on CPU returns truthful HTTP 503 error.
11. Load model on non-CUDA host returns False with truthful error message.
12. GET /readiness endpoint returns granular states (RUNNABLE / GPU_UNAVAILABLE / MODEL_UNAVAILABLE).
13. SAR modality is strictly rejected inside worker with UNSUPPORTED_MODALITY.
14. RequestId is propagated in responses.
15. Authentication via Bearer token and X-Worker-Auth-Key.
16. Unauthorized request rejected with HTTP 401 when auth token is invalid.
17. Text target query formatting (lowercase, strip verbs, period appended).
18. Normalized xyxy box clamping and geometry validation.
19. Zero detections produces valid HTTP 200 with detections: [] and MODEL_GENERATED provenance.
20. Target query formatting and geometry validation is deterministic.
"""

import os
import sys
import json
import time
import math
import threading
import unittest
import base64
from io import BytesIO
from unittest.mock import MagicMock
from urllib.request import Request, urlopen
from urllib.error import HTTPError

from worker import GroundingDINORuntime, GroundingWorkerRequestHandler, create_server, PIL_AVAILABLE, Image


class DummyHeaders(dict):
    def get(self, key, default=""):
        return super().get(key, default)


class TestGroundingWorker(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        """Starts an in-process HTTP worker server for testing."""
        cls.port = 8992
        cls.server = create_server("127.0.0.1", cls.port, model_id="IDEA-Research/grounding-dino-tiny")
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        time.sleep(0.2)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def test_01_runtime_initialization_and_hardware_inspection(self):
        """Worker runtime initializes and truthfully inspects hardware."""
        runtime = GroundingDINORuntime()
        health = runtime.get_health_status()
        self.assertEqual(health["status"], "online")
        self.assertEqual(health["model_id"], "IDEA-Research/grounding-dino-tiny")
        self.assertEqual(health["checkpoint"], "groundingdino_swint_ogc")
        self.assertIn("cuda_available", health)
        self.assertIn("gpu_name", health)
        self.assertFalse(health["model_loaded"])

    def test_02_get_health_endpoint(self):
        """GET /health returns valid JSON with online status and tiny model ID."""
        req = Request(f"http://127.0.0.1:{self.port}/health", method="GET")
        with urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertEqual(data["status"], "online")
            self.assertEqual(data["model_id"], "IDEA-Research/grounding-dino-tiny")

    def test_03_invalid_endpoint_404(self):
        """Request to unknown endpoint returns 404."""
        req = Request(f"http://127.0.0.1:{self.port}/invalid-route", method="GET")
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req)
        self.assertEqual(ctx.exception.code, 404)

    def test_04_missing_task_returns_400(self):
        """Missing or invalid task returns 400 Bad Request."""
        payload = {
            "target": "airport",
            "image": {"dataUri": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="}
        }
        data = json.dumps(payload).encode()
        req = Request(
            f"http://127.0.0.1:{self.port}/v1/grounding",
            data=data,
            headers={"Content-Type": "application/json", "Authorization": "Bearer satquery-grounding-worker-secret"},
            method="POST"
        )
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req)
        self.assertEqual(ctx.exception.code, 400)
        err = json.loads(ctx.exception.read().decode())
        self.assertIn("Invalid task", err["error"])

    def test_05_missing_target_returns_400(self):
        """Missing target query returns 400."""
        payload = {
            "task": "grounding",
            "image": {"dataUri": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="}
        }
        data = json.dumps(payload).encode()
        req = Request(
            f"http://127.0.0.1:{self.port}/v1/grounding",
            data=data,
            headers={"Content-Type": "application/json", "Authorization": "Bearer satquery-grounding-worker-secret"},
            method="POST"
        )
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req)
        self.assertEqual(ctx.exception.code, 400)
        err = json.loads(ctx.exception.read().decode())
        self.assertIn("Missing or empty target query", err["error"])

    def test_06_whitespace_target_returns_400(self):
        """Whitespace-only target query returns 400."""
        payload = {
            "task": "grounding",
            "target": "   \t \n  ",
            "image": {"dataUri": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="}
        }
        data = json.dumps(payload).encode()
        req = Request(
            f"http://127.0.0.1:{self.port}/v1/grounding",
            data=data,
            headers={"Content-Type": "application/json", "Authorization": "Bearer satquery-grounding-worker-secret"},
            method="POST"
        )
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req)
        self.assertEqual(ctx.exception.code, 400)

    def test_07_missing_image_object_returns_400(self):
        """Missing image object returns 400."""
        payload = {
            "task": "grounding",
            "target": "runway"
        }
        data = json.dumps(payload).encode()
        req = Request(
            f"http://127.0.0.1:{self.port}/v1/grounding",
            data=data,
            headers={"Content-Type": "application/json", "Authorization": "Bearer satquery-grounding-worker-secret"},
            method="POST"
        )
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req)
        self.assertEqual(ctx.exception.code, 400)
        err = json.loads(ctx.exception.read().decode())
        self.assertIn("Missing image object", err["error"])

    def test_08_missing_image_data_uri_and_path_returns_400(self):
        """Image without dataUri or path returns 400."""
        payload = {
            "task": "grounding",
            "target": "runway",
            "image": {"name": "sample.png", "mimeType": "image/png"}
        }
        data = json.dumps(payload).encode()
        req = Request(
            f"http://127.0.0.1:{self.port}/v1/grounding",
            data=data,
            headers={"Content-Type": "application/json", "Authorization": "Bearer satquery-grounding-worker-secret"},
            method="POST"
        )
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req)
        self.assertEqual(ctx.exception.code, 400)
        err = json.loads(ctx.exception.read().decode())
        self.assertIn("Neither 'dataUri' nor 'path'", err["error"])

    def test_09_unloaded_model_returns_truthful_503(self):
        """When Grounding DINO is not loaded, worker returns HTTP 503 with truthful details."""
        payload = {
            "task": "grounding",
            "target": "building",
            "image": {
                "name": "sample.png",
                "mimeType": "image/png",
                "dataUri": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            }
        }
        data = json.dumps(payload).encode()
        req = Request(
            f"http://127.0.0.1:{self.port}/v1/grounding",
            data=data,
            headers={"Content-Type": "application/json", "Authorization": "Bearer satquery-grounding-worker-secret"},
            method="POST"
        )
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req)
        self.assertEqual(ctx.exception.code, 503)
        err = json.loads(ctx.exception.read().decode())
        self.assertIn("Grounding DINO model not loaded", err["error"])
        self.assertFalse(err["model_loaded"])

    def test_10_load_model_on_cpu_host_fails_gracefully(self):
        """Attempting to load Grounding DINO without CUDA fails gracefully without crashing."""
        runtime = GroundingDINORuntime()
        if not runtime.cuda_available:
            success, msg = runtime.load_model()
            self.assertFalse(success)
            self.assertIn("CUDA is not available", msg)

    def test_11_response_schema_format_on_runtime(self):
        """Direct runtime check ensures process_grounding_request returns valid tuple."""
        runtime = GroundingDINORuntime()
        status_code, resp = runtime.process_grounding_request({
            "task": "grounding",
            "target": "bridge",
            "image": {"dataUri": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="}
        })
        self.assertEqual(status_code, 503)
        self.assertIn("error", resp)

    def test_12_readiness_endpoint_states(self):
        """GET /v1/readiness returns granular readinessState distinguishing process from model."""
        req = Request(f"http://127.0.0.1:{self.port}/v1/readiness", method="GET")
        with urlopen(req) as resp:
            self.assertEqual(resp.status, 200)
            data = json.loads(resp.read().decode())
            self.assertIn("readinessState", data)
            self.assertIn(data["readinessState"], ["RUNNABLE", "GPU_UNAVAILABLE", "MODEL_UNAVAILABLE", "MODEL_NOT_LOADABLE"])
            self.assertIn("isReady", data)
            self.assertEqual(data["model_id"], "IDEA-Research/grounding-dino-tiny")

    def test_13_sar_modality_rejected(self):
        """SAR modality imagery is strictly rejected by worker with 400 UNSUPPORTED_MODALITY."""
        runtime = GroundingDINORuntime()
        status_code, resp = runtime.process_grounding_request({
            "task": "grounding",
            "target": "vessels",
            "image": {
                "name": "radar.tif",
                "mimeType": "image/tiff",
                "modality": "SAR",
                "dataUri": "data:image/tiff;base64,SUkqAAgAAA=="
            }
        })
        self.assertEqual(status_code, 400)
        self.assertEqual(resp.get("code"), "UNSUPPORTED_MODALITY")
        self.assertIn("SAR imagery is not supported", resp.get("error", ""))

    def test_14_request_id_propagation(self):
        """Supplied requestId is propagated back in response payloads."""
        runtime = GroundingDINORuntime()
        status_code, resp = runtime.process_grounding_request({
            "task": "grounding",
            "requestId": "custom_req_uuid_101",
            "target": "",  # invalid to trigger immediate return
            "image": {"name": "test.png", "mimeType": "image/png", "dataUri": "data:image/png;base64,AAAA"}
        })
        self.assertEqual(status_code, 400)
        self.assertEqual(resp.get("requestId"), "custom_req_uuid_101")

    def test_15_authentication_bearer_and_worker_key(self):
        """Worker authentication checks both Bearer and X-Worker-Auth-Key."""
        handler = GroundingWorkerRequestHandler.__new__(GroundingWorkerRequestHandler)
        expected_key = os.getenv("GROUNDING_AUTH_KEY") or os.getenv("GEOCHAT_AUTH_KEY", "satquery-grounding-worker-secret")

        # 1. Bearer header
        handler.headers = DummyHeaders({"Authorization": f"Bearer {expected_key}"})
        self.assertTrue(handler._check_auth())

        # 2. X-Worker-Auth-Key header
        handler.headers = DummyHeaders({"X-Worker-Auth-Key": expected_key})
        self.assertTrue(handler._check_auth())

        # 3. Invalid header
        handler.headers = DummyHeaders({"Authorization": "Bearer wrong-key"})
        self.assertFalse(handler._check_auth())

    def test_16_unauthorized_request_rejected_401(self):
        """POST request with invalid auth credentials returns HTTP 401."""
        payload = json.dumps({"task": "grounding"}).encode()
        req = Request(
            f"http://127.0.0.1:{self.port}/v1/grounding",
            data=payload,
            headers={"Content-Type": "application/json", "Authorization": "Bearer completely-wrong-token"},
            method="POST"
        )
        with self.assertRaises(HTTPError) as ctx:
            urlopen(req)
        self.assertEqual(ctx.exception.code, 401)
        err = json.loads(ctx.exception.read().decode())
        self.assertEqual(err.get("code"), "UNAUTHORIZED")

    def test_17_target_formatting_lowercase_period(self):
        """Format target query removes leading action words, lowercases, and appends period."""
        runtime = GroundingDINORuntime()
        self.assertEqual(runtime.format_target_query("Locate the airplanes"), "airplanes.")
        self.assertEqual(runtime.format_target_query("Where is the runway?"), "runway.")
        self.assertEqual(runtime.format_target_query("show me storage tanks"), "storage tanks.")
        self.assertEqual(runtime.format_target_query("SOLAR PANELS."), "solar panels.")

    def test_18_post_processing_box_normalization_and_clamping(self):
        """Coordinates must be clamped to [0, 1], non-inverted, with valid confidence."""
        runtime = GroundingDINORuntime()
        # Mock ready state
        runtime.model_loaded = True
        runtime.model = MagicMock()
        runtime.processor = MagicMock()
        runtime.cuda_available = True
        runtime.device_type = "cpu"

        # Mock post-processor returning 1 valid box, 1 inverted box (xMin > xMax), and 1 invalid confidence
        mock_scores = [0.85, 0.90, 1.5]
        mock_labels = ["solar panel", "bad box", "bad conf"]
        # Pixel coordinates for 100x100 image: [x1, y1, x2, y2]
        mock_boxes = [
            [10.0, 20.0, 50.0, 60.0],   # valid: [0.1, 0.2, 0.5, 0.6]
            [70.0, 20.0, 30.0, 60.0],   # invalid: x1 > x2
            [10.0, 10.0, 40.0, 40.0]    # invalid confidence 1.5
        ]

        class MockBatch(dict):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                self.input_ids = MagicMock()
            def to(self, device):
                return self

        runtime.processor.return_value = MockBatch({
            "input_ids": MagicMock(),
            "pixel_values": MagicMock()
        })
        runtime.processor.post_process_grounded_object_detection.return_value = [{
            "scores": mock_scores,
            "labels": mock_labels,
            "boxes": mock_boxes
        }]

        # 100x100 test image so [10, 20, 50, 60] normalizes to [0.1, 0.2, 0.5, 0.6]
        if PIL_AVAILABLE:
            img = Image.new("RGB", (100, 100), color=(128, 128, 128))
            buf = BytesIO()
            img.save(buf, format="PNG")
            img_b64 = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
        else:
            img_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

        status, resp = runtime.process_grounding_request({
            "task": "grounding",
            "target": "solar panel",
            "image": {"dataUri": img_b64}
        })

        self.assertEqual(status, 200)
        self.assertEqual(resp["provenance"], "MODEL_GENERATED")
        # Only the 1 valid detection must survive
        self.assertEqual(len(resp["detections"]), 1)
        valid_box = resp["detections"][0]["box"]
        self.assertTrue(0.0 <= valid_box["xMin"] < valid_box["xMax"] <= 1.0)
        self.assertTrue(0.0 <= valid_box["yMin"] < valid_box["yMax"] <= 1.0)
        self.assertEqual(resp["detections"][0]["confidence"], 0.85)
        self.assertAlmostEqual(valid_box["xMin"], 0.1)
        self.assertAlmostEqual(valid_box["xMax"], 0.5)

    def test_19_zero_detections_returns_200_with_empty_array(self):
        """When 0 objects match, worker returns HTTP 200 with detections: [] and MODEL_GENERATED."""
        runtime = GroundingDINORuntime()
        runtime.model_loaded = True
        runtime.model = MagicMock()
        runtime.processor = MagicMock()
        runtime.cuda_available = True
        runtime.device_type = "cpu"

        class MockBatch(dict):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                self.input_ids = MagicMock()
            def to(self, device):
                return self

        runtime.processor.return_value = MockBatch({
            "input_ids": MagicMock(),
            "pixel_values": MagicMock()
        })
        runtime.processor.post_process_grounded_object_detection.return_value = [{
            "scores": [],
            "labels": [],
            "boxes": []
        }]

        img_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        status, resp = runtime.process_grounding_request({
            "task": "grounding",
            "target": "submarine",
            "image": {"dataUri": img_b64}
        })

        self.assertEqual(status, 200)
        self.assertEqual(resp["status"], "success")
        self.assertEqual(resp["provenance"], "MODEL_GENERATED")
        self.assertEqual(resp["detections"], [])

    def test_20_deterministic_execution(self):
        """format_target_query and geometric calculations are pure and deterministic."""
        runtime = GroundingDINORuntime()
        target = "Locate high-voltage transmission towers"
        results = [runtime.format_target_query(target) for _ in range(10)]
        for r in results:
            self.assertEqual(r, results[0])
            self.assertEqual(r, "high-voltage transmission towers.")


if __name__ == "__main__":
    unittest.main()
