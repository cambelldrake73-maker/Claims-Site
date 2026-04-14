/*
  ARCHITECTURE RULE:
  All ingestion MUST go through /services/pipeline/intake_pipeline.js
  Direct calls to parse/match/orchestrator/claim_model are forbidden.
*/

const { routeUploadedFile } = require('../intake/parser_router');
const {
  orchestrateClaimLifecycle,
  persistClaimLifecycle
} = require('../claim_ingestion_api/claim_model');

function getIntakeUploadPrivate() {
  const intakeUploadRouter = require('../intake/intake_upload_endpoint');
  const helpers = intakeUploadRouter && intakeUploadRouter._private;

  if (!helpers) {
    throw new Error('Intake upload helpers are unavailable');
  }

  return helpers;
}

function validateProcessUploadInputs({
  identity,
  uploadedFiles,
  metadata,
  recordsPayloadPresent,
  supportedFilesPerRequest,
  validateUploadedMultipartFile,
  createUploadError
}) {
  if (!identity || !identity.customer_id || !identity.provider_id) {
    throw createUploadError('UNAUTHENTICATED_OR_INVALID_IDENTITY', 401, 'Unauthenticated or invalid identity');
  }

  if (uploadedFiles.length && recordsPayloadPresent) {
    throw createUploadError('INVALID_UPLOAD_PAYLOAD', 400, 'Invalid upload payload', {
      reason: 'multiple_intake_modes_not_allowed'
    });
  }

  if (!recordsPayloadPresent && !uploadedFiles.length) {
    throw createUploadError('INVALID_UPLOAD_PAYLOAD', 400, 'Invalid upload payload', {
      reason: 'missing_upload_file'
    });
  }

  if (uploadedFiles.length > supportedFilesPerRequest) {
    throw createUploadError('TOO_MANY_FILES', 400, 'Too many files', {
      max_files_per_request: supportedFilesPerRequest
    });
  }

  if (uploadedFiles.length) {
    return uploadedFiles.map(validateUploadedMultipartFile);
  }

  return [];
}

