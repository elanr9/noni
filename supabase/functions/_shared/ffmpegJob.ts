// The hosted ffmpeg job runner (Upload-Post) and the videos-bucket helpers it
// needs. Moved out of assemble.ts unchanged so modules that only run a job
// (the reference reader) do not load the whole render stack.

import type { createClient } from 'npm:@supabase/supabase-js@2';

export type AdminClient = ReturnType<typeof createClient>;

export function uploadPostKey(): string {
  const key = Deno.env.get('UPLOAD_POST_API_KEY');
  if (!key) throw new Error('UPLOAD_POST_API_KEY missing');
  return key;
}

export type FfmpegOutputExtension = 'mp4' | 'png' | 'jpg' | 'txt';

export const IMAGE_CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
};

export const FFMPEG_JOBS_URL = 'https://api.upload-post.com/api/uploadposts/ffmpeg/jobs';
// Upload-Post workers may pick a job up hours after creation when their queue
// backs up; a 1h signed URL expired mid-queue and failed downloads with a 400.
export const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;

// Create an FFmpeg job on Upload-Post (docs.upload-post.com/api/ffmpeg-editor),
// poll it to completion and return the result as a byte stream.
// Upload-Post rejects `;` `|` `&` `$` and backticks anywhere in the command,
// so no inline filtergraph may use `;` to separate chains.
export const FFMPEG_POLL_MS = 270_000;

export async function createFfmpegJob(params: {
  apiKey: string;
  files: string[];
  fullCommand: string;
  outputExtension: FfmpegOutputExtension;
  label: string;
}): Promise<string> {
  const { apiKey, files, fullCommand, outputExtension, label } = params;
  if (/[;|&$`]/.test(fullCommand)) {
    throw new Error(`ffmpeg ${label} command contains a forbidden character`);
  }

  // Upload-Post rate limits job creation; back off and retry on 429.
  let jobJson: { success?: boolean; job_id?: string; message?: string; error?: string } = {};
  let jobStatus = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    const jobRes = await fetch(`${FFMPEG_JOBS_URL}/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Apikey ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files,
        full_command: fullCommand,
        output_extension: outputExtension,
      }),
    });
    jobStatus = jobRes.status;
    jobJson = (await jobRes.json().catch(() => ({}))) as typeof jobJson;
    if (jobRes.ok && jobJson.job_id) break;
    const throttled = jobRes.status === 429 || /too many requests/i.test(jobJson.message ?? '');
    if (!throttled || attempt === 5) break;
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
  if (!jobJson.job_id) {
    throw new Error(
      `ffmpeg ${label} create failed: ${jobJson.message ?? jobJson.error ?? jobStatus}`,
    );
  }
  console.log(`ffmpeg ${label} job created`);
  return jobJson.job_id;
}

/** Polls until finished (true), failed (throws) or the deadline passes (false). */
export async function awaitFfmpegJob(params: {
  apiKey: string;
  jobId: string;
  label: string;
  deadline: number;
}): Promise<boolean> {
  const { apiKey, jobId, label } = params;
  while (Date.now() < params.deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await fetch(`${FFMPEG_JOBS_URL}/${jobId}`, {
      headers: { Authorization: `Apikey ${apiKey}` },
    });
    if (statusRes.status === 429) continue;
    const statusJson = (await statusRes.json().catch(() => ({}))) as {
      status?: string;
      exc_info?: string | null;
      result?: { stderr_tail?: string | null } | null;
    };
    const status = (statusJson.status ?? '').toLowerCase();
    if (status === 'finished' || status === 'done') return true;
    if (status === 'failed' || status === 'error') {
      const detail =
        statusJson.result?.stderr_tail?.trim().split('\n').slice(-3).join(' ') ??
        statusJson.exc_info?.trim().split('\n').pop() ??
        '';
      throw new Error(`ffmpeg ${label} job errored${detail ? `: ${detail}` : ''}`);
    }
  }
  return false;
}

