"use client";

import { useEffect, useRef, useState } from "react";

const tabs = ["identity", "image", "video", "compare", "catalog", "settings", "history"];
const appName = "AI Identity Studio";

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const body = await response.text();
  let data;
  try { data = body ? JSON.parse(body) : {}; } catch { throw new Error(`Server returned an invalid response (${response.status}).`); }
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
  const [forms, setForms] = useState({
    image: { character: "ayra", prompt: "Ayra sitting in a premium cafe in Dhaka, natural window light, elegant modest fashion, realistic social media portrait", negativePrompt: "blur, distorted face, low quality", count: 1 },
    video: { character: "ayra", prompt: "Ayra slowly turns toward the camera, subtle smile, realistic handheld cinematic motion", duration: 5 },
    compare: { character: "ayra", type: "image", prompt: "Ayra in a premium cafe in Dhaka, same identity, realistic portrait, soft daylight", modelIds: [] }
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
    return () => { mounted = false; };
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

  async function saveIdentity(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    const uploads = [...event.currentTarget.elements.faceReferences.files || []];
    const uploadedReferences = await Promise.all(uploads.map(readImageAsDataUrl));
    const savedReferences = character()?.identity?.referenceImages || [];
    const characterId = slugify(data.name || "ai-influencer");
    const result = await api("/api/characters", {
      method: "POST",
      body: JSON.stringify({
        id: characterId,
        name: data.name || "AI Influencer",
        identity: {
          faceCut: data.faceCut,
          anchorPrompt: data.anchorPrompt,
          referenceImages: [...new Set([...data.referenceImages.split(/\n+/).map((line) => line.trim()).filter(Boolean), ...savedReferences, ...uploadedReferences])],
          identityLocked: true,
          identityLockStrength: Number(data.identityLockStrength || 0.75),
          negativeIdentityPrompt: data.negativeIdentityPrompt,
          notes: data.notes
        }
      })
    });
    setAuthStatus(result.supabase?.mirrored ? "Identity saved and mirrored to Supabase." : "Identity saved locally.");
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
    const result = await api("/api/jobs", { method: "POST", body: JSON.stringify({ type, modelId: payload.modelId, provider: model?.provider, input: payload }) });
    setAuthStatus("Generating image.");
    void pollJobs([result.job.id]);
  }

  async function submitComparison(event) {
    event.preventDefault();
    const input = normalizeGenerationForm(forms.compare);
    const result = await api("/api/comparisons", { method: "POST", body: JSON.stringify({ type: forms.compare.type, modelIds: forms.compare.modelIds, input }) });
    setAuthStatus("Generating comparison.");
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
    setAuthStatus("Generation is still running. It will remain in your history.");
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
    return <div className="login-shell"><div className="login-card"><span className="brand-mark">AI</span><h1>{appName}</h1><p>Checking your studio session.</p></div></div>;
  }

  if (!authUser) {
    return <LoginScreen status={authStatus} onSubmit={submitAuth} />;
  }

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand"><span className="brand-mark">AI</span><span>{appName}</span></div>
        <div className="rail-signal">
          <span>Live identity system</span>
          <strong>{state.characters.length || 1} influencer profile{(state.characters.length || 1) === 1 ? "" : "s"}</strong>
        </div>
        <div className={`nav-scroll ${navScrollable ? "has-overflow" : ""}`}>
          <nav ref={navRef} aria-label="Studio sections">{tabs.map((tab) => <button key={tab} className={`nav ${active === tab ? "active" : ""}`} onClick={() => setActive(tab)}>{tab}</button>)}</nav>
          <span className="nav-scroll-cue" aria-hidden="true">›</span>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <h1>{appName}</h1>
            <p>Set your AI influencer name, identity pack, generation models, provider credentials, and output history.</p>
          </div>
          <div className="session-card">
            <div><strong>{authUser.companyName || "Studio workspace"}</strong><span>{authUser.email} - {authStatus}</span></div>
            <button onClick={logout}>Logout</button>
          </div>
        </header>
        <section className="studio-metrics">
          <article><span>Configured providers</span><strong>{connectedCount}</strong></article>
          <article><span>Generation jobs</span><strong>{state.jobs.length}</strong></article>
          <article><span>Saved outputs</span><strong>{state.generations.length}</strong></article>
        </section>

        {active === "identity" && <IdentityPanel characters={state.characters} activeCharacterId={activeCharacterId} setActiveCharacterId={chooseCharacter} character={character()} connectedCount={connectedCount} draft={identityDraft} onSubmit={saveIdentity} />}
        {active === "image" && <GenerationPanel type="image" state={state} form={forms.image} update={updateForm} onSubmit={submitGeneration} />}
        {active === "video" && <GenerationPanel type="video" state={state} form={forms.video} update={updateForm} onSubmit={submitGeneration} />}
        {active === "compare" && <ComparePanel state={state} form={forms.compare} update={updateForm} onSubmit={submitComparison} />}
        {active === "catalog" && <CatalogPanel models={state.models} toggleFavorite={toggleFavorite} addCustomModel={addCustomModel} />}
        {active === "settings" && <SettingsPanel providers={state.providers} saveProvider={saveProvider} removeProvider={removeProvider} viewProvider={viewProvider} />}
        {active === "history" && <HistoryPanel generations={state.generations} />}
      </main>
    </div>
  );
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "ai-influencer";
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
            <p>Identity engine</p>
            <h1>{appName}</h1>
          </div>
          <div className="signal-stack">
            <span>Face lock</span>
            <span>Prompt memory</span>
            <span>Model routing</span>
          </div>
        </div>
        <form className={`login-card ${isSignup ? "signup-mode" : "login-mode"}`} onSubmit={onSubmit}>
          <div className="auth-switch" aria-label="Authentication mode">
            <button type="button" className={!isSignup ? "active" : ""} onClick={() => setMode("login")}>Login</button>
            <button type="button" className={isSignup ? "active" : ""} onClick={() => setMode("signup")}>Sign up</button>
          </div>
          <div className="auth-copy" key={mode}>
            <h1>{isSignup ? "Create your studio" : "Welcome back"}</h1>
            <p>{isSignup ? "Start with your company workspace and first AI identity system." : "Login to shape, lock, and generate your influencer identity."}</p>
          </div>
          <div className="auth-fields" key={`${mode}-fields`}>
            <label>Email<input name="email" type="email" placeholder="you@example.com" required /></label>
            {isSignup && <label>Company name<input name="companyName" placeholder="Your company" required /></label>}
            <label>Password<input name="password" type="password" placeholder="Password" required /></label>
          </div>
          <div className="login-actions">
            <button className="primary" data-auth={isSignup ? "signup" : "login"}>{isSignup ? "Create account" : "Login"}</button>
          </div>
          <span className="auth-note">{status}</span>
        </form>
      </section>
    </main>
  );
}
function normalizeGenerationForm(form) {
  return {
    ...form,
    referenceImages: (form.referenceImages || "").split(/\n+/).map((line) => line.trim()).filter(Boolean)
  };
}

