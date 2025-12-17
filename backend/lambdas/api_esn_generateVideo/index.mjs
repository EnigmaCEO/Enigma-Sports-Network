import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

// Use the same env conventions as the recap lambda where possible.
const PODCAST_OUTPUT_BUCKET = process.env.PODCAST_OUTPUT_BUCKET;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const GEMINI_BASE_URL =
  process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';

// Minimal S3 client (region can be inherited from Lambda env/config).
const s3 = new S3Client({});

// --- small helper to parse JSON safely ---
function safeJsonParse(s, fallback = null) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

// --- helper: load highlight image from S3 as Buffer ---
async function getHighlightImageFromS3(gameId) {
  if (!PODCAST_OUTPUT_BUCKET) {
    throw new Error('PODCAST_OUTPUT_BUCKET environment variable is required');
  }

  const key = `${gameId}_highlight.png`;
  console.log('getHighlightImageFromS3: fetching', { bucket: PODCAST_OUTPUT_BUCKET, key });

  const cmd = new GetObjectCommand({
    Bucket: PODCAST_OUTPUT_BUCKET,
    Key: key,
  });

  const res = await s3.send(cmd);
  // Node.js stream -> Buffer
  const chunks = [];
  for await (const chunk of res.Body) {
    chunks.push(chunk);
  }
  const buf = Buffer.concat(chunks);
  console.log('getHighlightImageFromS3: bytes', buf.length);
  return { buffer: buf, key };
}

// --- helper: call Gemini predictLongRunning for video generation ---
async function startVideoGeneration({ gameId, imageBytes }) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is required to call Gemini');
  }

  const url = `${GEMINI_BASE_URL}/models/${encodeURIComponent(
    GEMINI_MODEL
  )}:predictLongRunning`;

  const imageBase64 = imageBytes.toString('base64');

  const body = {
    instances: [
      {
        prompt:
          'A cinematic 8-second broadcast-style sports highlight animation based on this still frame. Preserve players, uniforms, and environment. Add natural camera motion and realistic stadium lighting. No text, logos, overlays, or narration.',
        image: {
          bytesBase64Encoded: imageBase64,
          mimeType: 'image/png',
        },
      },
    ],
    parameters: {
      sampleCount: 1,
      aspectRatio: '16:9',
      durationSeconds: 8,
      resolution: '1080p',
    },
  };

  console.log(
    'startVideoGeneration: POST',
    url,
    'payload',
    JSON.stringify({
      ...body,
      instances: [
        {
          ...body.instances[0],
          image: {
            mimeType: body.instances[0].image.mimeType,
            bytesBase64Encoded: `[${imageBase64.length} base64 chars]`,
          },
        },
      ],
    }).slice(0, 800)
  );

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  console.log('startVideoGeneration: status', res.status, 'body (trunc)', text.slice(0, 800));

  if (!res.ok) {
    throw new Error(`predictLongRunning failed ${res.status}: ${text}`);
  }

  const json = safeJsonParse(text, {});
  console.log(
    'startVideoGeneration: top-level keys',
    json && typeof json === 'object' ? Object.keys(json) : typeof json
  );

  const operationName = json?.name;
  if (!operationName) {
    console.error('startVideoGeneration: response without operation name', json);
    throw new Error('predictLongRunning response missing operation name');
  }

  console.log('startVideoGeneration: operationName', operationName);
  return { operationName, raw: json };
}

// --- helper: poll Gemini operation until done and extract video URI ---
async function waitForVideoOperation(operationName, { pollIntervalMs = 10000, timeoutMs = 600000 } = {}) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is required to call Gemini');
  }
  if (!operationName) {
    throw new Error('waitForVideoOperation called without operationName');
  }

  const start = Date.now();
  // Google example uses full operationName appended directly to base URL.
  // Example: BASE_URL="https://generativelanguage.googleapis.com/v1beta"
  // poll URL: `${BASE_URL}/${operationName}`
  const url = `${GEMINI_BASE_URL}/${operationName}`;

  while (true) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Video operation ${operationName} timed out after ${timeoutMs} ms`);
    }

    console.log('waitForVideoOperation: polling', url);

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'x-goog-api-key': GEMINI_API_KEY,
      },
    });

    const text = await res.text();
    console.log(
      'waitForVideoOperation: status',
      res.status,
      'body (trunc)',
      text.slice(0, 800)
    );

    if (!res.ok) {
      throw new Error(`Operation polling failed ${res.status}: ${text}`);
    }

    const json = safeJsonParse(text, {});
    if (!json) {
      throw new Error('Operation polling returned non-JSON body');
    }

    const done = !!json.done;
    if (!done) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      continue;
    }

    if (json.error) {
      throw new Error(
        `Operation ${operationName} failed: ${json.error.message || JSON.stringify(json.error)}`
      );
    }

    // Use the structure you logged:
    // response.generateVideoResponse.generatedSamples[0].video.uri
    const videoUri =
      json?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
      json?.response?.generated_videos?.[0]?.video?.uri ||
      json?.response?.generatedVideos?.[0]?.video?.uri ||
      json?.response?.generateVideoResponse?.generatedSamples?.[0]?.uri;

    console.log('waitForVideoOperation: resolved videoUri', videoUri || null);

    if (!videoUri) {
      console.error(
        'waitForVideoOperation: no videoUri in response JSON; full response (trunc)',
        JSON.stringify(json).slice(0, 4000)
      );
      throw new Error(
        'Operation completed but no video URI found in response. ' +
          'Check waitForVideoOperation logs for full structure.'
      );
    }

    return { videoUri, raw: json };
  }
}

// --- helper: download the video from Gemini video URI ---
async function downloadVideoToBuffer(videoUri) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is required to call Gemini');
  }

  console.log('downloadVideoToBuffer: GET', videoUri);

  const res = await fetch(videoUri, {
    method: 'GET',
    headers: {
      'x-goog-api-key': GEMINI_API_KEY,
    },
    redirect: 'follow',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Video download failed ${res.status}: ${text.slice(0, 800)}`);
  }

  // In Node 18+, Response has arrayBuffer().
  const arrBuf = await res.arrayBuffer();
  const buf = Buffer.from(arrBuf);
  console.log('downloadVideoToBuffer: downloaded bytes', buf.length);
  return buf;
}

