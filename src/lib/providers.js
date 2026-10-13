export const PROVIDERS = {
  openai: { name: "OpenAI", env: "OPENAI_API_KEY", implemented: true },
  stability: { name: "Stability AI", env: "STABILITY_API_KEY", implemented: true },
  google: { name: "Google Gemini", env: "GOOGLE_AI_API_KEY", implemented: true },
  fal: { name: "Fal.ai", env: "FAL_KEY", implemented: true },
  replicate: { name: "Replicate", env: "REPLICATE_API_TOKEN", implemented: true },
  huggingface: { name: "Hugging Face", env: "HF_TOKEN", implemented: true },
  nvidia: { name: "NVIDIA NIM", env: "NVIDIA_API_KEY", implemented: true },
  runway: { name: "Runway", env: "RUNWAY_API_KEY", implemented: true },
  luma: { name: "Luma", env: "LUMA_API_KEY", implemented: false },
  minimax: { name: "MiniMax/Hailuo", env: "MINIMAX_API_KEY", implemented: false },
  kling: { name: "Kling", env: "KLING_API_KEY", implemented: false },
  bytedance: { name: "ByteDance", env: "BYTEDANCE_API_KEY", implemented: false }
};