function readImageAsDataUrl(file) {
  if (!file || !file.size) return Promise.resolve("");
  if (file.size > 4 * 1024 * 1024) return Promise.reject(new Error("Each face reference image must be 4 MB or smaller."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the face reference image."));
    reader.readAsDataURL(file);
  });
}

function IdentityPanel({ characters, activeCharacterId, setActiveCharacterId, character, connectedCount, draft, onSubmit }) {
  const identity = draft || character?.identity || {};
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => setUnlocked(false), [character?.id]);
  const locked = identity.identityLocked !== false && !unlocked;
  const previewReferences = [...new Set((identity.referenceImages || []).filter((item) => item.startsWith("data:image/") || item.startsWith("/api/media/")))];
  return (
    <section className="identity-layout">
      <form className="panel identity-panel" onSubmit={onSubmit} key={character?.id || "new-character"}>
        <div className="panel-head"><h2>AI Influencer Identity Pack</h2><span className="status-pill">{locked ? "Identity locked" : `${connectedCount} configured providers`}</span></div>
        {characters.length > 1 && <label>Saved influencer<Select value={activeCharacterId} onChange={setActiveCharacterId} options={characters.map((item) => [item.id, item.name])} /></label>}
        <label>AI influencer name<input name="name" disabled={locked} defaultValue={character?.name || "AI Influencer"} /></label>
        <label>Face cut / facial structure<textarea name="faceCut" disabled={locked} rows={4} defaultValue={identity.faceCut || ""} /></label>
        <label>Identity anchor prompt<textarea name="anchorPrompt" disabled={locked} rows={3} defaultValue={identity.anchorPrompt || ""} /></label>
        <label>Approved face reference URLs<textarea name="referenceImages" disabled={locked} rows={5} defaultValue={(identity.referenceImages || []).filter((item) => !item.startsWith("data:") && !item.startsWith("/api/media/")).join("\n")} /></label>
        <label>Upload face reference<input name="faceReferences" disabled={locked} type="file" accept="image/png,image/jpeg,image/webp" multiple /></label>
        {previewReferences.length > 0 && <div className="reference-previews">{previewReferences.map((item, index) => <img key={`face-reference-${index}`} src={item} alt={`Approved face reference ${index + 1}`} />)}</div>}
        <div className="grid two">
          <label>Identity lock strength<input name="identityLockStrength" disabled={locked} type="range" min="0" max="1" step="0.05" defaultValue={identity.identityLockStrength ?? 0.75} /></label>
          <label>Negative identity prompt<input name="negativeIdentityPrompt" disabled={locked} defaultValue={identity.negativeIdentityPrompt || ""} /></label>
        </div>
        <label>Notes<textarea name="notes" disabled={locked} rows={3} defaultValue={identity.notes || ""} /></label>
        {locked ? <button type="button" onClick={() => setUnlocked(true)}>Unlock Identity</button> : <button className="primary">Lock and Save Identity</button>}
      </form>
      <section className="studio-brief">
        <div>
          <span>Identity-first workflow</span>
          <h2>Your influencer's face-cut consistency is stored as reusable character data.</h2>
          <p>Every image, video, and comparison job receives the saved face-cut description, approved references, identity strength, and negative identity prompt.</p>
        </div>
      </section>
    </section>
  );
}

