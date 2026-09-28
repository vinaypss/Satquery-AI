#!/usr/bin/env python3
import unittest
import json
from worker import OpticalSarRuntime


class OpticalSarWorkerTests(unittest.TestCase):
    def setUp(self):
        self.runtime = OpticalSarRuntime()

    def test_health(self):
        status = self.runtime.get_health_status()
        self.assertEqual(status['status'], 'online')
        self.assertEqual(status['deployment_status'], 'research_only')
        self.assertFalse(status['model_loaded'])

    def test_malformed_request(self):
        status, response = self.runtime.process_optical_sar_request(None)
        self.assertEqual(status, 400)
        self.assertIn('Malformed request', response['error'])

    def test_missing_optical(self):
        status, response = self.runtime.process_optical_sar_request({
            'task': 'optical_sar',
            'opticalImage': None,
            'sarImage': {'name': 'sar.png', 'mimeType': 'image/png'},
            'geographicArea': 'Delhi',
            'query': 'Compare optical and SAR.'
        })
        self.assertEqual(status, 400)
        self.assertIn('Missing opticalImage', response['error'])

    def test_missing_sar(self):
        status, response = self.runtime.process_optical_sar_request({
            'task': 'optical_sar',
            'opticalImage': {'name': 'optical.png', 'mimeType': 'image/png'},
            'sarImage': None,
            'geographicArea': 'Delhi',
            'query': 'Compare optical and SAR.'
        })
        self.assertEqual(status, 400)
        self.assertIn('Missing sarImage', response['error'])

    def test_missing_geographic_metadata(self):
        status, response = self.runtime.process_optical_sar_request({
            'task': 'optical_sar',
            'opticalImage': {'name': 'optical.png', 'mimeType': 'image/png'},
            'sarImage': {'name': 'sar.png', 'mimeType': 'image/png'},
            'geographicArea': '',
            'query': 'Compare optical and SAR.'
        })
        self.assertEqual(status, 400)
        self.assertIn('Missing geographicArea', response['error'])

    def test_invalid_image(self):
        status, response = self.runtime.process_optical_sar_request({
            'task': 'optical_sar',
            'opticalImage': {'name': '', 'mimeType': 'image/png'},
            'sarImage': {'name': 'sar.png', 'mimeType': 'image/png'},
            'geographicArea': 'Delhi',
            'query': 'Compare optical and SAR.'
        })
        self.assertEqual(status, 400)
        self.assertIn('Invalid opticalImage', response['error'])

    def test_research_only_unavailable_state(self):
        status, response = self.runtime.process_optical_sar_request({
            'task': 'optical_sar',
            'opticalImage': {'name': 'optical.png', 'mimeType': 'image/png'},
            'sarImage': {'name': 'sar.png', 'mimeType': 'image/png'},
            'geographicArea': 'Delhi',
            'query': 'Compare optical and SAR.'
        })
        self.assertEqual(status, 503)
        self.assertEqual(response['status'], 'unavailable')
        self.assertEqual(response['deploymentStatus'], 'research_only')
        self.assertIsNone(response['evidence'])

    def test_no_fabrication_behavior(self):
        status, response = self.runtime.process_optical_sar_request({
            'task': 'optical_sar',
            'opticalImage': {'name': 'optical.png', 'mimeType': 'image/png'},
            'sarImage': {'name': 'sar.png', 'mimeType': 'image/png'},
            'geographicArea': 'Delhi',
            'query': 'Compare optical and SAR.'
        })
        self.assertEqual(status, 503)
        self.assertEqual(response['error'], 'No verified unified Optical-SAR inference model is available.')

    def test_readiness_status(self):
        readiness = self.runtime.get_readiness_status()
        self.assertIn('status', readiness)
        self.assertIn('model_state', readiness)
        self.assertIn('cuda_available', readiness)
        self.assertEqual(readiness['model_id'], 'Dual-Stream Multimodal Optical-SAR Fusion Architecture')

    def test_load_model_truthful_rejection_on_cpu(self):
        if not self.runtime.cuda_available:
            success, msg = self.runtime.load_model()
            self.assertFalse(success)
            self.assertIn('research_only', msg)
            self.assertFalse(self.runtime.model_loaded)
            self.assertEqual(self.runtime.model_state, 'unavailable')

    def test_invalid_task_type(self):
        status, response = self.runtime.process_optical_sar_request({
            'task': 'vqa',
            'opticalImage': {'name': 'optical.png'},
            'sarImage': {'name': 'sar.png'},
            'geographicArea': 'Delhi',
            'query': 'Compare optical and SAR.'
        })
        self.assertEqual(status, 400)
        self.assertIn('Invalid task', response['error'])

    def test_empty_query_rejected(self):
        status, response = self.runtime.process_optical_sar_request({
            'task': 'optical_sar',
            'opticalImage': {'name': 'optical.png'},
            'sarImage': {'name': 'sar.png'},
            'geographicArea': 'Delhi',
            'query': '   '
        })
        self.assertEqual(status, 400)
        self.assertIn('Missing or empty query', response['error'])


if __name__ == '__main__':
    unittest.main()
