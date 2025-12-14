import https from "https";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const ELEVENLABS_API_BASE = "api.elevenlabs.io";
// use the streaming endpoint
const ELEVENLABS_TEXT_TO_DIALOGUE_STREAM_PATH = "/v1/text-to-dialogue/stream";

const s3Client = new S3Client({});

// Optional: map podcast speaker labels to ElevenLabs voice IDs.
// Configure via env or hard-code defaults here.
const SPEAKER_VOICE_MAP = {
  HOST: process.env.ELEVENLABS_VOICE_HOST || undefined,
  ANALYST: process.env.ELEVENLABS_VOICE_ANALYST || undefined,
  COLOR: process.env.ELEVENLABS_VOICE_COLOR || undefined,
  // Add more speakers if needed
};

// Map your high-level tone labels to ElevenLabs-style tags
const TONE_TAG_MAP = {
  excited: "[excited]",
  serious: "[calm]",
  neutral: "", // no explicit tag
  nervous: "[nervous]",
  frustrated: "[frustrated]",
  sorrowful: "[sorrowful]",
  calm: "[calm]",
};

/**
 * Call ElevenLabs streaming endpoint and return a single Buffer.
 * (We no longer pipe directly to S3 to avoid invalid header issues.)
 */
async function fetchElevenLabsAudioBuffer({ elevenBody, apiKey, outputFormat }) {
  const overallStart = Date.now();
  const query = outputFormat ? `?output_format=${encodeURIComponent(outputFormat)}` : "";
  const path = `${ELEVENLABS_TEXT_TO_DIALOGUE_STREAM_PATH}${query}`;
  const options = {
    hostname: ELEVENLABS_API_BASE,
    path,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
  };

  const requestBody = JSON.stringify(elevenBody);
  console.log("[generatePodcast] ElevenLabs(stream): about to send request", {
    path,
    outputFormat,
    requestBodyBytes: Buffer.byteLength(requestBody, "utf8"),
    inputsCount: Array.isArray(elevenBody.inputs) ? elevenBody.inputs.length : null,
  });

  return new Promise((resolve, reject) => {
    const reqStart = Date.now();
    const req = https.request(options, (res) => {
      const resStart = Date.now();
      console.log("[generatePodcast] ElevenLabs(stream): response headers", {
        statusCode: res.statusCode,
        statusMessage: res.statusMessage,
        elapsedMsSinceRequest: resStart - reqStart,
        headers: res.headers,
      });

      const chunks = [];
      let totalBytes = 0;

      res.on("data", (chunk) => {
        chunks.push(chunk);
        totalBytes += chunk.length;
        if (totalBytes % (1024 * 256) < chunk.length) {
          console.log("[generatePodcast] ElevenLabs(stream): chunk", {
            totalBytesSoFar: totalBytes,
          });
        }
      });

      res.on("end", () => {
        const endTime = Date.now();
        const buffer = Buffer.concat(chunks);
        console.log("[generatePodcast] ElevenLabs(stream): response end", {
          statusCode: res.statusCode,
          totalBytes,
          elapsedMsRequestToEnd: endTime - reqStart,
          elapsedMsOverall: endTime - overallStart,
        });

        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          const errText = buffer.toString("utf8");
          console.error("[generatePodcast] ElevenLabs(stream): non-2xx response", {
            statusCode: res.statusCode,
            bodyPreview: errText.slice(0, 1000),
          });
          reject(new Error(`ElevenLabs error: status=${res.statusCode}, body=${errText}`));
          return;
        }

        resolve({ buffer, totalBytes, elapsedMs: endTime - reqStart });
      });

      res.on("error", (err) => {
        console.error("[generatePodcast] ElevenLabs(stream): response error", {
          message: err.message,
          stack: err.stack,
        });
        reject(err);
      });
    });

    req.on("error", (err) => {
      console.error("[generatePodcast] ElevenLabs(stream): request error", {
        message: err.message,
        stack: err.stack,
        elapsedMs: Date.now() - overallStart,
      });
      reject(err);
    });

    req.setTimeout(25000, () => {
      console.error("[generatePodcast] ElevenLabs(stream): request timeout", {
        timeoutMs: 25000,
        elapsedMs: Date.now() - overallStart,
      });
      req.destroy(new Error("ElevenLabs request timed out"));
    });

    console.log("[generatePodcast] ElevenLabs(stream): sending request body");
    req.write(requestBody);
    req.end();
  });
}

/**
 * Extract dialogue inputs and gameId from the podcast JSON payload.
 * Adapts to the provided podcast schema.
 */