function GenerationPanel({ type, state, form, update, onSubmit }) {
  const models = state.models.filter((model) => model.type === type && model.executable);
  const providers = [...new Set(models.map((model) => model.provider))];
  const provider = form.provider || providers[0] || "";
  const providerModels = models.filter((model) => model.provider === provider);
  const model = state.models.find((item) => item.id === form.modelId) || providerModels[0];
  const character = state.characters.find((item) => item.id === form.character) || state.characters[0];
  const caps = new Set(model?.capabilities || []);

  useEffect(() => {
    if (!form.provider && providers[0]) update(type, { provider: providers[0], modelId: providerModels[0]?.id });
  }, [providers.join("|")]);

  return (
    <section className="workspace">
      <form className="panel" onSubmit={(event) => onSubmit(type, event)}>
        <div className="panel-head"><h2>{type === "image" ? "Image Generation" : "Video Generation"}</h2><BadgeList items={(model?.capabilities || []).slice(0, 4)} /></div>
        <label>Character<Select value={form.character || "ayra"} onChange={(value) => update(type, { character: value })} options={state.characters.map((item) => [item.id, item.name])} /></label>
        <IdentityChip character={character} />
        <div className="grid two">
          <label>Provider<Select value={provider} onChange={(value) => update(type, { provider: value, modelId: models.find((item) => item.provider === value)?.id })} options={providers.map((item) => [item, state.providers[item]?.name || item])} /></label>
          <label>Model<Select value={model?.id || ""} onChange={(value) => update(type, { modelId: value })} options={providerModels.map((item) => [item.id, modelLabel(item)])} /></label>
        </div>
        {type === "image" && character?.identity?.referenceImages?.length > 0 && <div className={`identity-model-status ${model?.referenceImage ? "ready" : "limited"}`}>{model?.referenceImage ? "Face reference will be sent with this generation." : "This model is text-only. Choose a model marked reference_image to use the saved face."}</div>}
        {type === "video" && caps.has("image_to_video") && <label>Source image URL<input value={form.sourceImage || ""} onChange={(e) => update(type, { sourceImage: e.target.value })} /></label>}
        <label>Prompt<textarea rows={5} value={form.prompt || ""} onChange={(e) => update(type, { prompt: e.target.value })} /></label>
        {caps.has("negative_prompt") && <label>Negative prompt<textarea rows={2} value={form.negativePrompt || ""} onChange={(e) => update(type, { negativePrompt: e.target.value })} /></label>}
        <label>Reference image URLs<textarea rows={2} value={form.referenceImages || ""} onChange={(e) => update(type, { referenceImages: e.target.value })} /></label>
        <div className="grid three">
          <label>Aspect ratio<Select value={form.aspectRatio || model?.aspectRatios?.[0] || ""} onChange={(value) => update(type, { aspectRatio: value })} options={(model?.aspectRatios || ["provider-defined"]).map((item) => [item, item])} /></label>
          <label>Resolution<Select value={form.resolution || model?.resolutions?.[0] || ""} onChange={(value) => update(type, { resolution: value })} options={(model?.resolutions || ["provider-defined"]).map((item) => [item, item])} /></label>
          <label>{type === "image" ? "Images" : "Duration"}<input type="number" min="1" value={type === "image" ? form.count || 1 : form.duration || 5} onChange={(e) => update(type, type === "image" ? { count: e.target.value } : { duration: e.target.value })} /></label>
        </div>
        {caps.has("seed") && <label>Seed<input type="number" value={form.seed || ""} onChange={(e) => update(type, { seed: e.target.value })} /></label>}
        <button className="primary">{type === "image" ? "Generate Image" : "Generate Video"}</button>
      </form>
      <OutputList jobs={state.jobs.filter((job) => job.type === type)} models={state.models} />
    </section>
  );
}

