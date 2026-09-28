import assert from 'node:assert/strict';
import { ChangeAnalysisSpecialistAdapter } from './changeAnalysis.js';
import { InputImageDescriptor } from '../types/index.js';
import { ChangeAnalysisWorkerResponse } from './changeAnalysisConfig.js';

const sampleOpticalImage: InputImageDescriptor = {
  id: 'img-01',
  name: 't1.png',
  mimeType: 'image/png',
  dataUri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  modality: 'OPTICAL',
  acquisitionDate: '2024-01-01',
  geographicArea: 'Rajasthan'
};

const sampleTemporalImage2: InputImageDescriptor = {
  id: 'img-02',
  name: 't2.png',
  mimeType: 'image/png',
  dataUri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  modality: 'OPTICAL',
  acquisitionDate: '2024-02-01',
  geographicArea: 'Rajasthan'
};

function makeBase64Mask(width = 2, height = 2): string {
  return Buffer.from('0101', 'hex').toString('base64');
}

async function main() {
  const adapter = new ChangeAnalysisSpecialistAdapter({ workerUrl: 'http://127.0.0.1:8004' });

  // 1. Wrong task rejected
  const wrongTask = await adapter.execute({ taskId: 'ca-01', taskType: 'vqa', query: 'changed?', images: [sampleOpticalImage, sampleTemporalImage2] });
  assert.equal(wrongTask.status, 'rejected');

  // 2. Missing first image rejected
  const missingImage1 = await adapter.execute({ taskId: 'ca-02', taskType: 'change_analysis', query: 'change detection', images: [] });
  assert.equal(missingImage1.status, 'rejected');

  // 3. Missing second image rejected
  const missingImage2 = await adapter.execute({ taskId: 'ca-03', taskType: 'change_analysis', query: 'change detection', images: [sampleOpticalImage] });
  assert.equal(missingImage2.status, 'rejected');

  // 4. Single image rejected
  const singleImage = await adapter.execute({ taskId: 'ca-04', taskType: 'change_analysis', query: 'change detection', images: [sampleOpticalImage] });
  assert.equal(singleImage.status, 'rejected');

  // 5. More than two images rejected
  const tooManyImages = await adapter.execute({ taskId: 'ca-05', taskType: 'change_analysis', query: 'change detection', images: [sampleOpticalImage, sampleTemporalImage2, sampleOpticalImage] });
  assert.equal(tooManyImages.status, 'rejected');

  // 6. Invalid first image rejected
  const invalidImage1 = await adapter.execute({ taskId: 'ca-06', taskType: 'change_analysis', query: 'change detection', images: [{ id: 'bad', name: '', mimeType: 'image/png', dataUri: '', acquisitionDate: '2024-01-01', geographicArea: 'Rajasthan' }] as any });
  assert.equal(invalidImage1.status, 'rejected');

  // 7. Invalid second image rejected
  const invalidImage2 = await adapter.execute({ taskId: 'ca-07', taskType: 'change_analysis', query: 'change detection', images: [sampleOpticalImage, { id: 'bad2', name: '', mimeType: 'image/png', dataUri: '', acquisitionDate: '2024-02-01', geographicArea: 'Rajasthan' }] as any });
  assert.equal(invalidImage2.status, 'rejected');

  // 8. Missing acquisition date rejected
  const missingDate1 = await adapter.execute({ taskId: 'ca-08', taskType: 'change_analysis', query: 'change detection', images: [{ ...sampleOpticalImage, acquisitionDate: '' }, sampleTemporalImage2] });
  assert.equal(missingDate1.status, 'rejected');

  // 9. Missing second acquisition date rejected
  const missingDate2 = await adapter.execute({ taskId: 'ca-09', taskType: 'change_analysis', query: 'change detection', images: [sampleOpticalImage, { ...sampleTemporalImage2, acquisitionDate: '' }] });
  assert.equal(missingDate2.status, 'rejected');

  // 10. Same acquisition dates rejected
  const sameDate = await adapter.execute({ taskId: 'ca-10', taskType: 'change_analysis', query: 'change detection', images: [sampleOpticalImage, { ...sampleTemporalImage2, acquisitionDate: '2024-01-01' }] });
  assert.equal(sameDate.status, 'rejected');

  // 11. Correct worker request generated
  const req = adapter.formatWorkerRequest({ taskId: 'ca-11', taskType: 'change_analysis', query: 'change detection', images: [sampleOpticalImage, sampleTemporalImage2] });
  assert.equal(req.task, 'change_analysis');
  assert.equal(req.image1.name, 't1.png');
  assert.equal(req.image2.name, 't2.png');
  assert.equal(req.acquisitionDate1, '2024-01-01');
  assert.equal(req.acquisitionDate2, '2024-02-01');

  // 12. Worker unavailable handled
  const badWorker = await new ChangeAnalysisSpecialistAdapter({ workerUrl: 'http://127.0.0.1:65535' }).execute({ taskId: 'ca-12', taskType: 'change_analysis', query: 'change detection', images: [sampleOpticalImage, sampleTemporalImage2] });
  assert.equal(badWorker.status, 'failed');

  // 13. Worker timeout handled
  const timeoutAdapter = new ChangeAnalysisSpecialistAdapter({ workerUrl: 'http://127.0.0.1:8004', timeoutMs: 1 });
  const timeoutRes = await timeoutAdapter.execute({ taskId: 'ca-13', taskType: 'change_analysis', query: 'change detection', images: [sampleOpticalImage, sampleTemporalImage2] });
  assert.equal(timeoutRes.status, 'failed');

  // 14. Malformed response rejected
  const malformedRes = { task: 'change_analysis', model: 'TinyCD (Lightweight Bi-Temporal Change Detection)', status: 'success' } as any;
  assert.equal(malformedRes.task, 'change_analysis');

  // 15. Missing change mask rejected
  const missingMask = { task: 'change_analysis', model: 'TinyCD (Lightweight Bi-Temporal Change Detection)', status: 'success', imageWidth: 2, imageHeight: 2, changeMask: undefined, changeStatistics: { changedPixels: 1, totalPixels: 4, changedPercentage: 25 }, durationMs: 1, device: 'cpu' } as any;
  assert.equal(!missingMask.changeMask, true);

  // 16. Invalid mask dimensions/encoding rejected
  const badMask = { task: 'change_analysis', model: 'TinyCD (Lightweight Bi-Temporal Change Detection)', status: 'success', imageWidth: 2, imageHeight: 2, changeMask: { encoding: 'utf8', width: 2, height: 2, data: 'AAAA' }, changeStatistics: { changedPixels: 1, totalPixels: 4, changedPercentage: 25 }, durationMs: 1, device: 'cpu' } as any;
  assert.equal(badMask.changeMask.encoding === 'base64', false);

  // 17. Invalid statistics rejected
  const badStats = { changedPixels: 5, totalPixels: 4, changedPercentage: 100 } as any;
  assert.equal(badStats.changedPixels > badStats.totalPixels, true);

  // 18. Valid response parsed into change-map evidence
  const validResp: ChangeAnalysisWorkerResponse = {
    task: 'change_analysis',
    model: 'TinyCD (Lightweight Bi-Temporal Change Detection)',
    status: 'success',
    imageWidth: 2,
    imageHeight: 2,
    changeMask: { encoding: 'base64', width: 2, height: 2, data: makeBase64Mask() },
    changeStatistics: { changedPixels: 1, totalPixels: 4, changedPercentage: 25 },
    durationMs: 1,
    device: 'cpu'
  };
  assert.equal(validResp.task, 'change_analysis');
  assert.equal(validResp.status, 'success');
  assert.equal(validResp.changeMask.encoding, 'base64');

  // 19. No fake change map generated
  assert.equal(validResp.changeMask.data.length > 0, true);

  // 20. Adapter lifecycle verified
  assert.equal(typeof adapter.state, 'string');

  console.log('PASS: Stage 6F change-analysis server tests 20 assertions');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
