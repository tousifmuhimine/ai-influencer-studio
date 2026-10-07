"use client";

import { useEffect, useRef, useState } from "react";
import { CAMERA_STYLES, formatCapabilityBadge } from "@/lib/camera-styles";

const tabs = ["identity", "image", "video", "compare", "catalog", "settings", "history"];
const appName = "AI Identity Studio";

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const body = await response.text();
  let data;
  try {
    data = body ? JSON.parse(body) : {};
  } catch {
    throw new Error(`Server returned an invalid response (${response.status}).`);
  }
  if (!response.ok) throw new Error(data.error || body || "Request failed");
  return data;
}

export default function StudioApp() {
  const [active, setActive] = useState("identity");
  const [navScrollable, setNavScrollable] = useState(false);
  const navRef = useRef(null);
  const [state, setState] = useState({ providers: {}, models: [], characters: [], jobs: [], generations: [] });
  const [authUser, setAuthUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [authStatus, setAuthStatus] = useState("Login to open your studio.");
  const [activeCharacterId, setActiveCharacterId] = useState("ayra");
  const [identityDraft, setIdentityDraft] = useState(null);
  const [modalImage, setModalImage] = useState(null);
  const [forms, setForms] = useState({
    image: {
      character: "ayra",
      cameraStyle: "iphone_candid",
      prompt: "Ayra sitting in a premium cafe in Dhaka, natural window light, elegant modest fashion, realistic social media portrait",
      negativePrompt: "blur, distorted face, low quality",
      count: 1,
      surroundingImage: "",
      surroundingPrompt: "",
      dressImage: "",
      dressPrompt: ""
    },
    video: {
      character: "ayra",
      prompt: "Ayra slowly turns toward the camera, subtle smile, realistic handheld cinematic motion",
      duration: 5
    },
    compare: {
      character: "ayra",
      type: "image",
      cameraStyle: "iphone_candid",
      prompt: "Ayra in a premium cafe in Dhaka, same identity, realistic portrait, soft daylight",
      modelIds: [],
      surroundingImage: "",
      dressImage: ""
    }
  });

  async function load(preferredCharacterId = activeCharacterId) {
    const catalog = await api("/api/catalog");
    const jobs = await api("/api/jobs");
    const characters = catalog.characters || [];
    const selectedCharacter = characters.find((item) => item.id === preferredCharacterId) || characters[0];
    setState({ ...catalog, ...jobs });
    setActiveCharacterId(selectedCharacter?.id || "ayra");
    setIdentityDraft(selectedCharacter?.identity || {});
  }

  useEffect(() => {
    function updateNavScrollState() {
      const nav = navRef.current;
      setNavScrollable(Boolean(nav && nav.scrollWidth > nav.clientWidth));
    }

    updateNavScrollState();
    window.addEventListener("resize", updateNavScrollState);
    return () => window.removeEventListener("resize", updateNavScrollState);
  }, [authUser]);

  useEffect(() => {
    let mounted = true;
    api("/api/auth/session")
      .then((session) => {
        if (!mounted) return;
        setAuthUser(session.user);
        setAuthStatus(session.authenticated ? "Logged in." : "Login to open your studio.");
        if (session.authenticated) load();
      })
      .catch((error) => {
        if (mounted) setAuthStatus(error.message);
      })
      .finally(() => {
        if (mounted) setAuthChecking(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const connectedCount = Object.values(state.providers).filter((provider) => provider.connected).length;

  function character(id = activeCharacterId) {
    return state.characters.find((item) => item.id === id) || state.characters[0];
  }

  async function submitAuth(event) {
    event.preventDefault();
    const action = event.nativeEvent.submitter?.dataset.auth || "login";
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const result = await api(`/api/auth/${action}`, { method: "POST", body: JSON.stringify(data) });
      setAuthUser(result.user || { email: data.email, companyName: data.companyName });
      setAuthStatus(result.localAuth || result.emailConfirmed || action === "login" ? "Logged in." : "Account created. Check email if confirmation is enabled.");
      await load();
    } catch (error) {
      setAuthStatus(error.message);
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
    setAuthUser(null);
    setAuthStatus("Logged out. Login to open your studio.");
    setState({ providers: {}, models: [], characters: [], jobs: [], generations: [] });
  }

  async function saveIdentity(data) {
    const characterId = slugify(data.name || "ai-influencer");
    const angleList = [data.angles?.front, data.angles?.left, data.angles?.right, data.angles?.normal].filter(Boolean);
    const combinedReferences = [...new Set([...angleList, ...(data.extraReferences || [])])];

    const result = await api("/api/characters", {
      method: "POST",
      body: JSON.stringify({
        id: characterId,
        name: data.name || "AI Influencer",
        identity: {
          faceCut: data.faceCut,
          anchorPrompt: data.anchorPrompt,
          angles: data.angles || { front: "", left: "", right: "", normal: "" },
          referenceImages: combinedReferences,
          identityLocked: true,
          identityLockStrength: Number(data.identityLockStrength || 0.75),
          negativeIdentityPrompt: data.negativeIdentityPrompt,
          notes: data.notes
        }
      })
    });
    setAuthStatus(result.supabase?.mirrored ? "Identity saved and synchronized." : "Identity saved locally.");
    setActiveCharacterId(result.character.id);
    updateForm("image", { character: result.character.id });
    updateForm("video", { character: result.character.id });
    updateForm("compare", { character: result.character.id });
    await load(result.character.id);
  }

  async function submitGeneration(type, event) {
    event.preventDefault();
    const payload = normalizeGenerationForm(forms[type]);
    const model = state.models.find((item) => item.id === payload.modelId);
    const result = await api("/api/jobs", {
      method: "POST",
      body: JSON.stringify({ type, modelId: payload.modelId, provider: model?.provider, input: payload })
    });
    setAuthStatus("Generating image with identity and style conditioning.");
    void pollJobs([result.job.id]);
  }

  async function submitComparison(event) {
    event.preventDefault();
    const input = normalizeGenerationForm(forms.compare);
    const result = await api("/api/comparisons", {
      method: "POST",
      body: JSON.stringify({ type: forms.compare.type, modelIds: forms.compare.modelIds, input })
    });
    setAuthStatus("Generating comparison across selected models.");
    void pollJobs(result.jobs.map((job) => job.id));
  }

  async function pollJobs(jobIds) {
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const jobsResult = await api("/api/jobs");
      setState((current) => ({ ...current, ...jobsResult }));
      const tracked = jobsResult.jobs.filter((job) => jobIds.includes(job.id));
      if (tracked.length === jobIds.length && tracked.every((job) => ["completed", "failed"].includes(job.status))) {
        setAuthStatus(tracked.every((job) => job.status === "completed") ? "Generation complete." : "One or more generation jobs failed.");
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
    setAuthStatus("Generation is still processing in background. Track in output history.");
  }

  async function saveProvider(event, providerId) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    await api("/api/credentials", { method: "POST", body: JSON.stringify({ provider: providerId, apiKey: data.apiKey, enabled: data.enabled === "on" }) });
    await load();
  }

  async function removeProvider(providerId) {
    await api(`/api/credentials/${providerId}`, { method: "DELETE" });
    await load();
  }

  async function viewProvider(providerId) {
    const result = await api(`/api/credentials/${providerId}`);
    return result.apiKey || "";
  }

  async function addCustomModel(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    data.capabilities = data.capabilities.split(",").map((item) => item.trim()).filter(Boolean);
    data.supportedInputs = ["text", "image"];
    data.supportedOutputs = [data.type];
    await api("/api/models/custom", { method: "POST", body: JSON.stringify(data) });
    event.currentTarget.reset();
    await load();
  }

  async function toggleFavorite(model) {
    await api("/api/models/favorite", { method: "POST", body: JSON.stringify({ modelId: model.id, favorite: !model.favorite }) });
    await load();
  }

  function updateForm(type, patch) {
    setForms((current) => ({ ...current, [type]: { ...current[type], ...patch } }));
  }

  function chooseCharacter(id) {
    setActiveCharacterId(id);
    setIdentityDraft(character(id)?.identity || {});
    updateForm("image", { character: id });
    updateForm("video", { character: id });
    updateForm("compare", { character: id });
  }

  if (authChecking) {
    return (
      <div className="login-shell">
        <div className="login-card pulse-card">
          <span className="brand-mark">AI</span>
          <h1>{appName}</h1>
          <p>Initializing your creative studio workspace...</p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return <LoginScreen status={authStatus} onSubmit={submitAuth} />;
  }

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <span className="brand-mark">AI</span>
          <div className="brand-titles">
            <span className="brand-name">{appName}</span>
            <span className="brand-sub">Neural Identity Engine</span>
          </div>
        </div>
        <div className="rail-signal">
          <div className="signal-dot live"></div>
          <div>
            <span>Multi-Angle Identity System</span>
            <strong>{state.characters.length || 1} influencer profile{(state.characters.length || 1) === 1 ? "" : "s"}</strong>
          </div>
        </div>
        <div className={`nav-scroll ${navScrollable ? "has-overflow" : ""}`}>
          <nav ref={navRef} aria-label="Studio sections">
            {tabs.map((tab) => (
              <button key={tab} className={`nav ${active === tab ? "active" : ""}`} onClick={() => setActive(tab)}>
                <span className="nav-icon">{tabIcons[tab] || "✦"}</span>
                <span className="nav-label">{tab}</span>
                {tab === "identity" && <span className="nav-badge">360°</span>}
              </button>
            ))}
          </nav>
          <span className="nav-scroll-cue" aria-hidden="true">›</span>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <h1>{appName}</h1>
            <p>Shape 360° facial consistency across every angle, attach surrounding environment and wardrobe references, and generate hyper-consistent outputs with iPhone candid realism or studio DSLR optics.</p>
          </div>
          <div className="session-card">
            <div>
              <strong>{authUser.companyName || "Studio Workspace"}</strong>
              <span>{authUser.email} · {authStatus}</span>
            </div>
            <button className="logout-btn" onClick={logout}>Logout</button>
          </div>
        </header>

        <section className="studio-metrics">
          <article className="metric-card">
            <span>Configured providers</span>
            <strong>{connectedCount}</strong>
            <small className="metric-hint">Ready for synthesis</small>
          </article>
          <article className="metric-card">
            <span>Generation jobs</span>
            <strong>{state.jobs.length}</strong>
            <small className="metric-hint">Queued and completed</small>
          </article>
          <article className="metric-card">
            <span>Saved gallery</span>
            <strong>{state.generations.length}</strong>
            <small className="metric-hint">Locked outputs</small>
          </article>
        </section>

        <div className="tab-stage animate-fade">
          {active === "identity" && (
            <IdentityPanel
              characters={state.characters}
              activeCharacterId={activeCharacterId}
              setActiveCharacterId={chooseCharacter}
              character={character()}
              connectedCount={connectedCount}
              draft={identityDraft}
              onSave={saveIdentity}
              onPreviewImage={(url, title) => setModalImage({ url, title })}
            />
          )}
          {active === "image" && (
            <GenerationPanel
              type="image"
              state={state}
              form={forms.image}
              update={updateForm}
              onSubmit={submitGeneration}
              onPreviewImage={(url, title) => setModalImage({ url, title })}
            />
          )}
          {active === "video" && (
            <GenerationPanel
              type="video"
              state={state}
              form={forms.video}
              update={updateForm}
              onSubmit={submitGeneration}
              onPreviewImage={(url, title) => setModalImage({ url, title })}
            />
          )}
          {active === "compare" && (
            <ComparePanel
              state={state}
              form={forms.compare}
              update={updateForm}
              onSubmit={submitComparison}
              onPreviewImage={(url, title) => setModalImage({ url, title })}
            />
          )}
          {active === "catalog" && (
            <CatalogPanel
              models={state.models}
              toggleFavorite={toggleFavorite}
              addCustomModel={addCustomModel}
            />
          )}
          {active === "settings" && (
            <SettingsPanel
              providers={state.providers}
              saveProvider={saveProvider}
              removeProvider={removeProvider}
              viewProvider={viewProvider}
            />
          )}
          {active === "history" && (
            <HistoryPanel
              generations={state.generations}
              onPreviewImage={(url, title) => setModalImage({ url, title })}
            />
          )}
        </div>
      </main>

      {modalImage && (
        <ImageModal
          image={modalImage.url}
          title={modalImage.title}
          onClose={() => setModalImage(null)}
        />
      )}
    </div>
  );
}

const tabIcons = {
  identity: "👤",
  image: "🎨",
  video: "🎬",
  compare: "⚖️",
  catalog: "📚",
  settings: "⚙️",
  history: "⏱️"
};

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "ai-influencer";
}

function normalizeGenerationForm(form) {
  return {
    ...form,
    cameraStyle: form.cameraStyle || "iphone_candid",
    referenceImages: (typeof form.referenceImages === "string" ? form.referenceImages : "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean),
    surroundingImage: form.surroundingImage || "",
    surroundingPrompt: form.surroundingPrompt || "",
    dressImage: form.dressImage || "",
    dressPrompt: form.dressPrompt || ""
  };
}

function readImageAsDataUrl(file) {
  if (!file || !file.size) return Promise.resolve("");
  if (file.size > 5 * 1024 * 1024) return Promise.reject(new Error("Each reference image must be 5 MB or smaller."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

function LoginScreen({ status, onSubmit }) {
  const [mode, setMode] = useState("login");
  const isSignup = mode === "signup";

  return (
    <main className="login-shell">
      <section className="login-stage">
        <div className="login-visual">
          <span className="brand-mark">AI</span>
          <div>
            <p>Next-Gen Virtual Persona Engine</p>
            <h1>{appName}</h1>
          </div>
          <div className="signal-stack">
            <span>360° Face Angles</span>
            <span>iPhone Candid Optics</span>
            <span>Wardrobe & Scene Fusion</span>
          </div>
        </div>
        <form className={`login-card ${isSignup ? "signup-mode" : "login-mode"}`} onSubmit={onSubmit}>
          <div className="auth-switch" aria-label="Authentication mode">
            <button type="button" className={!isSignup ? "active" : ""} onClick={() => setMode("login")}>Login</button>
            <button type="button" className={isSignup ? "active" : ""} onClick={() => setMode("signup")}>Sign up</button>
          </div>
          <div className="auth-copy" key={mode}>
            <h1>{isSignup ? "Create your studio" : "Welcome back"}</h1>
            <p>{isSignup ? "Initialize your multi-angle persona workspace and start creating." : "Sign in to lock identity angles, style conditioning, and generation pipelines."}</p>
          </div>
          <div className="auth-fields" key={`${mode}-fields`}>
            <label>Email<input name="email" type="email" placeholder="you@example.com" required /></label>
            {isSignup && <label>Company / Project name<input name="companyName" placeholder="Studio name" required /></label>}
            <label>Password<input name="password" type="password" placeholder="Password" required /></label>
          </div>
          <div className="login-actions">
            <button className="primary" data-auth={isSignup ? "signup" : "login"}>{isSignup ? "Create account" : "Enter Studio"}</button>
          </div>
          <span className="auth-note">{status}</span>
        </form>
      </section>
    </main>
  );
}

function IdentityPanel({ characters, activeCharacterId, setActiveCharacterId, character, connectedCount, draft, onSave, onPreviewImage }) {
  const identity = draft || character?.identity || {};
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => setUnlocked(false), [character?.id]);
  const locked = identity.identityLocked !== false && !unlocked;

  const defaultAngles = {
    front: identity.angles?.front || identity.referenceImages?.[0] || "",
    left: identity.angles?.left || "",
    right: identity.angles?.right || "",
    normal: identity.angles?.normal || ""
  };

  const [angles, setAngles] = useState(defaultAngles);
  const [angleUrlInputs, setAngleUrlInputs] = useState({ front: "", left: "", right: "", normal: "" });
  const [showUrlInput, setShowUrlInput] = useState({ front: false, left: false, right: false, normal: false });
  const [extraReferencesText, setExtraReferencesText] = useState("");

  useEffect(() => {
    const initialAngles = {
      front: identity.angles?.front || identity.referenceImages?.[0] || "",
      left: identity.angles?.left || "",
      right: identity.angles?.right || "",
      normal: identity.angles?.normal || ""
    };
    setAngles(initialAngles);

    const angleSet = new Set(Object.values(initialAngles).filter(Boolean));
    const extraUrls = (identity.referenceImages || [])
      .filter((img) => !angleSet.has(img) && !img.startsWith("data:") && !img.startsWith("/api/media/"))
      .join("\n");
    setExtraReferencesText(extraUrls);
  }, [character?.id, draft]);

  async function handleAngleUpload(key, file) {
    if (!file) return;
    try {
      const dataUrl = await readImageAsDataUrl(file);
      setAngles((prev) => ({ ...prev, [key]: dataUrl }));
    } catch (err) {
      alert(err.message);
    }
  }

  function applyAngleUrl(key) {
    const val = angleUrlInputs[key]?.trim();
    if (val) {
      setAngles((prev) => ({ ...prev, [key]: val }));
      setAngleUrlInputs((prev) => ({ ...prev, [key]: "" }));
      setShowUrlInput((prev) => ({ ...prev, [key]: false }));
    }
  }

  function clearAngle(key) {
    setAngles((prev) => ({ ...prev, [key]: "" }));
  }

  const filledAnglesCount = ["front", "left", "right", "normal"].filter((k) => Boolean(angles[k])).length;
  const coveragePercent = Math.round((filledAnglesCount / 4) * 100);

  async function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const formValues = Object.fromEntries(formData.entries());

    const extraFiles = [...event.currentTarget.elements.extraFaceFiles?.files || []];
    const uploadedExtras = await Promise.all(extraFiles.map(readImageAsDataUrl));

    const typedExtraUrls = extraReferencesText
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);

    const angleValues = new Set(Object.values(angles).filter(Boolean));
    const existingMediaExtras = (identity.referenceImages || []).filter(
      (ref) => !angleValues.has(ref) && (ref.startsWith("/api/media/") || ref.startsWith("data:"))
    );

    const extraReferences = [...new Set([...typedExtraUrls, ...existingMediaExtras, ...uploadedExtras])];

    onSave({
      name: formValues.name,
      faceCut: formValues.faceCut,
      anchorPrompt: formValues.anchorPrompt,
      identityLockStrength: formValues.identityLockStrength,
      negativeIdentityPrompt: formValues.negativeIdentityPrompt,
      notes: formValues.notes,
      angles,
      extraReferences
    });
  }

  const angleConfig = [
    {
      key: "front",
      title: "Front View (0°)",
      icon: "👤",
      subtitle: "Direct gaze portrait",
      hint: "Captures facial symmetry, eye shape, nose bridge, and lip contour directly."
    },
    {
      key: "left",
      title: "Left Profile (45°-90°)",
      icon: "↩️",
      subtitle: "Left side jawline & cheek",
      hint: "Captures left cheekbone elevation, jawline angle, and ear-to-eye proportion."
    },
    {
      key: "right",
      title: "Right Profile (45°-90°)",
      icon: "↪️",
      subtitle: "Right side profile contour",
      hint: "Captures right facial contour, temple depth, and 3D volumetric structure."
    },
    {
      key: "normal",
      title: "Natural / Candid Shot",
      icon: "📸",
      subtitle: "Everyday ambient portrait",
      hint: "Captures realistic skin texture, relaxed expression, and neutral everyday lighting."
    }
  ];

  return (
    <section className="identity-layout">
      <form className="panel identity-panel" onSubmit={handleSubmit} key={character?.id || "new-character"}>
        <div className="panel-head">
          <div>
            <h2>360° AI Influencer Identity Pack</h2>
            <p className="panel-subhead">Lock multiple facial angles to guarantee consistency from any perspective.</p>
          </div>
          <span className={`status-pill ${locked ? "locked-pill" : ""}`}>
            {locked ? "🔒 Identity locked" : `${connectedCount} active providers`}
          </span>
        </div>

        {characters.length > 1 && (
          <label>
            Saved influencer profile
            <Select value={activeCharacterId} onChange={setActiveCharacterId} options={characters.map((item) => [item.id, item.name])} />
          </label>
        )}

        <label>
          AI Influencer Name
          <input name="name" disabled={locked} defaultValue={character?.name || "AI Influencer"} required />
        </label>

        {/* 360 Degree Facial Angle Capture Module */}
        <div className="angles-section">
          <div className="angles-header">
            <div>
              <h3>Multi-Angle Facial Mapping</h3>
              <p>Providing front, left, right, and natural photos gives generative models a complete 3D facial representation.</p>
            </div>
            <div className="coverage-badge">
              <span className="coverage-counter">{filledAnglesCount}/4 Angles</span>
              <div className="coverage-bar-track">
                <div className="coverage-bar-fill" style={{ width: `${coveragePercent}%` }}></div>
              </div>
            </div>
          </div>

          <div className="angles-grid">
            {angleConfig.map(({ key, title, icon, subtitle, hint }) => {
              const imageSrc = angles[key];
              return (
                <div className={`angle-card ${imageSrc ? "has-image" : "empty"}`} key={key}>
                  <div className="angle-card-top">
                    <span className="angle-icon">{icon}</span>
                    <div className="angle-titles">
                      <strong>{title}</strong>
                      <small>{subtitle}</small>
                    </div>
                    <span className={`angle-status-dot ${imageSrc ? "active" : ""}`} title={imageSrc ? "Angle mapped" : "Angle pending"}></span>
                  </div>

                  {imageSrc ? (
                    <div className="angle-preview-box">
                      <img src={imageSrc} alt={title} onClick={() => onPreviewImage(imageSrc, title)} />
                      <div className="angle-preview-overlay">
                        <button type="button" className="angle-btn enlarge" onClick={() => onPreviewImage(imageSrc, title)}>Enlarge</button>
                        {!locked && (
                          <button type="button" className="angle-btn remove" onClick={() => clearAngle(key)}>Remove</button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="angle-dropzone">
                      <p className="angle-hint">{hint}</p>
                      {!locked ? (
                        <div className="angle-actions">
                          <label className="upload-trigger">
                            <span>Upload photo</span>
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              disabled={locked}
                              onChange={(e) => handleAngleUpload(key, e.target.files?.[0])}
                            />
                          </label>
                          <button
                            type="button"
                            className="text-btn"
                            onClick={() => setShowUrlInput((prev) => ({ ...prev, [key]: !prev[key] }))}
                          >
                            {showUrlInput[key] ? "Cancel URL" : "or paste URL"}
                          </button>
                        </div>
                      ) : (
                        <span className="angle-locked-notice">Locked</span>
                      )}

                      {!locked && showUrlInput[key] && (
                        <div className="angle-url-row">
                          <input
                            type="url"
                            placeholder="https://.../photo.jpg"
                            value={angleUrlInputs[key] || ""}
                            onChange={(e) => setAngleUrlInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                          />
                          <button type="button" onClick={() => applyAngleUrl(key)}>Set</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Detailed Facial Structure Description */}
        <label>
          Facial Structure & Geometry
          <textarea
            name="faceCut"
            disabled={locked}
            rows={3}
            defaultValue={identity.faceCut || ""}
            placeholder="Detailed facial architecture (e.g. softly oval face cut, high cheekbones, tapered jawline, almond dark eyes...)"
          />
        </label>

        <label>
          Identity Anchor Prompt
          <textarea
            name="anchorPrompt"
            disabled={locked}
            rows={3}
            defaultValue={identity.anchorPrompt || ""}
            placeholder="Prompt prefix automatically prepended to every generation to enforce likeness..."
          />
        </label>

        {/* Additional References (Extra angles or lifestyle photos) */}
        <details className="extra-references-details" open={false}>
          <summary>Additional reference photos & URLs (optional)</summary>
          <div className="extra-refs-content">
            <label>
              Extra reference URLs (one per line)
              <textarea
                value={extraReferencesText}
                onChange={(e) => setExtraReferencesText(e.target.value)}
                disabled={locked}
                rows={3}
                placeholder="https://example.com/extra-portrait.jpg"
              />
            </label>
            {!locked && (
              <label>
                Upload extra photos (batch)
                <input name="extraFaceFiles" disabled={locked} type="file" accept="image/png,image/jpeg,image/webp" multiple />
              </label>
            )}
          </div>
        </details>

        <div className="grid two">
          <label>
            Identity lock strength ({identity.identityLockStrength ?? 0.75})
            <input
              name="identityLockStrength"
              disabled={locked}
              type="range"
              min="0"
              max="1"
              step="0.05"
              defaultValue={identity.identityLockStrength ?? 0.75}
            />
          </label>
          <label>
            Negative identity prompt
            <input
              name="negativeIdentityPrompt"
              disabled={locked}
              defaultValue={identity.negativeIdentityPrompt || ""}
              placeholder="different person, changed face shape, distorted jaw"
            />
          </label>
        </div>

        <label>
          Identity Notes & Strategy
          <textarea name="notes" disabled={locked} rows={2} defaultValue={identity.notes || ""} placeholder="Lighting guidelines, model-specific tips..." />
        </label>

        <div className="identity-actions">
          {locked ? (
            <button type="button" className="unlock-btn" onClick={() => setUnlocked(true)}>
              🔓 Unlock Identity to Edit
            </button>
          ) : (
            <button className="primary save-identity-btn">
              🔒 Lock & Save Multi-Angle Identity
            </button>
          )}
        </div>
      </form>

      <section className="studio-brief">
        <div className="brief-content">
          <span className="brief-tag">360° Identity Pipeline</span>
          <h2>Every camera angle, outfit, and environment harmonized into one persona.</h2>
          <p>
            When you provide full facial perspectives along with environment and dress conditioning, the engine synchronizes
            identity geometry with wardrobe fabrics and ambient lighting across every generation job.
          </p>
          <div className="brief-feature-pills">
            <span>✨ 4-Angle Geometry</span>
            <span>📱 iPhone Candid Realism</span>
            <span>🏛️ Environmental Fusion</span>
            <span>👗 Wardrobe Match</span>
          </div>
        </div>
      </section>
    </section>
  );
}

function GenerationPanel({ type, state, form, update, onSubmit, onPreviewImage }) {
  const models = state.models.filter((model) => model.type === type && model.executable);
  const providers = [...new Set(models.map((model) => model.provider))];
  const provider = form.provider || providers[0] || "";
  const providerModels = models.filter((model) => model.provider === provider);
  const model = state.models.find((item) => item.id === form.modelId) || providerModels[0];
  const character = state.characters.find((item) => item.id === form.character) || state.characters[0];
  const caps = new Set(model?.capabilities || []);
  const providerInfo = state.providers[provider] || {};
  const isImplemented = Boolean(providerInfo.implemented);
  const isConnected = Boolean(providerInfo.connected);

  useEffect(() => {
    if (!form.provider && providers[0]) {
      update(type, { provider: providers[0], modelId: providerModels[0]?.id });
    }
  }, [providers.join("|")]);

  return (
    <section className="workspace">
      <form className="panel generation-form" onSubmit={(event) => onSubmit(type, event)}>
        <div className="panel-head">
          <div>
            <h2>{type === "image" ? "AI Image Synthesis" : "AI Video Generation"}</h2>
            <p className="panel-subhead">Multi-modal generation with identity, camera optics, scene, and wardrobe conditioning.</p>
          </div>
          <BadgeList items={(model?.capabilities || []).slice(0, 4)} />
        </div>

        <label>
          Character Profile
          <Select
            value={form.character || "ayra"}
            onChange={(value) => update(type, { character: value })}
            options={state.characters.map((item) => [item.id, item.name])}
          />
        </label>

        <IdentityChip character={character} />

        <div className="grid two">
          <label>
            Provider
            <Select
              value={provider}
              onChange={(value) => update(type, { provider: value, modelId: models.find((item) => item.provider === value)?.id })}
              options={providers.map((item) => {
                const p = state.providers[item] || {};
                const icon = p.implemented && p.connected ? "✅" : p.implemented && !p.connected ? "⚠️" : "🔒";
                return [item, `${icon} ${p.name || item}`];
              })}
            />
          </label>
          <label>
            Model
            <Select
              value={model?.id || ""}
              onChange={(value) => update(type, { modelId: value })}
              options={providerModels.map((item) => [item.id, modelLabel(item)])}
            />
          </label>
        </div>

        {/* Provider status banner */}
        <div className={`provider-status-banner ${isImplemented && isConnected ? "status-ready" : isImplemented && !isConnected ? "status-warn" : "status-locked"}`}>
          <span className="status-icon">{isImplemented && isConnected ? "✅" : isImplemented && !isConnected ? "⚠️" : "🔒"}</span>
          <div className="status-text">
            {isImplemented && isConnected && (
              <>
                <strong>Ready to generate</strong>
                <span>{providerInfo.name} API key is configured and active.</span>
              </>
            )}
            {isImplemented && !isConnected && (
              <>
                <strong>API key required</strong>
                <span>{providerInfo.name} adapter is ready but no API key is configured. Add your key in Settings → {providerInfo.name}.</span>
              </>
            )}
            {!isImplemented && (
              <>
                <strong>Coming soon — adapter in development</strong>
                <span>{providerInfo.name || provider} generation is not yet integrated. Browse models and capabilities now; generation will be enabled in a future update.</span>
              </>
            )}
          </div>
        </div>

        {/* Capability + Limitation detail */}
        <div className="model-detail-panel">
          <div className="model-cap-banner">
            <span className="cap-banner-title">Capabilities:</span>
            <div className="cap-chips">
              {(model?.capabilities || []).map((cap) => (
                <span
                  key={cap}
                  className={`cap-chip ${
                    cap === "iphone_candid"
                      ? "chip-phone"
                      : cap === "cinematic_dslr"
                      ? "chip-dslr"
                      : cap === "open_weights"
                      ? "chip-open"
                      : ""
                  }`}
                >
                  {formatCapabilityBadge(cap)}
                </span>
              ))}
            </div>
          </div>
          <div className="model-limit-row">
            <span className="limit-label">Limitations &amp; info:</span>
            <div className="limit-chips">
              {model?.pricing === "free_self_hosted" && <span className="limit-chip chip-free">Free / self-hosted</span>}
              {model?.pricing === "paid_api" && <span className="limit-chip chip-api">Paid API</span>}
              {model?.availability === "deprecated" && <span className="limit-chip chip-warn">Deprecated</span>}
              {model?.availability === "catalog_only" && <span className="limit-chip chip-warn">Catalog only</span>}
              {!model?.referenceImage && <span className="limit-chip chip-neutral">No reference image</span>}
              {!model?.editing && <span className="limit-chip chip-neutral">No image editing</span>}
              {!model?.seed && <span className="limit-chip chip-neutral">No seed control</span>}
              {model?.lora && <span className="limit-chip chip-good">LoRA support</span>}
              {(model?.resolutions || []).some((r) => r !== "provider-defined") && (
                <span className="limit-chip chip-neutral">Res: {(model.resolutions || []).filter((r) => r !== "provider-defined").join(", ")}</span>
              )}
              {(model?.aspectRatios || []).some((r) => r !== "provider-defined") && (
                <span className="limit-chip chip-neutral">Ratios: {(model.aspectRatios || []).filter((r) => r !== "provider-defined").join(", ")}</span>
              )}
              {(model?.supportedInputs || []).length > 1 && (
                <span className="limit-chip chip-good">Inputs: {model.supportedInputs.join(", ")}</span>
              )}
            </div>
          </div>
        </div>

        {/* Camera / Shot Type Selection (iPhone vs DSLR vs Film) */}
        {type === "image" && (
          <div className="camera-style-section">
            <div className="camera-style-head">
              <div>
                <h3>Camera & Photography Aesthetic</h3>
                <p>Choose your desired optics: smartphone snapshot (iPhone), professional DSLR studio, or 35mm film.</p>
              </div>
              <span className="badge good">{CAMERA_STYLES[form.cameraStyle || "iphone_candid"]?.badge || "Smartphone Realism"}</span>
            </div>

            <div className="camera-style-grid">
              {Object.values(CAMERA_STYLES).map((style) => (
                <button
                  key={style.id}
                  type="button"
                  className={`camera-style-card ${(form.cameraStyle || "iphone_candid") === style.id ? "selected" : ""}`}
                  onClick={() => update(type, { cameraStyle: style.id })}
                >
                  <strong className="camera-style-name">{style.label}</strong>
                  <small className="camera-style-desc">{style.desc}</small>
                </button>
              ))}
            </div>

            <div className="camera-style-directive-box">
              <span className="directive-tag">Active Camera Directive:</span>
              <p>{CAMERA_STYLES[form.cameraStyle || "iphone_candid"]?.directive || "Standard prompt without camera styling."}</p>
            </div>
          </div>
        )}

        {type === "image" && character?.identity?.referenceImages?.length > 0 && (
          <div className={`identity-model-status ${model?.referenceImage ? "ready" : "limited"}`}>
            {model?.referenceImage
              ? "✓ Multi-angle face references and visual conditioning will be injected into this generation."
              : "ℹ️ Selected model is text-only. Choose a model marked reference_image for direct visual conditioning."}
          </div>
        )}

        {/* Visual Conditioning for Surrounding Scene & Dress */}
        {type === "image" && (
          <div className="conditioning-section">
            <div className="conditioning-header">
              <div>
                <h3>Visual Conditioning: Environment & Wardrobe</h3>
                <p>Provide surrounding and dress references so the generated influencer appears in that exact setting and outfit.</p>
              </div>
              <div className="conditioning-pills">
                {form.surroundingImage && <span className="badge good">🏛️ Scene Attached</span>}
                {form.dressImage && <span className="badge good">👗 Outfit Attached</span>}
              </div>
            </div>

            <div className="grid two conditioning-cards">
              {/* Surrounding / Environment Reference */}
              <div className="conditioning-card">
                <div className="conditioning-card-head">
                  <span className="card-icon">🏛️</span>
                  <div>
                    <strong>Surrounding / Scene Reference</strong>
                    <small>Sets background atmosphere & lighting</small>
                  </div>
                </div>

                {form.surroundingImage ? (
                  <div className="conditioning-preview-box">
                    <img
                      src={form.surroundingImage}
                      alt="Surrounding environment"
                      onClick={() => onPreviewImage(form.surroundingImage, "Surrounding Scene Reference")}
                    />
                    <div className="preview-controls">
                      <button type="button" className="small-action" onClick={() => onPreviewImage(form.surroundingImage, "Surrounding Scene Reference")}>
                        Enlarge
                      </button>
                      <button type="button" className="small-action remove" onClick={() => update(type, { surroundingImage: "" })}>
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="conditioning-upload-zone">
                    <label className="upload-btn-secondary">
                      <span>Upload scene image</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const dataUrl = await readImageAsDataUrl(file);
                            update(type, { surroundingImage: dataUrl });
                          }
                        }}
                      />
                    </label>
                    <input
                      type="url"
                      placeholder="or paste scene URL"
                      value={form.surroundingImage || ""}
                      onChange={(e) => update(type, { surroundingImage: e.target.value })}
                    />
                  </div>
                )}

                <input
                  placeholder="Scene notes (optional, e.g. luxury cafe, rainy window, soft sunset)"
                  value={form.surroundingPrompt || ""}
                  onChange={(e) => update(type, { surroundingPrompt: e.target.value })}
                />
              </div>

              {/* Dress / Outfit Reference */}
              <div className="conditioning-card">
                <div className="conditioning-card-head">
                  <span className="card-icon">👗</span>
                  <div>
                    <strong>Dress / Wardrobe Reference</strong>
                    <small>Sets exact outfit, fabric & style</small>
                  </div>
                </div>

                {form.dressImage ? (
                  <div className="conditioning-preview-box">
                    <img
                      src={form.dressImage}
                      alt="Dress and outfit"
                      onClick={() => onPreviewImage(form.dressImage, "Wardrobe Reference")}
                    />
                    <div className="preview-controls">
                      <button type="button" className="small-action" onClick={() => onPreviewImage(form.dressImage, "Wardrobe Reference")}>
                        Enlarge
                      </button>
                      <button type="button" className="small-action remove" onClick={() => update(type, { dressImage: "" })}>
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="conditioning-upload-zone">
                    <label className="upload-btn-secondary">
                      <span>Upload outfit image</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const dataUrl = await readImageAsDataUrl(file);
                            update(type, { dressImage: dataUrl });
                          }
                        }}
                      />
                    </label>
                    <input
                      type="url"
                      placeholder="or paste outfit URL"
                      value={form.dressImage || ""}
                      onChange={(e) => update(type, { dressImage: e.target.value })}
                    />
                  </div>
                )}

                <input
                  placeholder="Wardrobe notes (optional, e.g. emerald silk evening gown, tailored blazer)"
                  value={form.dressPrompt || ""}
                  onChange={(e) => update(type, { dressPrompt: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}

        {type === "video" && caps.has("image_to_video") && (
          <label>
            Source image URL
            <input value={form.sourceImage || ""} onChange={(e) => update(type, { sourceImage: e.target.value })} />
          </label>
        )}

        <label>
          Prompt
          <textarea
            rows={4}
            value={form.prompt || ""}
            onChange={(e) => update(type, { prompt: e.target.value })}
            placeholder="Describe the action, composition, camera shot, and expression..."
          />
        </label>

        {caps.has("negative_prompt") && (
          <label>
            Negative prompt
            <textarea
              rows={2}
              value={form.negativePrompt || ""}
              onChange={(e) => update(type, { negativePrompt: e.target.value })}
            />
          </label>
        )}

        <div className="grid three">
          <label>
            Aspect ratio
            <Select
              value={form.aspectRatio || model?.aspectRatios?.[0] || ""}
              onChange={(value) => update(type, { aspectRatio: value })}
              options={(model?.aspectRatios || ["provider-defined"]).map((item) => [item, item])}
            />
          </label>
          <label>
            Resolution
            <Select
              value={form.resolution || model?.resolutions?.[0] || ""}
              onChange={(value) => update(type, { resolution: value })}
              options={(model?.resolutions || ["provider-defined"]).map((item) => [item, item])}
            />
          </label>
          <label>
            {type === "image" ? "Images count" : "Duration (s)"}
            <input
              type="number"
              min="1"
              value={type === "image" ? form.count || 1 : form.duration || 5}
              onChange={(e) => update(type, type === "image" ? { count: e.target.value } : { duration: e.target.value })}
            />
          </label>
        </div>

        {caps.has("seed") && (
          <label>
            Seed
            <input type="number" value={form.seed || ""} onChange={(e) => update(type, { seed: e.target.value })} />
          </label>
        )}

        {!isImplemented ? (
          <div className="generate-blocked-notice">
            🔒 <strong>{providerInfo.name || provider}</strong> adapter is coming soon — generation is not available yet for this provider.
          </div>
        ) : !isConnected ? (
          <div className="generate-blocked-notice warn">
            ⚠️ No API key configured for <strong>{providerInfo.name}</strong>. Go to <strong>Settings</strong> to add your key, then return here to generate.
          </div>
        ) : (
          <button className="primary generate-btn">
            {type === "image" ? "✨ Synthesize Image" : "🎬 Generate Video"}
          </button>
        )}
      </form>

      <OutputList
        jobs={state.jobs.filter((job) => job.type === type)}
        models={state.models}
        onPreviewImage={onPreviewImage}
      />
    </section>
  );
}

function ComparePanel({ state, form, update, onSubmit, onPreviewImage }) {
  const models = state.models.filter((model) => model.type === form.type && model.executable);
  const character = state.characters.find((item) => item.id === form.character) || state.characters[0];

  return (
    <>
      <form className="panel wide" onSubmit={onSubmit}>
        <div className="panel-head">
          <div>
            <h2>Multi-Model Comparison</h2>
            <p className="panel-subhead">Benchmark how different diffusion & neural models execute the same identity, camera style, and scene.</p>
          </div>
          <Select
            value={form.type}
            onChange={(value) => update("compare", { type: value, modelIds: [] })}
            options={[["image", "Image models"], ["video", "Video models"]]}
          />
        </div>

        <label>
          Character Profile
          <Select value={form.character} onChange={(value) => update("compare", { character: value })} options={state.characters.map((item) => [item.id, item.name])} />
        </label>

        <IdentityChip character={character} />

        {form.type === "image" && (
          <label>
            Camera & Shot Aesthetic
            <Select
              value={form.cameraStyle || "iphone_candid"}
              onChange={(value) => update("compare", { cameraStyle: value })}
              options={Object.values(CAMERA_STYLES).map((s) => [s.id, s.label])}
            />
          </label>
        )}

        <label>
          Shared prompt
          <textarea rows={4} value={form.prompt || ""} onChange={(e) => update("compare", { prompt: e.target.value })} />
        </label>

        <div className="model-checks">
          {models.map((model) => (
            <label className="check-card" key={model.id}>
              <span>
                <input
                  type="checkbox"
                  checked={form.modelIds.includes(model.id)}
                  onChange={(e) => update("compare", {
                    modelIds: e.target.checked ? [...form.modelIds, model.id] : form.modelIds.filter((id) => id !== model.id)
                  })}
                />
                {model.displayName}
              </span>
              <small>{model.providerName} · {model.providerConfigured ? "Ready" : "Unconfigured"}</small>
            </label>
          ))}
        </div>

        <button className="primary">Run Side-by-Side Comparison</button>
      </form>

      <OutputList jobs={state.jobs.slice(0, 8)} models={state.models} grid onPreviewImage={onPreviewImage} />
    </>
  );
}

function CatalogPanel({ models, toggleFavorite, addCustomModel }) {
  const [type, setType] = useState("image");
  const [pricing, setPricing] = useState("all");
  const [provider, setProvider] = useState("all");

  const availableModels = models.filter((model) => (
    model.type === type &&
    (pricing === "all" || model.pricing === pricing) &&
    (provider === "all" || model.provider === provider)
  ));
  const providers = [...new Map(models.filter((model) => model.type === type).map((model) => [model.provider, model.providerName])).entries()];

  return (
    <>
      <section className="panel wide">
        <div className="panel-head">
          <div>
            <h2>Model Catalog & Capabilities</h2>
            <p className="catalog-note">Verified foundation architectures categorized by photography style, reference capability, and hosted status.</p>
          </div>
          <span className="status-pill">{availableModels.length} models</span>
        </div>
        <div className="catalog-controls">
          <div className="catalog-tabs">
            <button type="button" className={type === "image" ? "selected" : ""} onClick={() => setType("image")}>Image Models</button>
            <button type="button" className={type === "video" ? "selected" : ""} onClick={() => setType("video")}>Video Models</button>
          </div>
          <div className="catalog-tabs">
            <button type="button" className={pricing === "all" ? "selected" : ""} onClick={() => setPricing("all")}>All pricing</button>
            <button type="button" className={pricing === "free_self_hosted" ? "selected" : ""} onClick={() => setPricing("free_self_hosted")}>Free self-hosted</button>
            <button type="button" className={pricing === "paid_api" ? "selected" : ""} onClick={() => setPricing("paid_api")}>Hosted API</button>
          </div>
          <select aria-label="Filter catalog by provider" value={provider} onChange={(event) => setProvider(event.target.value)}>
            <option value="all">All providers</option>
            {providers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
        <div className="catalog">{availableModels.map((model) => <ModelCard key={model.id} model={model} toggleFavorite={toggleFavorite} />)}</div>
      </section>

      <form className="panel wide" onSubmit={addCustomModel}>
        <h2>Register Custom Model Endpoint</h2>
        <div className="grid three">
          <label>Provider<input name="provider" placeholder="fal" /></label>
          <label>Model ID<input name="modelId" placeholder="provider/model-id" /></label>
          <label>Display name<input name="displayName" placeholder="New model" /></label>
        </div>
        <div className="grid three">
          <label>Type<select name="type"><option>image</option><option>video</option></select></label>
          <label>Endpoint URL<input name="endpoint" placeholder="Optional custom endpoint" /></label>
          <label>Version<input name="version" placeholder="Optional version tag" /></label>
        </div>
        <label>Pricing<select name="pricing"><option value="paid_api">Hosted API</option><option value="free_self_hosted">Free self-hosted</option></select></label>
        <label>Capabilities (comma separated)<input name="capabilities" placeholder="iphone_candid,cinematic_dslr,reference_image,seed" /></label>
        <button className="primary">Register Model</button>
      </form>
    </>
  );
}

function SettingsPanel({ providers, saveProvider, removeProvider, viewProvider }) {
  return (
    <section className="panel wide">
      <div className="panel-head">
        <div>
          <h2>Provider Credentials & API Vault</h2>
          <p className="panel-note">API keys are stored securely with AES-256 encryption in your private studio storage. Saved credentials take priority for all generation tasks.</p>
        </div>
      </div>
      <div className="providers">
        {Object.values(providers).map((provider) => (
          <form className="provider-row" key={provider.id} onSubmit={(event) => saveProvider(event, provider.id)}>
            <div className="provider-info">
              <strong>{provider.name}</strong>
              <small className="provider-sub">Cloud API Integration</small>
            </div>
            <span className={`badge ${provider.connected ? "good" : "warn"}`}>{provider.connected ? "Connected" : "Not configured"}</span>
            <span className="badge">{provider.implemented ? "Adapter ready" : "Catalog only"}</span>
            <small className="credential-source">
              {provider.source === "environment variable" ? "System preset configured" : provider.source === "encrypted database credential" ? "Stored in studio vault" : "No key configured"}
              {provider.masked ? ` · ${provider.masked}` : ""}
            </small>
            <ApiKeyInput providerId={provider.id} placeholder={provider.masked || "Paste API key"} viewProvider={viewProvider} />
            <label className="toggle-label"><input type="checkbox" name="enabled" defaultChecked={provider.enabled} /> Active</label>
            <button className="save-btn">Save</button>
            {provider.source === "encrypted database credential" && (
              <button type="button" className="remove-btn" onClick={() => removeProvider(provider.id)}>Remove</button>
            )}
          </form>
        ))}
      </div>
    </section>
  );
}

function ApiKeyInput({ providerId, placeholder, viewProvider }) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);

  async function toggleVisibility() {
    if (visible) {
      setVisible(false);
      return;
    }
    setLoading(true);
    try {
      const apiKey = await viewProvider(providerId);
      setValue(apiKey);
      setVisible(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="secret-input">
      <input
        type={visible ? "text" : "password"}
        name="apiKey"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      <button
        type="button"
        className="secret-toggle"
        onClick={toggleVisibility}
        disabled={loading}
        aria-label={visible ? "Hide API key" : "View API key"}
        title={visible ? "Hide API key" : "View API key"}
      >
        {loading ? "..." : visible ? "👁️" : "◉"}
      </button>
    </div>
  );
}

function HistoryPanel({ generations, onPreviewImage }) {
  return (
    <section className="panel wide">
      <div className="panel-head">
        <div>
          <h2>Generation History & Output Vault</h2>
          <p className="panel-subhead">Permanent log of all generated influencer portraits, camera aesthetics, seeds, and conditioning references.</p>
        </div>
        <span className="status-pill">{generations.length} records</span>
      </div>
      <div className="history">
        {generations.length ? (
          generations.map((generation) => {
            const image = generation.output?.data?.[0]?.url;
            const cameraStyle = generation.parameters?.cameraStyle;
            return (
              <article className="history-row" key={generation.id}>
                <div className="history-main">
                  <strong>{generation.character} · {generation.provider} · {generation.model}</strong>
                  <div className="meta">{new Date(generation.timestamp).toLocaleString()} · seed {generation.seed || "not set"}</div>
                  <p>{generation.prompt}</p>
                  <div className="history-conditioning">
                    {cameraStyle && CAMERA_STYLES[cameraStyle] && (
                      <span className="badge camera-badge">{CAMERA_STYLES[cameraStyle].label}</span>
                    )}
                    {generation.parameters?.surroundingImage && <span className="badge good">🏛️ Surrounding Ref</span>}
                    {generation.parameters?.dressImage && <span className="badge good">👗 Dress Ref</span>}
                  </div>
                </div>
                {image && (
                  <div className="history-thumb" onClick={() => onPreviewImage && onPreviewImage(image, generation.prompt)}>
                    <img src={image} alt="Generated output" />
                    <span className="thumb-zoom">🔍</span>
                  </div>
                )}
              </article>
            );
          })
        ) : (
          <p className="empty-notice">No completed generations yet. Synthesize your first image in the Image tab.</p>
        )}
      </div>
    </section>
  );
}

function ModelCard({ model, toggleFavorite }) {
  return (
    <article className="model-card">
      <div>
        <strong>
          {model.displayName}
          {model.pricing === "free_self_hosted" && <span className="badge good free-badge">Free</span>}
        </strong>
        <small>{model.providerName} · {model.modelId} · {model.type} · {model.availability}</small>
        <BadgeList
          items={[
            model.pricing === "free_self_hosted" ? "free self-hosted" : "hosted API",
            ...(model.capabilities || []),
            model.executable ? "generation ready" : "catalog only",
            model.providerConfigured ? "configured" : "Not configured",
            ...(model.providerImplemented ? [] : ["adapter pending"])
          ]}
        />
      </div>
      <div className="actions">
        <button onClick={() => toggleFavorite(model)}>{model.favorite ? "Unfavorite" : "Favorite"}</button>
        <a href={model.docs || "#"} target="_blank" rel="noreferrer">
          <button type="button">Docs</button>
        </a>
      </div>
    </article>
  );
}

function OutputList({ jobs, models, grid = false, onPreviewImage }) {
  return (
    <section className={grid ? "comparison-grid" : "output"}>
      {jobs.slice(0, 8).map((job) => {
        const model = models.find((item) => item.id === job.modelId);
        const image = job.output?.data?.[0]?.url || (job.output?.data?.[0]?.b64_json && `data:${job.output?.data?.[0]?.content_type || "image/png"};base64,${job.output.data[0].b64_json}`);
        const hasSurrounding = Boolean(job.input?.surroundingImage);
        const hasDress = Boolean(job.input?.dressImage);
        const cameraStyle = job.input?.cameraStyle;

        return (
          <article className={`output-card ${job.status}`} key={job.id}>
            <div className="output-card-head">
              <strong>{model?.displayName || job.modelId}</strong>
              <span className={`output-status ${job.status}`}>
                {job.status === "processing" ? "⚡ Processing..." : job.status === "completed" ? "✓ Finished" : "✕ Failed"}
              </span>
            </div>

            <div className="meta">{model?.providerName || job.provider} · {new Date(job.createdAt).toLocaleTimeString()}</div>

            {job.status === "processing" && (
              <div className="processing-skeleton">
                <div className="processing-spinner"></div>
                <p>Synthesizing portrait with multi-angle identity and camera conditioning...</p>
              </div>
            )}

            {image && (
              <>
                <div className="output-image-wrap" onClick={() => onPreviewImage && onPreviewImage(image, `Generated by ${model?.displayName || job.modelId}`)}>
                  <img className="generated-image" src={image} alt={`Generated by ${model?.displayName || job.modelId}`} />
                  <span className="image-zoom-overlay">🔍 Click to zoom</span>
                </div>

                <div className="output-conditioning-badges">
                  {cameraStyle && CAMERA_STYLES[cameraStyle] && (
                    <span className="badge camera-badge">{CAMERA_STYLES[cameraStyle].label}</span>
                  )}
                  {hasSurrounding && <span className="badge good">🏛️ Scene conditioning applied</span>}
                  {hasDress && <span className="badge good">👗 Wardrobe conditioning applied</span>}
                </div>

                <div className="actions output-actions">
                  <a
                    className="download-button"
                    href={image.includes("?") ? `${image}&download=1` : `${image}?download=1`}
                    download={`${slugify(model?.displayName || "ai-identity")}-${job.id}.png`}
                  >
                    Save Image
                  </a>
                  <button type="button" onClick={() => onPreviewImage && onPreviewImage(image, `Generated by ${model?.displayName || job.modelId}`)}>
                    Enlarge
                  </button>
                </div>
              </>
            )}

            {!image && job.status !== "processing" && (
              <p className="job-error-msg">{job.error || "Waiting for provider result."}</p>
            )}

            {job.input?.identityPack?.faceCut && (
              <div className="meta identity-snippet">
                Face Cut: {job.input.identityPack.faceCut.slice(0, 90)}...
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

function IdentityChip({ character }) {
  const identity = character?.identity || {};
  const refs = identity.referenceImages?.length || 0;
  const anglesCount = identity.angles ? Object.values(identity.angles).filter(Boolean).length : 0;

  return (
    <div className="identity-chip">
      <div className="chip-head">
        <strong>{character?.name || "Character"} Identity Pack</strong>
        <span className="angles-pill">{anglesCount}/4 Angles Mapped</span>
      </div>
      <span>{identity.faceCut || "No face cut profile configured yet."}</span>
      <small>{refs} total reference images · Lock strength {identity.identityLockStrength ?? 0.75}</small>
    </div>
  );
}

function BadgeList({ items }) {
  return (
    <div className="badge-list">
      {items.map((item) => (
        <span
          key={item}
          className={`badge ${
            String(item).includes("Not") || String(item).includes("pending")
              ? "warn"
              : String(item).includes("free") || String(item).includes("candid")
              ? "good"
              : ""
          }`}
        >
          {formatCapabilityBadge(item)}
        </span>
      ))}
    </div>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
      {options.map(([optionValue, label]) => (
        <option key={optionValue} value={optionValue}>{label}</option>
      ))}
    </select>
  );
}

function modelLabel(model) {
  return `${model.favorite ? "★ " : ""}${model.pricing === "free_self_hosted" ? "Free - " : ""}${model.displayName}${model.providerConfigured ? "" : " (Unconfigured)"}${model.providerImplemented ? "" : " (Adapter pending)"}`;
}

function ImageModal({ image, title, onClose }) {
  if (!image) return null;
  return (
    <div className="image-modal-backdrop" onClick={onClose}>
      <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="image-modal-header">
          <strong>{title || "Image Preview"}</strong>
          <button type="button" className="modal-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="image-modal-body">
          <img src={image} alt={title || "Preview"} />
        </div>
        <div className="image-modal-footer">
          <a
            className="download-button"
            href={image.includes("?") ? `${image}&download=1` : `${image}?download=1`}
            download="ai-studio-export.png"
          >
            Download High-Res
          </a>
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
