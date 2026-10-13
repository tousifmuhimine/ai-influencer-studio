import { randomBytes } from "node:crypto";
import { InferenceClient } from "@huggingface/inference";
import { mediaAsBlob, persistMediaDataUrl, persistOutputImages } from "./media-store";
import { PROVIDERS } from "./providers";
import { getCredential, hydratedCatalog, loadDb, providerStatuses, saveDb, withIdentityPack } from "./store";
import { supabaseRest } from "./supabase";

export async function enqueueJob({ type, modelId, provider, input = {}, ownerEmail }) {
  const db = await loadDb();
  const statuses = await providerStatuses(db);
  const model = hydratedCatalog(db, statuses).find((item) => item.id === modelId);

  // Persist any uploaded data URLs for surrounding and dress images
  if (input?.surroundingImage && typeof input.surroundingImage === "string" && input.surroundingImage.startsWith("data:image/")) {
    input.surroundingImage = await persistMediaDataUrl(input.surroundingImage);
  }
  if (input?.dressImage && typeof input.dressImage === "string" && input.dressImage.startsWith("data:image/")) {
    input.dressImage = await persistMediaDataUrl(input.dressImage);
  }
  if (input?.referenceImages && Array.isArray(input.referenceImages)) {
    input.referenceImages = await Promise.all(
      input.referenceImages.map((img) => (typeof img === "string" && img.startsWith("data:image/") ? persistMediaDataUrl(img) : img))
    );
  }

  const job = {
    id: `job_${randomBytes(8).toString("hex")}`,
    provider: model?.provider || provider,
    modelId,
    providerJobId: null,
    type,
    status: "queued",
    input: withIdentityPack(db, input),
    ownerEmail,
    output: null,
    error: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null
  };
  db.jobs.unshift(job);
  await saveDb(db);
  setTimeout(() => processJob(job.id, ownerEmail), 20);
  return job;
}

export async function enqueueComparison({ type, modelIds = [], input, ownerEmail }) {
  const jobs = [];
  for (const modelId of modelIds) jobs.push(await enqueueJob({ type, modelId, input, ownerEmail }));
  return jobs;
}

async function processJob(jobId, ownerEmail) {
  const db = await loadDb(ownerEmail);
  const job = db.jobs.find((item) => item.id === jobId);
  if (!job) return;
  const statuses = await providerStatuses(db);
  const model = hydratedCatalog(db, statuses).find((item) => item.id === job.modelId);
  job.status = "processing";
  job.startedAt = new Date().toISOString();
  await saveDb(db);
  try {
    if (!model) throw new Error("Model not found in catalog.");
    const credential = await getCredential(model.provider, db);
    if (!credential) throw new Error(`${model.providerName} is not configured.`);
    if (!PROVIDERS[model.provider]?.implemented) throw new Error(`${model.providerName} is cataloged but its adapter is not implemented yet.`);
    let output;
    if (model.provider === "openai" && model.type === "image") output = await runOpenAiImage(job, credential, model);
    else if (model.provider === "stability" && model.type === "image") output = await runStabilityImage(job, credential);
    else if (model.provider === "huggingface" && model.type === "image") output = await runHuggingFaceImage(job, credential, model);
    else if (model.provider === "google" && model.type === "image") output = await runGoogleImage(job, credential, model);
    else if (model.provider === "fal" && model.type === "image") output = await runFalImage(job, credential, model);
    else if (model.provider === "replicate" && model.type === "image") output = await runReplicateImage(job, credential, model);
    else if (model.provider === "nvidia" && model.type === "image") output = await runNvidiaImage(job, credential, model);
    else if (model.provider === "runway" && model.type === "image") output = await runRunwayImage(job, credential, model);
    else throw new Error("No adapter route exists for this model.");

    output = await persistOutputImages(output);

    job.status = "completed";
    job.output = output;
    job.completedAt = new Date().toISOString();
    const generation = {
      id: `gen_${randomBytes(8).toString("hex")}`,
      jobId: job.id,
      character: job.input.character,
      referenceImages: job.input.referenceImages || [],
      provider: model.provider,
      model: model.modelId,
      modelVersion: model.version,
      prompt: job.input.prompt,
      negativePrompt: job.input.negativePrompt,
      seed: job.input.seed,
      parameters: job.input,
      output,
      timestamp: job.completedAt,
      labels: [],
      notes: ""
    };
    db.generations.unshift(generation);
    await mirrorGeneration(generation);
  } catch (error) {
    job.status = "failed";
    job.error = error.message;
    job.completedAt = new Date().toISOString();
  }
  await saveDb(db);
}

