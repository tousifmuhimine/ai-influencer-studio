export const CAMERA_STYLES = {
  iphone_candid: {
    id: "iphone_candid",
    label: "📱 iPhone Candid Snapshot",
    badge: "Smartphone Realism",
    desc: "24mm f/1.8 lens, Smart HDR, handheld candid, authentic micro-pores, zero studio bokeh",
    directive: "Camera & Aesthetic: Shot on iPhone 16 Pro main 24mm f/1.8 lens, Apple ProRAW tone with Smart HDR. Natural handheld mobile perspective, unposed candid snapshot, authentic ambient lighting, realistic skin micro-pores and fine texture without artificial smoothing, subtle mobile sensor exposure, zero studio bokeh.",
    negative: "studio lighting, 85mm dslr bokeh, heavy post-processing, airbrushed plastic skin, over-rendered, staged studio photoshoot, glamour softbox"
  },
  iphone_selfie: {
    id: "iphone_selfie",
    label: "🤳 iPhone Mirror / Front Selfie",
    badge: "Casual Selfie",
    desc: "Front camera or mirror selfie, casual arm-length, unedited story vibe",
    directive: "Camera & Aesthetic: Casual mobile phone selfie, shot on iPhone front-facing camera, arm-length selfie angle or bedroom mirror selfie reflection, authentic room lighting, unedited social media snapshot, spontaneous candid moment.",
    negative: "professional studio camera, tripod, heavy bokeh, staged glamour, over-smoothed skin"
  },
  dslr_studio: {
    id: "dslr_studio",
    label: "📸 Professional DSLR Studio Portrait",
    badge: "Studio DSLR",
    desc: "85mm f/1.4 GM prime lens, soft creamy bokeh, 3-point studio lighting",
    directive: "Camera & Aesthetic: Shot on Sony A7R V with 85mm f/1.4 GM prime lens, professional portrait photography, creamy soft background bokeh, studio three-point lighting, clean key light, razor-sharp eye focus, color-graded editorial finish.",
    negative: "blurry, low resolution, phone camera distortion, bad lighting"
  },
  film_35mm: {
    id: "film_35mm",
    label: "🎞️ 35mm Vintage Analog Film",
    badge: "Analog 35mm",
    desc: "Kodak Portra 400, organic film grain, warm nostalgic tones, halation",
    directive: "Camera & Aesthetic: Authentic 35mm analog photograph shot on Kodak Portra 400, organic fine film grain, warm nostalgic color tones, gentle film halation, natural vintage daylight exposure.",
    negative: "digital sharpness, CGI, plastic, oversaturated"
  },
  disposable_flash: {
    id: "disposable_flash",
    label: "⚡ Disposable Camera / Direct Flash",
    badge: "Direct Flash",
    desc: "Direct harsh on-camera flash, 90s party snapshot, high contrast",
    directive: "Camera & Aesthetic: Shot on 35mm disposable camera with direct on-camera harsh flash, high-contrast flash aesthetic, 90s party snapshot atmosphere, authentic candid night snapshot, vibrant flash falloff.",
    negative: "soft studio light, daylight, professional bokeh"
  },
  editorial_fashion: {
    id: "editorial_fashion",
    label: "📰 High-Fashion Magazine Editorial",
    badge: "Vogue Editorial",
    desc: "High-contrast dramatic lighting, sculptural high-fashion posing",
    directive: "Camera & Aesthetic: High-fashion editorial cover shot for Vogue, sculptural high-contrast studio illumination, dramatic high-fashion posing, pristine sharpness and texture, high-end color grading.",
    negative: "casual snapshot, amateur, washed out"
  },
  raw_prompt: {
    id: "raw_prompt",
    label: "🔘 Custom / Prompt Only",
    badge: "Neutral",
    desc: "Pure prompt without automatic camera style injection",
    directive: "",
    negative: ""
  }
};

export const CAPABILITY_LABELS = {
  iphone_candid: "📱 iPhone Candid",
  cinematic_dslr: "📸 Studio DSLR",
  vintage_film: "🎞️ 35mm Film",
  photorealism: "👁️ Ultra Realism",
  raw_portrait: "✨ Raw Portrait",
  reference_image: "🖼️ Visual Ref",
  image_edit: "✂️ Image Edit",
  multi_reference: "🧩 Multi-Ref",
  prompt_adherence: "🎯 High Adherence",
  negative_prompt: "🚫 Neg Prompt",
  seed: "🎲 Seed Control",
  fast_inference: "⚡ Fast (1-4 step)",
  open_weights: "🆓 Open Weight",
  typography: "🔤 Typography",
  text_to_image: "🎨 Text-to-Image",
  text_to_video: "🎬 Text-to-Video",
  image_to_video: "🎥 Image-to-Video",
  first_frame: "🎞️ First Frame",
  lora: "🧬 LoRA Support"
};

export function formatCapabilityBadge(cap) {
  return CAPABILITY_LABELS[cap] || cap.replace(/_/g, " ");
}