async function processUpload({
  identity,
  files,
  metadata = {}
}) {
  const {
    SUPPORTED_FILES_PER_REQUEST,
    DUPLICATE_UPLOAD_WINDOW_MS,
    rejectClientProvidedIdentity,
    loadAuthenticatedUploadContext,
    hasRecordsPayload,
    validateJsonRecordsPayload,
    computeChecksum,
    findRecentDuplicateUpload,
    buildUploadErrorResponse,
    createUploadError,
    processParsedUpload,
    validateUploadedMultipartFile,
    createTrackedUploadContext,
    buildRecommendationSafeUploadItem
  } = getIntakeUploadPrivate();

  const rawUploadedFiles = Array.isArray(files) ? files : [];
  const recordsPayloadPresent = hasRecordsPayload(metadata);
  let uploadedFiles = [];
  let authenticatedContext;

  try {
    if (!identity || !identity.customer_id || !identity.provider_id) {
      throw createUploadError('UNAUTHENTICATED_OR_INVALID_IDENTITY', 401, 'Unauthenticated or invalid identity');
    }

    rejectClientProvidedIdentity(metadata || {});
    uploadedFiles = validateProcessUploadInputs({
      identity,
      uploadedFiles: rawUploadedFiles,
      metadata,
      recordsPayloadPresent,
      supportedFilesPerRequest: SUPPORTED_FILES_PER_REQUEST,
      validateUploadedMultipartFile,
      createUploadError
    });
    authenticatedContext = await loadAuthenticatedUploadContext(identity);
  } catch (err) {
    return buildUploadErrorResponse(err);
  }

  if (recordsPayloadPresent) {
    let validatedRecords;

    try {
      validatedRecords = validateJsonRecordsPayload(metadata?.records);
    } catch (err) {
      return buildUploadErrorResponse(err);
    }

    const computedChecksum = computeChecksum(validatedRecords.serialized);
    const duplicate = await findRecentDuplicateUpload({
      checksum: computedChecksum,
      providerId: authenticatedContext?.providerRecord?.provider_id ?? null
    });

    if (duplicate) {
      return buildUploadErrorResponse(
        createUploadError('DUPLICATE_UPLOAD_RECENT', 409, 'Duplicate upload detected', {
          duplicate_of_file_id: duplicate.file_id,
          duplicate_of_upload_id: duplicate.upload_id,
          duplicate_uploaded_at: duplicate.uploaded_at,
          duplicate_window_ms: DUPLICATE_UPLOAD_WINDOW_MS
        })
      );
    }

    return processParsedUpload({
      fileName: metadata?.file_name,
      fileType: metadata?.file_type,
      records: validatedRecords.records,
      customerId: identity.customer_id,
      providerName: authenticatedContext?.providerRecord?.provider_name || null,
      niche: metadata?.niche,
      mimeType: metadata?.mime_type || metadata?.file_type,
      fileSize: validatedRecords.sizeBytes,
      fileBuffer: Buffer.from(validatedRecords.serialized),
      checksum: computedChecksum,
      storageStatus: metadata?.storage_status,
      uploadNotes: {
        source: 'json_records'
      }
    });
  }

  try {
    const sharedUploadContext = createTrackedUploadContext({
      niche: metadata?.niche,
      createdAt: Date.now()
    });

    if (uploadedFiles.length === 1) {
      const uploadedFile = uploadedFiles[0];
      const computedChecksum = computeChecksum(uploadedFile.buffer);
      const duplicate = await findRecentDuplicateUpload({
        checksum: computedChecksum,
        providerId: authenticatedContext?.providerRecord?.provider_id ?? null
      });

      if (duplicate) {
        return buildUploadErrorResponse(
          createUploadError('DUPLICATE_UPLOAD_RECENT', 409, 'Duplicate upload detected', {
            duplicate_of_file_id: duplicate.file_id,
            duplicate_of_upload_id: duplicate.upload_id,
            duplicate_uploaded_at: duplicate.uploaded_at,
            duplicate_window_ms: DUPLICATE_UPLOAD_WINDOW_MS
          })
        );
      }

      const parsedFile = routeUploadedFile(uploadedFile);
      return processParsedUpload({
        fileName: metadata?.file_name || uploadedFile.originalname || 'uploaded-file',
        fileType: parsedFile.fileType,
        records: parsedFile.records,
        customerId: identity.customer_id,
        providerName: authenticatedContext?.providerRecord?.provider_name || null,
        niche: metadata?.niche,
        mimeType: uploadedFile.mimetype || metadata?.mime_type,
        fileSize: uploadedFile.size,
        fileBuffer: uploadedFile.buffer,
        checksum: computedChecksum,
        storageStatus: metadata?.storage_status,
        uploadNotes: {
          source: 'multipart_upload',
          parse_route: parsedFile.route
        },
        metadataOnly: parsedFile.metadataOnly === true,
        parserType: parsedFile.parserType || null,
        parseStatus: parsedFile.parseStatus || null,
        parseSummary: parsedFile.summary || null,
        uploadContext: sharedUploadContext,
        providerRecordOverride: authenticatedContext?.providerRecord || null
      });
    }

    const fileResults = [];

    for (const uploadedFile of uploadedFiles) {
      const computedChecksum = computeChecksum(uploadedFile.buffer);
      const duplicate = await findRecentDuplicateUpload({
        checksum: computedChecksum,
        providerId: authenticatedContext?.providerRecord?.provider_id ?? null
      });

      if (duplicate) {
        const duplicateResponse = buildUploadErrorResponse(
          createUploadError('DUPLICATE_UPLOAD_RECENT', 409, 'Duplicate upload detected', {
            duplicate_of_file_id: duplicate.file_id,
            duplicate_of_upload_id: duplicate.upload_id,
            duplicate_uploaded_at: duplicate.uploaded_at,
            duplicate_window_ms: DUPLICATE_UPLOAD_WINDOW_MS
          }),
          {
            file_name: uploadedFile.originalname || null,
            upload_id: sharedUploadContext.upload_id
          }
        );
        fileResults.push(duplicateResponse);
        continue;
      }

      const parsedFile = routeUploadedFile(uploadedFile);
      const result = await processParsedUpload({
        fileName: uploadedFile.originalname || 'uploaded-file',
        fileType: parsedFile.fileType,
        records: parsedFile.records,
        customerId: identity.customer_id,
        providerName: authenticatedContext?.providerRecord?.provider_name || null,
        niche: metadata?.niche,
        mimeType: uploadedFile.mimetype || metadata?.mime_type,
        fileSize: uploadedFile.size,
        fileBuffer: uploadedFile.buffer,
        checksum: computedChecksum,
        storageStatus: metadata?.storage_status,
        uploadNotes: {
          source: 'multipart_upload',
          parse_route: parsedFile.route
        },
        metadataOnly: parsedFile.metadataOnly === true,
        parserType: parsedFile.parserType || null,
        parseStatus: parsedFile.parseStatus || null,
        parseSummary: parsedFile.summary || null,
        uploadContext: sharedUploadContext,
        providerRecordOverride: authenticatedContext?.providerRecord || null
      });

      fileResults.push(result);
    }

    const items = fileResults.map((result, index) =>
      buildRecommendationSafeUploadItem(
        result?.body || {},
        uploadedFiles[index]?.originalname || null
      )
    );
    const acceptedCount = items.filter(item => item.accepted).length;
    const rejectedCount = items.length - acceptedCount;
    const requiresManualReviewCount = items.filter(item => item.manual_review_required).length;
    const casesCreated = items.reduce((sum, item) => sum + (item.cases_created || 0), 0);
    const reviewMatches = items.reduce((sum, item) => sum + (item.review_matches || 0), 0);
    const responseStatus = acceptedCount === items.length
      ? 200
      : (acceptedCount > 0 ? 207 : 422);

    return {
      status: responseStatus,
      body: {
        ok: acceptedCount === items.length,
        accepted: acceptedCount > 0,
        upload_id: sharedUploadContext.upload_id,
        file_count: items.length,
        accepted_count: acceptedCount,
        rejected_count: rejectedCount,
        manual_review_count: requiresManualReviewCount,
        cases_created: casesCreated,
        review_matches: reviewMatches,
        files: items
      }
    };
  } catch (err) {
    return buildUploadErrorResponse(
      err?.code
        ? err
        : createUploadError('UPLOAD_PROCESSING_FAILED', 500)
    );
  }
}

async function applyClaimLifecycle({
  claimId,
  claim,
  context = {},
  timestamp = Date.now(),
  options = {}
}) {
  const orchestration = orchestrateClaimLifecycle(claim, context);
  await persistClaimLifecycle(claimId, orchestration, timestamp, options);
  return orchestration;
}

module.exports = {
  processUpload,
  applyClaimLifecycle
};
