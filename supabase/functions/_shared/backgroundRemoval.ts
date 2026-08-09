// Person cutout for green screen segments, via Robust Video Matting on
// Replicate. Takes a signed clip URL, returns a URL to the same video with
// the creator composited onto a solid green background; the caller chroma
// keys that over the brief's screenshot. This is the ONLY file that knows
// Replicate's request shape.

const PREDICTIONS_URL = 'https://api.replicate.com/v1/predictions';
const MODEL_VERSION =
  '2d2de06a76a837a4ba92b6164bf8bfd3ddb524a1fb64b0d8ae055af17fa22503';
const POLL_INTERVAL_MS = 3000;
const POLL_ATTEMPTS = 100;

type Prediction = {
  id?: string;
  status?: string;
  output?: string | string[];
  error?: string | null;
  detail?: string;
};

export async function removeBackground(params: {
  apiToken: string;
  videoUrl: string;
}): Promise<string> {
  const { apiToken, videoUrl } = params;

  const createRes = await fetch(PREDICTIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: MODEL_VERSION,
      input: { input_video: videoUrl, output_type: 'green-screen' },
    }),
  });
  const created = (await createRes.json()) as Prediction;
  if (!createRes.ok || !created.id) {
    throw new Error(
      `cutout create failed: ${created.detail ?? created.error ?? createRes.status}`,
    );
  }

  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const statusRes = await fetch(`${PREDICTIONS_URL}/${created.id}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    const prediction = (await statusRes.json()) as Prediction;
    if (prediction.status === 'succeeded') {
      const output = Array.isArray(prediction.output)
        ? prediction.output[0]
        : prediction.output;
      if (!output) throw new Error('cutout succeeded but returned no video');
      return output;
    }
    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(`cutout failed: ${prediction.error ?? prediction.status}`);
    }
  }
  throw new Error('cutout timed out');
}