function ComparePanel({ state, form, update, onSubmit }) {
  const models = state.models.filter((model) => model.type === form.type && model.executable);
  const character = state.characters.find((item) => item.id === form.character) || state.characters[0];
  return (
    <>
      <form className="panel wide" onSubmit={onSubmit}>
        <div className="panel-head"><h2>Model Comparison</h2><Select value={form.type} onChange={(value) => update("compare", { type: value, modelIds: [] })} options={[["image", "Image models"], ["video", "Video models"]]} /></div>
        <label>Character<Select value={form.character} onChange={(value) => update("compare", { character: value })} options={state.characters.map((item) => [item.id, item.name])} /></label>
        <IdentityChip character={character} />
        <label>Shared prompt<textarea rows={4} value={form.prompt || ""} onChange={(e) => update("compare", { prompt: e.target.value })} /></label>
        <label>Shared references<textarea rows={2} value={form.referenceImages || ""} onChange={(e) => update("compare", { referenceImages: e.target.value })} /></label>
        <div className="model-checks">{models.map((model) => (
          <label className="check-card" key={model.id}>
            <span><input type="checkbox" checked={form.modelIds.includes(model.id)} onChange={(e) => update("compare", { modelIds: e.target.checked ? [...form.modelIds, model.id] : form.modelIds.filter((id) => id !== model.id) })} />{model.displayName}</span>
            <small>{model.providerName} - {model.providerConfigured ? "Configured" : "Not configured"} - {model.availability}</small>
          </label>
        ))}</div>
        <button className="primary">Generate Comparison</button>
      </form>
      <OutputList jobs={state.jobs.slice(0, 8)} models={state.models} grid />
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
        <div className="panel-head"><div><h2>Model Catalog</h2><p className="catalog-note">Open-weight models are free to self-host. Hosted APIs are shown separately so costs stay clear.</p></div><span className="status-pill">{availableModels.length} models</span></div>
        <div className="catalog-controls">
          <div className="catalog-tabs"><button type="button" className={type === "image" ? "selected" : ""} onClick={() => setType("image")}>Image</button><button type="button" className={type === "video" ? "selected" : ""} onClick={() => setType("video")}>Video</button></div>
          <div className="catalog-tabs"><button type="button" className={pricing === "all" ? "selected" : ""} onClick={() => setPricing("all")}>All pricing</button><button type="button" className={pricing === "free_self_hosted" ? "selected" : ""} onClick={() => setPricing("free_self_hosted")}>Free self-hosted</button><button type="button" className={pricing === "paid_api" ? "selected" : ""} onClick={() => setPricing("paid_api")}>Hosted API</button></div>
          <select aria-label="Filter catalog by provider" value={provider} onChange={(event) => setProvider(event.target.value)}><option value="all">All providers</option>{providers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
        </div>
        <div className="catalog">{availableModels.map((model) => <ModelCard key={model.id} model={model} toggleFavorite={toggleFavorite} />)}</div>
      </section>
      <form className="panel wide" onSubmit={addCustomModel}>
        <h2>Custom Model</h2>
        <div className="grid three">
          <label>Provider<input name="provider" placeholder="fal" /></label>
          <label>Model ID<input name="modelId" placeholder="provider/model-id" /></label>
          <label>Display name<input name="displayName" placeholder="New model" /></label>
        </div>
        <div className="grid three">
          <label>Type<select name="type"><option>image</option><option>video</option></select></label>
          <label>Endpoint<input name="endpoint" placeholder="Optional endpoint URL" /></label>
          <label>Version<input name="version" placeholder="Optional" /></label>
        </div>
        <label>Pricing<select name="pricing"><option value="paid_api">Hosted API</option><option value="free_self_hosted">Free self-hosted</option></select></label>
        <label>Capabilities<input name="capabilities" placeholder="text_to_image,reference_image,seed" /></label>
        <button className="primary">Add Custom Model</button>
      </form>
    </>
  );
}

function SettingsPanel({ providers, saveProvider, removeProvider, viewProvider }) {
  return <section className="panel wide"><h2>Provider Credentials</h2><p className="panel-note">Environment variables are managed in Vercel or your local <code>.env</code>. Keys entered here are stored encrypted by the app and can override an environment variable.</p><div className="providers">{Object.values(providers).map((provider) => (
    <form className="provider-row" key={provider.id} onSubmit={(event) => saveProvider(event, provider.id)}>
      <div><strong>{provider.name}</strong><small>{provider.env}</small></div>
      <span className={`badge ${provider.connected ? "good" : "warn"}`}>{provider.connected ? "Connected" : "Not configured"}</span>
      <span className="badge">{provider.implemented ? "Adapter ready" : "Catalog only"}</span>
      <small>{provider.source === "environment variable" ? "Managed by environment" : provider.source === "encrypted database credential" ? "Managed in app" : "No key configured"}{provider.masked ? ` - ${provider.masked}` : ""}</small>
      <ApiKeyInput providerId={provider.id} placeholder={provider.masked || "Paste API key"} viewProvider={viewProvider} />
      <label><input type="checkbox" name="enabled" defaultChecked={provider.enabled} /> Enable</label>
      <button>Save</button>
      {provider.source === "encrypted database credential" && <button type="button" onClick={() => removeProvider(provider.id)}>Remove saved key</button>}
    </form>
  ))}</div></section>;
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

  return <div className="secret-input"><input type={visible ? "text" : "password"} name="apiKey" value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} autoComplete="off" /><button type="button" className="secret-toggle" onClick={toggleVisibility} disabled={loading} aria-label={visible ? "Hide API key" : "View API key"} title={visible ? "Hide API key" : "View API key"}>{loading ? "..." : visible ? "\u{1F441}" : "\u{25C9}"}</button></div>;
}

