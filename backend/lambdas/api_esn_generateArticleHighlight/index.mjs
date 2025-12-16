import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

// Reuse same output bucket as article generator
const OUTPUT_BUCKET = process.env.PODCAST_OUTPUT_BUCKET;

// OpenAI image-generation helper using the /v1/images/generations endpoint
async function callGeminiForImage(
  prompt,
  {
    // model name kept configurable; default to gpt-image-1
    model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
  } = {}
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY environment variable is required for image generation');

  const endpoint = 'https://api.openai.com/v1/images/generations';

  const payload = {
    model,
    prompt,
    n: 1,
    // Use a supported landscape-ish size; 1536x1024 is allowed
    size: '1536x1024',
  };

  console.log(
    'callGeminiForImage(OpenAI): sending payload',
    JSON.stringify({ ...payload, prompt }).slice(0, 2000)
  );

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (netErr) {
    console.error('callGeminiForImage(OpenAI): network error', netErr);
    throw netErr;
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error(
      'callGeminiForImage(OpenAI): non-OK response',
      res.status,
      errText.slice(0, 2000)
    );
    throw new Error(`OpenAI image call failed ${res.status}: ${errText}`);
  }

  const json = await res.json().catch((e) => {
    console.error('callGeminiForImage(OpenAI): failed to parse JSON', e);
    throw e;
  });

  const first = Array.isArray(json?.data) ? json.data[0] : null;
  const b64 = first?.b64_json;

  if (!b64) {
    console.error(
      'callGeminiForImage(OpenAI): missing data[0].b64_json in response',
      JSON.stringify(json).slice(0, 2000)
    );
    throw new Error('OpenAI image response missing data[0].b64_json');
  }

  // Decode base64 image data directly instead of fetching via URL
  return Buffer.from(b64, 'base64');
}

const s3 = new S3Client({});

export const handler = async (event) => {
  console.log('highlight handler: incoming event', JSON.stringify(event).slice(0, 2000));
  console.log('highlight handler: using OUTPUT_BUCKET', OUTPUT_BUCKET);

  if (!OUTPUT_BUCKET) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'PODCAST_OUTPUT_BUCKET env var not set' }),
    };
  }

  try {
    let body;
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body ?? {};
    } catch (parseErr) {
      console.error('highlight handler: failed to parse event.body', parseErr);
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Invalid JSON in request body',
          details: String(parseErr?.message ?? parseErr),
        }),
      };
    }

    const gameId = body?.gameId;
    const clientStyle = typeof body?.imageStyle === 'string' ? body.imageStyle : null;

    if (!gameId || typeof gameId !== 'string') {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing or invalid gameId in request body' }),
      };
    }

    const articleKey = `${encodeURIComponent(gameId)}.json`;
    console.log('highlight handler: reading article from S3', OUTPUT_BUCKET, articleKey);

    let articleObject;
    try {
      const getRes = await s3.send(
        new GetObjectCommand({
          Bucket: OUTPUT_BUCKET,
          Key: articleKey,
        })
      );
      const chunks = [];
      for await (const chunk of getRes.Body) {
        chunks.push(chunk);
      }
      const buf = Buffer.concat(chunks);
      articleObject = JSON.parse(buf.toString('utf-8'));
    } catch (s3Err) {
      console.error('highlight handler: failed to load article from S3', s3Err);
      const code = s3Err?.name || s3Err?.Code || 'S3Error';
      if (code === 'NoSuchKey') {
        return {
          statusCode: 404,
          body: JSON.stringify({
            error: 'Article not found for gameId',
            bucket: OUTPUT_BUCKET,
            key: articleKey,
          }),
        };
      }
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to load article from S3',
          details: String(s3Err?.message ?? s3Err),
        }),
      };
    }

    const article = articleObject?.article || articleObject;
    if (!article || typeof article !== 'object') {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Loaded article JSON missing article field' }),
      };
    }

    const { title, dek, body: paragraphs, keyMoments, tags } = article;
    const highlightInput = {
      gameId,
      title,
      dek,
      keyMoments,
      tags,
      bodyPreview: Array.isArray(paragraphs) ? paragraphs.slice(0, 3) : paragraphs,
    };

    console.log('highlight handler: built highlightInput', JSON.stringify(highlightInput).slice(0, 2000));

    if (!Array.isArray(keyMoments) || keyMoments.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Article has no keyMoments to illustrate' }),
      };
    }

    // Pick exactly one random keyMoment
    const randomIndex = Math.floor(Math.random() * keyMoments.length);
    const chosenMomentRaw = keyMoments[randomIndex];
    const chosenMoment =
      chosenMomentRaw && typeof chosenMomentRaw === 'object'
        ? chosenMomentRaw.description || JSON.stringify(chosenMomentRaw)
        : String(chosenMomentRaw);

    const momentsText = `Chosen highlight moment: ${chosenMoment}`;

    const prompt = `Create an artistic image of an American football highlight without text and branding.
Depict this moment:
${momentsText}

Scene requirements:
- Generic uniforms and helmets with no logos or branding.
- The image must appear as a raw cinematic frame from a film, with absolutely no graphic overlays or UI of any kind

Strict rules:
- NO text, NO words, NO numbers, NO captions, NO scoreboard graphics, NO jersey numbers, NO HUD.
- NO real-world team logos, colors, or branding.
- NO league logos or recognizable team branding.`;

    const style = clientStyle || 'artistic';

    let imageBuffer;
    try {
      imageBuffer = await callGeminiForImage(`${prompt} Style: ${style}.`);
    } catch (imgErr) {
      console.error('highlight handler: image generation error', imgErr);
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: 'Image generation failed',
          details: String(imgErr?.message ?? imgErr),
        }),
      };
    }

    const imageKey = `${encodeURIComponent(gameId)}_highlight.png`;
    console.log('highlight handler: saving highlight image to S3', OUTPUT_BUCKET, imageKey);

    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: OUTPUT_BUCKET,
          Key: imageKey,
          Body: imageBuffer,
          ContentType: 'image/png',
        })
      );
    } catch (s3Err) {
      console.error('highlight handler: failed to save image to S3', s3Err);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Failed to save highlight image to S3',
          details: String(s3Err?.message ?? s3Err),
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        gameId,
        s3Bucket: OUTPUT_BUCKET,
        s3Key: imageKey,
        imageSpec: {
          prompt,
          style,
          aspectRatio: '16:9',
          format: 'image/png',
        },
      }),
    };
  } catch (err) {
    console.error('highlight handler: unexpected error', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        details: String(err?.message ?? err),
      }),
    };
  }
};
