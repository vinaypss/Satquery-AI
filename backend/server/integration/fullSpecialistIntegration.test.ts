import { strict as assert } from 'assert';
import http from 'http';

import { parseQuery } from '../agent/queryParser.js';
import { routeTask } from '../agent/router.js';
import { validateCompatibility } from '../validation/compatibilityValidator.js';
import {
  getSpecialistAdapter,
  getSpecialistAdapterByTask,
  executeSpecialistTask
} from '../tools/index.js';
import {
  VqaSpecialistAdapter,
  CaptionSpecialistAdapter,
  GroundingSpecialistAdapter,
  SegmentationSpecialistAdapter,
  ChangeAnalysisSpecialistAdapter,
  OpticalSarSpecialistAdapter
} from '../tools/index.js';
import {
  InputImageDescriptor,
  ParsedQuery,
  RoutingDecisionResult,
  SpecialistInput,
  SpecialistOutput,
  SpecialistEvidence
} from '../types/index.js';

let assertionCount = 0;
function check(condition: boolean, message: string) {
  assertionCount++;
  assert(condition, message);
}

async function runServer(handler: http.RequestListener): Promise<{ server: http.Server; url: string }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Unable to determine test worker port.');
  }
  return { server, url: `http://127.0.0.1:${addr.port}` };
}

async function closeServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
}

