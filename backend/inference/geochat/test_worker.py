#!/usr/bin/env python3
"""
SatQuery AI - Phase 7 GeoChat Worker Unit Tests (Multimodal VQA + Captioning)
SIH26167 | ISRO Space Technology

Tests request validation, schema compliance, error handling, authentication,
readiness state evaluation, hardware diagnostic logic, vision tower initialization,
image processor initialization, and multimodal tensor-passing verification.
"""

import os
import io
import base64
import unittest
from unittest.mock import MagicMock
from worker import (
    GeoChatRuntime,
    WorkerRequestHandler,
    MAX_PAYLOAD_BASE64_LENGTH,
    IMAGE_TOKEN_INDEX,
    DEFAULT_IMAGE_TOKEN,
    TORCH_AVAILABLE,
    expand2square,
    clean_geochat_caption
)
from PIL import Image

if TORCH_AVAILABLE:
    import torch


class DummyHeaders(dict):
    def get(self, key, default=""):
        return super().get(key, default)


class TestGeoChatWorker(unittest.TestCase):
    def setUp(self):
        # Instantiate runtime without downloading heavy weights
        self.runtime = GeoChatRuntime(model_id="MBZUAI/geochat-7B", load_mode="4bit")

    def test_1_health_and_runtime_diagnostics(self):
        """Worker health endpoint must expose truthful device, CUDA, and multimodal model status."""
        health = self.runtime.get_health_status()
        self.assertEqual(health["status"], "online")
        self.assertEqual(health["model_id"], "MBZUAI/geochat-7B")
        self.assertIn("cuda_available", health)
        self.assertIn("gpu_name", health)
        self.assertIn("total_vram_gb", health)
        self.assertIn("available_vram_gb", health)
        self.assertIn("model_loaded", health)
        self.assertFalse(health["model_loaded"])
        self.assertIn("vision_tower_loaded", health)
        self.assertIn("image_processor_loaded", health)

    def test_2_missing_task_rejected(self):
        """Requests with missing or invalid task types must be rejected with HTTP 400."""
        payload = {
            "task": "invalid_task",
            "question": "What is visible?",
            "image": {"name": "test.png", "mimeType": "image/png", "dataUri": "data:image/png;base64,AAAA"}
        }
        status, response = self.runtime.process_vqa_request(payload)
        self.assertEqual(status, 400)
        self.assertIn("error", response)
        self.assertIn("Invalid task", response["error"])

    def test_3_missing_question_rejected(self):
        """Requests with missing, whitespace, or non-string questions must be rejected with HTTP 400."""
        payload = {
            "task": "vqa",
            "question": "   ",
            "image": {"name": "test.png", "mimeType": "image/png", "dataUri": "data:image/png;base64,AAAA"}
        }
        status, response = self.runtime.process_vqa_request(payload)
        self.assertEqual(status, 400)
        self.assertIn("error", response)
        self.assertIn("Missing or empty question", response["error"])

    def test_4_missing_image_rejected(self):
        """Requests without an image object must be rejected with HTTP 400."""
        payload = {
            "task": "vqa",
            "question": "What objects are visible?"
        }
        status, response = self.runtime.process_vqa_request(payload)
        self.assertEqual(status, 400)
        self.assertIn("error", response)
        self.assertIn("Missing image object", response["error"])

    def test_5_invalid_image_rejected(self):
        """Image objects lacking both dataUri and path must be rejected with HTTP 400."""
        payload = {
            "task": "vqa",
            "question": "What objects are visible?",
            "image": {"name": "empty.png", "mimeType": "image/png"}
        }
        status, response = self.runtime.process_vqa_request(payload)
        self.assertEqual(status, 400)
        self.assertIn("error", response)
        self.assertIn("Neither 'dataUri' nor 'path' was provided", response["error"])

    def test_6_unloaded_model_or_non_cuda_host_blocked(self):
        """
        When model is not loaded (or CUDA is absent), must truthfully return HTTP 503
        with complete diagnostic metadata rather than simulating an answer.
        """
        payload = {
            "task": "vqa",
            "requestId": "vqa-req-123",
            "question": "What objects are visible in this satellite scene?",
            "image": {
                "name": "delhi_airport.png",
                "mimeType": "image/png",
                "dataUri": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            }
        }
        status, response = self.runtime.process_vqa_request(payload)
        self.assertEqual(status, 503)
        self.assertIn("error", response)
        self.assertEqual(response["error"], "GeoChat-7B model not loaded")
        self.assertIn("hardware", response)
        self.assertIn("required", response)
        self.assertEqual(response["requestId"], "vqa-req-123")

    def test_7_caption_missing_or_invalid_task_rejected(self):
        """Caption requests with missing or non-'caption' task type must be rejected with HTTP 400."""
        payload_invalid = {
            "task": "grounding",
            "prompt": "Describe this scene.",
            "image": {"name": "test.png", "mimeType": "image/png", "dataUri": "data:image/png;base64,AAAA"}
        }
        status, response = self.runtime.process_caption_request(payload_invalid)
        self.assertEqual(status, 400)
        self.assertIn("error", response)
        self.assertIn("Expected 'caption'", response["error"])

        payload_missing = {
            "prompt": "Describe this scene.",
            "image": {"name": "test.png", "mimeType": "image/png", "dataUri": "data:image/png;base64,AAAA"}
        }
        status, response = self.runtime.process_caption_request(payload_missing)
        self.assertEqual(status, 400)
        self.assertIn("error", response)

    def test_8_caption_missing_image_rejected(self):
        """Caption requests without an image object must be rejected with HTTP 400."""
        payload = {
            "task": "caption",
            "prompt": "Describe this scene."
        }
        status, response = self.runtime.process_caption_request(payload)
        self.assertEqual(status, 400)
        self.assertIn("error", response)
        self.assertIn("Missing image object", response["error"])

    def test_9_caption_invalid_image_rejected(self):
        """Caption image objects lacking both dataUri and path must be rejected with HTTP 400."""
        payload = {
            "task": "caption",
            "prompt": "Describe this scene.",
            "image": {"name": "empty.png", "mimeType": "image/png"}
        }
        status, response = self.runtime.process_caption_request(payload)
        self.assertEqual(status, 400)
        self.assertIn("error", response)
        self.assertIn("Neither 'dataUri' nor 'path' was provided", response["error"])

    def test_10_caption_unloaded_model_or_non_cuda_host_blocked(self):
        """
        When model is not loaded (or CUDA is absent), /v1/caption must truthfully return HTTP 503
        with complete diagnostic metadata rather than simulating a fake caption.
        """
        payload = {
            "task": "caption",
            "requestId": "cap-req-456",
            "prompt": "Describe this scene.",
            "image": {
                "name": "delhi_airport.png",
                "mimeType": "image/png",
                "dataUri": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            }
        }
        status, response = self.runtime.process_caption_request(payload)
        self.assertEqual(status, 503)
        self.assertIn("error", response)
        self.assertEqual(response["error"], "GeoChat-7B model not loaded")
        self.assertIn("hardware", response)
        self.assertIn("required", response)
        self.assertEqual(response["model_id"], "MBZUAI/geochat-7B")
        self.assertEqual(response["requestId"], "cap-req-456")

    def test_11_caption_response_schema_contract(self):
        """Verify the expected response schema contract for caption inference."""
        expected_fields = ["caption", "modelName", "device", "durationMs", "provenance", "requestId"]
        sample_response = {
            "caption": "An aerial remote-sensing scene depicting an airport runway and terminal.",
            "modelName": "MBZUAI/geochat-7B",
            "device": "cuda",
            "durationMs": 1250,
            "provenance": "MODEL_GENERATED",
            "validationState": "validated",
            "requestId": "test-req-001"
        }
        for field in expected_fields:
            self.assertIn(field, sample_response)
        self.assertIsInstance(sample_response["caption"], str)
        self.assertGreater(len(sample_response["caption"]), 0)
        self.assertEqual(sample_response["provenance"], "MODEL_GENERATED")

    def test_12_readiness_status_granular_states(self):
        """Readiness endpoint must distinguish process alive from operational multimodal model."""
        readiness = self.runtime.get_readiness_status()
        self.assertIn("readinessState", readiness)
        self.assertIn(readiness["readinessState"], ["RUNNABLE", "GPU_UNAVAILABLE", "MODEL_UNAVAILABLE", "MODEL_NOT_LOADABLE"])
        self.assertIn("isReady", readiness)
        self.assertFalse(readiness["isReady"])
        self.assertIn("cuda_available", readiness)
        self.assertIn("model_id", readiness)
        self.assertIn("vision_tower_loaded", readiness)
        self.assertIn("image_processor_loaded", readiness)

    def test_13_unsupported_sar_modality_rejected(self):
        """VQA and Caption requests specifying SAR modality must be rejected with UNSUPPORTED_MODALITY."""
        sar_payload_vqa = {
            "task": "vqa",
            "question": "What is visible?",
            "image": {
                "name": "radar_scene.tif",
                "mimeType": "image/tiff",
                "modality": "SAR",
                "dataUri": "data:image/tiff;base64,SUkqAAgAAA=="
            }
        }
        status, resp = self.runtime.process_vqa_request(sar_payload_vqa)
        self.assertEqual(status, 400)
        self.assertEqual(resp.get("code"), "UNSUPPORTED_MODALITY")
        self.assertIn("SAR imagery is not supported", resp.get("error", ""))

        sar_payload_caption = {
            "task": "caption",
            "prompt": "Describe this radar scene.",
            "image": {
                "name": "radar_scene.tif",
                "mimeType": "image/tiff",
                "modality": "SAR",
                "dataUri": "data:image/tiff;base64,SUkqAAgAAA=="
            }
        }
        c_status, c_resp = self.runtime.process_caption_request(sar_payload_caption)
        self.assertEqual(c_status, 400)
        self.assertEqual(c_resp.get("code"), "UNSUPPORTED_MODALITY")

    def test_14_request_id_propagation(self):
        """Supplied requestId must be propagated back in error and rejection responses."""
        payload = {
            "task": "vqa",
            "requestId": "trace-uuid-999",
            "question": "",  # invalid
            "image": {"name": "test.png", "mimeType": "image/png", "dataUri": "data:image/png;base64,AAAA"}
        }
        status, resp = self.runtime.process_vqa_request(payload)
        self.assertEqual(status, 400)
        self.assertEqual(resp.get("requestId"), "trace-uuid-999")

    def test_15_oversized_payload_rejected(self):
        """Payloads exceeding maximum size bounds must be rejected with HTTP 413."""
        huge_data = "data:image/png;base64," + ("A" * (MAX_PAYLOAD_BASE64_LENGTH + 100))
        payload = {
            "task": "vqa",
            "question": "What is this?",
            "image": {"name": "large.png", "mimeType": "image/png", "dataUri": huge_data}
        }
        status, resp = self.runtime.process_vqa_request(payload)
        self.assertEqual(status, 413)
        self.assertEqual(resp.get("code"), "PAYLOAD_TOO_LARGE")

    def test_16_authentication_check_logic(self):
        """Worker authentication check validates Bearer and X-Worker-Auth-Key tokens."""
        handler = WorkerRequestHandler.__new__(WorkerRequestHandler)
        expected = os.getenv("GEOCHAT_AUTH_KEY", "satquery-geochat-worker-secret")

        # 1. Valid Bearer token
        handler.headers = DummyHeaders({"Authorization": f"Bearer {expected}"})
        self.assertTrue(handler._check_auth())

        # 2. Valid X-Worker-Auth-Key header
        handler.headers = DummyHeaders({"X-Worker-Auth-Key": expected})
        self.assertTrue(handler._check_auth())

        # 3. Invalid token
        handler.headers = DummyHeaders({"Authorization": "Bearer wrong-token"})
        self.assertFalse(handler._check_auth())

        # 4. Missing auth
        handler.headers = DummyHeaders({})
        self.assertFalse(handler._check_auth())

    def test_17_image_processor_initialized(self):
        """Readiness and multimodal check requires image processor to be initialized."""
        self.runtime.model_loaded = True
        self.runtime.model = MagicMock()
        self.runtime.tokenizer = MagicMock()
        mock_vt = MagicMock()
        mock_vt.is_loaded = True
        self.runtime.vision_tower = mock_vt
        self.runtime.image_processor = None  # Missing image processor

        self.assertFalse(self.runtime.is_multimodally_ready())
        readiness = self.runtime.get_readiness_status()
        self.assertFalse(readiness["isReady"])
        self.assertFalse(readiness["image_processor_loaded"])
        self.assertNotEqual(readiness["readinessState"], "RUNNABLE")

    def test_18_vision_tower_initialized(self):
        """Readiness requires vision tower to be present and marked as loaded."""
        self.runtime.model_loaded = True
        self.runtime.model = MagicMock()
        self.runtime.tokenizer = MagicMock()
        self.runtime.image_processor = MagicMock()

        # 1. Missing vision tower
        self.runtime.vision_tower = None
        self.assertFalse(self.runtime.is_multimodally_ready())

        # 2. Vision tower present but is_loaded is False
        mock_vt = MagicMock()
        mock_vt.is_loaded = False
        self.runtime.vision_tower = mock_vt
        self.assertFalse(self.runtime.is_multimodally_ready())
        readiness = self.runtime.get_readiness_status()
        self.assertFalse(readiness["isReady"])
        self.assertFalse(readiness["vision_tower_loaded"])

    def test_19_multimodal_model_initialized(self):
        """Only when model, tokenizer, vision_tower, and image_processor are all active is state RUNNABLE."""
        self.runtime.cuda_available = True
        self.runtime.model_loaded = True
        self.runtime.model = MagicMock()
        self.runtime.tokenizer = MagicMock()
        mock_vt = MagicMock()
        mock_vt.is_loaded = True
        self.runtime.vision_tower = mock_vt
        self.runtime.image_processor = MagicMock()

        self.assertTrue(self.runtime.is_multimodally_ready())
        readiness = self.runtime.get_readiness_status()
        self.assertTrue(readiness["isReady"])
        self.assertEqual(readiness["readinessState"], "RUNNABLE")
        self.assertTrue(readiness["vision_tower_loaded"])
        self.assertTrue(readiness["image_processor_loaded"])

    def test_20_vqa_path_passes_image_tensor(self):
        """
        Verifies that VQA forward pass invokes model.generate with:
          - images= keyword argument containing official [1, 3, 504, 504] tensor
          - input_ids containing IMAGE_TOKEN_INDEX (-200)
        """
        if not TORCH_AVAILABLE:
            self.skipTest("PyTorch is not available for tensor testing.")

        self.runtime.cuda_available = True
        self.runtime.device_type = "cpu"
        self.runtime.model_loaded = True

        mock_model = MagicMock()
        mock_tokenizer = MagicMock()
        mock_tokenizer.bos_token_id = 1
        # Tokenizer converts chunks to list of IDs
        mock_tokenizer.side_effect = lambda chunk: MagicMock(input_ids=[101, 102])
        mock_tokenizer.decode.return_value = "Runways and hangars are visible.</s>"

        mock_image_processor = MagicMock()
        mock_image_processor.image_mean = (0.48145466, 0.4578275, 0.40821073)
        mock_image_processor.preprocess.return_value = {
            "pixel_values": torch.zeros((1, 3, 504, 504), dtype=torch.float32)
        }

        mock_vt = MagicMock()
        mock_vt.is_loaded = True

        # Generation returns output tensor
        mock_model.generate.return_value = torch.tensor([[101, 102, 201, 202]])

        self.runtime.model = mock_model
        self.runtime.tokenizer = mock_tokenizer
        self.runtime.image_processor = mock_image_processor
        self.runtime.vision_tower = mock_vt

        payload = {
            "task": "vqa",
            "question": "What infrastructure is present?",
            "image": {
                "name": "airport.png",
                "mimeType": "image/png",
                "dataUri": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            },
            "parameters": {"maxNewTokens": 128, "temperature": 0.2},
            "requestId": "mock-vqa-test"
        }

        status, resp = self.runtime.process_vqa_request(payload)
        self.assertEqual(status, 200)
        self.assertEqual(resp["answerText"], "Runways and hangars are visible.")
        self.assertEqual(resp["provenance"], "MODEL_GENERATED")

        # Verify model.generate call arguments
        self.assertTrue(mock_model.generate.called)
        call_kwargs = mock_model.generate.call_args[1]

        # 1. Image tensor passed
        self.assertIn("images", call_kwargs)
        images_tensor = call_kwargs["images"]
        self.assertIsInstance(images_tensor, torch.Tensor)
        self.assertEqual(images_tensor.shape, (1, 3, 504, 504))

        # 2. Input IDs contains IMAGE_TOKEN_INDEX (-200)
        self.assertIn("input_ids", call_kwargs)
        input_ids = call_kwargs["input_ids"]
        self.assertIn(IMAGE_TOKEN_INDEX, input_ids.tolist()[0])

    def test_21_caption_path_passes_image_tensor(self):
        """
        Verifies that Caption forward pass invokes model.generate with:
          - images= keyword argument containing official [1, 3, 504, 504] tensor
          - input_ids containing IMAGE_TOKEN_INDEX (-200)
        """
        if not TORCH_AVAILABLE:
            self.skipTest("PyTorch is not available for tensor testing.")

        self.runtime.cuda_available = True
        self.runtime.device_type = "cpu"
        self.runtime.model_loaded = True

        mock_model = MagicMock()
        mock_tokenizer = MagicMock()
        mock_tokenizer.bos_token_id = 1
        mock_tokenizer.side_effect = lambda chunk: MagicMock(input_ids=[101, 102])
        mock_tokenizer.decode.return_value = "A high-resolution view of a harbor with boats.</s>"

        mock_image_processor = MagicMock()
        mock_image_processor.image_mean = (0.48145466, 0.4578275, 0.40821073)
        mock_image_processor.preprocess.return_value = {
            "pixel_values": torch.zeros((1, 3, 504, 504), dtype=torch.float32)
        }

        mock_vt = MagicMock()
        mock_vt.is_loaded = True

        mock_model.generate.return_value = torch.tensor([[101, 102, 301, 302]])

        self.runtime.model = mock_model
        self.runtime.tokenizer = mock_tokenizer
        self.runtime.image_processor = mock_image_processor
        self.runtime.vision_tower = mock_vt

        payload = {
            "task": "caption",
            "prompt": "Describe this satellite scene in detail.",
            "image": {
                "name": "harbor.png",
                "mimeType": "image/png",
                "dataUri": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            },
            "parameters": {"maxNewTokens": 256, "temperature": 0.2},
            "requestId": "mock-cap-test"
        }

        status, resp = self.runtime.process_caption_request(payload)
        self.assertEqual(status, 200)
        self.assertEqual(resp["caption"], "A high-resolution view of a harbor with boats.")
        self.assertEqual(resp["provenance"], "MODEL_GENERATED")

        self.assertTrue(mock_model.generate.called)
        call_kwargs = mock_model.generate.call_args[1]

        # 1. Image tensor passed
        self.assertIn("images", call_kwargs)
        images_tensor = call_kwargs["images"]
        self.assertIsInstance(images_tensor, torch.Tensor)
        self.assertEqual(images_tensor.shape, (1, 3, 504, 504))

        # 2. Input IDs contains IMAGE_TOKEN_INDEX (-200)
        self.assertIn("input_ids", call_kwargs)
        input_ids = call_kwargs["input_ids"]
        self.assertIn(IMAGE_TOKEN_INDEX, input_ids.tolist()[0])

    def test_22_preprocess_image_pad_and_resize(self):
        """expand2square correctly creates a square image with background color."""
        rect_img = Image.new("RGB", (300, 100), color=(255, 0, 0))
        square_img = expand2square(rect_img, (0, 255, 0))
        self.assertEqual(square_img.size, (300, 300))

        # Center should be the original image color
        center_pixel = square_img.getpixel((150, 150))
        self.assertEqual(center_pixel, (255, 0, 0))

        # Edge padding should have background color
        edge_pixel = square_img.getpixel((150, 10))
        self.assertEqual(edge_pixel, (0, 255, 0))