function HistoryPanel({ generations }) {
  return <section className="panel wide"><h2>Generation Records</h2><div className="history">{generations.length ? generations.map((generation) => (
    <article className="history-row" key={generation.id}>
      <strong>{generation.character} - {generation.provider} - {generation.model}</strong>
      <div className="meta">{new Date(generation.timestamp).toLocaleString()} - seed {generation.seed || "not set"}</div>
      <p>{generation.prompt}</p>
    </article>
  )) : <p>No completed generations yet.</p>}</div></section>;
}

function ModelCard({ model, toggleFavorite }) {
  return <article className="model-card">
    <div>
      <strong>{model.displayName}{model.pricing === "free_self_hosted" && <span className="badge good free-badge">Free</span>}</strong>
      <small>{model.providerName} - {model.modelId} - {model.type} - {model.availability}</small>
      <BadgeList items={[model.pricing === "free_self_hosted" ? "free self-hosted" : "hosted API", ...(model.capabilities || []), model.executable ? "generation ready" : "catalog only", model.providerConfigured ? "configured" : "Not configured", ...(model.providerImplemented ? [] : ["adapter pending"])]} />
    </div>
    <div className="actions"><button onClick={() => toggleFavorite(model)}>{model.favorite ? "Unfavorite" : "Favorite"}</button><a href={model.docs || "#"} target="_blank" rel="noreferrer"><button type="button">Docs</button></a></div>
  </article>;
}