export async function downloadFfmpegJob(params: {
  apiKey: string;
  jobId: string;
  label: string;
}): Promise<ReadableStream<Uint8Array>> {
  const { apiKey, jobId, label } = params;
  // Upload-Post rate limits every endpoint; a slideshow downloads several
  // slides close together, so back off on 429 instead of failing the post.
  for (let attempt = 0; ; attempt++) {
    const download = await fetch(`${FFMPEG_JOBS_URL}/${jobId}/download`, {
      headers: { Authorization: `Apikey ${apiKey}` },
    });
    if (download.ok && download.body) return download.body;
    if (download.status === 429 && attempt < 6) {
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      continue;
    }
    throw new Error(`ffmpeg ${label} download failed: ${download.status}`);
  }
}

export async function executeFfmpegJob(params: {
  apiKey: string;
  files: string[];
  fullCommand: string;
  outputExtension: FfmpegOutputExtension;
  label: string;
}): Promise<ReadableStream<Uint8Array>> {
  const { apiKey, label } = params;
  const jobId = await createFfmpegJob(params);
  const done = await awaitFfmpegJob({ apiKey, jobId, label, deadline: Date.now() + FFMPEG_POLL_MS });
  if (!done) throw new Error(`ffmpeg ${label} timed out`);
  return downloadFfmpegJob({ apiKey, jobId, label });
}

// Run an FFmpeg job and store the media result in the videos bucket.
export async function runFfmpegJob(params: {
  admin: AdminClient;
  apiKey: string;
  files: string[];
  fullCommand: string;
  outputPath: string;
  label: string;
  outputExtension?: 'mp4' | 'png' | 'jpg';
  // Upload-Post rejects ';' in full_command, so a multi chain graph travels
  // as a file and the command reads it with -filter_complex_script. The
  // script is appended as the last input file; {graph} marks its placeholder.
  filterGraph?: string;
}): Promise<void> {
  const { admin, apiKey, outputPath, label } = params;
  const outputExtension = params.outputExtension ?? 'mp4';
  let files = params.files;
  let fullCommand = params.fullCommand;
  let scriptPath: string | null = null;
  if (params.filterGraph) {
    scriptPath = `${outputPath}.graph`;
    const { error } = await admin.storage
      .from('videos')
      .upload(scriptPath, new TextEncoder().encode(params.filterGraph), {
        contentType: 'video/mp4',
        upsert: true,
      });
    if (error) throw new Error(`could not store ${label} graph: ${error.message}`);
    const [scriptUrl] = await signVideoUrls(admin, [scriptPath]);
    files = [...files, scriptUrl];
    fullCommand = fullCommand.replace('{graph}', inputPlaceholder(files.length - 1, files.length));
  }

  try {
    const body = await executeFfmpegJob({ apiKey, files, fullCommand, outputExtension, label });
    console.log(`ffmpeg ${label} finished, storing ${outputPath}`);
    await streamToVideos({
      path: outputPath,
      contentType: IMAGE_CONTENT_TYPES[outputExtension] ?? 'video/mp4',
      body,
      label,
    });
    console.log(`ffmpeg ${label} stored ${outputPath}`);
  } finally {
    if (scriptPath) await admin.storage.from('videos').remove([scriptPath]);
  }
}

// Pipe a byte stream straight into the videos bucket. The body is handed to
// fetch untouched so the bytes never pass through JS; copying a long render
// chunk by chunk in the isolate exhausts the edge function CPU budget.
export async function streamToVideos(params: {
  path: string;
  contentType: string;
  body: ReadableStream<Uint8Array>;
  label: string;
}): Promise<void> {
  const { path, contentType, body, label } = params;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/storage/v1/object/videos/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': contentType,
      'x-upsert': 'true',
    },
    body,
  });
  if (!res.ok) throw new Error(`could not store ${label}: upload ${res.status}`);
  console.log(`${label}: stored ${path}`);
}

export async function signVideoUrls(
  admin: AdminClient,
  paths: string[],
): Promise<string[]> {
  const urls: string[] = [];
  for (const path of paths) {
    const { data, error } = await admin.storage
      .from('videos')
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) {
      throw new Error(`could not sign ${path}: ${error?.message}`);
    }
    urls.push(data.signedUrl);
  }
  return urls;
}

// Upload-Post names a lone input {input}; several are {input0}, {input1}, ...
export function inputPlaceholder(index: number, total: number): string {
  return total === 1 ? '{input}' : `{input${index}}`;
}
