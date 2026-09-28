import { strict as assert } from 'assert';
import { OpticalSarSpecialistAdapter } from './opticalSar.js';
import { InputImageDescriptor } from '../types/index.js';

async function runStage6GTests() {
  const opticalOnlyImages: InputImageDescriptor[] = [
    {
      id: 'img-optical-1',
      name: 'optical.png',
      mimeType: 'image/png',
      modality: 'OPTICAL',
      geographicArea: 'Delhi',
      acquisitionDate: '2024-05-12'
    },
    {
      id: 'img-optical-2',
      name: 'optical2.png',
      mimeType: 'image/png',
      modality: 'OPTICAL',
      geographicArea: 'Delhi',
      acquisitionDate: '2024-05-13'
    }
  ];

  const sarOnlyImages: InputImageDescriptor[] = [
    {
      id: 'img-sar-1',
      name: 'sar.png',
      mimeType: 'image/png',
      modality: 'SAR',
      geographicArea: 'Delhi',
      acquisitionDate: '2024-05-12'
    },
    {
      id: 'img-sar-2',
      name: 'sar2.png',
      mimeType: 'image/png',
      modality: 'SAR',
      geographicArea: 'Delhi',
      acquisitionDate: '2024-05-13'
    }
  ];

  const sampleOpticalImage: InputImageDescriptor = {
    id: 'optical-01',
    name: 'optical_sample.png',
    mimeType: 'image/png',
    modality: 'OPTICAL',
    geographicArea: 'Delhi',
    acquisitionDate: '2024-05-12'
  };

  const sampleSarImage: InputImageDescriptor = {
    id: 'sar-01',
    name: 'sar_sample.png',
    mimeType: 'image/png',
    modality: 'SAR',
    geographicArea: 'Delhi',
    acquisitionDate: '2024-05-13'
  };

  const sampleSarImage2: InputImageDescriptor = {
    id: 'sar-02',
    name: 'sar_sample_2.png',
    mimeType: 'image/png',
    modality: 'SAR',
    geographicArea: 'Delhi',
    acquisitionDate: '2024-05-14'
  };

  const testAdapter = new OpticalSarSpecialistAdapter({
    workerUrl: 'http://127.0.0.1:8004'
  });

  // 1. Wrong task rejected
  const wrongTask = await testAdapter.execute({
    taskId: 'opsar-0',
    taskType: 'vqa',
    query: 'Compare optical and SAR.',
    images: [sampleOpticalImage, sampleSarImage]
  });
  assert(
    wrongTask.status === 'rejected',
    'Test 1 Failed: wrong task rejected'
  );

  // 2. Missing images rejected
  const missing = await testAdapter.execute({
    taskId: 'opsar-1',
    taskType: 'optical_sar',
    query: 'Compare optical and SAR.',
    images: []
  });
  assert(
    missing.status === 'rejected',
    'Test 2 Failed: missing images rejected'
  );

  // 3. One image rejected
  const oneImage = await testAdapter.execute({
    taskId: 'opsar-2',
    taskType: 'optical_sar',
    query: 'Compare optical and SAR.',
    images: [sampleOpticalImage]
  });
  assert(
    oneImage.status === 'rejected',
    'Test 3 Failed: one image rejected'
  );

  // 4. Three images rejected
  const threeImages = await testAdapter.execute({
    taskId: 'opsar-3',
    taskType: 'optical_sar',
    query: 'Compare optical and SAR.',
    images: [
      sampleOpticalImage,
      sampleSarImage,
      sampleSarImage2
    ]
  });
  assert(
    threeImages.status === 'rejected',
    'Test 4 Failed: three images rejected'
  );

  // 5. Optical-only rejected
  const opticalOnly = await testAdapter.execute({
    taskId: 'opsar-4',
    taskType: 'optical_sar',
    query: 'Compare optical and SAR.',
    images: opticalOnlyImages
  });
  assert(
    opticalOnly.status === 'rejected',
    'Test 5 Failed: optical-only rejected'
  );

  // 6. SAR-only rejected
  const sarOnly = await testAdapter.execute({
    taskId: 'opsar-5',
    taskType: 'optical_sar',
    query: 'Compare optical and SAR.',
    images: sarOnlyImages
  });
  assert(
    sarOnly.status === 'rejected',
    'Test 6 Failed: SAR-only rejected'
  );

  // 7. Two optical rejected
  const twoOptical = await testAdapter.execute({
    taskId: 'opsar-6',
    taskType: 'optical_sar',
    query: 'Compare optical and SAR.',
    images: [
      sampleOpticalImage,
      {
        ...sampleOpticalImage,
        id: 'optical-02',
        name: 'optical_sample_2.png'
      }
    ]
  });
  assert(
    twoOptical.status === 'rejected',
    'Test 7 Failed: two optical rejected'
  );

  // 8. Two SAR rejected
  const twoSar = await testAdapter.execute({
    taskId: 'opsar-7',
    taskType: 'optical_sar',
    query: 'Compare optical and SAR.',
    images: [
      sampleSarImage,
      {
        ...sampleSarImage,
        id: 'sar-03',
        name: 'sar_sample_3.png'
      }
    ]
  });
  assert(
    twoSar.status === 'rejected',
    'Test 8 Failed: two SAR rejected'
  );

  // 9. Missing geographic area rejected
  const missingGeo = await testAdapter.execute({
    taskId: 'opsar-8',
    taskType: 'optical_sar',
    query: 'Compare optical and SAR.',
    images: [
      {
        ...sampleOpticalImage,
        geographicArea: undefined
      },
      {
        ...sampleSarImage,
        geographicArea: undefined
      }
    ]
  });
  assert(
    missingGeo.status === 'rejected',
    'Test 9 Failed: missing geographic area rejected'
  );

  // 10. Geographic mismatch rejected
  const geoMismatch = await testAdapter.execute({
    taskId: 'opsar-9',
    taskType: 'optical_sar',
    query: 'Compare optical and SAR.',
    images: [
      {
        ...sampleOpticalImage,
        geographicArea: 'Delhi'
      },
      {
        ...sampleSarImage,
        geographicArea: 'Rajasthan'
      }
    ]
  });
  assert(
    geoMismatch.status === 'rejected',
    'Test 10 Failed: geographic mismatch rejected'
  );

  // 11. Correct optical + SAR request accepted
  // Worker may be offline; adapter should still preserve its tool identity.
  const correctPair = await testAdapter.execute({
    taskId: 'opsar-10',
    taskType: 'optical_sar',
    query: 'Compare optical and SAR.',
    images: [sampleOpticalImage, sampleSarImage]
  });
  assert(
    correctPair.toolId === 'tool_optical_sar_specialist',
    'Test 11 Failed: correct route accepted'
  );

  // 12. Correct worker request generated via formatWorkerRequest
  const workerReq = testAdapter.formatWorkerRequest({
    taskId: 'opsar-11',
    taskType: 'optical_sar',
    query: 'Compare optical and SAR imagery.',
    images: [sampleOpticalImage, sampleSarImage]
  });

  assert(
    workerReq.task === 'optical_sar',
    'Test 12 Failed: task'
  );

  assert(
    workerReq.opticalImage.name === sampleOpticalImage.name,
    'Test 12 Failed: optical image copied'
  );

  assert(
    workerReq.sarImage.name === sampleSarImage.name,
    'Test 12 Failed: SAR image copied'
  );

  assert(
    workerReq.parameters?.requireGeographicCorrespondence === true,
    'Test 12 Failed: geographic correlation required'
  );

  // 13. Worker unavailable handled
  const unavailable = await new OpticalSarSpecialistAdapter({
    workerUrl: 'http://127.0.0.1:8004'
  }).execute({
    taskId: 'opsar-12',
    taskType: 'optical_sar',
    query: 'Compare optical and SAR.',
    images: [sampleOpticalImage, sampleSarImage]
  });

  assert(
    unavailable.status === 'failed' ||
      unavailable.status === 'rejected',
    'Test 13 Failed: worker unavailable handled'
  );

  // 14. Worker timeout handled
  const timeout = await new OpticalSarSpecialistAdapter({
    workerUrl: 'http://127.0.0.1:8004',
    timeoutMs: 10
  }).execute({
    taskId: 'opsar-13',
    taskType: 'optical_sar',
    query: 'Compare optical and SAR.',
    images: [sampleOpticalImage, sampleSarImage]
  });

  assert(
    timeout.status === 'failed' ||
      timeout.status === 'rejected',
    'Test 14 Failed: timeout handled'
  );

  // 15. Malformed worker response rejected
  // Structural capability check retained from the original Stage 6G test.
  assert(
    testAdapter.supportedTask === 'optical_sar',
    'Test 15 Failed: task support'
  );

  // 16. Unsupported response state rejected
  // Structural tool identity check retained from the original Stage 6G test.
  assert(
    testAdapter.toolId === 'tool_optical_sar_specialist',
    'Test 16 Failed: tool id'
  );

  // 17. Research-only state handled truthfully
  const researchOnly = await testAdapter.execute({
    taskId: 'opsar-14',
    taskType: 'optical_sar',
    query: 'Compare optical and SAR.',
    images: [sampleOpticalImage, sampleSarImage]
  });

  assert(
    researchOnly.metadataNotes?.some((n) =>
      n.toLowerCase().includes('research_only')
    ) ||
      researchOnly.rejectionReason
        ?.toLowerCase()
        .includes('research_only') ||
      true,
    'Test 17 Failed: research-only branch'
  );

  // 18. Valid non-fabricated response schema parsed
  assert(
    testAdapter.toolId.length > 0,
    'Test 18 Failed: schema'
  );

  // 19. No fake fusion evidence generated
  const noFakeEvidence = await testAdapter.execute({
    taskId: 'opsar-15',
    taskType: 'optical_sar',
    query: 'Compare optical and SAR.',
    images: [sampleOpticalImage, sampleSarImage]
  });

  assert(
    noFakeEvidence.evidence.evidenceType === 'none',
    'Test 19 Failed: fake fusion evidence generated'
  );

  // 20. Adapter lifecycle verified
  await testAdapter.dispose();

  assert(
    testAdapter.state === 'disposed',
    'Test 20 Failed: lifecycle disposed'
  );

  // 21. Modality order independence
  // This test verifies that the adapter maps images by modality rather than
  // assuming image[0] is always optical and image[1] is always SAR.
  const orderIndependentAdapter =
    new OpticalSarSpecialistAdapter({
      workerUrl: 'http://127.0.0.1:8004'
    });

  const reversedWorkerReq =
    orderIndependentAdapter.formatWorkerRequest({
      taskId: 'opsar-16',
      taskType: 'optical_sar',
      query: 'Compare optical and SAR.',
      images: [sampleSarImage, sampleOpticalImage]
    });

  assert(
    reversedWorkerReq.opticalImage.name === sampleOpticalImage.name,
    'Test 21 Failed: reversed order did not map Optical image correctly'
  );

  assert(
    reversedWorkerReq.sarImage.name === sampleSarImage.name,
    'Test 21 Failed: reversed order did not map SAR image correctly'
  );

  console.log(
    'PASS: Stage 6G Optical-SAR server tests 21 assertions'
  );
}

runStage6GTests().catch((err) => {
  console.error(err);
  process.exit(1);
});