async function runOpenAiImage(job, credential, model) {
  const isDalle3 = model.modelId.includes("dall-e-3");
  let size = "1024x1024";
  if (isDalle3) {
    if (job.input.aspectRatio === "9:16" || job.input.resolution === "1024x1792") size = "1024x1792";
    else if (job.input.aspectRatio === "16:9" || job.input.resolution === "1792x1024") size = "1792x1024";
    else size = "1024x1024";
  } else {
    size = ["1024x1024", "512x512", "256x256"].includes(job.input.resolution) ? job.input.resolution : "1024x1024";
  }

  const reference = model.referenceImage ? job.input.referenceImages?.[0] : null;
  const response = reference
    ? await openAiReferenceEdit(job, credential, model, size, reference)
    : await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: model.modelId,
        prompt: job.input.prompt,
        n: Number(job.input.count || 1),
        size,
        response_format: "b64_json"
      })
    });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `OpenAI request failed with ${response.status}`);
  return data;
}

async function openAiReferenceEdit(job, credential, model, size, reference) {
  const form = new FormData();
  form.append("model", model.modelId === "dall-e-3" ? "dall-e-2" : model.modelId);
  form.append("prompt", job.input.prompt);
  form.append("n", String(Number(job.input.count || 1)));
  form.append("size", size === "1024x1792" || size === "1792x1024" ? "1024x1024" : size);
  form.append("response_format", "b64_json");
  form.append("image", await referenceAsBlob(reference), "face-reference.png");
  return fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { authorization: `Bearer ${credential}` }, body: form });
}

async function runStabilityImage(job, credential) {
  const form = new FormData();
  form.append("prompt", job.input.prompt);
  if (job.input.negativePrompt) form.append("negative_prompt", job.input.negativePrompt);
  if (job.input.aspectRatio) form.append("aspect_ratio", job.input.aspectRatio);
  if (job.input.seed) form.append("seed", String(job.input.seed));
  form.append("output_format", "png");
  const response = await fetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
    method: "POST",
    headers: { authorization: `Bearer ${credential}`, accept: "application/json" },
    body: form
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.errors?.join(", ") || data.message || `Stability request failed with ${response.status}`);
  return data;
}

async function runHuggingFaceImage(job, credential, model) {
  const { width, height } = dimensionsFor(job.input.aspectRatio);
  const client = new InferenceClient(credential);
  const parameters = {
    ...(job.input.negativePrompt ? { negative_prompt: job.input.negativePrompt } : {}),
    ...(job.input.seed ? { seed: Number(job.input.seed) } : {}),
    target_size: { width, height }
  };
  const reference = model.referenceImage ? job.input.referenceImages?.[0] : null;
  const result = reference
    ? await client.imageToImage({ model: model.modelId, provider: "auto", inputs: await referenceAsBlob(reference), parameters: { ...parameters, prompt: job.input.prompt } })
    : await client.textToImage({ model: model.modelId, provider: "auto", inputs: job.input.prompt, parameters });
  const image = Buffer.from(await result.arrayBuffer()).toString("base64");
  return { data: [{ b64_json: image, content_type: result.type || "image/png" }] };
}

async function referenceAsBlob(reference) {
  const storedImage = await mediaAsBlob(reference);
  if (storedImage) return storedImage;
  const response = await fetch(reference);
  if (!response.ok) throw new Error("The saved face reference could not be loaded.");
  return response.blob();
}

function dimensionsFor(aspectRatio) {
  const dimensions = {
    "16:9": [1344, 768],
    "9:16": [768, 1344],
    "4:3": [1152, 864],
    "3:4": [864, 1152],
    "3:2": [1216, 832],
    "2:3": [832, 1216]
  };
  const [width, height] = dimensions[aspectRatio] || [1024, 1024];
  return { width, height };
}