function OutputList({ jobs, models, grid = false }) {
  return <section className={grid ? "comparison-grid" : "output"}>{jobs.slice(0, 8).map((job) => {
    const model = models.find((item) => item.id === job.modelId);
    const image = job.output?.data?.[0]?.url || (job.output?.data?.[0]?.b64_json && `data:${job.output?.data?.[0]?.content_type || "image/png"};base64,${job.output.data[0].b64_json}`);
    const imageType = job.output?.data?.[0]?.content_type || "image/png";
    return <article className={`output-card ${job.status}`} key={job.id}><strong>{model?.displayName || job.modelId}</strong><div className="meta">{model?.providerName || job.provider} - {job.status}</div>{image && <><img className="generated-image" src={image} alt={`Generated by ${model?.displayName || job.modelId}`} /><div className="actions output-actions"><a className="download-button" href={image.includes("?") ? `${image}&download=1` : `${image}?download=1`} download={`${slugify(model?.displayName || "ai-identity")}-${job.id}.png`}>Save Image</a></div></>}{!image && <p>{job.error || "Waiting for provider result."}</p>}{job.input?.identityPack?.faceCut && <div className="meta">Identity: {job.input.identityPack.faceCut}</div>}</article>;
  })}</section>;
}

function IdentityChip({ character }) {
  const identity = character?.identity || {};
  const refs = identity.referenceImages?.length || 0;
  return <div className="identity-chip"><strong>{character?.name || "Character"} identity pack</strong><span>{identity.faceCut || "No face-cut saved yet."}</span><small>{refs} approved references - lock {identity.identityLockStrength ?? 0.75}</small></div>;
}

function BadgeList({ items }) {
  return <div className="badge-list">{items.map((item) => <span key={item} className={`badge ${String(item).includes("Not") || String(item).includes("pending") ? "warn" : String(item).includes("free") ? "good" : ""}`}>{item}</span>)}</div>;
}

function Select({ value, onChange, options }) {
  return <select value={value || ""} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}</select>;
}

function modelLabel(model) {
  return `${model.favorite ? "Starred " : ""}${model.pricing === "free_self_hosted" ? "Free - " : ""}${model.displayName}${model.providerConfigured ? "" : " - Not configured"}${model.providerImplemented ? "" : " - Adapter pending"}`;
}
