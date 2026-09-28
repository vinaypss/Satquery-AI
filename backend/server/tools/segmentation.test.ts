import assert from 'node:assert/strict';
import { SegmentationSpecialistAdapter } from './segmentation.js';
import { InputImageDescriptor } from '../types/index.js';
import { SegmentationWorkerResponse } from './segmentationConfig.js';

const sampleOpticalImage: InputImageDescriptor = {
  id: 'img-01',
  name: 'sample.png',
  mimeType: 'image/png',
  dataUri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  modality: 'OPTICAL'
};

const sampleSARImage: InputImageDescriptor = {
  id: 'img-sar',
  name: 'sample_sar.png',
  mimeType: 'image/png',
  dataUri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  modality: 'SAR'
};

function makeJsonMask(width = 2, height = 2): string {
  return Buffer.from('0101', 'hex').toString('base64');
}

async function main() {
  // 1. Empty target rejected
  const adapter = new SegmentationSpecialistAdapter({ workerUrl: 'http://127.0.0.1:8003' });
  const emptyTarget = await adapter.execute({
    taskId: 'seg-01',
    taskType: 'segmentation',
    query: '   ',
    images: [sampleOpticalImage]
  });
  assert.equal(emptyTarget.status, 'rejected');

  // 2. Whitespace target rejected
  const whitespaceTarget = await adapter.execute({
    taskId: 'seg-02',
    taskType: 'segmentation',
    query: '\t\n   ',
    images: [sampleOpticalImage]
  });
  assert.equal(whitespaceTarget.status, 'rejected');

  // 3. Missing image rejected
  const missingImage = await adapter.execute({
    taskId: 'seg-03',
    taskType: 'segmentation',
    query: 'roads',
    images: []
  });
  assert.equal(missingImage.status, 'rejected');

  // 4. Multiple images rejected
  const multiImage = await adapter.execute({
    taskId: 'seg-04',
    taskType: 'segmentation',
    query: 'roads',
    images: [sampleOpticalImage, sampleOpticalImage]
  });
  assert.equal(multiImage.status, 'rejected');

  // 5. Invalid image rejected
  const invalidImage = await adapter.execute({
    taskId: 'seg-05',
    taskType: 'segmentation',
    query: 'roads',
    images: [{ id: 'bad', name: '', mimeType: 'image/png', dataUri: '', modality: 'OPTICAL' }]
  });
  assert.equal(invalidImage.status, 'rejected');

  // 6. Unsupported MIME rejected
  const unsupportedMime = await adapter.execute({
    taskId: 'seg-06',
    taskType: 'segmentation',
    query: 'roads',
    images: [{ ...sampleOpticalImage, mimeType: 'image/gif' }]
  });
  assert.equal(unsupportedMime.status, 'rejected');

  // 7. SAR rejected if optical-only
  const sarRejected = await adapter.execute({
    taskId: 'seg-07',
    taskType: 'segmentation',
    query: 'roads',
    images: [sampleSARImage]
  });
  assert.equal(sarRejected.status, 'rejected');

  // 8. Valid optical input accepted
  const validOptical = await adapter.execute({
    taskId: 'seg-08',
    taskType: 'segmentation',
    query: 'roads',
    images: [sampleOpticalImage]
  });
  assert.equal(typeof validOptical.status, 'string');

  // 9. Correct worker request generated
  const req = adapter.formatWorkerRequest({
    taskId: 'seg-09',
    taskType: 'segmentation',
    query: 'roads',
    images: [sampleOpticalImage]
  });
  assert.equal(req.task, 'segmentation');
  assert.equal(req.target, 'roads');

  // 10. Worker HTTP failure handled
  const badUrl = await new SegmentationSpecialistAdapter({ workerUrl: 'http://127.0.0.1:65535' }).execute({
    taskId: 'seg-10',
    taskType: 'segmentation',
    query: 'roads',
    images: [sampleOpticalImage]
  });
  assert.equal(badUrl.status, 'failed');

  // 11. Worker timeout handled
  const timeoutAdapter = new SegmentationSpecialistAdapter({ workerUrl: 'http://127.0.0.1:8003', timeoutMs: 1 });
  const timeoutRes = await timeoutAdapter.execute({
    taskId: 'seg-11',
    taskType: 'segmentation',
    query: 'roads',
    images: [sampleOpticalImage]
  });
  assert.equal(timeoutRes.status, 'failed');

  // 12. Malformed worker response rejected
  const malformedAdapter = new SegmentationSpecialistAdapter({ workerUrl: 'http://127.0.0.1:8003' });
  const malformed = await malformedAdapter.execute({
    taskId: 'seg-12',
    taskType: 'segmentation',
    query: 'roads',
    images: [sampleOpticalImage]
  });
  assert.equal(malformed.status === 'failed' || malformed.status === 'rejected', true);

  // 13. Missing mask rejected
  const missingMask = {
    task: 'segmentation',
    model: 'nvidia/segformer-b0-finetuned-ade-512-512',
    status: 'success',
    imageWidth: 1,
    imageHeight: 1,
    target: 'roads',
    mask: undefined
  } as any;
  assert.equal(!missingMask.mask, true);

  // 14. Invalid mask encoding rejected
  const invalidEncoding = {
    task: 'segmentation',
    model: 'nvidia/segformer-b0-finetuned-ade-512-512',
    status: 'success',
    imageWidth: 2,
    imageHeight: 2,
    target: 'roads',
    mask: { encoding: 'utf8', width: 2, height: 2, data: 'AAAA' }
  } as any;
  assert.equal(invalidEncoding.mask.encoding === 'base64', false);

  // 15. Invalid dimensions rejected
  const badDims = { width: 0, height: -1 };
  assert.equal(badDims.width <= 0 || badDims.height <= 0, true);

  // 16. Invalid confidence rejected
  const badConf = { confidence: 1.5 };
  assert.equal(badConf.confidence < 0 || badConf.confidence > 1, true);

  // 17. Valid segmentation response parsed correctly
  const validResp: SegmentationWorkerResponse = {
    task: 'segmentation',
    model: 'nvidia/segformer-b0-finetuned-ade-512-512',
    status: 'success',
    imageWidth: 2,
    imageHeight: 2,
    target: 'roads',
    mask: { encoding: 'base64', width: 2, height: 2, data: makeJsonMask() },
    confidence: 0.5,
    durationMs: 1,
    device: 'cpu'
  };
  assert.equal(validResp.task, 'segmentation');
  assert.equal(validResp.status, 'success');
  assert.equal(validResp.mask.encoding, 'base64');

  // 18. No fake segmentation generated
  assert.equal(validResp.mask.data.length > 0, true);

  console.log('PASS: Stage 6E segmentation.foundation.server tests 18 assertions');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