async function runGoogleImage(job, credential, model) {
  const generateOnce = async () => {
    const parts = [{ text: job.input.prompt }];
    const ref = model.referenceImage ? job.input.referenceImages?.[0] : null;
    if (ref) {
      try {
        parts.push(await referenceAsInlineData(ref));
      } catch {
        // Fall back to text-only generation when a reference cannot be converted.
      }
    }
    if (job.input.negativePrompt) parts[0].text += `\n\nAvoid: ${job.input.negativePrompt}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.modelId)}:generateContent?key=${encodeURIComponent(credential)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || data.message || `Google request failed with ${response.status}`);
    const outputParts = data?.candidates?.[0]?.content?.parts || [];
    const images = outputParts
      .filter((part) => part.inlineData?.data)
      .map((part) => ({ b64_json: part.inlineData.data, content_type: part.inlineData.mimeType || "image/png" }));
    if (!images.length) throw new Error("Google did not return an image.");
    return images;
  };

  const count = Math.min(Math.max(Number(job.input.count || 1), 1), 4);
  const batches = await Promise.all(Array.from({ length: count }, () => generateOnce()));
  return { data: batches.flat() };
}

async function runFalImage(job, credential, model) {
  const count = Math.max(Number(job.input.count || 1), 1);
  const body = { prompt: job.input.prompt };
  if (job.input.negativePrompt) body.negative_prompt = job.input.negativePrompt;
  if (job.input.seed) body.seed = Number(job.input.seed);
  if (count > 1) body.num_images = count;

  const ref = model.referenceImage ? job.input.referenceImages?.[0] : null;
  if (ref && (ref.startsWith("http") || ref.startsWith("data:"))) body.image_url = ref;

  const response = await fetch(`https://fal.run/${model.modelId}`, {
    method: "POST",
    headers: { authorization: `Key ${credential}`, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || data.error || data.message || `Fal request failed with ${response.status}`);
  const images = data.images || data.data || (Array.isArray(data) ? data : []);
  const normalized = images.map((item) => {
    if (typeof item === "string") return { url: item };
    if (item?.url) return { url: item.url, content_type: item.content_type };
    if (item?.b64_json) return { b64_json: item.b64_json, content_type: item.content_type };
    return item;
  });
  if (!normalized.length) throw new Error("Fal did not return an image.");
  return { data: normalized };
}

async function runReplicateImage(job, credential, model) {
  const count = Math.max(Number(job.input.count || 1), 1);
  const input = { prompt: job.input.prompt };
  if (job.input.negativePrompt) input.negative_prompt = job.input.negativePrompt;
  if (job.input.seed) input.seed = Number(job.input.seed);
  if (count > 1) input.num_outputs = count;

  const ref = model.referenceImage ? job.input.referenceImages?.[0] : null;
  if (ref && (ref.startsWith("http") || ref.startsWith("data:"))) input.image = ref;

  const createResponse = await fetch(`https://api.replicate.com/v1/models/${model.modelId}/predictions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${credential}`,
      "content-type": "application/json",
      prefer: "wait=60"
    },
    body: JSON.stringify({ input })
  });
  let prediction = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok) throw new Error(prediction.detail || prediction.error || prediction.message || `Replicate request failed with ${createResponse.status}`);

  const startedAt = Date.now();
  while (prediction.status && !["succeeded", "failed", "canceled", "aborted"].includes(prediction.status) && Date.now() - startedAt < 90000) {
    await sleep(2000);
    const pollResponse = await fetch(prediction.urls?.get || `https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { authorization: `Bearer ${credential}` }
    });
    prediction = await pollResponse.json().catch(() => ({}));
    if (!pollResponse.ok) throw new Error(prediction.detail || prediction.error || prediction.message || `Replicate poll failed with ${pollResponse.status}`);
  }

  if (prediction.status !== "succeeded") throw new Error(prediction.error || prediction.detail || `Replicate status ${prediction.status}`);
  const output = prediction.output;
  const items = Array.isArray(output) ? output : (typeof output === "string" ? [output] : (output?.images || []));
  const normalized = items.map((item) => {
    if (typeof item === "string") return { url: item };
    if (item?.url) return { url: item.url, content_type: item.content_type };
    if (item?.b64_json) return { b64_json: item.b64_json, content_type: item.content_type };
    return item;
  });
  if (!normalized.length) throw new Error("Replicate did not return an image.");
  return { data: normalized };
}

async function runNvidiaImage(job, credential, model) {
  const { width, height } = dimensionsFor(job.input.aspectRatio);
  const body = {
    prompt: job.input.prompt,
    negative_prompt: job.input.negativePrompt,
    width,
    height,
    steps: 30,
    cfg_scale: 4.5
  };
  if (job.input.seed) body.seed = Number(job.input.seed);

  const ref = model.referenceImage ? job.input.referenceImages?.[0] : null;
  if (ref) {
    try {
      const blob = await referenceAsBlob(ref);
      body.mode = "image-to-image";
      body.image = Buffer.from(await blob.arrayBuffer()).toString("base64");
    } catch {
      body.mode = "text-to-image";
    }
  } else {
    body.mode = "text-to-image";
  }

  const response = await fetch(`https://ai.api.nvidia.com/v1/genai/${model.modelId}`, {
    method: "POST",
    headers: { authorization: `Bearer ${credential}`, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || data.error || data.message || `NVIDIA request failed with ${response.status}`);
  const artifacts = data.artifacts || data.images || data.data || [];
  const normalized = artifacts.map((item) => {
    if (item?.base64) return { b64_json: item.base64, content_type: "image/png" };
    if (item?.b64_json) return { b64_json: item.b64_json, content_type: item.content_type };
    if (item?.url) return { url: item.url, content_type: item.content_type };
    return item;
  });
  if (!normalized.length) throw new Error("NVIDIA did not return an image.");
  return { data: normalized };
}

async function runRunwayImage(job, credential, model) {
  const ratioMap = {
    "16:9": "1920:1080",
    "9:16": "1080:1920",
    "4:3": "1440:1080",
    "3:4": "1080:1440",
    "1:1": "1024:1024",
    "3:2": "1536:1024",
    "2:3": "1024:1536"
  };
  const body = {
    model: "gen4_image",
    promptText: (job.input.prompt || "").slice(0, 1000),
    ratio: ratioMap[job.input.aspectRatio] || "1024:1024"
  };
  if (job.input.seed) body.seed = Number(job.input.seed);

  const ref = model.referenceImage ? job.input.referenceImages?.[0] : null;
  if (ref && (ref.startsWith("http") || ref.startsWith("data:"))) body.referenceImages = [{ uri: ref }];

  const createResponse = await fetch("https://api.dev.runwayml.com/v1/text_to_image", {
    method: "POST",
    headers: {
      authorization: `Bearer ${credential}`,
      "content-type": "application/json",
      "x-runway-version": "2024-11-06"
    },
    body: JSON.stringify(body)
  });
  let task = await createResponse.json().catch(() => ({}));
  if (!createResponse.ok) throw new Error(task.error || task.message || `Runway request failed with ${createResponse.status}`);

  const taskId = task.id;
  const startedAt = Date.now();
  while (task.status && !["SUCCEEDED", "FAILED", "CANCELLED", "CANCELED"].includes(task.status) && Date.now() - startedAt < 120000) {
    await sleep(2000);
    const pollResponse = await fetch(`https://api.dev.runwayml.com/v1/tasks/${taskId}`, {
      headers: {
        authorization: `Bearer ${credential}`,
        "x-runway-version": "2024-11-06"
      }
    });
    task = await pollResponse.json().catch(() => ({}));
    if (!pollResponse.ok) throw new Error(task.error || task.message || `Runway poll failed with ${pollResponse.status}`);
  }

  if (task.status !== "SUCCEEDED") throw new Error(task.error || task.failure || `Runway status ${task.status}`);
  const output = task.output || task.outputs || task.artifacts || [];
  const items = Array.isArray(output) ? output : (typeof output === "string" ? [output] : []);
  const normalized = items.map((item) => {
    if (typeof item === "string") return { url: item };
    if (item?.url) return { url: item.url, content_type: item.content_type };
    if (item?.uri) return { url: item.uri, content_type: item.content_type };
    return item;
  });
  if (!normalized.length) throw new Error("Runway did not return an image.");
  return { data: normalized };
}

async function referenceAsInlineData(reference) {
  const blob = await referenceAsBlob(reference);
  return {
    inlineData: {
      mimeType: blob.type || "image/png",
      data: Buffer.from(await blob.arrayBuffer()).toString("base64")
    }
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mirrorGeneration(generation) {
  try {
    await supabaseRest("studio_generations", {
      method: "POST",
      body: {
        id: generation.id,
        job_id: generation.jobId,
        character_id: generation.character,
        provider: generation.provider,
        model: generation.model,
        model_version: generation.modelVersion,
        prompt: generation.prompt,
        negative_prompt: generation.negativePrompt,
        seed: generation.seed || null,
        parameters: generation.parameters,
        output: generation.output,
        labels: generation.labels,
        notes: generation.notes,
        created_at: generation.timestamp
      },
      prefer: "resolution=merge-duplicates"
    });
  } catch {
    generation.supabaseMirrored = false;
  }
}