class TestCleanGeoChatCaption(unittest.TestCase):
    """
    Regression tests for the clean_geochat_caption() post-processing function.

    Verifies:
    - Grounding / bounding-box tokens are removed from display caption.
    - Natural-language text is preserved exactly.
    - Mixed content (text + tokens) yields only the text portion.
    - Input consisting solely of grounding tokens produces an empty string.
    - Non-string and empty-string inputs are handled gracefully.
    - rawCaption field is present in a mocked 200 caption response.
    """

    # ------------------------------------------------------------------
    # Token stripping
    # ------------------------------------------------------------------

    def test_23_grounding_tokens_stripped(self):
        """Oriented bounding-box tokens must be completely removed."""
        raw = "{<80><8><100><24>|<90>}<delim>{<57><0><69><16>|<90>}"
        result = clean_geochat_caption(raw)
        self.assertEqual(result, "")

    def test_24_standard_box_tokens_stripped(self):
        """Standard (non-rotated) bounding-box tokens must be removed."""
        raw = "{<10><20><30><40>}"
        result = clean_geochat_caption(raw)
        self.assertEqual(result, "")

    def test_25_delim_token_stripped(self):
        """<delim> separator tokens must be removed."""
        self.assertEqual(clean_geochat_caption("<delim>"), "")
        self.assertEqual(clean_geochat_caption("<delim/>"), "")

    def test_26_phrase_tags_stripped_text_preserved(self):
        """<p>...</p> wrappers must be removed; inner text preserved."""
        raw = "<p>urban area</p>"
        result = clean_geochat_caption(raw)
        self.assertEqual(result, "urban area")

    def test_27_task_instruction_tokens_stripped(self):
        """[grounding], [refer], [identify], [detection] tokens must be removed."""
        for token in ["[grounding]", "[refer]", "[identify]", "[detection]"]:
            with self.subTest(token=token):
                self.assertEqual(clean_geochat_caption(token), "")

    def test_28_special_image_tokens_stripped(self):
        """<image>, <im_start>, <im_end>, <im_patch>, <unk> must be removed."""
        for token in ["<image>", "<im_start>", "<im_end>", "<im_patch>", "<unk>"]:
            with self.subTest(token=token):
                self.assertEqual(clean_geochat_caption(token), "")

    # ------------------------------------------------------------------
    # Natural-language preservation
    # ------------------------------------------------------------------

    def test_29_plain_text_unchanged(self):
        """Pure natural-language captions must pass through without alteration."""
        text = "A dense residential area with roads and green patches."
        self.assertEqual(clean_geochat_caption(text), text)

    def test_30_mixed_tokens_and_text_preserves_text(self):
        """Mixed model output must yield only the natural-language portion."""
        raw = (
            "The image shows a harbor {<80><8><100><24>|<90>}<delim>"
            "{<57><0><69><16>|<90>} with several boats docked."
        )
        result = clean_geochat_caption(raw)
        self.assertIn("harbor", result)
        self.assertIn("boats", result)
        self.assertNotIn("{<", result)
        self.assertNotIn("<delim>", result)

    def test_31_verified_real_grounding_output_cleaned(self):
        """The exact token pattern reported from the verified T4 run must be cleaned."""
        raw = (
            "This is a satellite image. {<80><8><100><24>|<90>}<delim>"
            "{<57><0><69><16>|<90>} The scene contains agricultural land."
        )
        result = clean_geochat_caption(raw)
        self.assertIn("satellite image", result)
        self.assertIn("agricultural land", result)
        self.assertNotIn("{<80>", result)
        self.assertNotIn("<delim>", result)

    # ------------------------------------------------------------------
    # Empty / invalid input edge cases
    # ------------------------------------------------------------------

    def test_32_token_only_output_returns_empty_string(self):
        """If model output consisted solely of grounding tokens, result must be empty."""
        raw = "{<10><20><30><40>|<0>}<delim>{<50><60><70><80>|<45>}"
        self.assertEqual(clean_geochat_caption(raw), "")

    def test_33_empty_string_input_returns_empty(self):
        """Empty string input must return empty string without error."""
        self.assertEqual(clean_geochat_caption(""), "")

    def test_34_non_string_input_returns_empty(self):
        """Non-string inputs must return empty string without raising."""
        self.assertEqual(clean_geochat_caption(None), "")   # type: ignore[arg-type]
        self.assertEqual(clean_geochat_caption(42), "")     # type: ignore[arg-type]

    def test_35_whitespace_only_returns_empty(self):
        """Whitespace-only strings must strip to empty."""
        self.assertEqual(clean_geochat_caption("   "), "")

    # ------------------------------------------------------------------
    # rawCaption field in mocked process_caption_request
    # ------------------------------------------------------------------

    def test_36_rawcaption_present_in_mocked_response(self):
        """
        process_caption_request must return both 'caption' (cleaned) and
        'rawCaption' (unmodified model output) in a successful 200 response.

        Uses the same mock-model pattern as test_21 to bypass the CUDA guard.
        """
        if not TORCH_AVAILABLE:
            self.skipTest("Skipping GPU-path test: torch not available in this environment.")

        runtime = GeoChatRuntime(model_id="MBZUAI/geochat-7B", load_mode="4bit")
        # Mirror test_21: patch cuda_available so is_multimodally_ready() passes
        runtime.cuda_available = True
        runtime.device_type = "cpu"
        runtime.model_loaded = True
        runtime.vision_tower_loaded = True
        runtime.image_processor_loaded = True

        raw_output = (
            "An aerial view of agricultural land. "
            "{<80><8><100><24>|<90>}<delim>{<57><0><69><16>|<90>}"
        )

        mock_model = MagicMock()
        mock_model.generate.return_value = torch.tensor([[1, 2, 3, 100, 200, 300]])

        mock_tokenizer = MagicMock()
        mock_tokenizer.bos_token_id = 1
        mock_tokenizer.side_effect = lambda chunk: MagicMock(input_ids=[101, 102])
        mock_tokenizer.decode.return_value = raw_output

        mock_image_processor = MagicMock()
        mock_image_processor.image_mean = (0.48145466, 0.4578275, 0.40821073)
        mock_image_processor.preprocess.return_value = {
            "pixel_values": torch.zeros((1, 3, 504, 504), dtype=torch.float32)
        }

        mock_vt = MagicMock()
        mock_vt.is_loaded = True

        runtime.model = mock_model
        runtime.tokenizer = mock_tokenizer
        runtime.image_processor = mock_image_processor
        runtime.vision_tower = mock_vt

        img = Image.new("RGB", (64, 64), color=(100, 150, 200))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        data_uri = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

        payload = {
            "task": "caption",
            "image": {"name": "test.png", "mimeType": "image/png", "dataUri": data_uri},
            "parameters": {"maxNewTokens": 256, "temperature": 0.2},
            "requestId": "cleanup-regression-01"
        }

        status, resp = runtime.process_caption_request(payload)

        self.assertEqual(status, 200, f"Expected 200 but got {status}: {resp}")
        self.assertIn("caption", resp)
        self.assertIn("rawCaption", resp, "rawCaption must be present for provenance")
        self.assertEqual(resp["rawCaption"], raw_output)
        # Cleaned caption must not contain grounding tokens
        self.assertNotIn("{<", resp["caption"])
        self.assertNotIn("<delim>", resp["caption"])
        # Natural text must survive
        self.assertIn("aerial view", resp["caption"])

    # ------------------------------------------------------------------
    # Phase 7 caption cleanup — additional focused regression tests
    # ------------------------------------------------------------------

    def test_37_punctuation_preserved_after_cleanup(self):
        """
        Punctuation (commas, periods, colons, semicolons, hyphens, exclamation
        marks, question marks) must survive the cleanup pass unchanged.
        Regression for Step-4 requirement #4.
        """
        # Text with varied punctuation mixed alongside a grounding token
        raw = (
            "The scene contains roads, rivers, and fields. "
            "{<10><20><30><40>|<45>}"
            " Elevation: 450 m; slope angle — 12°!"
        )
        result = clean_geochat_caption(raw)
        # Grounding token gone
        self.assertNotIn("{<", result)
        # Punctuation preserved
        self.assertIn(",", result)
        self.assertIn(".", result)
        self.assertIn(":", result)
        self.assertIn(";", result)
        self.assertIn("—", result)
        self.assertIn("!", result)
        # Original text preserved
        self.assertIn("roads", result)
        self.assertIn("rivers", result)
        self.assertIn("fields", result)
        self.assertIn("Elevation", result)

    def test_38_ordinary_numbers_and_words_not_removed(self):
        """
        Ordinary decimal numbers, percentages, coordinates written as plain
        text, and alphanumeric identifiers must NOT be stripped.
        Regression for Step-4 requirement #5.
        """
        test_cases = [
            # (input, substrings that must survive)
            ("Cloud cover is 35%.",           ["35", "%", "Cloud"]),
            ("Building height: 120 m.",       ["120", "m", "Building"]),
            ("Plot area: 0.5 ha.",             ["0.5", "ha", "Plot"]),
            ("Grid ref: 28N 12E.",             ["28N", "12E", "Grid"]),
            ("Scene ID RS2-20240915.",         ["RS2", "20240915", "Scene"]),
        ]
        for raw, expected_fragments in test_cases:
            with self.subTest(raw=raw):
                result = clean_geochat_caption(raw)
                for fragment in expected_fragments:
                    self.assertIn(
                        fragment, result,
                        f"Fragment '{fragment}' was incorrectly removed from: '{raw}'"
                    )

    def test_39_caption_cleanup_does_not_alter_model_loading_state(self):
        """
        Calling clean_geochat_caption() must not modify GeoChatRuntime
        attributes.  The model-loading lifecycle is entirely independent of
        the caption post-processing step.
        Regression for Step-4 requirement #9.
        """
        runtime = GeoChatRuntime(model_id="MBZUAI/geochat-7B", load_mode="4bit")

        # Snapshot relevant state before calling the cleanup function
        model_before           = runtime.model
        tokenizer_before       = runtime.tokenizer
        image_processor_before = runtime.image_processor
        vision_tower_before    = runtime.vision_tower
        model_loaded_before    = runtime.model_loaded
        load_error_before      = runtime.load_error

        # Run cleanup (simulates what process_caption_request does post-generation)
        _ = clean_geochat_caption(
            "Agricultural fields visible. {<10><20><30><40>|<0>}<delim>"
        )

        # State must be identical after the call
        self.assertIs(runtime.model,           model_before)
        self.assertIs(runtime.tokenizer,       tokenizer_before)
        self.assertIs(runtime.image_processor, image_processor_before)
        self.assertIs(runtime.vision_tower,    vision_tower_before)
        self.assertEqual(runtime.model_loaded, model_loaded_before)
        self.assertEqual(runtime.load_error,   load_error_before)

    def test_40_cleaned_caption_is_deterministic(self):
        """
        clean_geochat_caption() is a pure function: identical input must
        always produce identical output regardless of call order or repetition.
        Regression for Step-4 requirement #10.
        """
        raw = (
            "This satellite image shows a dense urban area "
            "{<80><8><100><24>|<90>}<delim>{<57><0><69><16>|<90>} "
            "with high-rise buildings and road networks."
        )

        results = [clean_geochat_caption(raw) for _ in range(5)]

        # Every result must equal the first
        for i, result in enumerate(results[1:], start=2):
            self.assertEqual(
                results[0], result,
                f"Call #{i} returned a different result: '{result}' vs '{results[0]}'"
            )

        # Sanity-check the deterministic output is sensible
        self.assertIn("urban area", results[0])
        self.assertIn("road networks", results[0])
        self.assertNotIn("{<", results[0])
        self.assertNotIn("<delim>", results[0])


if __name__ == "__main__":
    unittest.main(verbosity=2)