// --- helper: upload video buffer to S3 ---
async function uploadVideoToS3({ bucket, key, body }) {
  if (!bucket) throw new Error('uploadVideoToS3: bucket is required');
  if (!key) throw new Error('uploadVideoToS3: key is required');

  console.log('uploadVideoToS3: uploading', { bucket, key, size: body?.length });

  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: 'video/mp4',
  });

  await s3.send(cmd);
  console.log('uploadVideoToS3: upload complete');
}

// --- Lambda handler ---
export const handler = async (event) => {
  console.log('handler(api_esn_generateVideo): incoming event', JSON.stringify(event).slice(0, 2000));
  console.log('handler(api_esn_generateVideo): PODCAST_OUTPUT_BUCKET', PODCAST_OUTPUT_BUCKET);

  try {
    if (!PODCAST_OUTPUT_BUCKET) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'PODCAST_OUTPUT_BUCKET environment variable is required',
        }),
      };
    }

    // Parse request body (similar style to generateRecap)
    let body;
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body || {};
    } catch (parseErr) {
      console.error(
        'handler(api_esn_generateVideo): failed to parse event.body',
        parseErr,
        'raw body:',
        event.body
      );
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Invalid JSON in request body',
          details: String(parseErr?.message ?? parseErr),
        }),
      };
    }

    console.log('handler(api_esn_generateVideo): parsed body', body);

    const gameId = body?.gameId;
    if (!gameId || typeof gameId !== 'string') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing or invalid gameId in request body' }),
      };
    }

    // Retrieve highlight image directly from S3 instead of CloudFront URL
    const { buffer: highlightBuffer, key: highlightKey } = await getHighlightImageFromS3(gameId);
    console.log('handler(api_esn_generateVideo): using highlight from S3 key', highlightKey);

    // 1) Start long‑running video generation
    const { operationName } = await startVideoGeneration({
      gameId,
      imageBytes: highlightBuffer,
    });

    // 2) Poll until operation completes and retrieve videoUri
    const { videoUri, raw: geminiRaw } = await waitForVideoOperation(operationName);

    // 3) Download the video from videoUri
    const videoBuffer = await downloadVideoToBuffer(videoUri);

    // 4) Upload the video into S3 PODCAST_OUTPUT_BUCKET as {gameId}_video.mp4
    const key = `${gameId}_video.mp4`;
    await uploadVideoToS3({
      bucket: PODCAST_OUTPUT_BUCKET,
      key,
      body: videoBuffer,
    });

    const publicBase =
      process.env.PODCAST_VIDEO_CLOUDFRONT_BASE || `https://${PODCAST_OUTPUT_BUCKET}.s3.amazonaws.com`;
    const publicUrl = `${publicBase.replace(/\/+$/, '')}/${encodeURIComponent(key)}`;

    const responseBody = {
      gameId,
      s3Bucket: PODCAST_OUTPUT_BUCKET,
      s3Key: key,
      videoUriSource: videoUri,
      operationName,
      publicUrl,
      // optional: include a tiny snapshot of the Gemini response shape for debugging
      geminiShape:
        geminiRaw && typeof geminiRaw === 'object'
          ? { keys: Object.keys(geminiRaw), hasGenerateVideoResponse: !!geminiRaw.response?.generateVideoResponse }
          : undefined,
    };

    console.log(
      'handler(api_esn_generateVideo): success response',
      JSON.stringify(responseBody).slice(0, 800)
    );

    return {
      statusCode: 200,
      body: JSON.stringify(responseBody),
    };
  } catch (err) {
    console.error('handler(api_esn_generateVideo): unexpected error', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        details: String(err?.message ?? err),
        stack: err?.stack,
      }),
    };
  }
};