async function runFullSpecialistIntegration() {
  console.log('--- Running SatQuery AI Stage 6H-4 Full Specialist End-to-End Integration Tests ---');

  const optical: InputImageDescriptor = {
    id: 'optical-1',
    name: 'delhi_optical.png',
    mimeType: 'image/png',
    modality: 'OPTICAL',
    acquisitionDate: '2024-05-12',
    geographicArea: 'Delhi',
    dataUri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  };

  const sar: InputImageDescriptor = {
    id: 'sar-1',
    name: 'delhi_sar.png',
    mimeType: 'image/png',
    modality: 'SAR',
    acquisitionDate: '2024-05-11',
    geographicArea: 'Delhi'
  };

  const optical2: InputImageDescriptor = {
    id: 'optical-2',
    name: 'delhi_optical_t2.png',
    mimeType: 'image/png',
    modality: 'OPTICAL',
    acquisitionDate: '2024-11-20',
    geographicArea: 'Delhi',
    dataUri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  };

  const unsupportedSegmentationImage: InputImageDescriptor = {
    id: 'sar-seg',
    name: 'sar_seg.png',
    mimeType: 'image/png',
    modality: 'SAR',
    acquisitionDate: '2024-05-12',
    geographicArea: 'Delhi'
  };

  // VQA positive case
  {
    const q = 'What runway structures are visible in this optical image?';
    const parsed = parseQuery(q);
    check(parsed.valid === true, 'VQA parse should be valid.');
    check(parsed.parsedQuery?.taskType === 'vqa', 'VQA parser must identify vqa task.');

    const decision = routeTask(parsed.parsedQuery as ParsedQuery, [optical]);
    check(decision.routingStatus === 'routed', 'Route decision should be routed.');
    check(decision.selectedToolId === 'tool_vqa_specialist', 'VQA route should select tool_vqa_specialist.');

    const compat = validateCompatibility(parsed.parsedQuery as ParsedQuery, [optical]);
    check(compat.status === 'compatible', 'VQA compatibility validator should accept optical image.');

    const adapter = getSpecialistAdapterByTask('vqa');
    check(adapter?.toolId === 'tool_vqa_specialist', 'Registry must map vqa task to VQA adapter.');

    const workerServer = await runServer((req, res) => {
      if (req.method === 'POST' && req.url === '/v1/vqa') {
        let body = '';
        req.on('data', (chunk) => body += chunk);
        req.on('end', () => {
          const payload = JSON.parse(body);
          check(payload.task === 'vqa', 'VQA worker request task must be vqa.');
          check(payload.question.includes('runway'), 'VQA worker request question should carry the user query.');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            answerText: 'The image displays an airport runway and apron structures.',
            confidence: 0.84,
            modelName: 'MBZUAI/geochat-7B',
            device: 'cpu',
            durationMs: 900
          }));
        });
      } else {
        res.writeHead(404);
        res.end('not found');
      }
    });

    const vqa = new VqaSpecialistAdapter({ workerUrl: workerServer.url });
    const output = await vqa.execute({
      taskId: 'case-vqa',
      taskType: 'vqa',
      query: q,
      images: [optical]
    });

    check(output.toolId === 'tool_vqa_specialist', 'VQA output toolId must match registry.');
    check(output.status === 'complete', 'VQA worker response must produce complete status.');
    check(output.evidence.evidenceType === 'text', 'VQA evidence must serialize as text evidence.');
    check(output.answerText.includes('runway'), 'VQA answerText must be returned from worker payload.');
    check(output.executionMetrics.modelName === 'MBZUAI/geochat-7B', 'VQA modelName should be propagated from worker.');

    await closeServer(workerServer.server);
  }

  // Caption positive case
  {
    const q = 'Describe the scene in this image.';
    const parsed = parseQuery(q);
    check(parsed.valid === true, 'Caption parse should be valid.');
    check(parsed.parsedQuery?.taskType === 'caption', 'Caption parser must identify caption.');

    const decision = routeTask(parsed.parsedQuery as ParsedQuery, [optical]);
    check(decision.selectedToolId === 'tool_caption_specialist', 'Caption route should select caption adapter.');

    const compat = validateCompatibility(parsed.parsedQuery as ParsedQuery, [optical]);
    check(compat.status === 'compatible', 'Caption compatibility should be compatible.');

    const adapter = getSpecialistAdapter('tool_caption_specialist');
    check(adapter?.supportedTask === 'caption', 'Caption adapter must be selected by registry.');

    const workerServer = await runServer((req, res) => {
      if (req.method === 'POST' && req.url === '/v1/caption') {
        let body = '';
        req.on('data', (chunk) => body += chunk);
        req.on('end', () => {
          const payload = JSON.parse(body);
          check(payload.task === 'caption', 'Caption worker request task must be caption.');
          check(payload.prompt.includes('Describe'), 'Caption worker request prompt should keep the natural-language prompt.');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            caption: 'An airport runway and surrounding infrastructure are visible.',
            modelName: 'MBZUAI/geochat-7B',
            device: 'cpu',
            durationMs: 900
          }));
        });
      } else {
        res.writeHead(404);
        res.end('not found');
      }
    });

    const caption = new CaptionSpecialistAdapter({ workerUrl: workerServer.url });
    const output = await caption.execute({ taskId: 'case-caption', taskType: 'caption', query: q, images: [optical] });
    check(output.toolId === 'tool_caption_specialist', 'Caption output toolId must match registry.');
    check(output.status === 'complete', 'Caption worker response must produce complete status.');
    check(output.evidence.evidenceType === 'text', 'Caption evidence must serialize as text evidence in the existing schema.');
    check(output.evidence.text?.includes('airport'), 'Caption evidence must carry the worker caption as text.');

    await closeServer(workerServer.server);
  }

  // Grounding positive case
  {
    const q = 'Where are the buildings in this image?';
    const parsed = parseQuery(q);
    check(parsed.valid === true, 'Grounding parse should be valid.');
    check(parsed.parsedQuery?.taskType === 'grounding', 'Grounding parser must identify grounding.');

    const decision = routeTask(parsed.parsedQuery as ParsedQuery, [optical]);
    check(decision.selectedToolId === 'tool_grounding_specialist', 'Grounding route should select grounding adapter.');

    const compat = validateCompatibility(parsed.parsedQuery as ParsedQuery, [optical]);
    check(compat.status === 'compatible', 'Grounding compatibility should be compatible.');

    const workerServer = await runServer((req, res) => {
      if (req.method === 'POST' && req.url === '/v1/grounding') {
        let body = '';
        req.on('data', (chunk) => body += chunk);
        req.on('end', () => {
          const payload = JSON.parse(body);
          check(payload.task === 'grounding', 'Grounding worker request task must be grounding.');
          check(payload.target === 'buildings', 'Grounding target must be extracted from query.');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            detections: [
              { label: 'buildings', confidence: 0.92, box: { xMin: 0.1, yMin: 0.2, xMax: 0.4, yMax: 0.5 } }
            ],
            coordinateFormat: 'normalized_xyxy',
            imageDimensions: { width: 1024, height: 1024 },
            model: 'IDEA-Research/grounding-dino-base',
            device: 'cpu',
            durationMs: 1200
          }));
        });
      } else {
        res.writeHead(404);
        res.end('not found');
      }
    });

    const grounding = new GroundingSpecialistAdapter({ workerUrl: workerServer.url });
    const output = await grounding.execute({
      taskId: 'case-grounding',
      taskType: 'grounding',
      query: q,
      images: [optical],
      parameters: { targetFeatures: ['buildings'] }
    });

    check(output.toolId === 'tool_grounding_specialist', 'Grounding output toolId must match registry.');
    check(output.status === 'complete', 'Grounding worker output must be complete.');
    check(output.evidence.evidenceType === 'bounding_box', 'Grounding evidence must be bounding_box.');
    check(Array.isArray(output.evidence.boxes) && output.evidence.boxes.length >= 1, 'Grounding evidence boxes must be real.');

    await closeServer(workerServer.server);
  }

  // Segmentation positive case
  {
    const q = 'Segment buildings in this image.';
    const parsed = parseQuery(q);
    check(parsed.valid === true, 'Segmentation parse should be valid.');
    check(parsed.parsedQuery?.taskType === 'segmentation', 'Segmentation parser must identify segmentation.');

    const decision = routeTask(parsed.parsedQuery as ParsedQuery, [optical]);
    check(decision.selectedToolId === 'tool_segmentation_specialist', 'Segmentation route should select segmentation adapter.');

    const compat = validateCompatibility(parsed.parsedQuery as ParsedQuery, [optical]);
    check(compat.status === 'compatible', 'Segmentation compatibility should be compatible.');

    const workerServer = await runServer((req, res) => {
      if (req.method === 'POST' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'online',
          model_state: 'ready',
          model_loaded: true,
          model_id: 'nvidia/segformer-b0-finetuned-ade-512-512',
          checkpoint: 'nvidia/segformer-b0-finetuned-ade-512-512',
          cuda_available: false,
          gpu_name: 'cpu',
          total_vram_gb: 0,
          available_vram_gb: 0,
          device: 'cpu',
          message: 'ready'
        }));
      } else if (req.method === 'POST' && req.url === '/v1/segmentation') {
        let body = '';
        req.on('data', (chunk) => body += chunk);
        req.on('end', () => {
          const payload = JSON.parse(body);
          check(payload.task === 'segmentation', 'Segmentation worker request task must be segmentation.');
          check(payload.target === 'Segment buildings in this image', 'Segmentation worker contract carries the query text target string after punctuation normalization.');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            task: 'segmentation',
            status: 'success',
            model: 'nvidia/segformer-b0-finetuned-ade-512-512',
            device: 'cpu',
            durationMs: 1100,
            imageWidth: 512,
            imageHeight: 512,
            target: 'buildings',
            confidence: 0.7,
            mask: { encoding: 'base64', width: 512, height: 512, data: 'SGVsbG8=' }
          }));
        });
      } else {
        res.writeHead(404);
        res.end('not found');
      }
    });

    const segmentation = new SegmentationSpecialistAdapter({ workerUrl: workerServer.url });
    const output = await segmentation.execute({
      taskId: 'case-segmentation',
      taskType: 'segmentation',
      query: q,
      images: [optical]
    });

    check(output.toolId === 'tool_segmentation_specialist', 'Segmentation output toolId must match registry.');
    check(output.status === 'complete', 'Segmentation worker output must be complete.');
    check(output.evidence.evidenceType === 'segmentation_mask', 'Segmentation evidence must be segmentation_mask.');
    check(output.evidence.details?.model === 'nvidia/segformer-b0-finetuned-ade-512-512', 'Segmentation evidence model must stay truthful.');

    await closeServer(workerServer.server);
  }

  // Change-analysis positive case
  {
    const q = 'Show changes before and after this area.';
    const parsed = parseQuery(q);
    check(parsed.valid === true, 'Change-analysis parse should be valid.');
    check(parsed.parsedQuery?.taskType === 'change_analysis', 'Change-analysis parser must identify change_analysis.');

    const decision = routeTask(parsed.parsedQuery as ParsedQuery, [optical, optical2]);
    check(decision.selectedToolId === 'tool_change_specialist', 'Change-analysis route should select change adapter.');

    const compat = validateCompatibility(parsed.parsedQuery as ParsedQuery, [optical, optical2]);
    check(compat.status === 'compatible', 'Change-analysis compatibility should be compatible.');

    const workerServer = await runServer((req, res) => {
      if (req.method === 'POST' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'online', model_state: 'ready', model_loaded: true }));
      } else if (req.method === 'POST' && req.url === '/v1/change-analysis') {
        let body = '';
        req.on('data', (chunk) => body += chunk);
        req.on('end', () => {
          const payload = JSON.parse(body);
          check(payload.task === 'change_analysis', 'Change-analysis worker request task must be change_analysis.');
          check(payload.acquisitionDate1 === '2024-05-12', 'Change-analysis request must carry first date.');
          check(payload.acquisitionDate2 === '2024-11-20', 'Change-analysis request must carry second date.');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            task: 'change_analysis',
            status: 'success',
            model: 'TinyCD',
            device: 'cpu',
            durationMs: 1100,
            imageWidth: 512,
            imageHeight: 512,
            changeMask: { encoding: 'base64', width: 512, height: 512, data: 'Q2hhbmdl' },
            changeStatistics: { changedPixels: 20, totalPixels: 260000, changedPercentage: 0.0077 }
          }));
        });
      } else {
        res.writeHead(404);
        res.end('not found');
      }
    });

    const change = new ChangeAnalysisSpecialistAdapter({ workerUrl: workerServer.url });
    const output = await change.execute({
      taskId: 'case-change-analysis',
      taskType: 'change_analysis',
      query: q,
      images: [optical, optical2]
    });

    check(output.toolId === 'tool_change_specialist', 'Change-analysis output toolId must match registry.');
    check(output.status === 'complete', 'Change-analysis worker response must be complete.');
    check(output.evidence.evidenceType === 'change_map', 'Change-analysis evidence type must be change_map.');
    const changeStats = (output.evidence.details as any)?.changeStatistics;
    check(typeof changeStats?.changedPixels === 'number' && changeStats.changedPixels >= 0, 'Change-analysis evidence stats must be numeric.');

    await closeServer(workerServer.server);
  }

  // Optical-SAR positive case: model remains research_only and no evidence
  {
    const q = 'Compare optical and SAR imagery.';
    const parsed = parseQuery(q);
    check(parsed.valid === true, 'Optical-SAR parse should be valid.');
    check(parsed.parsedQuery?.taskType === 'optical_sar', 'Optical-SAR parser must identify optical_sar.');

    const decision = routeTask(parsed.parsedQuery as ParsedQuery, [optical, sar]);
    check(decision.selectedToolId === 'tool_optical_sar_specialist', 'Optical-SAR route should select optical-sar adapter.');

    const compat = validateCompatibility(parsed.parsedQuery as ParsedQuery, [optical, sar]);
    check(compat.status === 'compatible', 'Optical-SAR compatibility should accept one optical and one SAR.');

    const workerServer = await runServer((req, res) => {
      if (req.method === 'POST' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'online', model_state: 'ready', model_loaded: true }));
      } else if (req.method === 'POST' && req.url === '/v1/optical-sar') {
        let body = '';
        req.on('data', (chunk) => body += chunk);
        req.on('end', () => {
          const payload = JSON.parse(body);
          check(payload.task === 'optical_sar', 'Optical-SAR worker request task must be optical_sar.');
          check(payload.opticalImage.name === 'delhi_optical.png', 'Optical-SAR request must carry optical image descriptor.');
          check(payload.sarImage.name === 'delhi_sar.png', 'Optical-SAR request must carry SAR image descriptor.');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            task: 'optical_sar',
            status: 'unavailable',
            model: 'research-only-integrated-optical-sar-fusion',
            device: 'cpu',
            durationMs: 1200,
            deploymentStatus: 'research_only',
            evidence: null,
            error: 'No verified unified Optical-SAR inference model is available.'
          }));
        });
      } else {
        res.writeHead(404);
        res.end('not found');
      }
    });

    const opticalSar = new OpticalSarSpecialistAdapter({ workerUrl: workerServer.url });
    const output = await opticalSar.execute({
      taskId: 'case-optical-sar',
      taskType: 'optical_sar',
      query: q,
      images: [optical, sar]
    });

    check(output.toolId === 'tool_optical_sar_specialist', 'Optical-SAR output toolId must match registry.');
    check(output.status === 'failed', 'Research_only Optical-SAR must remain failed in integration output.');
    check(output.evidence.evidenceType === 'none', 'Research_only optical-sar must never fabricate modality comparison evidence.');
    check(output.evidence.modalityComparison === undefined, 'Research_only optical-sar must not include modalityComparison evidence object.');
    check(output.rejectionReason?.includes('No verified unified Optical-SAR inference model') === true, 'Research_only branch should remain truthful.');

    await closeServer(workerServer.server);
  }

  // Negative and no-fabrication cases
  {
    const ambiguous = parseQuery('hello');
    check(ambiguous.valid === true, 'Ambiguous query should still parse as valid query object.');
    check(ambiguous.parsedQuery?.taskType === 'uncertain', 'Ambiguous parser result must be uncertain.');

    const route = routeTask(ambiguous.parsedQuery as ParsedQuery, [optical]);
    check(route.selectedToolId === null, 'Ambiguous query must route to no specialist tool.');
    check(route.routingStatus === 'uncertain', 'Ambiguous route result must stay uncertain.');
  }

  {
    const parsed = parseQuery('What changed in this image?');
    check(parsed.valid === true, 'Canonical change-analysis parse should be valid.');
    check(parsed.parsedQuery?.taskType === 'change_analysis', 'Change-analysis parser should recognize the changed-in-image query.');
    const route = routeTask(parsed.parsedQuery as ParsedQuery, [optical]);
    check(route.routingStatus === 'rejected', 'Single-image change-analysis input should be rejected by compatibility.');
    check(route.compatibilityErrors.some((e) => e.includes('requires exactly two')), 'Change-analysis compatibility should require two images.');
  }

  {
    const parsed = parseQuery('Compare optical and SAR imagery.');
    check(parsed.valid === true, 'Optical-SAR parser should parse optical_sar query.');

    const opticalOnlyRoute = routeTask(parsed.parsedQuery as ParsedQuery, [optical, optical2]);
    check(opticalOnlyRoute.routingStatus === 'rejected', 'Optical-only pair must not execute optical_sar.');
    check(opticalOnlyRoute.compatibilityErrors.some((e) => e.includes('Optical-SAR analysis requires')), 'Optical-only pair should fail compatibility.');

    const sarOnlyRoute = routeTask(parsed.parsedQuery as ParsedQuery, [sar, sar]);
    check(sarOnlyRoute.routingStatus === 'rejected', 'SAR-only pair must not execute optical_sar.');
    check(sarOnlyRoute.compatibilityErrors.some((e) => e.includes('Optical-SAR analysis requires')), 'SAR-only pair should fail compatibility.');
  }

  {
    const parsed = parseQuery('Where are buildings?');
    check(parsed.valid === true, 'Grounding parse should be valid.');
    const route = routeTask(parsed.parsedQuery as ParsedQuery, [optical]);
    check(route.routingStatus === 'routed', 'Grounding route should select grounding in a happy path.');

    const parsedNoFeature: ParsedQuery = {
      rawQuery: 'Where are objects in the image?',
      taskType: 'grounding',
      confidence: 0.95,
      targetFeatures: [],
      requestedObjects: [],
      temporalIntent: false,
      comparisonIntent: false,
      modalityIntent: null,
      requiresMultipleImages: false,
      explanation: 'Grounding target required.'
    };
    const compat = validateCompatibility(parsedNoFeature, [optical]);
    check(compat.status === 'rejected', 'Grounding compatibility should reject empty target features.');
    check(compat.errors.some((e) => e.includes('specific object class')), 'Grounding compatibility should mention target class requirement.');
  }

  {
    const parsed = parseQuery('Segment fields in this image.');
    check(parsed.valid === true, 'Segmentation parser should recognize segmentation.');
    const segmentation = new SegmentationSpecialistAdapter({ workerUrl: 'http://127.0.0.1:59999' });
    const output = await segmentation.execute({
      taskId: 'case-seg-sar-rejected',
      taskType: 'segmentation',
      query: 'Segment fields in this image.',
      images: [unsupportedSegmentationImage]
    });
    check(output.status === 'rejected', 'SAR segmentation input must be rejected by the adapter before worker.');
    check(output.rejectionReason?.includes('SAR imagery is not supported') === true, 'Segmentation adapter must reject SAR, not fabricate a mask.');
    check(output.evidence.evidenceType === 'none', 'SAR segmentation rejection must preserve evidenceType none.');
  }

  {
    const workerServer = await runServer((_req, res) => {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'worker unavailable' }));
    });

    const vqa = new VqaSpecialistAdapter({ workerUrl: workerServer.url });
    const output = await vqa.execute({
      taskId: 'case-vqa-no-evidence',
      taskType: 'vqa',
      query: 'What is visible?',
      images: [optical]
    });
    check(output.status === 'failed', 'VQA worker failure must map to failed.');
    check(output.evidence.evidenceType === 'none', 'Worker HTTP failure must not expose evidence.');
    check(output.answerText === '', 'Worker failure must not fabricate answerText.');

    await closeServer(workerServer.server);
  }

  {
    const workerServer = await runServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ badField: 123 }));
    });

    const vqa = new VqaSpecialistAdapter({ workerUrl: workerServer.url });
    const output = await vqa.execute({
      taskId: 'case-vqa-malformed',
      taskType: 'vqa',
      query: 'What is visible?',
      images: [optical]
    });
    check(output.status === 'failed', 'Malformed worker response must fail without evidence.');
    check(output.evidence.evidenceType === 'none', 'Malformed worker response must leave evidenceType none.');
    check(output.rejectionReason?.includes('Malformed worker response') === true, 'Malformed response must reject with a schema validation message.');

    await closeServer(workerServer.server);
  }

  {
    const parsed = parseQuery('Compare optical and SAR imagery.');
    const route = routeTask(parsed.parsedQuery as ParsedQuery, [optical, sar]);
    const adapter = getSpecialistAdapter(route.selectedToolId as string);
    const compatibility = validateCompatibility(parsed.parsedQuery as ParsedQuery, [optical, sar]);

    check(adapter?.toolId === 'tool_optical_sar_specialist', 'Controlled registry maps optical_sar task to Optical-SAR adapter.');
    check(compatibility.status === 'compatible', 'Compatibility should be compatible for valid optical_sar pair.');

    const decision: RoutingDecisionResult = {
      ...route,
      compatibilityStatus: compatibility.status,
      compatibilityErrors: compatibility.errors,
      warnings: compatibility.warnings
    };
    const output = await executeSpecialistTask(decision, {
      taskId: 'case-controller',
      taskType: 'optical_sar',
      query: 'Compare optical and SAR imagery.',
      images: [optical, sar]
    });

    check(output.toolId === 'tool_optical_sar_specialist', 'Execution controller should not bypass registry.');
    check(output.status === 'failed' || output.status === 'rejected', 'Controller should stay on the truthful non-fabricated output branch.');
  }

  console.log(`PASS: Stage 6H-4 full specialist integration test completed with ${assertionCount} assertions`);
}

runFullSpecialistIntegration().catch((err) => {
  console.error(err);
  process.exit(1);
});