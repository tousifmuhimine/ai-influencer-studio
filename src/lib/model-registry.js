const image = (provider, modelId, displayName, options = {}) => ({
  id: `${provider}:${modelId}`,
  provider,
  modelId,
  displayName,
  type: "image",
  apiSource: options.apiSource || `${provider} API`,
  version: options.version || modelId,
  availability: options.availability || "catalog_only",
  pricing: options.pricing || "paid_api",
  preferred: Boolean(options.preferred),
  executable: Boolean(options.executable),
  capabilities: options.capabilities || ["text_to_image"],
  supportedInputs: options.supportedInputs || ["text"],
  supportedOutputs: ["image"],
  resolutions: options.resolutions || ["provider-defined"],
  aspectRatios: options.aspectRatios || ["provider-defined"],
  referenceImage: Boolean(options.referenceImage),
  editing: Boolean(options.editing),
  imageToVideo: false,
  textToVideo: false,
  lora: Boolean(options.lora),
  seed: Boolean(options.seed),
  docs: options.docs
});

const video = (provider, modelId, displayName, options = {}) => ({
  ...image(provider, modelId, displayName, {
    ...options,
    capabilities: options.capabilities || ["text_to_video"],
    supportedInputs: options.supportedInputs || ["text"]
  }),
  type: "video",
  supportedOutputs: ["video"],
  imageToVideo: Boolean(options.imageToVideo),
  textToVideo: true
});

const openWeight = (modelId, displayName, options = {}) => image("huggingface", modelId, displayName, {
  ...options,
  pricing: "free_self_hosted",
  availability: options.availability || "catalog_only",
  capabilities: options.capabilities || ["text_to_image", "negative_prompt", "seed"],
  seed: true,
  docs: options.docs || `https://huggingface.co/${modelId}`
});

const imageDocs = "https://replicate.com/collections/text-to-image";
const falDocs = "https://fal.ai/image";
const stabilityDocs = "https://platform.stability.ai/docs/release-notes";
const googleDocs = "https://ai.google.dev/gemini-api/docs/image-generation";
const openaiDocs = "https://platform.openai.com/docs/guides/images";