function parsePodcastPayload(podcastJson) {
  const gameId = podcastJson.gameId;
  const podcast = podcastJson.podcast || {};
  const segments = podcast.segments || [];

  if (!gameId) {
    throw new Error("Missing gameId in podcast payload");
  }
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error("Missing or empty 'podcast.segments' array in podcast payload");
  }

  console.log("[generatePodcast] Parsing podcast payload", {
    gameId,
    segmentsCount: segments.length,
    title: podcast.title,
    durationMinutes: podcast.durationMinutes,
  });

  const inputs = segments.map((seg, index) => {
    const rawTone = (seg.tone || "").toLowerCase();
    const toneTag = TONE_TAG_MAP[rawTone] ?? "";
    const text = toneTag ? `${toneTag} ${seg.script}` : seg.script;

    const speaker = seg.speaker;
    const mappedVoiceId = speaker ? SPEAKER_VOICE_MAP[speaker] : undefined;
    const voiceId =
      seg.voiceId ||
      seg.voice_id ||
      mappedVoiceId ||
      process.env.ELEVENLABS_DEFAULT_VOICE_ID;

    if (!voiceId) {
      console.warn("[generatePodcast] Missing voiceId for segment", {
        index,
        id: seg.id,
        speaker,
        tone: seg.tone,
      });
    }

    return {
      text,
      voice_id: voiceId,
    };
  });

  if (inputs.some((i) => !i.text || !i.voice_id)) {
    throw new Error(
      "Each segment must have 'script' text and a resolvable voice ID (segment.voiceId / voice_id / speaker mapping / ELEVENLABS_DEFAULT_VOICE_ID)"
    );
  }

  console.log("[generatePodcast] Built ElevenLabs inputs summary", {
    inputsCount: inputs.length,
    sampleTextPreview: inputs[0]?.text?.slice(0, 120),
  });

  return { gameId, inputs };
}

export const handler = async (event) => {
  const handlerStart = Date.now();
  console.log("[generatePodcast] Handler start", {
    requestId: event?.requestContext?.requestId,
    rawEventPreview: JSON.stringify(event).slice(0, 500),
  });

  try {
    const parseStart = Date.now();
    const body = typeof event.body === "string" ? JSON.parse(event.body) : event.body || {};
    console.log("[generatePodcast] Parsed event body", {
      parseElapsedMs: Date.now() - parseStart,
      hasGameId: !!body?.gameId,
      hasPodcast: !!body?.podcast,
      segmentsCount: Array.isArray(body?.podcast?.segments)
        ? body.podcast.segments.length
        : null,
    });

    const { gameId, inputs } = parsePodcastPayload(body);

    const elevenApiKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenApiKey) {
      throw new Error("Missing ELEVENLABS_API_KEY environment variable");
    }

    const outputFormat =
      body.outputFormat ||
      process.env.ELEVENLABS_OUTPUT_FORMAT ||
      "mp3_44100_128";

    const modelId = body.modelId || process.env.ELEVENLABS_MODEL_ID || undefined;
    const languageCode = body.languageCode || process.env.ELEVENLABS_LANGUAGE_CODE || undefined;

    const bodyStability = body.settings?.stability;
    const envStability = process.env.ELEVENLABS_STABILITY;
    const stability =
      typeof bodyStability === "number"
        ? bodyStability
        : envStability !== undefined
        ? Number(envStability)
        : 0.0;

    const elevenBody = {
      inputs,
      ...(modelId ? { model_id: modelId } : {}),
      ...(languageCode ? { language_code: languageCode } : {}),
      ...(Number.isFinite(stability)
        ? {
            settings: {
              stability,
            },
          }
        : {}),
    };

    console.log("[generatePodcast] ElevenLabs(stream) request summary", {
      gameId,
      inputsCount: inputs.length,
      outputFormat,
      modelId,
      languageCode,
      stability: Number.isFinite(stability) ? stability : undefined,
    });

    const bucket = process.env.PODCAST_OUTPUT_BUCKET;
    if (!bucket) {
      throw new Error("Missing PODCAST_OUTPUT_BUCKET environment variable");
    }
    const key = `${gameId}.mp3`;

    // 1) Get audio as a single Buffer from ElevenLabs
    const elevenStart = Date.now();
    const { buffer: audioBuffer, totalBytes, elapsedMs: llElapsed } =
      await fetchElevenLabsAudioBuffer({
        elevenBody,
        apiKey: elevenApiKey,
        outputFormat,
      });
    console.log("[generatePodcast] ElevenLabs(stream) finished", {
      elapsedMs: llElapsed,
      audioBytes: totalBytes,
    });

    // 2) Upload Buffer to S3 (no streaming / no decoded length header issues)
    const s3Start = Date.now();
    const putCmd = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: audioBuffer,
      ContentType: "audio/mpeg",
    });
    await s3Client.send(putCmd);
    const s3Elapsed = Date.now() - s3Start;
    console.log("[generatePodcast] S3 upload finished", {
      bucket,
      key,
      bytes: totalBytes,
      elapsedMs: s3Elapsed,
    });

    const responseBody = {
      success: true,
      gameId,
      bucket,
      key,
      outputFormat,
      stability: Number.isFinite(stability) ? stability : undefined,
      timingsMs: {
        total: Date.now() - handlerStart,
        elevenLabs: llElapsed,
        s3: s3Elapsed,
      },
      bytesWritten: totalBytes,
    };

    console.log("[generatePodcast] Handler success", {
      gameId,
      totalElapsedMs: Date.now() - handlerStart,
      bytesWritten: totalBytes,
    });

    return {
      statusCode: 200,
      body: JSON.stringify(responseBody),
    };
  } catch (err) {
    console.error("[generatePodcast] Error generating podcast via ElevenLabs (buffered):", {
      message: err.message,
      stack: err.stack,
      elapsedMs: Date.now() - handlerStart,
    });
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: err.message || "Internal server error",
      }),
    };
  }
};