export const registry = [
  // OpenAI Models
  image("openai", "gpt-image-2", "GPT Image 2", {
    availability: "available",
    executable: true,
    apiSource: "OpenAI Images API",
    capabilities: ["text_to_image", "image_edit", "reference_image", "iphone_candid", "cinematic_dslr"],
    supportedInputs: ["text", "image"],
    resolutions: ["1024x1024", "1024x1536", "1536x1024"],
    aspectRatios: ["1:1", "2:3", "3:2"],
    referenceImage: true,
    editing: true,
    docs: "https://developers.openai.com/api/docs/guides/image-generation"
  }),
  image("openai", "gpt-image-1", "GPT Image 1", {
    availability: "deprecated",
    apiSource: "OpenAI Images API",
    capabilities: ["text_to_image", "image_edit", "reference_image"],
    supportedInputs: ["text", "image"],
    resolutions: ["1024x1024", "1024x1536", "1536x1024"],
    aspectRatios: ["1:1", "2:3", "3:2"],
    referenceImage: true,
    editing: true,
    docs: "https://developers.openai.com/api/docs/models/gpt-image-1"
  }),
  image("openai", "gpt-image-1-mini", "GPT Image 1 Mini", {
    availability: "catalog_only",
    apiSource: "OpenAI Images API",
    capabilities: ["text_to_image", "image_edit", "reference_image"],
    supportedInputs: ["text", "image"],
    resolutions: ["1024x1024", "1024x1536", "1536x1024"],
    aspectRatios: ["1:1", "2:3", "3:2"],
    referenceImage: true,
    editing: true,
    docs: "https://platform.openai.com/docs/models"
  }),
  image("openai", "dall-e-3", "DALL-E 3", {
    availability: "available",
    executable: true,
    apiSource: "OpenAI Images API",
    capabilities: ["text_to_image", "prompt_adherence", "cinematic_dslr", "iphone_candid"],
    supportedInputs: ["text"],
    resolutions: ["1024x1024", "1024x1792", "1792x1024"],
    aspectRatios: ["1:1", "9:16", "16:9"],
    docs: openaiDocs
  }),
  image("openai", "dall-e-2", "DALL-E 2", {
    availability: "available",
    executable: true,
    apiSource: "OpenAI Images API",
    capabilities: ["text_to_image", "image_edit", "reference_image"],
    supportedInputs: ["text", "image"],
    resolutions: ["1024x1024", "512x512"],
    aspectRatios: ["1:1"],
    referenceImage: true,
    editing: true,
    docs: openaiDocs
  }),

  // Stability AI Models
  image("stability", "stable-image-core", "Stable Image Core", {
    availability: "available",
    executable: true,
    apiSource: "Stability AI Stable Image API",
    capabilities: ["text_to_image", "negative_prompt", "seed", "fast_inference", "iphone_candid"],
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9", "9:21"],
    seed: true,
    docs: "https://platform.stability.ai/docs/api-reference"
  }),
  image("stability", "stable-image-ultra", "Stable Image Ultra", {
    capabilities: ["text_to_image", "image_to_image", "negative_prompt", "seed", "cinematic_dslr"],
    supportedInputs: ["text", "image"],
    editing: true,
    seed: true,
    docs: stabilityDocs
  }),
  image("stability", "sd3.5-large", "Stable Diffusion 3.5 Large", {
    capabilities: ["text_to_image", "negative_prompt", "seed", "cinematic_dslr", "iphone_candid"],
    seed: true,
    docs: stabilityDocs
  }),
  image("stability", "sd3.5-large-turbo", "Stable Diffusion 3.5 Large Turbo", {
    capabilities: ["text_to_image", "negative_prompt", "seed", "fast_inference"],
    seed: true,
    docs: stabilityDocs
  }),
  image("stability", "sd3.5-medium", "Stable Diffusion 3.5 Medium", {
    capabilities: ["text_to_image", "negative_prompt", "seed"],
    seed: true,
    docs: stabilityDocs
  }),

  // Google Models
  image("google", "gemini-3.1-flash-lite-image", "Nano Banana 2 Lite", {
    executable: true,
    capabilities: ["text_to_image", "image_edit", "reference_image"],
    supportedInputs: ["text", "image", "video"],
    resolutions: ["1K"],
    referenceImage: true,
    editing: true,
    docs: googleDocs
  }),
  image("google", "gemini-3.1-flash-image", "Nano Banana 2", {
    executable: true,
    capabilities: ["text_to_image", "image_edit", "reference_image", "multi_reference", "style_reference", "iphone_candid", "cinematic_dslr"],
    supportedInputs: ["text", "image", "video", "pdf"],
    resolutions: ["0.5K", "1K", "2K", "4K"],
    referenceImage: true,
    editing: true,
    docs: googleDocs
  }),
  image("google", "gemini-3-pro-image", "Nano Banana Pro", {
    executable: true,
    capabilities: ["text_to_image", "image_edit", "reference_image", "multi_reference", "style_reference", "cinematic_dslr"],
    supportedInputs: ["text", "image"],
    resolutions: ["1K", "2K", "4K"],
    referenceImage: true,
    editing: true,
    docs: googleDocs
  }),
  image("google", "gemini-2.5-flash-image", "Nano Banana", {
    executable: true,
    capabilities: ["text_to_image", "image_edit", "reference_image"],
    supportedInputs: ["text", "image"],
    resolutions: ["1K"],
    referenceImage: true,
    editing: true,
    docs: googleDocs
  }),

  // Fal.ai Models
  image("fal", "fal-ai/flux-2", "FLUX.2 [dev]", {
    executable: true,
    capabilities: ["text_to_image", "image_edit", "seed", "iphone_candid", "cinematic_dslr"],
    supportedInputs: ["text", "image"],
    resolutions: ["512-2048px"],
    aspectRatios: ["1:1", "4:3", "9:16", "3:4", "16:9"],
    editing: true,
    seed: true,
    docs: "https://fal.ai/models/fal-ai/flux-2/api"
  }),
  image("fal", "fal-ai/flux-pro/kontext/text-to-image", "FLUX.1 Kontext [pro]", {
    executable: true,
    capabilities: ["text_to_image", "image_edit", "reference_image", "seed", "cinematic_dslr"],
    supportedInputs: ["text", "image"],
    referenceImage: true,
    editing: true,
    seed: true,
    docs: "https://fal.ai/models/fal-ai/flux-pro/kontext/text-to-image"
  }),
  image("fal", "fal-ai/flux-pro/kontext/max/text-to-image", "FLUX.1 Kontext [max]", {
    executable: true,
    capabilities: ["text_to_image", "image_edit", "reference_image", "seed"],
    supportedInputs: ["text", "image"],
    referenceImage: true,
    editing: true,
    seed: true,
    docs: "https://fal.ai/models/fal-ai/flux-pro/kontext/max/text-to-image/api"
  }),
  image("fal", "fal-ai/flux-kontext/dev", "FLUX.1 Kontext [dev]", {
    executable: true,
    capabilities: ["image_edit", "reference_image", "seed"],
    supportedInputs: ["text", "image"],
    referenceImage: true,
    editing: true,
    seed: true,
    docs: "https://fal.ai/models/fal-ai/flux-kontext/dev"
  }),
  image("fal", "alibaba/qwen-image-3/text-to-image", "Qwen Image 3", {
    executable: true,
    capabilities: ["text_to_image", "seed"],
    seed: true,
    docs: falDocs
  }),
  image("fal", "ideogram/v4/instant", "Ideogram V4 Instant", {
    executable: true,
    capabilities: ["text_to_image", "style_reference", "seed", "typography"],
    supportedInputs: ["text", "image"],
    referenceImage: true,
    seed: true,
    docs: falDocs
  }),
  image("fal", "fal-ai/flux/schnell", "FLUX.1 Schnell [fal]", {
    executable: true,
    capabilities: ["text_to_image", "seed", "fast_inference", "iphone_candid"],
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    seed: true,
    docs: "https://fal.ai/models/fal-ai/flux/schnell"
  }),
  image("fal", "fal-ai/flux/dev", "FLUX.1 Dev [fal]", {
    executable: true,
    capabilities: ["text_to_image", "image_edit", "reference_image", "seed", "iphone_candid", "cinematic_dslr"],
    supportedInputs: ["text", "image"],
    referenceImage: true,
    editing: true,
    seed: true,
    docs: "https://fal.ai/models/fal-ai/flux/dev"
  }),
  image("fal", "fal-ai/flux-pro/v1.1", "FLUX 1.1 Pro [fal]", {
    executable: true,
    capabilities: ["text_to_image", "prompt_adherence", "cinematic_dslr", "iphone_candid"],
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    seed: true,
    docs: "https://fal.ai/models/fal-ai/flux-pro/v1.1"
  }),
  image("fal", "fal-ai/flux-realism", "FLUX Realism [fal]", {
    executable: true,
    capabilities: ["text_to_image", "iphone_candid", "raw_portrait", "seed"],
    aspectRatios: ["1:1", "9:16", "16:9"],
    seed: true,
    docs: "https://fal.ai/models/fal-ai/flux-realism"
  }),
  image("fal", "fal-ai/ideogram/v2", "Ideogram v2 [fal]", {
    executable: true,
    capabilities: ["text_to_image", "typography", "iphone_candid", "seed"],
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    seed: true,
    docs: "https://fal.ai/models/fal-ai/ideogram/v2"
  }),

  // Replicate Models
  image("replicate", "google/nano-banana-2", "Nano Banana 2", {
    executable: true,
    capabilities: ["text_to_image", "image_edit", "multi_reference", "iphone_candid"],
    supportedInputs: ["text", "image"],
    referenceImage: true,
    editing: true,
    docs: imageDocs
  }),
  image("replicate", "openai/gpt-image-1.5", "GPT Image 1.5", {
    executable: true,
    capabilities: ["text_to_image", "image_edit", "reference_image"],
    supportedInputs: ["text", "image"],
    referenceImage: true,
    editing: true,
    docs: imageDocs
  }),
  image("replicate", "black-forest-labs/flux-2-max", "FLUX.2 Max", {
    executable: true,
    capabilities: ["text_to_image", "image_edit", "multi_reference", "cinematic_dslr"],
    supportedInputs: ["text", "image"],
    referenceImage: true,
    editing: true,
    docs: imageDocs
  }),
  image("replicate", "black-forest-labs/flux-2-pro", "FLUX.2 Pro", {
    executable: true,
    capabilities: ["text_to_image", "image_edit", "multi_reference", "cinematic_dslr"],
    supportedInputs: ["text", "image"],
    referenceImage: true,
    editing: true,
    docs: imageDocs
  }),
  image("replicate", "bytedance/seedream-5-lite", "Seedream 5 Lite", {
    executable: true,
    capabilities: ["text_to_image", "image_edit", "reference_image"],
    supportedInputs: ["text", "image"],
    referenceImage: true,
    editing: true,
    docs: imageDocs
  }),
  image("replicate", "qwen/qwen-image-edit-plus", "Qwen Image Edit Plus", {
    executable: true,
    capabilities: ["image_edit", "multi_reference"],
    supportedInputs: ["text", "image"],
    referenceImage: true,
    editing: true,
    docs: "https://replicate.com/collections/sketch-to-image"
  }),
  image("replicate", "black-forest-labs/flux-schnell", "FLUX.1 Schnell", {
    executable: true,
    capabilities: ["text_to_image", "seed", "fast_inference", "iphone_candid"],
    seed: true,
    docs: "https://replicate.com/collections/flux"
  }),
  image("replicate", "black-forest-labs/flux-fill-dev", "FLUX.1 Fill [dev]", {
    executable: true,
    capabilities: ["image_edit", "inpainting", "seed"],
    supportedInputs: ["text", "image"],
    editing: true,
    seed: true,
    docs: "https://replicate.com/collections/flux"
  }),
  image("replicate", "black-forest-labs/flux-dev", "FLUX.1 Dev [replicate]", {
    executable: true,
    capabilities: ["text_to_image", "image_edit", "reference_image", "seed", "iphone_candid", "cinematic_dslr"],
    supportedInputs: ["text", "image"],
    referenceImage: true,
    editing: true,
    seed: true,
    docs: "https://replicate.com/black-forest-labs/flux-dev"
  }),
  image("replicate", "black-forest-labs/flux-1.1-pro", "FLUX 1.1 Pro [replicate]", {
    executable: true,
    capabilities: ["text_to_image", "prompt_adherence", "cinematic_dslr"],
    seed: true,
    docs: "https://replicate.com/black-forest-labs/flux-1.1-pro"
  }),
  image("replicate", "ideogram-ai/ideogram-v2", "Ideogram v2 [replicate]", {
    executable: true,
    capabilities: ["text_to_image", "typography", "iphone_candid", "seed"],
    seed: true,
    docs: "https://replicate.com/ideogram-ai/ideogram-v2"
  }),
  image("replicate", "stability-ai/stable-diffusion-3.5-large", "SD 3.5 Large [replicate]", {
    executable: true,
    capabilities: ["text_to_image", "negative_prompt", "seed"],
    seed: true,
    docs: "https://replicate.com/stability-ai/stable-diffusion-3.5-large"
  }),

  // Hugging Face Open-Weight & Serverless Inference Models
  openWeight("black-forest-labs/FLUX.1-schnell", "FLUX.1 Schnell", {
    availability: "available",
    executable: true,
    preferred: true,
    capabilities: ["text_to_image", "seed", "fast_inference", "iphone_candid", "cinematic_dslr", "open_weights"],
    resolutions: ["self-hosted or HF Inference", "1024x1024", "768x1344", "1344x768"],
    aspectRatios: ["1:1", "9:16", "16:9", "4:3", "3:4"],
    docs: "https://huggingface.co/black-forest-labs/FLUX.1-schnell"
  }),
  image("huggingface", "black-forest-labs/FLUX.2-klein-9B", "FLUX.2 Klein 9B", {
    availability: "available",
    executable: true,
    apiSource: "Hugging Face Inference Providers",
    capabilities: ["text_to_image", "image_edit", "reference_image", "iphone_candid", "cinematic_dslr"],
    supportedInputs: ["text", "image"],
    referenceImage: true,
    editing: true,
    docs: "https://huggingface.co/docs/inference-providers/providers/replicate"
  }),
  openWeight("black-forest-labs/FLUX.1-dev", "FLUX.1 Dev", {
    capabilities: ["text_to_image", "negative_prompt", "seed", "lora", "iphone_candid", "cinematic_dslr", "open_weights"],
    lora: true,
    resolutions: ["self-hosted"],
    aspectRatios: ["custom"]
  }),
  openWeight("black-forest-labs/FLUX.1-Krea-dev", "FLUX.1 Krea Dev", {
    capabilities: ["text_to_image", "negative_prompt", "seed", "lora", "cinematic_dslr", "open_weights"],
    lora: true,
    resolutions: ["self-hosted"],
    aspectRatios: ["custom"]
  }),
  openWeight("Qwen/Qwen-Image", "Qwen Image", {
    capabilities: ["text_to_image", "negative_prompt", "seed", "lora", "open_weights"],
    lora: true,
    resolutions: ["self-hosted"],
    aspectRatios: ["custom"]
  }),
  openWeight("Qwen/Qwen-Image-Edit", "Qwen Image Edit", {
    capabilities: ["image_edit", "reference_image", "seed", "lora", "open_weights"],
    supportedInputs: ["text", "image"],
    referenceImage: true,
    editing: true,
    lora: true,
    resolutions: ["self-hosted"],
    aspectRatios: ["custom"]
  }),
  openWeight("stabilityai/stable-diffusion-3.5-large", "Stable Diffusion 3.5 Large", {
    capabilities: ["text_to_image", "negative_prompt", "seed", "lora", "cinematic_dslr", "iphone_candid", "open_weights"],
    lora: true,
    resolutions: ["self-hosted"],
    aspectRatios: ["custom"]
  }),
  openWeight("stabilityai/stable-diffusion-xl-base-1.0", "Stable Diffusion XL", {
    capabilities: ["text_to_image", "negative_prompt", "seed", "lora", "open_weights"],
    lora: true,
    resolutions: ["self-hosted"],
    aspectRatios: ["custom"]
  }),
  openWeight("ByteDance/Hyper-SD", "Hyper-SD", {
    capabilities: ["text_to_image", "seed", "fast_inference", "open_weights"],
    resolutions: ["self-hosted"],
    aspectRatios: ["custom"]
  }),

  // NVIDIA NIM Models
  image("nvidia", "black-forest-labs/flux.2-klein-4b", "FLUX.2 Klein 4B", {
    executable: true,
    capabilities: ["text_to_image", "image_edit", "seed", "iphone_candid"],
    supportedInputs: ["text", "image"],
    editing: true,
    seed: true,
    docs: "https://docs.nvidia.com/nim/visual-genai/1.7.1/models.html"
  }),
  image("nvidia", "black-forest-labs/flux.1-dev", "FLUX.1 Dev", {
    executable: true,
    capabilities: ["text_to_image", "negative_prompt", "seed", "cinematic_dslr"],
    seed: true,
    docs: "https://docs.nvidia.com/nim/visual-genai/1.4.0/getting-started.html"
  }),
  image("nvidia", "black-forest-labs/flux.1-kontext-dev", "FLUX.1 Kontext Dev", {
    executable: true,
    capabilities: ["image_edit", "reference_image", "seed"],
    supportedInputs: ["text", "image"],
    referenceImage: true,
    editing: true,
    seed: true,
    docs: "https://docs.nvidia.com/nim/visual-genai/1.4.0/getting-started.html"
  }),
  image("nvidia", "black-forest-labs/flux.1-schnell", "FLUX.1 Schnell", {
    executable: true,
    capabilities: ["text_to_image", "negative_prompt", "seed", "fast_inference"],
    seed: true,
    docs: "https://docs.nvidia.com/nim/visual-genai/1.4.0/getting-started.html"
  }),
  image("nvidia", "stabilityai/stable-diffusion-3.5-large", "Stable Diffusion 3.5 Large", {
    executable: true,
    capabilities: ["text_to_image", "negative_prompt", "seed", "controlnet", "cinematic_dslr"],
    seed: true,
    docs: "https://docs.nvidia.com/nim/visual-genai/1.4.0/getting-started.html"
  }),

  // Runway Models
  image("runway", "gen4-image", "Gen-4 Image", {
    executable: true,
    capabilities: ["text_to_image", "reference_image", "style_reference"],
    supportedInputs: ["text", "image"],
    referenceImage: true,
    docs: "https://replicate.com/collections"
  }),
  video("runway", "gen-3-alpha-turbo", "Runway Gen-3 Alpha", {
    capabilities: ["text_to_video", "image_to_video"],
    supportedInputs: ["text", "image"],
    docs: "https://runwayml.com"
  }),

  // Video Models
  video("fal", "fal-ai/kling-video/v1/standard/effects", "Kling 1.0 Effects", {
    docs: "https://fal.ai/models/fal-ai/kling-video/v1/standard/effects/api"
  }),
  video("google", "veo-3.1-generate-preview", "Veo 3.1 Preview", {
    capabilities: ["text_to_video", "image_to_video", "first_frame", "last_frame", "extend_video"],
    supportedInputs: ["text", "image"],
    aspectRatios: ["16:9", "9:16"],
    referenceImage: true,
    imageToVideo: true,
    docs: "https://ai.google.dev/gemini-api/docs/models"
  }),
  video("luma", "dream-machine", "Luma Dream Machine", {
    capabilities: ["text_to_video", "image_to_video"],
    supportedInputs: ["text", "image"],
    docs: "https://lumalabs.ai/dream-machine"
  }),
  video("minimax", "video-01", "Hailuo Video-01", {
    capabilities: ["text_to_video", "image_to_video"],
    supportedInputs: ["text", "image"],
    docs: "https://hailuoai.video"
  })
];
