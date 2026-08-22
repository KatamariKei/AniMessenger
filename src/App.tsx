import { ChangeEvent, FormEvent, TouchEvent as ReactTouchEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, AnimaCharacter, AppConfig, ComfyDiagnostics, ImageInstallJob, ImagePackStatus, Message, OllamaDownloadOption, OllamaGpuDiagnostics, OllamaInstallJob, Thread } from "./api";

const accentPalette = ["#a8e6c6", "#61e8df", "#ef9caa", "#ff8d76", "#d5d0c7", "#d7a57c", "#bda4ff"];
const emojiCatalog = [
  ["😀", "grinning happy smile"], ["😃", "happy smile excited"], ["😄", "big smile joy"], ["😁", "beaming grin"],
  ["😂", "laughing tears funny haha"], ["🤣", "rolling laughing hilarious"], ["😊", "warm smile blush"], ["☺️", "gentle smile"],
  ["🙂", "slight smile"], ["🙃", "upside down silly sarcasm"], ["😉", "wink playful flirt"], ["😍", "heart eyes love"],
  ["🥰", "affection hearts love"], ["😘", "kiss flirt"], ["😗", "kiss"], ["😋", "delicious yummy playful"],
  ["😛", "tongue playful"], ["😜", "wink tongue silly"], ["🤪", "zany wild silly"], ["😎", "cool sunglasses"],
  ["🤓", "nerd glasses smart"], ["🧐", "monocle curious inspect"], ["🤔", "thinking curious"], ["🤨", "raised eyebrow skeptical"],
  ["😏", "smirk flirt suggestive"], ["😒", "unamused annoyed"], ["🙄", "eye roll annoyed"], ["😬", "grimace awkward"],
  ["😳", "flushed surprised embarrassed"], ["🥺", "pleading puppy eyes"], ["🥹", "holding back tears touched"], ["😢", "sad tear"],
  ["😭", "crying sob"], ["😤", "frustrated huff"], ["😠", "angry"], ["😡", "rage angry"],
  ["🤬", "swearing angry"], ["😱", "scream shocked"], ["😨", "fear worried"], ["😰", "anxious sweat"],
  ["😅", "nervous laugh sweat"], ["🤭", "giggle hand over mouth"], ["🫢", "gasp surprised"], ["🫣", "peeking shy"],
  ["🤫", "quiet shush secret"], ["🤐", "zipper mouth secret"], ["😴", "sleep tired"], ["🥱", "yawn tired"],
  ["🤤", "drool hungry"], ["🤒", "sick fever"], ["🤕", "hurt bandage"], ["😈", "devil mischievous"],
  ["👻", "ghost spooky"], ["💀", "skull dead laughing"], ["🤖", "robot"], ["👽", "alien"],
  ["👍", "thumbs up approve yes"], ["👎", "thumbs down disapprove no"], ["👏", "clap applause"], ["🙌", "celebrate raised hands"],
  ["🙏", "pray please thanks"], ["🤝", "handshake deal"], ["🫶", "heart hands love"], ["🤗", "hug"],
  ["🤞", "fingers crossed luck"], ["✌️", "peace victory"], ["👌", "okay perfect"], ["💪", "strong muscle"],
  ["👀", "eyes looking watching"], ["🫦", "biting lip flirt"], ["💋", "kiss lips"], ["💅", "nails sassy"],
  ["❤️", "red heart love"], ["🩷", "pink heart love"], ["🧡", "orange heart"], ["💛", "yellow heart"],
  ["💚", "green heart"], ["🩵", "blue heart"], ["💙", "blue heart"], ["💜", "purple heart"],
  ["🖤", "black heart"], ["🤍", "white heart"], ["💔", "broken heart"], ["💕", "two hearts love"],
  ["💞", "revolving hearts love"], ["💓", "beating heart"], ["💖", "sparkling heart"], ["💘", "heart arrow romance"],
  ["🔥", "fire hot amazing"], ["✨", "sparkles magic"], ["⭐", "star favorite"], ["🌙", "moon night"],
  ["☀️", "sun sunny morning"], ["🌸", "cherry blossom flower"], ["🌹", "rose romance"], ["🌈", "rainbow"],
  ["🎉", "party celebrate"], ["🎊", "confetti celebrate"], ["🎂", "birthday cake"], ["🎁", "gift present"],
  ["☕", "coffee morning drink"], ["🍵", "tea drink"], ["🍷", "wine drink"], ["🥂", "cheers champagne"],
  ["🍻", "beer cheers"], ["🍕", "pizza food"], ["🍔", "burger food"], ["🍜", "noodles ramen food"],
  ["🍓", "strawberry fruit"], ["🍒", "cherries fruit"], ["🍫", "chocolate sweet"], ["🍿", "popcorn movie"],
  ["🎮", "game controller gaming"], ["🎵", "music note"], ["🎸", "guitar music"], ["🎬", "movie film"],
  ["📸", "camera photo picture"], ["💡", "idea light bulb"], ["💯", "hundred perfect"], ["‼️", "double exclamation emphasis"],
  ["❓", "question"], ["✅", "check yes done"], ["❌", "cross no wrong"], ["🚀", "rocket launch fast"],
] as const;
const RECENT_EMOJI_KEY = "animessenger-recent-emoji";
const SETUP_COMPLETE_KEY = "animessenger-setup-complete-v1";
const BUNDLED_COMFY_WORKFLOW = "workflows/anima-recommended-api.json";
const BUNDLED_COMFY_MAPPING = "workflows/anima-recommended-api.mapping.json";
const quickReactions = [
  { value: "👍", label: "Thumbs up" },
  { value: "❤️", label: "Heart" },
  { value: "👎", label: "Thumbs down" },
  { value: "😂", label: "Haha" },
  { value: "‼️", label: "Exclamation" },
  { value: "❓", label: "Question" },
];
const MESSAGE_BATCH_SIZE = 120;

function characterDisplayName(character: AnimaCharacter) {
  return character.displayName?.trim() || character.name;
}

function messageSpeakerCharacter(message: Message, host: Thread, threads: Thread[]) {
  if (message.from !== "character" || !message.speakerId || message.speakerId === host.character.id) return host.character;
  return threads.find((thread) => thread.character.id === message.speakerId)?.character || host.character;
}

function characterAddressAliases(character: AnimaCharacter) {
  const full = characterDisplayName(character).replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  return [...new Set([full, ...full.split(/\s+/).filter((part) => part.length >= 3)])].filter(Boolean);
}

function textAddressesCharacter(text: string, character: AnimaCharacter) {
  const value = text.toLowerCase();
  return characterAddressAliases(character).some((alias) => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("(^|[^a-z0-9])" + escaped + "([^a-z0-9]|$)", "i").test(value);
  });
}

function anticipatedCameoSpeakerId(thread: Thread, guest: Thread | undefined, text: string) {
  if (!guest || !thread.cameo?.activeGuest) return thread.character.id;
  const hostId = thread.character.id;
  const guestId = guest.character.id;
  const lastCharacterMessage = [...thread.messages].reverse().find((message) => message.from === "character");
  const lastSpeakerId = lastCharacterMessage?.speakerId || (lastCharacterMessage ? hostId : "");
  const hostMentioned = textAddressesCharacter(text, thread.character);
  const guestMentioned = textAddressesCharacter(text, guest.character);
  const groupAddress = /\b(?:both of you|you both|you two|either of you|everyone|all of you|what do (?:you two|you guys|all of you) think)\b/i.test(text);
  if ((hostMentioned && guestMentioned) || groupAddress) return lastSpeakerId === hostId ? guestId : hostId;
  if (guestMentioned) return guestId;
  if (hostMentioned) return hostId;
  if (lastSpeakerId === hostId || lastSpeakerId === guestId) return lastSpeakerId;
  return hostId;
}

type ChatListSwipe = {
  startX: number;
  startY: number;
  lastX: number;
  startedAt: number;
  active: boolean;
};

type PendingPhoto = {
  dataUrl: string;
  name: string;
};

type RelationshipMilestone = {
  id: string;
  character: AnimaCharacter;
  relationship: number;
  label: string;
};

function accentFor(value: string) {
  const hash = [...value].reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
  return accentPalette[hash % accentPalette.length];
}

function relationshipLabel(value: number) {
  if (value >= 91) return "Deep bond";
  if (value >= 71) return "Close bond";
  if (value >= 41) return "Trusted bond";
  if (value >= 21) return "Familiar bond";
  return "New acquaintance";
}

function relationshipColor(value: number) {
  if (value >= 91) return "#f4f1ea";
  if (value >= 71) return "#ff6657";
  if (value >= 41) return "#ff9a3d";
  if (value >= 21) return "#f0d94f";
  return "#77727b";
}

function crossedRelationshipThreshold(previous: number, next: number) {
  return next > previous && relationshipLabel(previous) !== relationshipLabel(next);
}

function sceneContextLabel(thread: Thread) {
  const location = String(thread.scene?.location || "").replace(/\s+/g, " ").trim();
  const meaningfulLocation = location && location.toLowerCase() !== "somewhere familiar" ? location : "";
  return meaningfulLocation || thread.character.series;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(date);
}

function localMessageId() {
  const secureUuid = globalThis.crypto?.randomUUID;
  if (typeof secureUuid === "function") return secureUuid.call(globalThis.crypto);
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2) + "-" + Math.random().toString(36).slice(2);
}

function cameoReplyDelay(message: Message) {
  const length = String(message.text || "").trim().length;
  return Math.min(4200, Math.max(1800, 1100 + length * 11));
}

function RetryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 12a9 9 0 0 0-15.2-6.5L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 15.2 6.5L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.09a2 2 0 0 1 1 1.74v.5a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function GuestIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="8" cy="8" r="3" />
      <path d="M2.8 19c.5-3.3 2.2-5 5.2-5s4.7 1.7 5.2 5" />
      <path d="M18 8v6M15 11h6" />
    </svg>
  );
}

function Portrait({ character, large = false }: { character: AnimaCharacter; large?: boolean }) {
  const accent = accentFor(character.id);
  const portraitUrl = character.avatarUrl || character.thumbUrl;
  const generatedAvatar = Boolean(character.avatarUrl);
  const image = portraitUrl ? "url(\"" + portraitUrl + "\")" : "linear-gradient(145deg, " + accent + "55, #17121d)";
  return (
    <span
      className={"portrait portrait--remote " + (large ? "portrait--large" : "")}
      style={{
        backgroundColor: accent + "24",
        backgroundImage: image,
        backgroundPosition: generatedAvatar ? "center" : (character.sprite || "center"),
        backgroundSize: generatedAvatar ? "cover" : (character.sprite ? "300% 200%" : "cover"),
      }}
      role="img"
      aria-label={characterDisplayName(character) + " portrait"}
    >
      {!portraitUrl && <b>{characterDisplayName(character).slice(0, 1)}</b>}
    </span>
  );
}

function EmptyChat({ mode, onDiscover }: { mode: "chats" | "discover"; onDiscover: () => void }) {
  return (
    <section className="chat-panel empty-chat">
      <img className="empty-brand-icon" src="/animessenger-icon.svg?v=4" alt="" aria-hidden="true" />
      <p className="eyebrow">Your private character space</p>
      <h2>An adventure in every chat.</h2>
      <p>Search across character sources, build their personality with Ollama, and begin a conversation that remembers.</p>
      {mode === "chats"
        ? <button onClick={onDiscover}>Find a character</button>
        : <p className="empty-search-hint">Use the character search on the left to choose someone to meet.</p>}
    </section>
  );
}

function useDialogFocus<T extends HTMLElement>(ref: React.RefObject<T | null>, enabled = true) {
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled || !ref.current) return;
    const container = ref.current;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])';
    const focusables = () => [...container.querySelectorAll<HTMLElement>(focusableSelector)].filter((element) => !element.hidden && element.getClientRects().length > 0);
    const first = focusables()[0] || container;
    window.requestAnimationFrame(() => first.focus());

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const modalLayers = [...document.querySelectorAll<HTMLElement>('[aria-modal="true"]')];
      const topModal = modalLayers[modalLayers.length - 1];
      const ownModal = container.closest<HTMLElement>('[aria-modal="true"]');
      if (topModal && ownModal && topModal !== ownModal) return;
      const items = focusables();
      if (!items.length) {
        event.preventDefault();
        container.focus();
        return;
      }
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && currentIndex <= 0) {
        event.preventDefault();
        items[items.length - 1].focus();
      } else if (!event.shiftKey && (currentIndex === -1 || currentIndex === items.length - 1)) {
        event.preventDefault();
        items[0].focus();
      }
    };

    window.addEventListener("keydown", trapFocus);
    return () => {
      window.removeEventListener("keydown", trapFocus);
      previousFocus.current?.focus();
    };
  }, [enabled, ref]);
}

type SettingsProps = {
  initial: AppConfig;
  onClose: () => void;
  onSaved: (config: AppConfig) => void;
  onOpenSetup: () => void;
};

type LightboxItem = {
  id: string;
  src: string;
  alt: string;
  time: string;
  generation?: Message["generation"];
  retryable: boolean;
};

type LightboxState = {
  items: LightboxItem[];
  index: number;
};

type LightboxZoom = { scale: number; x: number; y: number };
type LightboxGesture = {
  mode: "swipe" | "pan" | "pinch";
  startX: number;
  startY: number;
  startDistance: number;
  startMidX: number;
  startMidY: number;
  startZoom: LightboxZoom;
};

function formatFileSize(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return "Unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

type ImagePackInstallerProps = {
  modelsDirectory: string;
  outputDirectory?: string;
  onModelsDirectoryChange: (value: string) => void;
  onOutputDirectoryChange: (value: string) => void;
};

function ImagePackInstaller({ modelsDirectory, outputDirectory = "", onModelsDirectoryChange, onOutputDirectoryChange }: ImagePackInstallerProps) {
  const [status, setStatus] = useState<ImagePackStatus | null>(null);
  const [job, setJob] = useState<ImageInstallJob | null>(null);
  const [checking, setChecking] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [apiToken, setApiToken] = useState("");
  const [repair, setRepair] = useState(false);
  const [error, setError] = useState("");

  const scan = async (directory = modelsDirectory) => {
    if (!directory.trim()) return;
    setChecking(true);
    setError("");
    try {
      const nextStatus = await api.imagePackStatus(directory);
      setStatus(nextStatus);
      if (!outputDirectory.trim()) {
        const prepared = await api.prepareComfyOutputDirectory(nextStatus.modelsDirectory);
        onOutputDirectoryChange(prepared.outputDirectory);
      }
    } catch (reason) {
      setStatus(null);
      setError(reason instanceof Error ? reason.message : "The model folder could not be checked.");
    } finally {
      setChecking(false);
    }
  };

  const detect = async () => {
    setDetecting(true);
    setError("");
    try {
      const result = await api.detectImageModelsFolders(modelsDirectory, outputDirectory);
      if (!result.candidates.length) {
        setError("AniMessenger could not locate ComfyUI automatically. Paste the path to its models folder below.");
        return;
      }
      const selected = result.candidates[0];
      onModelsDirectoryChange(selected);
      await scan(selected);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ComfyUI could not be located.");
    } finally {
      setDetecting(false);
    }
  };

  useEffect(() => {
    if (modelsDirectory.trim()) void scan(modelsDirectory);
    else void detect();
  }, []);

  useEffect(() => {
    if (!job || !["queued", "downloading"].includes(job.status)) return;
    let stopped = false;
    const timer = window.setInterval(() => {
      void api.imageInstallStatus(job.id).then(async (next) => {
        if (stopped) return;
        setJob(next);
        if (next.status === "complete") await scan(next.modelsDirectory);
      }).catch((reason) => {
        if (!stopped) setError(reason instanceof Error ? reason.message : "Download progress could not be read.");
      });
    }, 900);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [job?.id, job?.status]);

  const install = async () => {
    setError("");
    try {
      setJob(await api.installImagePack({ modelsDirectory, acceptedTerms, apiToken, repair }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The image pack download could not start.");
    }
  };

  const cancel = async () => {
    if (!job) return;
    try {
      setJob(await api.cancelImageInstall(job.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The download could not be cancelled.");
    }
  };

  const active = Boolean(job && ["queued", "downloading"].includes(job.status));
  const repairNeeded = Boolean(status?.assets.some((asset) => asset.state === "invalid"));
  const progress = job?.totalBytes ? Math.min(100, Math.round((job.completedBytes / job.totalBytes) * 100)) : 0;
  return (
    <section className="image-pack-installer" aria-label="Recommended image files">
      <div className="image-pack-heading">
        <span><strong>Recommended image files</strong><small>Five verified files · {formatFileSize(status?.totalBytes || 5905499670)} total</small></span>
        <button type="button" onClick={() => void detect()} disabled={detecting || active}>{detecting ? "Looking…" : "Find folder"}</button>
      </div>
      <label className="image-pack-folder">
        <span>ComfyUI models folder</span>
        <div><input value={modelsDirectory} onChange={(event) => { onModelsDirectoryChange(event.target.value); setStatus(null); }} placeholder="Example: C:\ComfyUI\models" disabled={active} /><button type="button" onClick={() => void scan()} disabled={!modelsDirectory.trim() || checking || active}>{checking ? "Checking…" : "Scan"}</button></div>
        <small>Contains ComfyUI's diffusion_models, text_encoders, VAE, and LoRA folders.</small>
      </label>
      {outputDirectory.trim() && <p className="image-pack-output-ready"><i /><span><strong>Finished-images folder ready</strong><small>{outputDirectory}</small></span></p>}
      <details className="image-pack-custom-output">
        <summary>Use a custom ComfyUI output folder</summary>
        <label className="image-pack-folder">
          <span>Custom finished-images folder</span>
          <input value={outputDirectory} onChange={(event) => onOutputDirectoryChange(event.target.value)} placeholder="Example: C:\ComfyUI\output" disabled={active} />
          <small>AniMessenger normally creates and selects the standard <b>output</b> folder beside ComfyUI's models folder automatically.</small>
        </label>
      </details>

      {status && (
        <div className={`image-pack-summary ${status.allInstalled ? "ready" : ""}`} aria-live="polite">
          <i />
          <span><strong>{status.allInstalled ? "Image pack ready" : `${status.assets.filter((asset) => asset.state === "installed").length} of ${status.assets.length} files ready`}</strong><small>{status.allInstalled ? "All files passed their size and checksum checks." : `${formatFileSize(status.requiredDownloadBytes)} still needed · ${formatFileSize(status.availableBytes)} free`}</small></span>
        </div>
      )}

      {status && !status.allInstalled && (
        <>
          <details className="image-pack-files">
            <summary>Review the five files and source pages</summary>
            <ul>{status.assets.map((asset) => <li key={asset.id} className={`is-${asset.state}`}><i /><span><strong>{asset.filename}</strong><small>{asset.state === "installed" ? "Verified" : asset.state === "invalid" ? "Needs repair" : `${formatFileSize(asset.bytes)} · Missing`}</small></span><a href={asset.pageUrl} target="_blank" rel="noreferrer">Source</a></li>)}</ul>
          </details>
          <label className="image-pack-terms"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} disabled={active} /><span>I reviewed the linked model pages and agree to the providers’ current terms.</span></label>
          {repairNeeded && <label className="image-pack-terms warning"><input type="checkbox" checked={repair} onChange={(event) => setRepair(event.target.checked)} disabled={active} /><span>Preserve invalid files as backups, then download verified replacements.</span></label>}
          <div className="image-pack-token"><strong>Civitai access token required</strong><p>Civitai requires an account token for this pack. AniMessenger uses it for this download only and never saves it.</p><label><span>Temporary access token</span><input type="password" value={apiToken} onChange={(event) => setApiToken(event.target.value)} autoComplete="off" disabled={active} /></label><a href="https://civitai.com/user/account" target="_blank" rel="noreferrer">Open Civitai account settings</a></div>
        </>
      )}

      {active && job && <div className="image-pack-progress" aria-live="polite"><div><i style={{ width: `${progress}%` }} /></div><span><strong>{progress}%</strong><small>{job.currentFilename ? `Downloading ${job.currentFilename}` : "Preparing download…"}</small></span><button type="button" onClick={() => void cancel()}>Cancel</button></div>}
      {job?.status === "complete" && <p className="image-pack-message success">Download complete. Every file was checksum-verified before installation.</p>}
      {job?.status === "cancelled" && <p className="image-pack-message">Download cancelled. Completed model files remain installed.</p>}
      {job?.status === "error" && <p className="image-pack-message error">{job.error}</p>}
      {error && <p className="image-pack-message error">{error}</p>}

      {status && !status.allInstalled && !active && <button type="button" className="image-pack-install" onClick={() => void install()} disabled={!acceptedTerms || !apiToken.trim() || (repairNeeded && !repair)}>{repairNeeded ? "Repair and download files" : `Download ${formatFileSize(status.requiredDownloadBytes)}`}</button>}
    </section>
  );
}

function OllamaGpuCheck({ ollamaUrl, model }: { ollamaUrl: string; model: string }) {
  const [result, setResult] = useState<OllamaGpuDiagnostics | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const check = async (optimize = false) => {
    setChecking(true);
    setError("");
    try {
      setResult(await api.ollamaGpuCheck({ ollamaUrl, model, optimize }));
    } catch (reason) {
      setResult(null);
      setError(reason instanceof Error ? reason.message : "GPU acceleration could not be checked.");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    setResult(null);
    setError("");
  }, [ollamaUrl, model]);

  return (
    <div className="ollama-gpu-check">
      <div className="ollama-gpu-head">
        <span><strong>Chat performance check</strong><small>Loads this model briefly and verifies whether Ollama is really using the GPU.</small></span>
        <button type="button" onClick={() => void check(false)} disabled={!model || checking}>{checking ? "Testing…" : result ? "Check again" : "Check GPU use"}</button>
      </div>
      {result && <div className={`ollama-gpu-result is-${result.status}`} role="status">
        <i />
        <span><strong>{result.summary}</strong><small>{result.detail}</small>{result.otherModels.length > 0 && <em>Also loaded: {result.otherModels.join(", ")}</em>}</span>
        {result.status !== "ready" && <button type="button" onClick={() => void check(true)} disabled={checking}>Optimize and retest</button>}
      </div>}
      {error && <p className="image-pack-message error">{error}</p>}
    </div>
  );
}

function OllamaModelInstaller({ ollamaUrl, onInstalled }: { ollamaUrl: string; onInstalled: () => Promise<void> }) {
  const [options, setOptions] = useState<OllamaDownloadOption[]>([]);
  const [selected, setSelected] = useState("gemma4:12b");
  const [job, setJob] = useState<OllamaInstallJob | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.recommendedOllamaDownloads()
      .then((result) => {
        setOptions(result.models);
        if (!result.models.some((item) => item.model === selected) && result.models[0]) setSelected(result.models[0].model);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Recommended models could not be loaded."));
  }, []);

  useEffect(() => {
    if (!job || !["queued", "downloading"].includes(job.status)) return undefined;
    const timer = window.setInterval(() => {
      api.ollamaInstallStatus(job.id).then(async (next) => {
        setJob(next);
        if (next.status === "complete") await onInstalled();
      }).catch((reason) => {
        setError(reason instanceof Error ? reason.message : "The model download status could not be checked.");
        window.clearInterval(timer);
      });
    }, 750);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status, onInstalled]);

  const start = async () => {
    setError("");
    try {
      setJob(await api.installOllamaModel({ ollamaUrl, model: selected }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The model download could not start.");
    }
  };

  const cancel = async () => {
    if (!job) return;
    try { setJob(await api.cancelOllamaInstall(job.id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The download could not be cancelled."); }
  };

  const active = Boolean(job && ["queued", "downloading"].includes(job.status));
  const progress = job?.totalBytes ? Math.max(0, Math.min(100, (job.completedBytes / job.totalBytes) * 100)) : 0;

  return (
    <div className="ollama-model-installer">
      <div className="ollama-install-intro"><strong>Choose a model and AniMessenger will ask Ollama to download it.</strong><span>No command window needed. One model can power chat, character profiles, and photo reactions.</span></div>
      <div className="ollama-install-options" role="radiogroup" aria-label="Recommended Ollama models">
        {options.map((option) => <button type="button" role="radio" aria-checked={selected === option.model} className={selected === option.model ? "selected" : ""} key={option.model} onClick={() => setSelected(option.model)} disabled={active}>
          <span><strong>{option.label}</strong><b>{option.model}</b></span>
          <small>{option.detail}<em>About {formatFileSize(option.approximateBytes)}</em></small>
        </button>)}
      </div>
      {job && <div className={`ollama-install-progress is-${job.status}`} role="status">
        <div><strong>{job.status === "complete" ? `${job.model} is ready` : job.status === "error" ? "Download stopped" : job.message || "Downloading model"}</strong><span>{job.error || (job.totalBytes > 0 ? `${formatFileSize(job.completedBytes)} of ${formatFileSize(job.totalBytes)}` : "Preparing download…")}</span></div>
        <i><span style={{ width: `${job.status === "complete" ? 100 : progress}%` }} /></i>
      </div>}
      {error && <p className="form-error">{error}</p>}
      <div className="ollama-install-actions">
        <button type="button" onClick={() => void start()} disabled={active || options.length === 0}>{job?.status === "error" || job?.status === "cancelled" ? "Try again" : "Download with Ollama"}</button>
        {active && <button type="button" className="secondary" onClick={() => void cancel()}>Cancel</button>}
      </div>
      <small className="ollama-install-note">Downloads can be several gigabytes. You can leave this screen open while Ollama works.</small>
    </div>
  );
}

function Settings({ initial, onClose, onSaved, onOpenSetup }: SettingsProps) {
  const [config, setConfig] = useState(initial);
  const [models, setModels] = useState<string[]>([]);
  const [comfyModels, setComfyModels] = useState<string[]>([]);
  const [comfyWorkflowDefault, setComfyWorkflowDefault] = useState("");
  const [saving, setSaving] = useState(false);
  const [diagnosingComfy, setDiagnosingComfy] = useState(false);
  const [comfyDiagnostics, setComfyDiagnostics] = useState<ComfyDiagnostics | null>(null);
  const [error, setError] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [canShutdown, setCanShutdown] = useState(false);
  const [confirmShutdown, setConfirmShutdown] = useState(false);
  const [shuttingDown, setShuttingDown] = useState(false);
  const [shutdownComplete, setShutdownComplete] = useState(false);
  const cardRef = useRef<HTMLFormElement>(null);
  const discardRef = useRef<HTMLElement>(null);
  const dirty = JSON.stringify(config) !== JSON.stringify(initial);
  useDialogFocus(cardRef);
  useDialogFocus(discardRef, confirmDiscard);

  const requestClose = () => {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  useEffect(() => {
    api.models().then((result) => setModels(result.models)).catch(() => undefined);
    api.runtime().then((result) => setCanShutdown(result.canShutdown)).catch(() => undefined);
    api.comfyModels().then((result) => {
      setComfyModels(result.models);
      setComfyWorkflowDefault(result.workflowDefault);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dirty]);

  const update = (key: keyof AppConfig, value: string | boolean) => {
    setConfig((current) => ({ ...current, [key]: value }));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const saved = await api.saveConfig(config);
      onSaved(saved);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  const checkImageSetup = async () => {
    setDiagnosingComfy(true);
    setError("");
    try {
      setComfyDiagnostics(await api.comfyDiagnostics(config));
    } catch (reason) {
      setComfyDiagnostics(null);
      setError(reason instanceof Error ? reason.message : "The ComfyUI setup could not be checked.");
    } finally {
      setDiagnosingComfy(false);
    }
  };

  const shutdown = async () => {
    setShuttingDown(true);
    setError("");
    try {
      await api.shutdown();
      setShutdownComplete(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "AniMessenger could not shut down cleanly.");
      setShuttingDown(false);
      setConfirmShutdown(false);
    }
  };

  return (
    <div className="profile-layer settings-layer" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={requestClose}>
      <form ref={cardRef} className="settings-card" onSubmit={save} onClick={(event) => event.stopPropagation()} tabIndex={-1}>
        <header className="settings-header">
          <div className="settings-brand">
            <div className="brand-lockup"><img src="/animessenger-logo.svg?v=3" alt="ANIMESSENGER" /></div>
            <span id="settings-title">Settings</span>
          </div>
          <button type="button" className="profile-close" onClick={requestClose} aria-label="Close settings">×</button>
        </header>
        <div className="settings-scroll">
          <div className="settings-intro">
            <div><p className="eyebrow">Your experience</p><p>Choose the models, images, and message behavior that shape AniMessenger.</p></div>
            <button type="button" className="settings-guide-link" onClick={onOpenSetup}>Run guided setup</button>
          </div>

          <section className="settings-section">
            <div className="settings-section-heading"><h3>You and your characters</h3><p>How characters address you and how their profiles are researched.</p></div>
            <div className="settings-grid">
              <label className="settings-wide"><span>Your name or nickname</span><input value={config.userName || ""} onChange={(e) => update("userName", e.target.value)} placeholder="What characters should call you" autoComplete="nickname" /></label>
              <label className="toggle-row settings-wide"><input type="checkbox" checked={config.researchEnabled} onChange={(e) => update("researchEnabled", e.target.checked)} /><span>Research character background before building a profile</span></label>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-heading"><h3>Local AI models</h3><p>Chat drives conversation. Profile builds personalities. Vision looks at photos you attach.</p></div>
            <div className="settings-grid">
              <label><span>Chat model</span><input list="ollama-models" value={config.chatModel} onChange={(e) => update("chatModel", e.target.value)} placeholder="Choose an Ollama model" /></label>
              <label><span>Profile model</span><input list="ollama-models" value={config.profileModel} onChange={(e) => update("profileModel", e.target.value)} placeholder="Defaults to chat model" /></label>
              <label className="settings-wide"><span>Vision model</span><input list="ollama-models" value={config.visionModel} onChange={(e) => update("visionModel", e.target.value)} placeholder="For reacting to your photos" /></label>
              <datalist id="ollama-models">{models.map((model) => <option value={model} key={model} />)}</datalist>
              <div className="settings-wide"><OllamaGpuCheck ollamaUrl={config.ollamaUrl} model={config.chatModel} /></div>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-heading"><h3>Character images</h3><p>Select your ANIMA model and keep generated images connected to the gallery.</p></div>
            <div className="settings-grid">
              <label className="settings-wide"><span>ANIMA diffusion model</span><select value={config.comfyDiffusionModel || ""} onChange={(e) => update("comfyDiffusionModel", e.target.value)}><option value="">Workflow default{comfyWorkflowDefault ? ` · ${comfyWorkflowDefault}` : ""}</option>{config.comfyDiffusionModel && !comfyModels.includes(config.comfyDiffusionModel) && <option value={config.comfyDiffusionModel}>{config.comfyDiffusionModel} · Not currently available</option>}{comfyModels.map((model) => <option value={model} key={model}>{model}</option>)}</select><small className="settings-field-help">Used for profile pictures, new images, and retries.</small></label>
              <label className="settings-wide"><span>Finished-images folder</span><input value={config.comfyOutputDir} onChange={(e) => update("comfyOutputDir", e.target.value)} placeholder="Example: C:\ComfyUI\output" /><small>Keeping this connected makes galleries available even while ComfyUI is closed.</small></label>
              <div className="settings-wide comfy-diagnostics">
                <div className="comfy-diagnostics-head"><span><strong>Image setup check</strong><small>Verify the workflow, models, LoRAs, and gallery recovery.</small></span><button type="button" onClick={() => void checkImageSetup()} disabled={diagnosingComfy}>{diagnosingComfy ? "Checking…" : "Check setup"}</button></div>
                {comfyDiagnostics && <div className={"comfy-diagnostics-result is-" + comfyDiagnostics.status}><p><i />{comfyDiagnostics.summary}</p>{comfyDiagnostics.issues.length > 0 && <ul>{comfyDiagnostics.issues.map((issue) => <li className={"is-" + issue.severity} key={issue.code}><strong>{issue.title}</strong><span>{issue.detail}</span></li>)}</ul>}</div>}
              </div>
            </div>
            <details className="settings-advanced">
              <summary>Advanced image setup</summary>
              <div className="settings-grid">
                <label className="settings-wide"><span>ComfyUI models folder</span><input value={config.comfyModelsDir} onChange={(e) => update("comfyModelsDir", e.target.value)} placeholder="Used by the recommended image-pack installer" /></label>
                <label className="settings-wide"><span>ANIMA workflow file</span><input value={config.comfyWorkflowFile} onChange={(e) => update("comfyWorkflowFile", e.target.value)} placeholder="C:\...\anima-workflow-api.json" /></label>
                <label className="settings-wide"><span>Workflow mapping file</span><input value={config.comfyMappingFile} onChange={(e) => update("comfyMappingFile", e.target.value)} placeholder="C:\...\anima-workflow.mapping.json" /></label>
              </div>
            </details>
          </section>

          <details className="settings-section settings-advanced settings-prompt-section">
            <summary><span><strong>Image quality prompts</strong><small>Global positive and negative guidance applied to every generation.</small></span></summary>
            <div className="settings-grid">
              <label className="settings-wide"><span>Global positive prompt</span><textarea rows={4} value={config.globalPositivePrompt} onChange={(e) => update("globalPositivePrompt", e.target.value)} /></label>
              <label className="settings-wide"><span>Global negative prompt</span><textarea rows={4} value={config.globalNegativePrompt} onChange={(e) => update("globalNegativePrompt", e.target.value)} /></label>
            </div>
          </details>

          <section className="settings-section">
            <div className="settings-section-heading"><h3>Proactive messages</h3><p>Control when trusted characters can reach out on their own.</p></div>
            <div className="settings-grid">
              <label className="toggle-row settings-wide"><input type="checkbox" checked={config.proactiveEnabled} onChange={(e) => update("proactiveEnabled", e.target.checked)} /><span>Allow trusted characters to reach out while AniMessenger is open</span></label>
              <label className="settings-wide"><span>Message pace</span><select value={config.proactivePace} onChange={(e) => update("proactivePace", e.target.value)} disabled={!config.proactiveEnabled}><option value="relaxed">Relaxed</option><option value="normal">Normal</option><option value="lively">Lively · faster testing</option><option value="off">Off</option></select></label>
              <label><span>May start</span><input type="time" value={config.proactiveDeliveryStart || "08:00"} onChange={(e) => update("proactiveDeliveryStart", e.target.value)} disabled={!config.proactiveEnabled || config.proactivePace === "off"} /></label>
              <label><span>Pause at</span><input type="time" value={config.proactiveDeliveryEnd || "23:00"} onChange={(e) => update("proactiveDeliveryEnd", e.target.value)} disabled={!config.proactiveEnabled || config.proactivePace === "off"} /></label>
            </div>
          </section>

          <details className="settings-section settings-advanced settings-connections">
            <summary><span><strong>Connection addresses</strong><small>Only change these when a local service uses a different address.</small></span></summary>
            <div className="settings-grid"><label><span>Ollama URL</span><input value={config.ollamaUrl} onChange={(e) => update("ollamaUrl", e.target.value)} /></label><label><span>ComfyUI URL</span><input value={config.comfyUrl} onChange={(e) => update("comfyUrl", e.target.value)} /></label><label className="settings-wide"><span>AnimaDex fallback URL</span><input value={config.animadexUrl} onChange={(e) => update("animadexUrl", e.target.value)} /></label></div>
          </details>

          {canShutdown && <section className="settings-shutdown">
            <div><strong>Finished for now?</strong><span>Stops AniMessenger on this computer. Ollama and ComfyUI keep their current state.</span></div>
            {!confirmShutdown ? <button type="button" onClick={() => setConfirmShutdown(true)}>Shut down AniMessenger</button> : <div className="settings-shutdown-confirm"><button type="button" onClick={() => setConfirmShutdown(false)} disabled={shuttingDown}>Cancel</button><button type="button" onClick={() => void shutdown()} disabled={shuttingDown}>{shuttingDown ? "Shutting down…" : "Yes, shut down"}</button></div>}
          </section>}
          {error && <p className="form-error">{error}</p>}
        </div>
        <div className="settings-actions">
          <button type="button" onClick={requestClose}>Cancel</button>
          <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save settings"}</button>
        </div>
        {confirmDiscard && <div className="discard-confirm" role="alertdialog" aria-modal="true" aria-labelledby="settings-discard-title"><section ref={discardRef} tabIndex={-1}><strong id="settings-discard-title">Discard unsaved changes?</strong><p>Your settings edits have not been saved.</p><div><button type="button" onClick={() => setConfirmDiscard(false)}>Keep editing</button><button type="button" className="discard-button" onClick={onClose}>Discard</button></div></section></div>}
        {shutdownComplete && <div className="shutdown-complete" role="status"><img src="/animessenger-icon.svg?v=4" alt="" /><strong>AniMessenger is shut down.</strong><p>Your chats are safe. You can close this browser tab and use the AniMessenger tray icon or shortcut when you want to return.</p></div>}
      </form>
    </div>
  );
}

type VisualOverrideDraft = { displayName: string; identity: string[]; signature: string[]; hiddenSignature: string[]; exceptions: string[]; defaultWardrobe: string; currentOutfit: string };
type VisualOverrideListKey = "identity" | "signature" | "exceptions";

function VisualIdentityEditor({ thread, onClose, onSaved }: { thread: Thread; onClose: () => void; onSaved: (thread: Thread) => void }) {
  const profile = thread.profile!;
  const saved = profile.visual.userOverrides;
  const initial: VisualOverrideDraft = {
    displayName: characterDisplayName(thread.character),
    identity: [...(saved?.identity ?? profile.visual.identity)],
    signature: [...(saved?.signature ?? profile.visual.signature)],
    hiddenSignature: [...(saved?.hiddenSignature ?? [])],
    exceptions: [...(saved?.exceptions ?? [])],
    defaultWardrobe: saved?.defaultWardrobe ?? profile.visual.defaultWardrobe,
    currentOutfit: thread.scene.outfit === "default outfit"
      ? (saved?.defaultWardrobe ?? profile.visual.defaultWardrobe)
      : thread.scene.outfit,
  };
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const discardRef = useRef<HTMLElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  useDialogFocus(cardRef);
  useDialogFocus(discardRef, confirmDiscard);

  const requestClose = () => {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dirty]);

  const updateItem = (section: VisualOverrideListKey, index: number, value: string) => {
    setDraft((current) => {
      const previous = current[section][index];
      const next = { ...current, [section]: current[section].map((item, itemIndex) => itemIndex === index ? value : item) };
      if (section !== "signature") return next;
      const wasHidden = current.hiddenSignature.some((item) => item.toLowerCase() === previous.toLowerCase());
      return {
        ...next,
        hiddenSignature: wasHidden
          ? current.hiddenSignature.map((item) => item.toLowerCase() === previous.toLowerCase() ? value : item)
          : current.hiddenSignature,
      };
    });
  };
  const removeItem = (section: VisualOverrideListKey, index: number) => {
    setDraft((current) => {
      const removed = current[section][index];
      return {
        ...current,
        [section]: current[section].filter((_, itemIndex) => itemIndex !== index),
        ...(section === "signature"
          ? { hiddenSignature: current.hiddenSignature.filter((item) => item.toLowerCase() !== removed.toLowerCase()) }
          : {}),
      };
    });
  };
  const addItem = (section: VisualOverrideListKey) => {
    setDraft((current) => ({ ...current, [section]: [...current[section], ""] }));
  };
  const signatureIsHidden = (item: string) => draft.hiddenSignature.some((hidden) => hidden.toLowerCase() === item.toLowerCase());
  const toggleSignature = (item: string) => {
    if (!item.trim()) return;
    setDraft((current) => {
      const hidden = current.hiddenSignature.some((candidate) => candidate.toLowerCase() === item.toLowerCase());
      return {
        ...current,
        hiddenSignature: hidden
          ? current.hiddenSignature.filter((candidate) => candidate.toLowerCase() !== item.toLowerCase())
          : [...current.hiddenSignature, item],
      };
    });
  };
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const result = await api.saveVisualOverrides(thread.id, draft, draft.currentOutfit, draft.displayName);
      if (result.thread) onSaved(result.thread);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Visual identity could not be saved.");
    } finally {
      setSaving(false);
    }
  };
  const reset = async () => {
    if (!window.confirm("Restore the researched visual identity for this character?")) return;
    setSaving(true);
    setError("");
    try {
      const result = await api.saveVisualOverrides(thread.id, null, undefined, thread.character.displayName);
      if (result.thread) onSaved(result.thread);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Visual identity could not be restored.");
    } finally {
      setSaving(false);
    }
  };

  const section = (key: VisualOverrideListKey, title: string, help: string) => (
    <section className="identity-editor-section">
      <header><span><strong>{title}</strong><small>{help}</small></span><button type="button" onClick={() => addItem(key)}>+ Add feature</button></header>
      <div className="identity-editor-list">
        {draft[key].map((item, index) => {
          const hidden = key === "signature" && signatureIsHidden(item);
          return (
            <div className={"identity-editor-row " + (hidden ? "is-hidden" : "")} key={key + index}>
              <input
                value={item}
                onChange={(event) => updateItem(key, index, event.target.value)}
                placeholder="Describe one visual detail"
                aria-label={`${title} feature ${index + 1}`}
                autoFocus={!item}
              />
              {key === "signature" && (
                <button
                  type="button"
                  className="identity-visibility-toggle"
                  onClick={() => toggleSignature(item)}
                  aria-label={`Include ${item || "feature"} in image prompts`}
                  aria-pressed={!hidden}
                  title={hidden ? "Include in image prompts" : "Keep saved, but hide from image prompts"}
                  disabled={!item.trim()}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z" />
                    <circle cx="12" cy="12" r="2.5" />
                    {hidden && <path d="m4 4 16 16" />}
                  </svg>
                </button>
              )}
              <button type="button" onClick={() => removeItem(key, index)} aria-label={`Remove ${item || "feature"}`}>×</button>
            </div>
          );
        })}
        {!draft[key].length && <p>No custom details in this group.</p>}
      </div>
    </section>
  );

  return createPortal((
    <div className="profile-layer identity-editor-layer" role="dialog" aria-modal="true" aria-labelledby="identity-editor-title" onClick={requestClose}>
      <article ref={cardRef} className="identity-editor-card" onClick={(event) => event.stopPropagation()} tabIndex={-1}>
        <button type="button" className="profile-close" onClick={requestClose} aria-label="Close identity editor">×</button>
        <p className="eyebrow">Character details</p>
        <h2 id="identity-editor-title">Edit {characterDisplayName(thread.character)}'s identity</h2>
        <p>Choose how their name appears in AniMessenger and correct visual details for future images. Personality, memories, and relationship progress stay untouched.</p>
        <div className="identity-editor-scroll">
          <section className="identity-editor-section identity-editor-wardrobe">
            <header><span><strong>Display name</strong><small>Shorten or clean up the catalogue name. The canonical source identity remains intact behind the scenes.</small></span></header>
            <input
              value={draft.displayName}
              maxLength={80}
              onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))}
              placeholder={thread.character.name}
              aria-label="Character display name"
            />
          </section>
          {section("identity", "Core identity", "Hair, eyes, body, and features that should always be recognizable.")}
          <section className="identity-editor-section identity-editor-wardrobe">
            <header><span><strong>Default outfit</strong><small>The canonical outfit used when the conversation has not established different clothing.</small></span></header>
            <input
              value={draft.defaultWardrobe}
              onChange={(event) => setDraft((current) => ({ ...current, defaultWardrobe: event.target.value }))}
              placeholder="Describe the character's usual clothing"
            />
          </section>
          <section className="identity-editor-section identity-editor-wardrobe">
            <header>
              <span><strong>Current outfit</strong><small>What they are wearing in this conversation and in new or retried images.</small></span>
              <button type="button" onClick={() => setDraft((current) => ({ ...current, currentOutfit: current.defaultWardrobe }))}>Reset to default</button>
            </header>
            <input
              value={draft.currentOutfit}
              onChange={(event) => setDraft((current) => ({ ...current, currentOutfit: event.target.value }))}
              placeholder="Describe what the character is wearing now"
            />
          </section>
          {section("signature", "Signature details", "Accessories and character-specific visual cues. Use the eye to keep a detail saved without including it in image prompts.")}
          {section("exceptions", "Keep out", "Incorrect or conditional features ComfyUI should avoid unless the scene specifically requests them.")}
        </div>
        {error && <p className="form-error">{error}</p>}
        <footer className="identity-editor-actions">
          <button type="button" className="identity-reset" onClick={() => void reset()} disabled={saving || !saved}>Restore research</button>
          <span />
          <button type="button" onClick={requestClose} disabled={saving}>Cancel</button>
          <button type="button" className="identity-save" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
        </footer>
        {confirmDiscard && <div className="discard-confirm" role="alertdialog" aria-modal="true" aria-labelledby="identity-discard-title"><section ref={discardRef} tabIndex={-1}><strong id="identity-discard-title">Discard identity edits?</strong><p>Your visual corrections have not been saved.</p><div><button type="button" onClick={() => setConfirmDiscard(false)}>Keep editing</button><button type="button" className="discard-button" onClick={onClose}>Discard</button></div></section></div>}
      </article>
    </div>
  ), document.body);
}

type ConnectionHealth = { ollama: boolean; comfy: boolean; animadex: boolean };

function ServiceRecovery({ health, serviceReachable, ready, mode, checking, onRetry, onSetup }: {
  health: ConnectionHealth;
  serviceReachable: boolean;
  ready: boolean;
  mode: "chats" | "discover";
  checking: boolean;
  onRetry: () => void;
  onSetup?: () => void;
}) {
  const issue = !ready ? null
    : !serviceReachable
      ? { title: "AniMessenger is stopped", detail: "Start it from the AniMessenger tray icon or shortcut, then check again.", optional: false, retryLabel: "Check again", allowSetup: false }
    : !health.ollama
      ? { title: "Chat is offline", detail: "AniMessenger is running, but Ollama is not connected. Start Ollama, then retry.", optional: false, retryLabel: "Retry", allowSetup: true }
      : mode === "discover" && !health.animadex
        ? { title: "Character search is offline", detail: "Existing chats still work. Retry the independent sources or use the small built-in preview.", optional: true, retryLabel: "Retry", allowSetup: true }
        : !health.comfy
          ? { title: "Images are offline", detail: "Chat still works. Start ComfyUI whenever you want pictures.", optional: true, retryLabel: "Retry", allowSetup: true }
          : null;
  return (
    <div
      className={"service-recovery-slot " + (!issue ? "is-clear" : issue.optional ? "is-optional" : "")}
      role="status"
      aria-live="polite"
    >
      {issue && <>
        <span className="service-recovery-dot" />
        <span><strong>{issue.title}</strong><small>{issue.detail}</small></span>
        <button type="button" onClick={onRetry} disabled={checking}>{checking ? "Checking…" : issue.retryLabel}</button>
        {onSetup && issue.allowSetup && <button type="button" onClick={onSetup}>Setup</button>}
      </>}
    </div>
  );
}

type SetupGuideProps = {
  initial: AppConfig;
  initialHealth: ConnectionHealth;
  onComplete: (config: AppConfig, health: ConnectionHealth) => void;
  onSkip: () => void;
};

function SetupGuide({ initial, initialHealth, onComplete, onSkip }: SetupGuideProps) {
  const [step, setStep] = useState(0);
  const [draftConfig, setDraftConfig] = useState(initial);
  const [connectionHealth, setConnectionHealth] = useState(initialHealth);
  const [models, setModels] = useState<string[]>([]);
  const [visionModels, setVisionModels] = useState<string[]>([]);
  const [recommendedModels, setRecommendedModels] = useState({ chat: "", vision: "" });
  const initialUsesBundledWorkflow = initial.comfyWorkflowFile === BUNDLED_COMFY_WORKFLOW && initial.comfyMappingFile === BUNDLED_COMFY_MAPPING;
  const [imageMode, setImageMode] = useState<"recommended" | "custom" | "later">(
    !initial.comfyWorkflowFile && !initial.comfyMappingFile
      ? "later"
      : initialUsesBundledWorkflow
        ? (initialHealth.comfy || initial.comfyModelsDir.trim() ? "recommended" : "later")
        : "custom",
  );
  const [customImageFiles, setCustomImageFiles] = useState({
    workflow: initialUsesBundledWorkflow ? "" : initial.comfyWorkflowFile,
    mapping: initialUsesBundledWorkflow ? "" : initial.comfyMappingFile,
  });
  const [comfyDiagnostics, setComfyDiagnostics] = useState<ComfyDiagnostics | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkingImages, setCheckingImages] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modelHelp, setModelHelp] = useState<"chat" | "profile" | "vision" | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  useDialogFocus(cardRef);

  const checkConnections = async () => {
    setChecking(true);
    setError("");
    try {
      const next = await api.health();
      setConnectionHealth(next);
      if (next.ollama) {
        const result = await api.models();
        setModels(result.models);
        setVisionModels(result.options.filter((model) => model.capabilities.includes("vision")).map((model) => model.name));
        setRecommendedModels({ chat: result.recommendedChat, vision: result.recommendedVision });
        setDraftConfig((current) => current.chatModel || !result.recommendedChat
          ? current
          : { ...current, chatModel: result.recommendedChat, profileModel: "", visionModel: result.recommendedVision });
      } else {
        setModels([]);
        setVisionModels([]);
        setRecommendedModels({ chat: "", vision: "" });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not check the local services.");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void checkConnections();
  }, []);

  const chooseImageMode = (mode: "recommended" | "custom" | "later") => {
    setImageMode(mode);
    setComfyDiagnostics(null);
    setDraftConfig((current) => mode === "recommended"
      ? { ...current, comfyWorkflowFile: BUNDLED_COMFY_WORKFLOW, comfyMappingFile: BUNDLED_COMFY_MAPPING }
      : mode === "custom"
        ? { ...current, comfyWorkflowFile: customImageFiles.workflow, comfyMappingFile: customImageFiles.mapping }
        : { ...current, comfyWorkflowFile: "", comfyMappingFile: "" });
  };

  const updateCustomImageFile = (key: "workflow" | "mapping", value: string) => {
    setCustomImageFiles((current) => ({ ...current, [key]: value }));
    setDraftConfig((current) => ({
      ...current,
      [key === "workflow" ? "comfyWorkflowFile" : "comfyMappingFile"]: value,
    }));
    setComfyDiagnostics(null);
  };

  const checkImageSetup = async () => {
    setCheckingImages(true);
    setError("");
    try {
      setComfyDiagnostics(await api.comfyDiagnostics(draftConfig));
    } catch (reason) {
      setComfyDiagnostics(null);
      setError(reason instanceof Error ? reason.message : "The image setup could not be checked.");
    } finally {
      setCheckingImages(false);
    }
  };

  const finish = async () => {
    setSaving(true);
    setError("");
    try {
      const saved = await api.saveConfig(draftConfig);
      localStorage.setItem(SETUP_COMPLETE_KEY, "1");
      onComplete(saved, connectionHealth);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Setup could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const skip = () => {
    localStorage.setItem(SETUP_COMPLETE_KEY, "1");
    onSkip();
  };

  const ready = connectionHealth.ollama && Boolean(draftConfig.chatModel);
  const visionChoices = Array.from(new Set([
    ...(draftConfig.visionModel ? [draftConfig.visionModel] : []),
    ...visionModels,
  ]));
  const imagesLabel = imageMode === "later"
    ? "Add later"
    : comfyDiagnostics?.ready
      ? "Ready"
      : connectionHealth.comfy
        ? "Needs setup check"
        : "Configured · ComfyUI offline";
  const statusLabel = (connected: boolean, optional = false) => connected ? "Connected" : optional ? "Optional" : "Needs attention";

  return (
    <div className="setup-layer" role="dialog" aria-modal="true" aria-labelledby="setup-title">
      <section ref={cardRef} className="setup-card" tabIndex={-1}>
        <div className="setup-progress" aria-label={`Setup step ${step + 1} of 4`}>
          {[0, 1, 2, 3].map((item) => <i className={item <= step ? "active" : ""} key={item} />)}
        </div>

        {step === 0 && (
          <div className="setup-page setup-welcome">
            <img className="setup-mark" src="/animessenger-icon.svg?v=4" alt="" aria-hidden="true" />
            <p className="eyebrow">Welcome to AniMessenger</p>
            <h2 id="setup-title">Meet characters who remember you.</h2>
            <p>AniMessenger connects to AI tools on this computer to build character personalities, conversations, memories, and visual messages.</p>
            <label className="setup-name">
              <span>What should characters call you?</span>
              <input value={draftConfig.userName || ""} onChange={(event) => setDraftConfig((current) => ({ ...current, userName: event.target.value }))} placeholder="Your name or nickname" autoComplete="nickname" />
            </label>
            <div className="setup-promises">
              <span><b>Private</b> conversations and memory</span>
              <span><b>Searchable</b> characters across anime, games, manga, and more</span>
              <span><b>Optional</b> images through ComfyUI</span>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="setup-page">
            <p className="eyebrow">Local connections</p>
            <h2 id="setup-title">Let’s see what’s ready.</h2>
            <p><strong>Ollama is required to create and chat with characters.</strong> Independent catalogue and research sources supply character identity, while ComfyUI adds optional profile pictures and visual messages.</p>
            <div className="setup-services">
              <div className={"required " + (connectionHealth.ollama ? "connected" : "needs-attention")}>
                <span className="setup-status-dot" /><strong>Ollama</strong><small>Required to meet characters</small><em>{connectionHealth.ollama ? "Connected" : "Required · not connected"}</em>
              </div>
              <div className={connectionHealth.animadex ? "connected" : ""}>
                <span className="setup-status-dot" /><strong>Character catalogue</strong><small>Independent character search</small><em>{statusLabel(connectionHealth.animadex)}</em>
              </div>
              <div className={connectionHealth.comfy ? "connected" : "optional"}>
                <span className="setup-status-dot" /><strong>ComfyUI</strong><small>Optional images</small><em>{statusLabel(connectionHealth.comfy, true)}</em>
              </div>
            </div>
            <button type="button" className="setup-recheck" onClick={() => void checkConnections()} disabled={checking}>{checking ? "Checking…" : "Check connections again"}</button>
            {connectionHealth.ollama && models.length > 0 ? (
              <div className="setup-models">
                <div className="setup-model-field">
                  <div className="setup-model-label"><label htmlFor="setup-chat-model">Chat model</label><button type="button" aria-label="What does the chat model do?" aria-expanded={modelHelp === "chat"} onClick={() => setModelHelp((current) => current === "chat" ? null : "chat")}>i</button>{modelHelp === "chat" && <p role="tooltip">Writes every character reply. This choice has the biggest effect on personality, creativity, response speed, and memory use. Gemma 4 is recommended for the best AniMessenger experience.</p>}</div>
                  <select id="setup-chat-model" value={draftConfig.chatModel} onChange={(event) => setDraftConfig((current) => ({ ...current, chatModel: event.target.value }))}>{models.map((model) => <option value={model} key={model}>{model}{model === recommendedModels.chat ? " · Recommended" : ""}</option>)}</select>
                </div>
                <div className="setup-model-field">
                  <div className="setup-model-label"><label htmlFor="setup-profile-model">Profile model</label><button type="button" aria-label="What does the profile model do?" aria-expanded={modelHelp === "profile"} onClick={() => setModelHelp((current) => current === "profile" ? null : "profile")}>i</button>{modelHelp === "profile" && <p role="tooltip">Researches each new character once, shaping their long-term personality, voice, history, and visual identity. Using the chat model is usually simplest.</p>}</div>
                  <select id="setup-profile-model" value={draftConfig.profileModel} onChange={(event) => setDraftConfig((current) => ({ ...current, profileModel: event.target.value }))}><option value="">Same as chat · Recommended</option>{models.map((model) => <option value={model} key={model}>{model}</option>)}</select>
                </div>
                <div className="setup-model-field">
                  <div className="setup-model-label"><label htmlFor="setup-vision-model">Vision model</label><button type="button" aria-label="What does the vision model do?" aria-expanded={modelHelp === "vision"} onClick={() => setModelHelp((current) => current === "vision" ? null : "vision")}>i</button>{modelHelp === "vision" && <p role="tooltip">Looks at photos you attach so characters can react to what is actually in them. AniMessenger only recommends models Ollama confirms can see images. It does not generate pictures.</p>}</div>
                  <select id="setup-vision-model" value={draftConfig.visionModel} onChange={(event) => setDraftConfig((current) => ({ ...current, visionModel: event.target.value }))}><option value="">None yet</option>{visionChoices.map((model) => <option value={model} key={model}>{model}{model === recommendedModels.vision ? " · Suggested all-in-one" : visionModels.includes(model) ? " · Supports photos" : " · Not verified for photos"}</option>)}</select>
                </div>
                <p className="setup-model-note">{models.length === 1
                  ? `One installed model found. It can handle chat and profiles${recommendedModels.vision ? ", plus photo reactions" : "; photo reactions can be added later"}.`
                  : recommendedModels.vision
                    ? draftConfig.visionModel && draftConfig.visionModel !== recommendedModels.vision && visionModels.includes(draftConfig.visionModel)
                      ? `${recommendedModels.vision} is the balanced all-in-one Gemma 4 suggestion. ${draftConfig.visionModel} supports photos too and remains selected.`
                      : "AniMessenger recommends Gemma 4 for the best experience and picked a balanced installed model that can also handle photo reactions."
                    : "AniMessenger picked a balanced installed model. No installed model was confirmed for photo reactions; you can add one later."}</p>
                <div className="setup-model-performance"><OllamaGpuCheck ollamaUrl={draftConfig.ollamaUrl} model={draftConfig.chatModel} /></div>
              </div>
            ) : !checking && connectionHealth.ollama ? (
              <OllamaModelInstaller ollamaUrl={draftConfig.ollamaUrl} onInstalled={checkConnections} />
            ) : !checking && (
              <p className="setup-help setup-help-required"><b>Ollama is required before you can continue.</b> Start Ollama, then choose <b>Check connections again</b>. Once connected, AniMessenger can download a recommended model for you.</p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="setup-page setup-images">
            <p className="eyebrow">Image setup</p>
            <h2 id="setup-title">How should pictures work?</h2>
            <p>Use AniMessenger's tested ANIMA workflow, connect your own ComfyUI workflow, or keep chatting without images for now.</p>
            <div className="setup-image-choices" role="group" aria-label="Image workflow choice">
              <button type="button" className={imageMode === "recommended" ? "selected" : ""} aria-pressed={imageMode === "recommended"} onClick={() => chooseImageMode("recommended")}>
                <strong>Recommended</strong><b>AniMessenger workflow</b><span>The bundled workflow and mapping are selected automatically. Best for a first setup.</span>
              </button>
              <button type="button" className={imageMode === "custom" ? "selected" : ""} aria-pressed={imageMode === "custom"} onClick={() => chooseImageMode("custom")}>
                <strong>Advanced</strong><b>Use my workflow</b><span>Choose an API-format ComfyUI workflow and its AniMessenger mapping.</span>
              </button>
              <button type="button" className={imageMode === "later" ? "selected" : ""} aria-pressed={imageMode === "later"} onClick={() => chooseImageMode("later")}>
                <strong>Optional</strong><b>Add images later</b><span>Character chat still works. Return to this guide from Settings whenever you're ready.</span>
              </button>
            </div>
            {imageMode === "recommended" && (
              <>
                <div className="setup-image-detail">
                  <span><b>Workflow</b>Recommended ANIMA · standard nodes</span>
                  <span><b>Mapping</b>Included and selected automatically</span>
                </div>
                <ImagePackInstaller
                  modelsDirectory={draftConfig.comfyModelsDir}
                  outputDirectory={draftConfig.comfyOutputDir}
                  onModelsDirectoryChange={(value) => setDraftConfig((current) => ({ ...current, comfyModelsDir: value }))}
                  onOutputDirectoryChange={(value) => { setDraftConfig((current) => ({ ...current, comfyOutputDir: value })); setComfyDiagnostics(null); }}
                />
              </>
            )}
            {imageMode === "custom" && (
              <div className="setup-custom-workflow">
                <label><span>API workflow file</span><input value={draftConfig.comfyWorkflowFile} onChange={(event) => updateCustomImageFile("workflow", event.target.value)} placeholder="C:\\...\\workflow-api.json" /></label>
                <label><span>Workflow mapping file</span><input value={draftConfig.comfyMappingFile} onChange={(event) => updateCustomImageFile("mapping", event.target.value)} placeholder="C:\\...\\workflow.mapping.json" /></label>
                <p>Custom workflows are an advanced feature for now. The mapping tells AniMessenger where to place prompts, seeds, dimensions, and output names.</p>
              </div>
            )}
            {imageMode !== "later" && (
              <div className="setup-image-check">
                <div><strong>{connectionHealth.comfy ? "Check the complete image setup" : "ComfyUI is currently offline"}</strong><span>{connectionHealth.comfy ? "Validate the workflow, mapping, nodes, model files, LoRAs, and finished-images folder." : "Your workflow choice will be saved. Start ComfyUI later and run this check again."}</span></div>
                <button type="button" onClick={() => void checkImageSetup()} disabled={checkingImages}>{checkingImages ? "Checking…" : "Check image setup"}</button>
                {comfyDiagnostics && (
                  <div className={"comfy-diagnostics-result is-" + comfyDiagnostics.status}>
                    <p><i />{comfyDiagnostics.summary}</p>
                    {comfyDiagnostics.issues.length > 0 && <ul>{comfyDiagnostics.issues.map((issue) => (
                      <li className={"is-" + issue.severity} key={issue.code}><strong>{issue.title}</strong><span>{issue.detail}</span></li>
                    ))}</ul>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="setup-page setup-ready">
            <div className={ready ? "setup-ready-mark ready" : "setup-ready-mark"}>{ready ? "✓" : "!"}</div>
            <p className="eyebrow">{ready ? "Ready for your first chat" : "Almost there"}</p>
            <h2 id="setup-title">{ready ? "Who do you want to meet?" : "Ollama still needs a model."}</h2>
            <p>{ready ? "Search for a character across anime, games, manga, and more. AniMessenger will research them, build a local performance profile, and remember what happens between you." : "Go back to connect Ollama and choose a model before finishing setup."}</p>
            <div className="setup-summary">
              <span><b>Chat</b>{ready ? draftConfig.chatModel : "Not configured"}</span>
              <span><b>Character search</b>{connectionHealth.animadex ? "Online" : "Offline preview"}</span>
              <span><b>Images</b>{imagesLabel}</span>
            </div>
          </div>
        )}

        {error && <p className="form-error setup-error">{error}</p>}
        <footer className="setup-actions">
          {Boolean(initial.chatModel) && <button type="button" className="setup-skip" onClick={skip}>Close guide</button>}
          <span />
          {step > 0 && <button type="button" onClick={() => setStep((current) => current - 1)}>Back</button>}
          {step < 3
            ? <button type="button" className="setup-primary" onClick={() => setStep((current) => current + 1)} disabled={step === 1 && !ready}>{step === 0 ? "Get started" : "Continue"}</button>
            : <button type="button" className="setup-primary" onClick={() => void finish()} disabled={!ready || saving}>{saving ? "Saving…" : "Finish setup"}</button>}
        </footer>
      </section>
    </div>
  );
}

export function AniMessengerApp() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState("");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [mode, setMode] = useState<"chats" | "discover">("chats");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<AnimaCharacter[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingPhoto, setPendingPhoto] = useState<PendingPhoto | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [capturingMoment, setCapturingMoment] = useState(false);
  const [typingSpeakerId, setTypingSpeakerId] = useState("");
  const [searching, setSearching] = useState(false);
  const [building, setBuilding] = useState<AnimaCharacter | null>(null);
  const [avatarGenerating, setAvatarGenerating] = useState<Record<string, boolean>>({});
  const [showProfile, setShowProfile] = useState(false);
  const [showGuestPicker, setShowGuestPicker] = useState(false);
  const [guestSearch, setGuestSearch] = useState("");
  const [cameoUpdating, setCameoUpdating] = useState(false);
  const [showIdentityEditor, setShowIdentityEditor] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Thread | null>(null);
  const [deletingChat, setDeletingChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState("");
  const [recentEmoji, setRecentEmoji] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(RECENT_EMOJI_KEY) || "[]");
      return Array.isArray(saved) ? saved.filter((item) => typeof item === "string").slice(0, 15) : [];
    } catch {
      return [];
    }
  });
  const [reactionTarget, setReactionTarget] = useState<string | null>(null);
  const [profileTab, setProfileTab] = useState<"profile" | "memories" | "gallery">("profile");
  const [memoryUpdating, setMemoryUpdating] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState<LightboxState | null>(null);
  const [unavailableImageIds, setUnavailableImageIds] = useState<Set<string>>(() => new Set());
  const [retryingImageIds, setRetryingImageIds] = useState<Set<string>>(() => new Set());
  const [imageReloadVersion, setImageReloadVersion] = useState(0);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [health, setHealth] = useState({ ollama: false, comfy: false, animadex: false });
  const [serviceReachable, setServiceReachable] = useState(false);
  const [healthReady, setHealthReady] = useState(false);
  const [healthChecking, setHealthChecking] = useState(false);
  const [notice, setNotice] = useState("");
  const [relationshipMilestones, setRelationshipMilestones] = useState<RelationshipMilestone[]>([]);
  const [visibleMessageLimit, setVisibleMessageLimit] = useState(MESSAGE_BATCH_SIZE);
  const [loadingThreadId, setLoadingThreadId] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const emojiSearchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const profileCardRef = useRef<HTMLElement>(null);
  const guestCardRef = useRef<HTMLElement>(null);
  const deleteCardRef = useRef<HTMLElement>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const proactiveCheckingRef = useRef(false);
  const activeIdRef = useRef("");
  const threadsRef = useRef<Thread[]>([]);
  const lightboxStageRef = useRef<HTMLDivElement>(null);
  const lightboxImageRef = useRef<HTMLImageElement>(null);
  const lightboxGestureRef = useRef<LightboxGesture | null>(null);
  const lightboxLastTapRef = useRef(0);
  const lightboxTouchUsedAtRef = useRef(0);
  const lightboxZoomRef = useRef<LightboxZoom>({ scale: 1, x: 0, y: 0 });
  const lightboxFrameRef = useRef<number | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState<LightboxZoom>({ scale: 1, x: 0, y: 0 });
  const sendInFlightRef = useRef(false);
  const reactionInFlightRef = useRef(false);
  const reactionTypingTimerRef = useRef<number | null>(null);
  const imageRecoveryPendingRef = useRef(false);
  const keyboardAnchorTimersRef = useRef<number[]>([]);
  const appShellRef = useRef<HTMLElement>(null);
  const chatListSwipeRef = useRef<ChatListSwipe | null>(null);
  const chatListSwipeTimerRef = useRef<number | null>(null);
  useDialogFocus(profileCardRef, showProfile);
  useDialogFocus(guestCardRef, showGuestPicker);
  useDialogFocus(deleteCardRef, Boolean(deleteTarget));
  useDialogFocus(lightboxRef, Boolean(fullScreenImage));

  useEffect(() => () => {
    if (chatListSwipeTimerRef.current !== null) window.clearTimeout(chatListSwipeTimerRef.current);
  }, []);

  useEffect(() => {
    const milestone = relationshipMilestones[0];
    if (!milestone) return;
    const timer = window.setTimeout(() => {
      setRelationshipMilestones((current) => current.filter((item) => item.id !== milestone.id));
    }, 5200);
    return () => window.clearTimeout(timer);
  }, [relationshipMilestones]);

  const active = threads.find((thread) => thread.id === activeId) ?? threads[0];
  threadsRef.current = threads;
  const relationshipMilestone = relationshipMilestones[0];
  const activeGuestId = active?.cameo?.activeGuest?.characterId || "";
  const activeGuestThread = threads.find((thread) => thread.character.id === activeGuestId);
  const typingCharacter = threads.find((thread) => thread.character.id === typingSpeakerId)?.character || active?.character;
  const guestOptions = useMemo(() => {
    const query = guestSearch.trim().toLowerCase();
    return threads.filter((thread) => thread.profile && thread.id !== active?.id && (!query
      || (characterDisplayName(thread.character) + " " + thread.character.name + " " + thread.character.series).toLowerCase().includes(query)));
  }, [active?.id, guestSearch, threads]);
  const activeVisualIdentity = active?.profile?.visual.userOverrides?.identity ?? active?.profile?.visual.identity ?? [];
  const activeGallery = useMemo<LightboxItem[]>(() => {
    if (!active) return [];
    return active.messages
      .filter((message) => message.from === "character" && Boolean(message.image) && (!message.speakerId || message.speakerId === active.character.id) && !unavailableImageIds.has(message.id))
      .map((message) => ({
        id: message.id,
        src: message.image!,
        alt: message.imageOrigin === "captured_moment"
          ? "Captured moment with " + characterDisplayName(active.character)
          : characterDisplayName(active.character) + " shared an image",
        time: message.time,
        generation: message.generation,
        retryable: Boolean(message.generated),
      }));
  }, [active, unavailableImageIds]);
  const visibleMessages = useMemo(() => active?.messages.slice(-visibleMessageLimit) ?? [], [active?.messages, visibleMessageLimit]);
  const hiddenMessageCount = Math.max(0, (active?.messages.length ?? 0) - visibleMessages.length);
  const selectedLightboxImage = fullScreenImage?.items[fullScreenImage.index];
  const filteredEmoji = useMemo(() => {
    const query = emojiSearch.trim().toLowerCase();
    if (!query) return emojiCatalog;
    return emojiCatalog.filter(([emoji, keywords]) => emoji.includes(query) || keywords.includes(query));
  }, [emojiSearch]);

  useEffect(() => {
    if (!showEmoji) return;
    window.requestAnimationFrame(() => emojiSearchRef.current?.focus());
    const closeEmoji = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setShowEmoji(false);
      composerRef.current?.focus();
    };
    window.addEventListener("keydown", closeEmoji);
    return () => window.removeEventListener("keydown", closeEmoji);
  }, [showEmoji]);

  const changeModeFromKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const nextMode = mode === "chats" ? "discover" : "chats";
    setMode(nextMode);
    setSearch("");
    window.requestAnimationFrame(() => document.getElementById("character-tab-" + nextMode)?.focus());
  };

  const changeProfileTabFromKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const tabs = ["profile", "memories", "gallery"] as const;
    const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (!direction) return;
    event.preventDefault();
    const next = tabs[(tabs.indexOf(profileTab) + direction + tabs.length) % tabs.length];
    setProfileTab(next);
    window.requestAnimationFrame(() => document.getElementById("profile-tab-" + next)?.focus());
  };

  const syncMobileViewportHeight = () => {
    if (window.innerWidth > 760) {
      document.documentElement.style.removeProperty("--mobile-viewport-height");
      return;
    }
    const height = window.visualViewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty("--mobile-viewport-height", Math.round(height) + "px");
  };

  const anchorComposerAfterKeyboard = () => {
    keyboardAnchorTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    keyboardAnchorTimersRef.current = [];

    const anchor = () => {
      syncMobileViewportHeight();
      const scroll = scrollRef.current;
      if (scroll) scroll.scrollTo({ top: scroll.scrollHeight, behavior: "auto" });
    };

    anchor();
    keyboardAnchorTimersRef.current = [80, 220, 420].map((delay) => window.setTimeout(anchor, delay));
  };
  activeIdRef.current = active?.id || activeId;
  const visibleThreads = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (mode !== "chats" || !query) return threads;
    return threads.filter(({ character }) => (characterDisplayName(character) + " " + character.name + " " + character.series).toLowerCase().includes(query));
  }, [mode, search, threads]);

  useEffect(() => {
    Promise.allSettled([api.threads(), api.config(), api.health()])
      .then(([threadResult, configResult, healthResult]) => {
        const loadedThreads = threadResult.status === "fulfilled" ? threadResult.value.threads : [];
        const loadedConfig = configResult.status === "fulfilled" ? configResult.value : null;
        const first = loadedThreads[0];

        if (threadResult.status === "fulfilled") {
          setThreads(loadedThreads);
          setActiveId(first?.id ?? "");
        }
        if (loadedConfig) setConfig(loadedConfig);
        if (healthResult.status === "fulfilled") setHealth(healthResult.value);
        else setHealth({ ollama: false, comfy: false, animadex: false });
        setServiceReachable(healthResult.status === "fulfilled");
        setHealthReady(true);

        const failures = [threadResult, configResult, healthResult].filter((result) => result.status === "rejected");
        if (failures.length > 0 && failures.length < 3) {
          setNotice("AniMessenger loaded the local data it could. Retry the connection to restore anything still unavailable.");
        } else if (failures.length === 3) {
          const reason = failures[0].status === "rejected" ? failures[0].reason : null;
          setNotice(reason instanceof Error ? reason.message : "The local AniMessenger service is unavailable.");
        }

        let setupComplete = false;
        try {
          setupComplete = localStorage.getItem(SETUP_COMPLETE_KEY) === "1";
        } catch {
          setupComplete = false;
        }
        if (!setupComplete && threadResult.status === "fulfilled" && configResult.status === "fulfilled"
          && loadedThreads.length === 0 && !loadedConfig?.chatModel) setShowSetup(true);
        if (first) {
          setLoadingThreadId(first.id);
          const load = first.unreadCount ? api.markRead(first.id) : api.thread(first.id);
          void load.then((result) => {
            mergeThread(result.thread);
          }).catch(() => undefined).finally(() => setLoadingThreadId((current) => current === first.id ? "" : current));
        }
      });
  }, []);

  useEffect(() => {
    const syncChangedThreads = async () => {
      const summaries = (await api.threads()).threads;
      for (const summary of summaries) {
        const local = threadsRef.current.find((thread) => thread.id === summary.id);
        if (!local || String(summary.updatedAt || "") > String(local.updatedAt || "")) {
          const result = await api.thread(summary.id);
          mergeThread(result.thread);
        }
      }
    };
    const poll = () => {
      void api.health()
        .then((next) => {
          setServiceReachable(true);
          setHealth(next);
          setHealthReady(true);
          void syncChangedThreads().catch(() => undefined);
        })
        .catch(() => { setServiceReachable(false); setHealth({ ollama: false, comfy: false, animadex: false }); setHealthReady(true); });
    };
    const timer = window.setInterval(poll, 30000);
    window.addEventListener("focus", poll);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", poll);
    };
  }, []);

  const retryConnections = async () => {
    setHealthChecking(true);
    try {
      const [healthResult, threadResult, configResult] = await Promise.allSettled([
        api.health(),
        threads.length === 0 ? api.threads() : Promise.resolve(null),
        config ? Promise.resolve(null) : api.config(),
      ]);
      if (healthResult.status === "rejected") throw healthResult.reason;

      const next = healthResult.value;
      setServiceReachable(true);
      setHealth(next);
      setHealthReady(true);

      if (configResult.status === "fulfilled" && configResult.value) setConfig(configResult.value);
      if (threadResult.status === "fulfilled" && threadResult.value) {
        const restoredThreads = threadResult.value.threads;
        setThreads(restoredThreads);
        const first = restoredThreads[0];
        setActiveId(first?.id ?? "");
        if (first) {
          setLoadingThreadId(first.id);
          const load = first.unreadCount ? api.markRead(first.id) : api.thread(first.id);
          void load.then((result) => mergeThread(result.thread))
            .catch(() => undefined)
            .finally(() => setLoadingThreadId((current) => current === first.id ? "" : current));
        }
      }

      const localDataStillUnavailable = threadResult.status === "rejected" || configResult.status === "rejected";
      setNotice(!next.ollama
        ? "Ollama is still offline. Start it, then retry."
        : mode === "discover" && !next.animadex
          ? "Character search is still offline. The built-in preview remains available; try reconnecting again in a moment."
        : localDataStillUnavailable
          ? "The connection is back, but some local data could not be reloaded yet. Try once more."
          : "");
      if (next.comfy) setImageReloadVersion((current) => current + 1);
    } catch {
      setServiceReachable(false);
      setHealth({ ollama: false, comfy: false, animadex: false });
      setHealthReady(true);
      setNotice("AniMessenger's local service is not responding. Restart AniMessenger, then reload this page.");
    } finally {
      setHealthChecking(false);
    }
  };

  useEffect(() => {
    document.documentElement.dataset.accent = "signal";
  }, []);

  useEffect(() => {
    if (mode !== "discover") return;
    const query = search.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setSearching(true);
      api.search(query)
        .then((result) => {
          setResults(result.results);
          setNotice("");
        })
        .catch((reason) => {
          setResults([]);
          setNotice(reason instanceof Error ? reason.message : "Character search failed.");
        })
        .finally(() => setSearching(false));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [mode, search, health.animadex]);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;

    const settleAtBottom = () => {
      scroll.scrollTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    };

    // A conversation switch can otherwise inherit the previous thread's scroll
    // position. Safari occasionally keeps that stale layer blank until the user
    // scrolls, so settle once before paint and again after layout/compositing.
    settleAtBottom();
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      settleAtBottom();
      secondFrame = window.requestAnimationFrame(settleAtBottom);
    });
    const settleTimer = window.setTimeout(settleAtBottom, 180);

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(settleTimer);
    };
  }, [active?.id, active?.messages.length, loadingThreadId, typing, visibleMessageLimit]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const handleViewportChange = () => {
      syncMobileViewportHeight();
      if (document.activeElement === composerRef.current) {
        window.requestAnimationFrame(() => {
          const scroll = scrollRef.current;
          if (scroll) scroll.scrollTo({ top: scroll.scrollHeight, behavior: "auto" });
        });
      }
    };

    handleViewportChange();
    viewport?.addEventListener("resize", handleViewportChange);
    viewport?.addEventListener("scroll", handleViewportChange);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("orientationchange", handleViewportChange);

    return () => {
      viewport?.removeEventListener("resize", handleViewportChange);
      viewport?.removeEventListener("scroll", handleViewportChange);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("orientationchange", handleViewportChange);
      keyboardAnchorTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      document.documentElement.style.removeProperty("--mobile-viewport-height");
    };
  }, []);

  useEffect(() => {
    setReactionTarget(null);
    setVisibleMessageLimit(MESSAGE_BATCH_SIZE);
  }, [active?.id]);

  useLayoutEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, 112);
    textarea.style.height = nextHeight + "px";
    textarea.style.overflowY = textarea.scrollHeight > 112 ? "auto" : "hidden";
  }, [draft]);

  useEffect(() => {
    if (!fullScreenImage) return;
    const handleLightboxKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullScreenImage(null);
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        setFullScreenImage((current) => {
          if (!current || current.items.length < 2) return current;
          const delta = event.key === "ArrowLeft" ? -1 : 1;
          return { ...current, index: (current.index + delta + current.items.length) % current.items.length };
        });
      }
    };
    window.addEventListener("keydown", handleLightboxKeys);
    return () => window.removeEventListener("keydown", handleLightboxKeys);
  }, [fullScreenImage]);

  useEffect(() => {
    const reset = { scale: 1, x: 0, y: 0 };
    lightboxZoomRef.current = reset;
    setLightboxZoom(reset);
    if (lightboxImageRef.current) lightboxImageRef.current.style.transform = "translate3d(0px, 0px, 0) scale(1)";
    lightboxGestureRef.current = null;
    lightboxLastTapRef.current = 0;
  }, [selectedLightboxImage?.id]);

  useEffect(() => () => {
    if (lightboxFrameRef.current !== null) window.cancelAnimationFrame(lightboxFrameRef.current);
  }, []);

  useEffect(() => {
    if (!showProfile || showIdentityEditor) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !fullScreenImage) setShowProfile(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showProfile, showIdentityEditor, fullScreenImage]);

  useEffect(() => {
    if (!deleteTarget) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deletingChat) setDeleteTarget(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteTarget, deletingChat]);

  useEffect(() => {
    if (!showGuestPicker) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !cameoUpdating) setShowGuestPicker(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showGuestPicker, cameoUpdating]);

  function mergeThread(next: Thread, activate = false) {
    setThreads((current) => {
      const existing = current.find((thread) => thread.id === next.id);
      const nextUpdatedAt = String(next.updatedAt || "");
      const existingUpdatedAt = String(existing?.updatedAt || "");
      const newestSnapshot = !existing || nextUpdatedAt >= existingUpdatedAt ? next : existing;
      const olderSnapshot = newestSnapshot === next ? existing : next;
      const messagesById = new Map(
        (olderSnapshot?.messages || []).map((message) => [message.id, message]),
      );
      for (const message of newestSnapshot.messages) {
        const mergedMessage: Message = { ...messagesById.get(message.id), ...message };
        if (!Object.hasOwn(message, "delivery")) delete mergedMessage.delivery;
        messagesById.set(message.id, mergedMessage);
      }
      const orderedMessageIds = [
        ...newestSnapshot.messages.map((message) => message.id),
        ...(olderSnapshot?.messages || [])
          .map((message) => message.id)
          .filter((id) => !newestSnapshot.messages.some((message) => message.id === id)),
      ];
      const mergedThread = {
        ...newestSnapshot,
        messages: orderedMessageIds.map((id) => messagesById.get(id)!),
      };
      const merged = existing
        ? current.map((thread) => thread.id === next.id ? mergedThread : thread)
        : [mergedThread, ...current];
      return [...merged].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    });
    if (activate) setActiveId(next.id);
  }

  function replaceThread(next: Thread) {
    mergeThread(next, true);
  }

  const openProfile = () => {
    setProfileTab("profile");
    setShowProfile(true);
  };

  const inviteGuest = async (guestCharacterId: string) => {
    if (!active || cameoUpdating) return;
    setCameoUpdating(true);
    setNotice("");
    try {
      const result = await api.inviteGuest(active.id, guestCharacterId);
      replaceThread(result.thread);
      setPendingPhoto(null);
      setGuestSearch("");
      setShowGuestPicker(false);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "That guest could not join the conversation.");
    } finally {
      setCameoUpdating(false);
    }
  };

  const removeGuest = async () => {
    if (!active || cameoUpdating) return;
    setCameoUpdating(true);
    setNotice("");
    try {
      const result = await api.removeGuest(active.id);
      replaceThread(result.thread);
      if (result.relatedThread) mergeThread(result.relatedThread, false);
      setShowGuestPicker(false);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "The guest encounter could not be ended.");
    } finally {
      setCameoUpdating(false);
    }
  };

  const backfillActiveMemories = async () => {
    if (!active || memoryUpdating) return;
    setMemoryUpdating(true);
    setNotice("");
    try {
      const result = await api.backfillMemories(active.id);
      replaceThread(result.thread);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Earlier chat memories could not be scanned.");
    } finally {
      setMemoryUpdating(false);
    }
  };

  const forgetActiveMemory = async (memoryId: string) => {
    if (!active) return;
    try {
      const result = await api.forgetMemory(active.id, memoryId);
      replaceThread(result.thread);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "That memory could not be forgotten.");
    }
  };

  const clampLightboxZoom = (zoom: LightboxZoom): LightboxZoom => {
    const scale = Math.min(4, Math.max(1, zoom.scale));
    if (scale === 1) return { scale: 1, x: 0, y: 0 };
    const rect = lightboxStageRef.current?.getBoundingClientRect();
    if (!rect) return { scale, x: zoom.x, y: zoom.y };
    const maxX = rect.width * (scale - 1) / 2;
    const maxY = rect.height * (scale - 1) / 2;
    return {
      scale,
      x: Math.min(maxX, Math.max(-maxX, zoom.x)),
      y: Math.min(maxY, Math.max(-maxY, zoom.y)),
    };
  };

  const paintLightboxZoom = (zoom: LightboxZoom, commit = false) => {
    const next = clampLightboxZoom(zoom);
    lightboxZoomRef.current = next;
    if (lightboxFrameRef.current === null) {
      lightboxFrameRef.current = window.requestAnimationFrame(() => {
        const current = lightboxZoomRef.current;
        if (lightboxImageRef.current) {
          lightboxImageRef.current.style.transform = `translate3d(${current.x}px, ${current.y}px, 0) scale(${current.scale})`;
        }
        lightboxFrameRef.current = null;
      });
    }
    if (commit) setLightboxZoom(next);
    return next;
  };

  const resetLightboxZoom = () => paintLightboxZoom({ scale: 1, x: 0, y: 0 }, true);

  const moveLightbox = (delta: number) => {
    resetLightboxZoom();
    setFullScreenImage((current) => {
      if (!current || current.items.length < 2) return current;
      return { ...current, index: (current.index + delta + current.items.length) % current.items.length };
    });
  };

  const touchDistance = (touches: React.TouchList) => {
    const first = touches[0];
    const second = touches[1];
    return first && second ? Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY) : 0;
  };

  const touchMidpoint = (touches: React.TouchList) => {
    const first = touches[0];
    const second = touches[1];
    return first && second
      ? { x: (first.clientX + second.clientX) / 2, y: (first.clientY + second.clientY) / 2 }
      : { x: first?.clientX ?? 0, y: first?.clientY ?? 0 };
  };

  const startLightboxGesture = (event: React.TouchEvent<HTMLDivElement>) => {
    lightboxTouchUsedAtRef.current = Date.now();
    const first = event.touches[0];
    if (!first) return;
    if (event.touches.length >= 2) {
      const midpoint = touchMidpoint(event.touches);
      lightboxGestureRef.current = {
        mode: "pinch",
        startX: first.clientX,
        startY: first.clientY,
        startDistance: touchDistance(event.touches),
        startMidX: midpoint.x,
        startMidY: midpoint.y,
        startZoom: lightboxZoomRef.current,
      };
      return;
    }
    lightboxGestureRef.current = {
      mode: lightboxZoomRef.current.scale > 1 ? "pan" : "swipe",
      startX: first.clientX,
      startY: first.clientY,
      startDistance: 0,
      startMidX: first.clientX,
      startMidY: first.clientY,
      startZoom: lightboxZoomRef.current,
    };
  };

  const moveLightboxGesture = (event: React.TouchEvent<HTMLDivElement>) => {
    const gesture = lightboxGestureRef.current;
    if (!gesture) return;
    if (event.touches.length >= 2) {
      event.preventDefault();
      const midpoint = touchMidpoint(event.touches);
      const distance = touchDistance(event.touches);
      const scale = gesture.startDistance > 0 ? gesture.startZoom.scale * distance / gesture.startDistance : gesture.startZoom.scale;
      paintLightboxZoom({
        scale,
        x: gesture.startZoom.x + midpoint.x - gesture.startMidX,
        y: gesture.startZoom.y + midpoint.y - gesture.startMidY,
      });
      return;
    }
    const first = event.touches[0];
    if (!first || gesture.mode !== "pan") return;
    event.preventDefault();
    paintLightboxZoom({
      ...gesture.startZoom,
      x: gesture.startZoom.x + first.clientX - gesture.startX,
      y: gesture.startZoom.y + first.clientY - gesture.startY,
    });
  };

  const finishLightboxGesture = (event: React.TouchEvent<HTMLDivElement>) => {
    lightboxTouchUsedAtRef.current = Date.now();
    if (event.touches.length > 0) return;
    const gesture = lightboxGestureRef.current;
    lightboxGestureRef.current = null;
    if (!gesture) return;
    const end = event.changedTouches[0];
    const movedX = end ? end.clientX - gesture.startX : 0;
    const movedY = end ? end.clientY - gesture.startY : 0;
    const currentZoom = lightboxZoomRef.current;
    if (gesture.mode === "swipe" && currentZoom.scale === 1 && Math.abs(movedX) >= 48 && Math.abs(movedX) > Math.abs(movedY)) {
      moveLightbox(movedX < 0 ? 1 : -1);
      return;
    }
    if (gesture.mode === "pinch" || gesture.mode === "pan" || Math.hypot(movedX, movedY) > 12) {
      setLightboxZoom(currentZoom);
      return;
    }
    const now = Date.now();
    if (now - lightboxLastTapRef.current < 320) {
      lightboxLastTapRef.current = 0;
      if (currentZoom.scale > 1) resetLightboxZoom();
      else {
        const rect = lightboxStageRef.current?.getBoundingClientRect();
        const scale = 2.5;
        paintLightboxZoom({
          scale,
          x: rect && end ? (rect.left + rect.width / 2 - end.clientX) * (scale - 1) : 0,
          y: rect && end ? (rect.top + rect.height / 2 - end.clientY) * (scale - 1) : 0,
        }, true);
      }
    } else {
      lightboxLastTapRef.current = now;
    }
  };

  const markImageUnavailable = (messageId: string) => {
    setUnavailableImageIds((current) => {
      if (current.has(messageId)) return current;
      const next = new Set(current);
      next.add(messageId);
      return next;
    });
    setFullScreenImage((current) => {
      if (!current?.items.some((item) => item.id === messageId)) return current;
      const items = current.items.filter((item) => item.id !== messageId);
      if (!items.length) return null;
      return { items, index: Math.min(current.index, items.length - 1) };
    });
  };

  const handleImageLoadError = (messageId: string) => {
    void api.health().then(() => {
      setServiceReachable(true);
      // The app is reachable, so this individual file is genuinely unavailable.
      markImageUnavailable(messageId);
    }).catch(() => {
      // A stopped Vite proxy makes every image look missing. Keep the entries and
      // remount them once the local app is reachable again instead of hiding them.
      if (imageRecoveryPendingRef.current) return;
      imageRecoveryPendingRef.current = true;
      setServiceReachable(false);
      setHealth({ ollama: false, comfy: false, animadex: false });
      setHealthReady(true);
      setNotice("Images could not reconnect to AniMessenger's local service. Your gallery is still safe; the app will keep trying.");
      const retry = () => {
        window.setTimeout(() => {
          void api.health().then((nextHealth) => {
            setServiceReachable(true);
            setHealth(nextHealth);
            setImageReloadVersion((current) => current + 1);
            imageRecoveryPendingRef.current = false;
          }).catch(retry);
        }, 1500);
      };
      retry();
    });
  };

  const reloadUnavailableImage = (messageId: string) => {
    setUnavailableImageIds((current) => {
      const next = new Set(current);
      next.delete(messageId);
      return next;
    });
    setImageReloadVersion((current) => current + 1);
  };

  const openThread = (thread: Thread) => {
    setPendingPhoto(null);
    if (fileRef.current) fileRef.current.value = "";
    const opened = { ...thread, unreadCount: 0 };
    mergeThread(opened, true);
    if (thread.summary) {
      setLoadingThreadId(thread.id);
      const load = thread.unreadCount ? api.markRead(thread.id) : api.thread(thread.id);
      void load
        .then((result) => mergeThread(result.thread))
        .catch((reason) => setNotice(reason instanceof Error ? reason.message : "That conversation could not be loaded."))
        .finally(() => setLoadingThreadId((current) => current === thread.id ? "" : current));
    } else if (thread.unreadCount) {
      void api.markRead(thread.id).then((result) => mergeThread(result.thread)).catch(() => undefined);
    }
    setMobileChatOpen(true);
    setMode("chats");
    setSearch("");
  };

  const openCharacter = async (character: AnimaCharacter) => {
    setPendingPhoto(null);
    if (fileRef.current) fileRef.current.value = "";
    setBuilding(character);
    setNotice("");
    try {
      const existing = threads.find((thread) => thread.character.id === character.id);
      if (existing?.profile) {
        openThread(existing);
        return;
      }
      const started = existing ?? (await api.startThread(character)).thread;
      // Enter the conversation immediately with the source-neutral letter avatar.
      // Profile research continues in context instead of blocking behind a modal.
      openThread(started);
      const result = await api.buildProfile(character);
      replaceThread(result.thread);
      if (result.avatarJob) {
        setAvatarGenerating((current) => ({ ...current, [character.id]: true }));
        void watchImage(result.avatarJob.promptId, result.thread)
          .catch((reason) => setNotice(reason instanceof Error ? reason.message : "The profile picture could not be generated."))
          .finally(() => setAvatarGenerating((current) => ({ ...current, [character.id]: false })));
      }
      setMobileChatOpen(true);
      setMode("chats");
      setSearch("");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "The character profile could not be built.");
    } finally {
      setBuilding(null);
    }
  };

  const watchImage = async (promptId: string, _thread?: Thread, activate = true) => {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
      const status = await api.imageStatus(promptId);
      if (status.thread && (status.status === "complete" || status.status === "error")) {
        mergeThread(status.thread, activate);
        return status.thread;
      }
      if (status.status === "error") throw new Error(status.error || "ComfyUI generation failed.");
      if (status.status === "complete") {
        throw new Error("The image finished, but AniMessenger could not reconnect it to its original request. Refresh the chat and try again.");
      }
    }
    throw new Error("ComfyUI is still working on the image.");
  };

  useEffect(() => {
    if (!config?.proactiveEnabled || config.proactivePace === "off") return;
    let disposed = false;
    const check = async () => {
      if (disposed || proactiveCheckingRef.current || document.visibilityState === "hidden") return;
      proactiveCheckingRef.current = true;
      try {
        const result = await api.proactiveCheck(activeIdRef.current);
        if (disposed) return;
        if (result.thread) mergeThread(result.thread);
        if (result.imageJob) {
          void watchImage(result.imageJob.promptId, result.thread, false)
            .catch(() => undefined);
        }
      } catch {
        // Proactive outreach is optional and should never interrupt normal chat.
      } finally {
        proactiveCheckingRef.current = false;
      }
    };
    const initial = window.setTimeout(() => void check(), 2500);
    const interval = window.setInterval(() => void check(), 5 * 60 * 1000);
    const onFocus = () => void check();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void check();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [config?.proactiveEnabled, config?.proactivePace]);

  const regenerateAvatar = async () => {
    if (!active || !health.comfy || avatarGenerating[active.character.id]) return;
    const characterId = active.character.id;
    setAvatarGenerating((current) => ({ ...current, [characterId]: true }));
    setNotice("");
    try {
      const job = await api.generateAvatar(characterId);
      await watchImage(job.promptId, active);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "The profile picture could not be generated.");
    } finally {
      setAvatarGenerating((current) => ({ ...current, [characterId]: false }));
    }
  };

  const retryGeneratedImage = async (messageId: string) => {
    if (!active || retryingImageIds.has(messageId)) return;
    const characterId = active.id;
    const baseThread = active;
    setRetryingImageIds((current) => new Set(current).add(messageId));
    setNotice("");
    try {
      const job = await api.retryImage(characterId, messageId);
      const updated = await watchImage(job.promptId, baseThread);
      const replacement = updated?.messages.find((message) => message.id === messageId);
      setUnavailableImageIds((current) => {
        if (!current.has(messageId)) return current;
        const next = new Set(current);
        next.delete(messageId);
        return next;
      });
      if (replacement?.image) {
        setFullScreenImage((current) => {
          if (!current?.items.some((item) => item.id === messageId)) return current;
          return {
            ...current,
            items: current.items.map((item) => item.id === messageId
              ? { ...item, src: replacement.image!, generation: replacement.generation }
              : item),
          };
        });
      }
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "That image could not be retried.");
    } finally {
      setRetryingImageIds((current) => {
        const next = new Set(current);
        next.delete(messageId);
        return next;
      });
    }
  };

  const confirmDeleteChat = async () => {
    if (!deleteTarget || deletingChat) return;
    setDeletingChat(true);
    setNotice("");
    try {
      await api.deleteThread(deleteTarget.id);
      const remaining = threads.filter((thread) => thread.id !== deleteTarget.id);
      setThreads(remaining);
      setActiveId(remaining[0]?.id ?? "");
      setMobileChatOpen(false);
      setShowProfile(false);
      setDeleteTarget(null);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "The chat could not be deleted.");
    } finally {
      setDeletingChat(false);
    }
  };

  const send = async (text: string, image?: string, retryMessage?: Message) => {
    if (!active || typing || sendInFlightRef.current || reactionInFlightRef.current) return;
    sendInFlightRef.current = true;
    const clientMessageId = retryMessage?.id || "client-" + localMessageId();
    const optimisticMessage: Message = {
      id: clientMessageId,
      from: "user",
      ...(text ? { text } : {}),
      ...(image ? { image } : {}),
      retryText: text,
      delivery: "sending",
      time: new Date().toISOString(),
    };
    const focusSpeakerId = anticipatedCameoSpeakerId(active, activeGuestThread, text);
    replaceThread({
      ...active,
      messages: [...active.messages.filter((message) => message.id !== clientMessageId), optimisticMessage],
      updatedAt: new Date().toISOString(),
    });
    setTyping(true);
    setTypingSpeakerId(focusSpeakerId);
    setReactionTarget(null);
    setNotice("");
    try {
      let response;
      try {
        response = await api.chat(active.id, text, image, clientMessageId, focusSpeakerId);
      } catch (reason) {
        setThreads((current) => current.map((thread) => thread.id === active.id
          ? { ...thread, messages: thread.messages.map((message) => message.id === clientMessageId ? { ...message, delivery: "failed" } : message) }
          : thread));
        try {
          const nextHealth = await api.health();
          setServiceReachable(true);
          setHealth(nextHealth);
          setHealthReady(true);
          setNotice(nextHealth.ollama ? (reason instanceof Error ? reason.message : "The character could not reply.") : "Ollama is offline. Your message is still here—start Ollama, then tap Retry beneath it.");
        } catch {
          setServiceReachable(false);
          setHealth({ ollama: false, comfy: false, animadex: false });
          setHealthReady(true);
          setNotice("AniMessenger's local service stopped responding. Your saved chats are safe; restart AniMessenger, then tap Retry beneath the message.");
        }
        return;
      }
      const relationshipUpdates = [response.thread, ...(response.relatedThreads || [])];
      const newMilestones = relationshipUpdates.flatMap((nextThread) => {
        const previousThread = nextThread.id === active.id
          ? active
          : threads.find((thread) => thread.id === nextThread.id);
        if (!previousThread || !crossedRelationshipThreshold(previousThread.relationship, nextThread.relationship)) return [];
        return [{
          id: clientMessageId + "-" + nextThread.id + "-" + nextThread.relationship,
          character: nextThread.character,
          relationship: nextThread.relationship,
          label: relationshipLabel(nextThread.relationship),
        } satisfies RelationshipMilestone];
      });
      if (newMilestones.length) {
        setRelationshipMilestones((current) => [
          ...current,
          ...newMilestones.filter((milestone) => !current.some((item) => item.id === milestone.id)),
        ]);
      }
      for (const relatedThread of response.relatedThreads || []) mergeThread(relatedThread, false);
      const cameoReplies = response.replies?.filter((reply) => reply.from === "character") || [];
      if (cameoReplies.length > 1) {
        const cameoReplyIds = new Set(cameoReplies.map((reply) => reply.id));
        for (let index = 0; index < cameoReplies.length; index += 1) {
          const visibleReplyIds = new Set(cameoReplies.slice(0, index + 1).map((reply) => reply.id));
          const stagedThread = {
            ...response.thread,
            messages: response.thread.messages.filter((message) => !cameoReplyIds.has(message.id) || visibleReplyIds.has(message.id)),
          };
          mergeThread(stagedThread, activeIdRef.current === response.thread.id);
          const nextReply = cameoReplies[index + 1];
          if (nextReply) {
            setTypingSpeakerId(nextReply.speakerId || active.character.id);
            await new Promise((resolve) => window.setTimeout(resolve, cameoReplyDelay(nextReply)));
          }
        }
      } else {
        replaceThread(response.thread);
      }
      if (response.imageWarning) setNotice("The reply was delivered, but its image was not started. " + response.imageWarning);
      if (response.replyWarning) setNotice(response.replyWarning);
      const queuedImageJobs = response.imageJobs?.length
        ? response.imageJobs
        : response.imageJob
          ? [response.imageJob]
          : [];
      for (const imageJob of queuedImageJobs) {
        try {
          await watchImage(imageJob.promptId, response.thread);
        } catch (reason) {
          setNotice("The reply was delivered, but an image did not finish. " + (reason instanceof Error ? reason.message : "Check ComfyUI, then retry the image."));
        }
      }
    } finally {
      sendInFlightRef.current = false;
      setTyping(false);
      setTypingSpeakerId("");
    }
  };

  const retryFailedMessage = (message: Message) => {
    if (message.delivery !== "failed") return;
    void send(message.retryText || message.text || "[I shared a photo with you. React naturally to what you see.]", message.image, message);
  };

  const reactToMessage = async (message: Message, reaction: string) => {
    if (!active || typing || reactionInFlightRef.current || message.from !== "character" || message.id.startsWith("optimistic-")) return;
    reactionInFlightRef.current = true;
    const previous = active;
    const nextReaction = message.reaction === reaction ? null : reaction;
    const optimisticMessages = active.messages.map((item) => {
      if (item.id !== message.id) return item;
      const next = { ...item };
      if (nextReaction) next.reaction = nextReaction;
      else delete next.reaction;
      return next;
    });
    replaceThread({ ...active, messages: optimisticMessages });
    setReactionTarget(null);
    setNotice("");
    if (nextReaction) {
      reactionTypingTimerRef.current = window.setTimeout(() => {
        reactionTypingTimerRef.current = null;
        setTyping(true);
      }, 250);
    }
    try {
      const response = await api.reactToMessage(active.id, message.id, nextReaction);
      replaceThread(response.thread);
    } catch (reason) {
      replaceThread(previous);
      setNotice(reason instanceof Error ? reason.message : "The reaction could not be saved.");
    } finally {
      reactionInFlightRef.current = false;
      if (reactionTypingTimerRef.current !== null) {
        window.clearTimeout(reactionTypingTimerRef.current);
        reactionTypingTimerRef.current = null;
      }
      setTyping(false);
    }
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    const photo = pendingPhoto;
    if ((!text && !photo) || photoUploading || typing) return;
    let image: string | undefined;
    if (photo) {
      setPhotoUploading(true);
      setNotice("");
      try {
        image = (await api.upload(photo.dataUrl)).url;
      } catch (reason) {
        setNotice(reason instanceof Error ? reason.message : "The photo could not be attached.");
        return;
      } finally {
        setPhotoUploading(false);
      }
    }
    setDraft("");
    setPendingPhoto(null);
    if (fileRef.current) fileRef.current.value = "";
    setShowEmoji(false);
    await send(text, image);
  };

  const insertEmoji = (emoji: string) => {
    const textarea = composerRef.current;
    const start = textarea?.selectionStart ?? draft.length;
    const end = textarea?.selectionEnd ?? start;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    textarea?.focus();
    setDraft(next);
    setRecentEmoji((current) => {
      const updated = [emoji, ...current.filter((item) => item !== emoji)].slice(0, 15);
      localStorage.setItem(RECENT_EMOJI_KEY, JSON.stringify(updated));
      return updated;
    });
    window.requestAnimationFrame(() => {
      const cursor = start + emoji.length;
      composerRef.current?.setSelectionRange(cursor, cursor);
      anchorComposerAfterKeyboard();
    });
  };

  const insertAction = () => {
    const textarea = composerRef.current;
    const start = textarea?.selectionStart ?? draft.length;
    const end = textarea?.selectionEnd ?? start;
    const action = "[action: ]";
    const spacer = start > 0 && !/\s$/.test(draft.slice(0, start)) ? " " : "";
    const next = draft.slice(0, start) + spacer + action + draft.slice(end);
    textarea?.focus();
    setDraft(next);
    setShowEmoji(false);
    window.requestAnimationFrame(() => {
      const cursor = start + spacer.length + "[action: ".length;
      composerRef.current?.setSelectionRange(cursor, cursor);
      anchorComposerAfterKeyboard();
    });
  };

  const attachPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      setPendingPhoto({ dataUrl, name: file.name || "Selected photo" });
      setShowEmoji(false);
      window.requestAnimationFrame(() => composerRef.current?.focus());
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "The photo could not be attached.");
    }
  };

  const removePendingPhoto = () => {
    setPendingPhoto(null);
    if (fileRef.current) fileRef.current.value = "";
    window.requestAnimationFrame(() => composerRef.current?.focus());
  };

  const captureMoment = async () => {
    if (!active || !health.comfy || typing || capturingMoment) return;
    setCapturingMoment(true);
    setNotice("");
    try {
      const result = await api.captureMoment(active.id);
      await Promise.all(result.imageJobs.map((job) => watchImage(job.promptId, active)));
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "That moment could not be captured.");
    } finally {
      setCapturingMoment(false);
    }
  };

  const clearChatListSwipe = () => {
    const shell = appShellRef.current;
    shell?.classList.remove("is-chat-swiping", "is-chat-settling");
    shell?.style.removeProperty("--mobile-chat-drag");
    shell?.style.removeProperty("--mobile-list-drag");
    chatListSwipeRef.current = null;
    chatListSwipeTimerRef.current = null;
  };

  const startChatListSwipe = (event: ReactTouchEvent<HTMLElement>) => {
    if (window.innerWidth > 760 || !mobileChatOpen || event.touches.length !== 1
      || showProfile || showGuestPicker || showIdentityEditor || showSettings || showSetup || Boolean(fullScreenImage)) return;
    const touch = event.touches[0];
    const target = event.target as HTMLElement;
    if (touch.clientX < 18 || target.closest("button, input, textarea, select, a, [contenteditable='true']")) return;
    if (chatListSwipeTimerRef.current !== null) window.clearTimeout(chatListSwipeTimerRef.current);
    chatListSwipeRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      startedAt: Date.now(),
      active: false,
    };
  };

  const moveChatListSwipe = (event: ReactTouchEvent<HTMLElement>) => {
    const gesture = chatListSwipeRef.current;
    const shell = appShellRef.current;
    if (!gesture || !shell || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const deltaX = Math.max(0, touch.clientX - gesture.startX);
    const deltaY = Math.abs(touch.clientY - gesture.startY);
    gesture.lastX = touch.clientX;
    if (!gesture.active) {
      if (deltaY > 12 && deltaY > deltaX) {
        chatListSwipeRef.current = null;
        return;
      }
      if (deltaX < 8 || deltaX < deltaY * 1.2) return;
      gesture.active = true;
      shell.classList.add("is-chat-swiping");
    }
    if (event.cancelable) event.preventDefault();
    const width = Math.max(window.innerWidth, 1);
    const offset = Math.min(deltaX, width);
    const progress = offset / width;
    shell.style.setProperty("--mobile-chat-drag", offset + "px");
    shell.style.setProperty("--mobile-list-drag", (-26 * (1 - progress)).toFixed(2) + "%");
  };

  const finishChatListSwipe = () => {
    const gesture = chatListSwipeRef.current;
    const shell = appShellRef.current;
    if (!gesture?.active || !shell) {
      chatListSwipeRef.current = null;
      return;
    }
    const distance = Math.max(0, gesture.lastX - gesture.startX);
    const elapsed = Math.max(Date.now() - gesture.startedAt, 1);
    const velocity = distance / elapsed;
    const shouldOpenList = distance >= Math.max(72, window.innerWidth * .22) || (distance >= 38 && velocity > .45);
    shell.classList.add("is-chat-settling");
    shell.style.setProperty("--mobile-chat-drag", shouldOpenList ? "100vw" : "0px");
    shell.style.setProperty("--mobile-list-drag", shouldOpenList ? "0%" : "-26%");
    chatListSwipeTimerRef.current = window.setTimeout(() => {
      if (shouldOpenList) setMobileChatOpen(false);
      clearChatListSwipe();
    }, 190);
  };

  const contactRows = mode === "discover" ? results : visibleThreads.map((thread) => thread.character);

  return (
    <main className="site-frame">
      <div className="ambient ambient--one" />
      <div className="ambient ambient--two" />
      <section ref={appShellRef} className={"app-shell " + (mobileChatOpen ? "is-chat-open" : "")}>
        <aside className="inbox-panel">
          <header className="inbox-header">
            <div>
              <div className="brand-lockup"><img src="/animessenger-logo.svg?v=3" alt="ANIMESSENGER" /></div>
              <p>An adventure in every chat</p>
            </div>
          </header>
          <div className="mode-tabs" role="tablist" aria-label="Character lists">
            <button id="character-tab-chats" type="button" role="tab" aria-selected={mode === "chats"} aria-controls="character-list-panel" tabIndex={mode === "chats" ? 0 : -1} className={mode === "chats" ? "active" : ""} onKeyDown={changeModeFromKeyboard} onClick={() => { setMode("chats"); setSearch(""); }}>Chats <span>{threads.length}</span></button>
            <button id="character-tab-discover" type="button" role="tab" aria-selected={mode === "discover"} aria-controls="character-list-panel" tabIndex={mode === "discover" ? 0 : -1} className={mode === "discover" ? "active" : ""} onKeyDown={changeModeFromKeyboard} onClick={() => { setMode("discover"); setSearch(""); }}>New chat</button>
          </div>
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input aria-label={mode === "chats" ? "Search active characters" : "Search for a new character"} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={mode === "chats" ? "Search active characters" : "Search for a new character"} />
            {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search">×</button>}
          </label>
          {mode === "discover" && (
            <div className="discover-note">
              <span className={"signal-dot " + (health.animadex ? "" : "offline")} />
              <div><strong>{health.animadex ? "Character catalogue connected" : "Offline character preview"}</strong><small>{health.animadex ? "Independent search sources available." : "A small built-in selection remains available while character search reconnects."}</small></div>
              <button type="button" onClick={() => void retryConnections()} disabled={healthChecking}>{healthChecking ? "Checking…" : health.animadex ? "Refresh" : "Reconnect"}</button>
            </div>
          )}
          <div className="contact-list" id="character-list-panel" role="tabpanel" aria-labelledby={"character-tab-" + mode}>
            {searching && <div className="list-state">Searching character sources…</div>}
            {!searching && mode === "discover" && search.length < 2 && <div className="list-state">Type a name or series to find a character.</div>}
            {!searching && mode === "discover" && search.length >= 2 && results.length === 0 && <div className="list-state">{health.animadex ? "No matches yet." : "No offline-preview matches. Retry when character search reconnects."}</div>}
            {!searching && mode === "chats" && visibleThreads.length === 0 && <div className="list-state">No conversations yet. Find someone to begin.</div>}
            {contactRows.map((character) => {
              const thread = threads.find((item) => item.character.id === character.id);
              const last = thread?.messages.at(-1);
              return (
                <button
                  key={character.id}
                  className={"contact-row " + (activeId === thread?.id && mode === "chats" ? "active " : "") + (thread?.unreadCount ? "has-unread" : "")}
                  aria-label={(mode === "discover" ? "Start a new chat with " : "Open chat with ") + characterDisplayName(character) + (thread?.unreadCount ? ", unread messages" : "")}
                  onClick={() => mode === "discover" ? void openCharacter(character) : thread && openThread(thread)}
                >
                  <span className="contact-portrait">
                    <Portrait character={character} />
                    {Boolean(thread?.unreadCount) && <i className="unread-dot" aria-label="Unread message" />}
                  </span>
                  <span className="contact-copy">
                    <span className="contact-topline"><strong>{characterDisplayName(character)}</strong><time>{mode === "chats" && last ? formatTime(last.time) : ""}</time></span>
                    <span className="series-label">{character.series}</span>
                    <span className="message-preview">{mode === "discover" ? (character.tags.slice(0, 3).join(" · ") || "Research profile on first meeting") : (last?.text ?? "Start a conversation")}</span>
                  </span>
                  {mode === "discover" && <span className="chat-arrow">↗</span>}
                </button>
              );
            })}
          </div>
          <footer className="inbox-footer">
            <span className="user-orb">{config?.userName?.trim().slice(0, 1).toUpperCase() || "Y"}</span>
            <span><strong>{config?.userName?.trim() || "Your space"}</strong><small>{!serviceReachable ? "AniMessenger stopped" : health.ollama ? "Ollama connected · local" : "Ollama needs attention"}</small></span>
            <button className="settings-button" onClick={() => setShowSettings(true)} aria-label="Settings"><SettingsIcon /></button>
          </footer>
        </aside>

        {!active ? <section className="empty-workspace">
          <ServiceRecovery
            health={health}
            serviceReachable={serviceReachable}
            ready={healthReady}
            mode={mode}
            checking={healthChecking}
            onRetry={() => void retryConnections()}
            {...(config ? { onSetup: () => setShowSetup(true) } : {})}
          />
          {notice && <div className="workspace-notice" role="alert">{notice}</div>}
          <EmptyChat mode={mode} onDiscover={() => setMode("discover")} />
        </section> : (
          <section
            className={"chat-panel " + (active.cameo?.activeGuest ? "has-cameo" : "")}
            onTouchStart={startChatListSwipe}
            onTouchMove={moveChatListSwipe}
            onTouchEnd={finishChatListSwipe}
            onTouchCancel={finishChatListSwipe}
          >
            <header className="chat-header">
              <button className="back-button" onClick={() => setMobileChatOpen(false)} aria-label="Back to messages">‹</button>
              <button type="button" className="chat-person" onClick={openProfile} disabled={!active.profile} aria-label={active.profile ? "Open " + characterDisplayName(active.character) + " profile" : "Character profile is being prepared"}>
                <span className={"chat-avatar " + (avatarGenerating[active.character.id] ? "is-generating" : "")}>
                  <Portrait character={active.character} />
                </span>
                <span className="chat-person-copy">
                  <strong>{characterDisplayName(active.character)}</strong>
                  <small title={sceneContextLabel(active)}>
                    {avatarGenerating[active.character.id]
                      ? "making profile picture…"
                      : activeGuestThread
                        ? "with " + characterDisplayName(activeGuestThread.character) + " · " + sceneContextLabel(active)
                        : sceneContextLabel(active)}
                  </small>
                </span>
              </button>
              <button
                type="button"
                className={"guest-control " + (activeGuestThread ? "has-guest" : "")}
                onClick={() => { setGuestSearch(""); setShowGuestPicker(true); }}
                disabled={!active.profile}
                aria-label={activeGuestThread ? "Manage guest " + characterDisplayName(activeGuestThread.character) : "Invite a guest character"}
                title={activeGuestThread ? "Guest: " + characterDisplayName(activeGuestThread.character) : "Invite a guest"}
              >
                {activeGuestThread ? <Portrait character={activeGuestThread.character} /> : <><GuestIcon /><small>Guest</small></>}
              </button>
            </header>
            <div className="relationship-strip" style={{ "--accent": relationshipColor(active.relationship) } as React.CSSProperties}>
              <span>{relationshipLabel(active.relationship)}</span>
              <output aria-label="Relationship strength">{active.relationship}%</output>
              <div><i style={{ width: active.relationship + "%" }} /></div>
            </div>
            {relationshipMilestone && (
              <div className="relationship-milestone" style={{ "--bond-color": relationshipColor(relationshipMilestone.relationship) } as React.CSSProperties} role="status" aria-live="polite">
                <Portrait character={relationshipMilestone.character} />
                <span>
                  <small>Relationship up</small>
                  <strong>{characterDisplayName(relationshipMilestone.character)}</strong>
                  <b>{relationshipMilestone.label}</b>
                </span>
                <i aria-hidden="true">↑</i>
              </div>
            )}
            <ServiceRecovery
              health={health}
              serviceReachable={serviceReachable}
              ready={healthReady}
              mode={mode}
              checking={healthChecking}
              onRetry={() => void retryConnections()}
              onSetup={() => setShowSetup(true)}
            />
            <div className="message-scroll" key={active.id} ref={scrollRef}>
              <div className="conversation-date"><span>Private · on this device</span></div>
              <div className="hello-card">
                <Portrait character={active.character} large />
                <h2>{characterDisplayName(active.character)}</h2>
                <p>{active.character.series}</p>
                  <small>{activeVisualIdentity.join(" · ") || active.character.tags.join(" · ")}</small>
              </div>
              {building?.id === active.id && !active.profile && (
                <div className="build-in-chat" role="status" aria-live="polite">
                  <span className="build-letter"><Portrait character={active.character} /></span>
                  <div><small>Preparing this character</small><strong>Getting to know {characterDisplayName(active.character)}…</strong><p>Ollama is researching their personality, visual identity, history, and conversation style. You can begin as soon as their first message appears.</p></div>
                  <div className="build-progress"><i /></div>
                </div>
              )}
              {!active.profile && building?.id !== active.id && (
                <div className="build-in-chat build-recovery" role="alert">
                  <span className="build-letter"><Portrait character={active.character} /></span>
                  <div>
                    <small>Profile setup paused</small>
                    <strong>{characterDisplayName(active.character)} isn’t ready yet.</strong>
                    <p>Nothing is lost. Retry the character research, or remove this unfinished chat and choose another result.</p>
                  </div>
                  <div className="build-actions">
                    <button type="button" onClick={() => void openCharacter(active.character)}>Retry setup</button>
                    <button type="button" className="build-remove" onClick={() => setDeleteTarget(active)}>Remove chat</button>
                  </div>
                </div>
              )}
              {loadingThreadId === active.id && active.summary && <div className="history-loading">Loading conversation…</div>}
              {hiddenMessageCount > 0 && (
                <button type="button" className="load-earlier" onClick={() => setVisibleMessageLimit((current) => current + MESSAGE_BATCH_SIZE)}>
                  Load earlier messages <span>{hiddenMessageCount.toLocaleString()} remaining</span>
                </button>
              )}
              {visibleMessages.map((message) => (
                <div key={message.id} className={"message-line message-line--" + (message.from === "system" ? "system" : message.from === "character" ? "character" : "user") + (message.from === "character" && message.speakerId && message.speakerId !== active.character.id ? " message-line--guest" : "") + (message.imageOrigin === "captured_moment" ? " message-line--captured" : "")}>
                  <div className="message-content">
                    <div className="message-primary">
                      {message.from === "character" && message.imageOrigin !== "captured_moment" && <Portrait character={messageSpeakerCharacter(message, active, threads)} />}
                      <div className="message-payload">
                        {message.from === "character" && active.cameo?.activeGuest && (
                          <small className="message-speaker">{characterDisplayName(messageSpeakerCharacter(message, active, threads))}</small>
                        )}
                        {message.image && !unavailableImageIds.has(message.id) && (
                          <button
                            type="button"
                            className={"shared-image " + (message.generated ? "shared-image--generated" : "")}
                            onClick={() => setFullScreenImage({
                              items: [{
                                id: message.id,
                                src: message.image!,
                                alt: message.imageOrigin === "captured_moment" ? "Captured moment with " + characterDisplayName(messageSpeakerCharacter(message, active, threads)) : message.generated ? characterDisplayName(messageSpeakerCharacter(message, active, threads)) + " shared a generated scene" : "Shared by you",
                                time: message.time,
                                generation: message.generation,
                                retryable: Boolean(message.generated),
                              }],
                              index: 0,
                            })}
                            aria-label="View image full screen"
                          >
                            <img
                              key={message.id + "-" + imageReloadVersion}
                              src={message.image}
                              alt={message.imageOrigin === "captured_moment" ? "Captured moment with " + characterDisplayName(messageSpeakerCharacter(message, active, threads)) : message.generated ? characterDisplayName(messageSpeakerCharacter(message, active, threads)) + " shared a generated scene" : "Shared by you"}
                              onError={() => handleImageLoadError(message.id)}
                            />
                          </button>
                        )}
                        {message.image && unavailableImageIds.has(message.id) && (
                          <button
                            type="button"
                            className={"missing-image-retry " + (retryingImageIds.has(message.id) ? "is-retrying" : "")}
                            onClick={() => message.generated ? void retryGeneratedImage(message.id) : reloadUnavailableImage(message.id)}
                            disabled={retryingImageIds.has(message.id)}
                          >
                            <RetryIcon />
                            <span>{retryingImageIds.has(message.id) ? "Generating replacement..." : message.generated ? "Image unavailable · Generate again" : "Shared photo unavailable · Reload"}</span>
                          </button>
                        )}
                        {message.text && <p className="bubble">{message.text}</p>}
                      </div>
                    </div>
                    <div className={"message-meta " + (message.delivery === "failed" ? "is-failed" : "")}>
                      <time>{formatTime(message.time)}</time>
                      {message.delivery === "sending" && <span className="delivery-state">Sending…</span>}
                      {message.delivery === "failed" && <button type="button" className="delivery-retry" onClick={() => retryFailedMessage(message)}>Not sent · Retry</button>}
                      {message.from === "character" && message.imageOrigin !== "captured_moment" && (!message.speakerId || message.speakerId === active.character.id) && (
                        <span className="reaction-control">
                          {message.reaction ? (
                            <button
                              type="button"
                              className="reaction-pill"
                              onClick={() => setReactionTarget((current) => current === message.id ? null : message.id)}
                              aria-label={"Change reaction " + message.reaction}
                            >{message.reaction}</button>
                          ) : (
                            <button
                              type="button"
                              className="reaction-trigger"
                              onClick={() => setReactionTarget((current) => current === message.id ? null : message.id)}
                              aria-label="React to message"
                            >＋♡</button>
                          )}
                          {reactionTarget === message.id && (
                            <span className="reaction-tray" role="group" aria-label="Message reactions">
                              {quickReactions.map((item) => (
                                <button
                                  type="button"
                                  key={item.value}
                                  className={message.reaction === item.value ? "active" : ""}
                                  onClick={() => void reactToMessage(message, item.value)}
                                  aria-label={item.label}
                                >{item.value}</button>
                              ))}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {typing && typingCharacter && (
                <div className={"message-line message-line--character typing-line " + (typingCharacter.id !== active.character.id ? "message-line--guest" : "")} role="status" aria-label={characterDisplayName(typingCharacter) + " is typing"}>
                  <div className="message-content">
                    <div className="message-primary">
                      <Portrait character={typingCharacter} />
                      <div className="message-payload">
                        {active.cameo?.activeGuest && <small className="message-speaker">{characterDisplayName(typingCharacter)}</small>}
                        <p className="bubble"><i /><i /><i /></p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {notice && <div className="chat-notice" role="alert">{notice}</div>}
            </div>
            <div className="quick-prompts">
              <button onClick={() => setDraft("What are you doing right now?")} disabled={!active.profile}>What are you doing?</button>
              <button onClick={insertAction} aria-label="Insert an action" disabled={!active.profile}>[action: ]</button>
              <button
                type="button"
                className={"capture-moment-button " + (capturingMoment ? "is-capturing" : "")}
                onClick={() => void captureMoment()}
                disabled={!active.profile || !health.comfy || typing || capturingMoment}
                title={!health.comfy ? "Connect ComfyUI in Settings to capture moments" : "Capture this moment"}
                aria-label={capturingMoment ? "Capturing this moment" : "Capture this moment"}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7.5h3l1.4-2h6.2l1.4 2h3a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13.5" r="4"/><path d="M18 10h.01"/></svg>
              </button>
            </div>
            <form className="composer" onSubmit={sendMessage}>
              {showEmoji && (
                <div className="emoji-tray" role="dialog" aria-label="Emoji picker">
                  <label className="emoji-search">
                    <span aria-hidden="true">⌕</span>
                    <input
                      ref={emojiSearchRef}
                      type="search"
                      value={emojiSearch}
                      onChange={(event) => setEmojiSearch(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
                      placeholder="Search emoji"
                      aria-label="Search emoji"
                    />
                    {emojiSearch && <button type="button" onClick={() => setEmojiSearch("")} aria-label="Clear emoji search">×</button>}
                  </label>
                  <div className="emoji-scroll">
                    {!emojiSearch && recentEmoji.length > 0 && (
                      <section className="emoji-section" aria-label="Recently used emoji">
                        <small>Recent</small>
                        <div className="emoji-grid">
                          {recentEmoji.map((emoji) => (
                            <button type="button" key={emoji} onClick={() => insertEmoji(emoji)} aria-label={emojiCatalog.find(([item]) => item === emoji)?.[1] || "Recent emoji"}>{emoji}</button>
                          ))}
                        </div>
                      </section>
                    )}
                    <section className="emoji-section" aria-label={emojiSearch ? "Emoji search results" : "All emoji"}>
                      <small>{emojiSearch ? "Results" : "All emoji"}</small>
                      {filteredEmoji.length > 0 ? (
                        <div className="emoji-grid">
                          {filteredEmoji.map(([emoji, keywords]) => (
                            <button type="button" key={emoji} onClick={() => insertEmoji(emoji)} aria-label={keywords}>{emoji}</button>
                          ))}
                        </div>
                      ) : <p className="emoji-empty">No matching emoji</p>}
                    </section>
                  </div>
                </div>
              )}
              {pendingPhoto && (
                <div className="composer-attachment" aria-label="Attached photo">
                  <span className="composer-attachment-preview">
                    <img src={pendingPhoto.dataUrl} alt={"Selected image: " + pendingPhoto.name} />
                    <button type="button" onClick={removePendingPhoto} aria-label="Remove attached photo">×</button>
                    {photoUploading && <i aria-label="Attaching photo" />}
                  </span>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={attachPhoto} />
              <button type="button" className="add-button" onClick={() => fileRef.current?.click()} disabled={!active.profile || typing || photoUploading} aria-label={pendingPhoto ? "Replace attached photo" : active.cameo?.activeGuest ? "Attach a photo for both characters" : "Attach a photo"}>＋</button>
              <div className="composer-input">
                <textarea
                  ref={composerRef}
                  rows={1}
                  enterKeyHint="send"
                  autoCapitalize="sentences"
                  value={draft}
                  disabled={!active.profile}
                  onFocus={anchorComposerAfterKeyboard}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder={!active.profile ? "Preparing " + characterDisplayName(active.character) + "…" : pendingPhoto ? "Add a message about this image…" : activeGuestThread ? "Message both characters…" : "Message " + characterDisplayName(active.character) + "…"}
                  aria-label={"Message " + characterDisplayName(active.character)}
                />
                <button
                  type="button"
                  className={"emoji-button " + (showEmoji ? "active" : "")}
                  onClick={() => setShowEmoji((current) => !current)}
                  aria-label={showEmoji ? "Close emoji tray" : "Add emoji"}
                  aria-expanded={showEmoji}
                >☺</button>
              </div>
              <button className="send-button" type="submit" disabled={!active.profile || (!draft.trim() && !pendingPhoto) || typing || photoUploading} aria-label="Send message">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" />
                </svg>
              </button>
            </form>
          </section>
        )}

        {showGuestPicker && active && (
          <div className="profile-layer guest-layer" onClick={() => !cameoUpdating && setShowGuestPicker(false)} role="dialog" aria-modal="true" aria-labelledby="guest-picker-title">
            <article ref={guestCardRef} className="guest-card" onClick={(event) => event.stopPropagation()} tabIndex={-1}>
              <button type="button" className="profile-close" onClick={() => setShowGuestPicker(false)} disabled={cameoUpdating} aria-label="Close guest characters">×</button>
              <p className="eyebrow">Guest chat</p>
              <h2 id="guest-picker-title">{activeGuestThread ? characterDisplayName(activeGuestThread.character) + " is here" : "Invite a character"}</h2>
              {activeGuestThread ? (
                <>
                  <div className="current-guest">
                    <Portrait character={activeGuestThread.character} large />
                    <span><strong>{characterDisplayName(activeGuestThread.character)}</strong><small>{activeGuestThread.character.series}</small></span>
                  </div>
                  <div className="bond-summary guest-bond" style={{ "--bond-color": relationshipColor(activeGuestThread.relationship) } as React.CSSProperties}>
                    <span><small>Relationship</small><strong>{relationshipLabel(activeGuestThread.relationship)}</strong></span>
                    <b>{activeGuestThread.relationship}%</b>
                    <div className="profile-meter"><i style={{ width: activeGuestThread.relationship + "%", background: relationshipColor(activeGuestThread.relationship) }} /></div>
                  </div>
                  <p className="guest-privacy">Shared moments can affect their relationship and memory. Their earlier private chat stays private.</p>
                  <div className="guest-actions">
                    <button type="button" className="guest-private" onClick={() => { setActiveId(activeGuestThread.id); setMobileChatOpen(true); setShowGuestPicker(false); }}>Open private chat</button>
                    <button type="button" className="guest-leave" onClick={() => void removeGuest()} disabled={cameoUpdating}>{cameoUpdating ? "Ending encounter…" : "Have guest leave"}</button>
                  </div>
                </>
              ) : (
                <>
                  <p>Choose a character you already know. Replies stay with whoever has the floor; the other may occasionally add something genuinely relevant.</p>
                  <label className="guest-search">
                    <span aria-hidden="true">⌕</span>
                    <input type="search" value={guestSearch} onChange={(event) => setGuestSearch(event.target.value)} placeholder="Search your characters" aria-label="Search researched characters" />
                  </label>
                  <div className="guest-list">
                    {guestOptions.length ? guestOptions.map((thread) => (
                      <button type="button" key={thread.id} onClick={() => void inviteGuest(thread.id)} disabled={cameoUpdating}>
                        <Portrait character={thread.character} />
                        <span><strong>{characterDisplayName(thread.character)}</strong><small>{thread.character.series}</small></span>
                        <b aria-hidden="true">＋</b>
                      </button>
                    )) : <p className="guest-empty">No matching researched characters.</p>}
                  </div>
                </>
              )}
              {!activeGuestThread && <small className="guest-safety-note">One guest can join at a time. Each character keeps their own voice, relationship, and private history.</small>}
            </article>
          </div>
        )}

        {showProfile && active?.profile && (
          <div className="profile-layer" onClick={() => setShowProfile(false)} role="dialog" aria-modal="true" aria-labelledby="character-profile-title">
            <article ref={profileCardRef} className="profile-card" onClick={(event) => event.stopPropagation()} tabIndex={-1}>
              <button type="button" className="profile-close" onClick={() => setShowProfile(false)} aria-label="Close character profile">×</button>
              <div className="profile-hero">
                <span className={"profile-avatar " + (avatarGenerating[active.character.id] ? "is-generating" : "")}>
                  <Portrait character={active.character} large />
                  {health.comfy && <button
                    type="button"
                    className="avatar-refresh"
                    onClick={regenerateAvatar}
                    disabled={avatarGenerating[active.character.id]}
                    aria-label="Regenerate profile picture"
                    title="Regenerate profile picture"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M21 12a9 9 0 0 0-15.2-6.5L3 8" />
                      <path d="M3 3v5h5" />
                      <path d="M3 12a9 9 0 0 0 15.2 6.5L21 16" />
                      <path d="M16 16h5v5" />
                    </svg>
                  </button>}
                </span>
                <div className="profile-hero-copy">
                  <p className="eyebrow">{active.character.series}</p>
                  <h2 id="character-profile-title">{characterDisplayName(active.character)}</h2>
                  <div className="bond-summary" style={{ "--bond-color": relationshipColor(active.relationship) } as React.CSSProperties}>
                    <span><small>Relationship</small><strong>{relationshipLabel(active.relationship)}</strong></span>
                    <b>{active.relationship}%</b>
                    <div className="profile-meter"><i style={{ width: active.relationship + "%", background: relationshipColor(active.relationship) }} /></div>
                  </div>
                </div>
              </div>
              <div className="profile-tabs" role="tablist" aria-label="Character profile sections">
                <button id="profile-tab-profile" type="button" role="tab" aria-selected={profileTab === "profile"} aria-controls="profile-panel" tabIndex={profileTab === "profile" ? 0 : -1} className={profileTab === "profile" ? "active" : ""} onKeyDown={changeProfileTabFromKeyboard} onClick={() => setProfileTab("profile")}>Profile</button>
                <button id="profile-tab-memories" type="button" role="tab" aria-selected={profileTab === "memories"} aria-controls="profile-panel" tabIndex={profileTab === "memories" ? 0 : -1} className={profileTab === "memories" ? "active" : ""} onKeyDown={changeProfileTabFromKeyboard} onClick={() => setProfileTab("memories")}>Memories <span>{active.memories?.length || 0}</span></button>
                <button id="profile-tab-gallery" type="button" role="tab" aria-selected={profileTab === "gallery"} aria-controls="profile-panel" tabIndex={profileTab === "gallery" ? 0 : -1} className={profileTab === "gallery" ? "active" : ""} onKeyDown={changeProfileTabFromKeyboard} onClick={() => setProfileTab("gallery")}>Gallery <span>{activeGallery.length}</span></button>
              </div>
              {profileTab === "profile" ? (
                <div className="profile-section" id="profile-panel" role="tabpanel" aria-labelledby="profile-tab-profile">
                  <p>{active.profile.summary}</p>
                  <dl>
                    <div><dt>Voice</dt><dd>{active.profile.persona.speechStyle}</dd></div>
                    <div><dt>Now wearing</dt><dd>{active.scene.outfit}</dd></div>
                    <div><dt>Where</dt><dd>{active.scene.location}</dd></div>
                  </dl>
                  <div className="identity-note"><span><strong>Character details</strong><small>{active.profile.visual.userOverrides || active.character.displayName ? "Your corrections are active" : "Researched baseline"}</small></span><p>{activeVisualIdentity.join(" · ")}</p><button type="button" onClick={() => setShowIdentityEditor(true)}>Edit character</button></div>
                  <small className="fan-note">Character interpretation is created locally from catalogue evidence, optional research, and your selected Ollama model.</small>
                </div>
              ) : profileTab === "memories" ? (
                <div className="profile-memories" id="profile-panel" role="tabpanel" aria-labelledby="profile-tab-memories">
                  <div className="memory-intro">
                    <p>Specific things {characterDisplayName(active.character)} can recall beyond the recent chat window.</p>
                    {!active.memoryBackfilledAt && <button type="button" onClick={backfillActiveMemories} disabled={memoryUpdating}>{memoryUpdating ? "Scanning earlier chat..." : "Scan earlier chat"}</button>}
                  </div>
                  {!active.memories?.length ? (
                    <p className="memory-empty">No lasting memories saved yet.</p>
                  ) : active.memories.map((memory) => (
                    <div className="memory-card" key={memory.id}>
                      <div><small>{memory.kind.replaceAll("_", " ")}</small><p>{memory.text}</p></div>
                      <button type="button" onClick={() => void forgetActiveMemory(memory.id)} aria-label={"Forget: " + memory.text}>Forget</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="profile-gallery" id="profile-panel" role="tabpanel" aria-labelledby="profile-tab-gallery">
                  {activeGallery.length === 0 ? (
                    <p className="gallery-empty">Images {characterDisplayName(active.character)} sends or moments you capture will appear here.</p>
                  ) : activeGallery.map((item, index) => (
                    <div className="gallery-item" key={item.id}>
                      <button
                        type="button"
                        className="gallery-image-button"
                        onClick={() => setFullScreenImage({ items: activeGallery, index })}
                        aria-label={"Open image " + (index + 1) + " of " + activeGallery.length}
                      >
                        <img key={item.id + "-" + imageReloadVersion} src={item.src} alt="" onError={() => handleImageLoadError(item.id)} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button className="profile-danger" onClick={() => { setDeleteTarget(active); setShowProfile(false); }}>Delete chat</button>
            </article>
          </div>
        )}
        {showIdentityEditor && active?.profile && <VisualIdentityEditor thread={active} onClose={() => setShowIdentityEditor(false)} onSaved={replaceThread} />}
        {deleteTarget && (
          <div className="profile-layer delete-layer" role="dialog" aria-modal="true" aria-labelledby="delete-chat-title" onClick={() => !deletingChat && setDeleteTarget(null)}>
            <article ref={deleteCardRef} className="delete-card" onClick={(event) => event.stopPropagation()} tabIndex={-1}>
              <Portrait character={deleteTarget.character} large />
              <p className="eyebrow">Delete conversation</p>
              <h2 id="delete-chat-title">Delete chat with {characterDisplayName(deleteTarget.character)}?</h2>
              <p>This removes the messages and relationship progress from your address book. The reusable character dossier and generated image files will stay on this device.</p>
              <div className="delete-actions">
                <button type="button" onClick={() => setDeleteTarget(null)} disabled={deletingChat}>Cancel</button>
                <button type="button" className="confirm-delete" onClick={confirmDeleteChat} disabled={deletingChat}>{deletingChat ? "Deleting…" : "Delete chat"}</button>
              </div>
            </article>
          </div>
        )}
        {showSettings && config && <Settings
          initial={config}
          onClose={() => setShowSettings(false)}
          onSaved={setConfig}
          onOpenSetup={() => { setShowSettings(false); setShowSetup(true); }}
        />}
        {showSetup && config && createPortal(<SetupGuide
          initial={config}
          initialHealth={health}
          onComplete={(saved, nextHealth) => { setConfig(saved); setHealth(nextHealth); setShowSetup(false); setMode("discover"); }}
          onSkip={() => setShowSetup(false)}
        />, document.body)}
        {fullScreenImage && selectedLightboxImage && createPortal((
          <div
            ref={lightboxRef}
            className={"image-lightbox " + (lightboxZoom.scale > 1 ? "is-zoomed" : "")}
            role="dialog"
            aria-modal="true"
            aria-label="Full-screen image"
            tabIndex={-1}
            onClick={() => setFullScreenImage(null)}
          >
            <button className="lightbox-close" onClick={() => setFullScreenImage(null)} aria-label="Close full-screen image">×</button>
            {selectedLightboxImage.retryable && (
              <button
                type="button"
                className={"lightbox-retry " + (retryingImageIds.has(selectedLightboxImage.id) ? "is-retrying" : "")}
                onClick={(event) => { event.stopPropagation(); void retryGeneratedImage(selectedLightboxImage.id); }}
                disabled={retryingImageIds.has(selectedLightboxImage.id)}
              >
                <RetryIcon />
                <span>{retryingImageIds.has(selectedLightboxImage.id) ? "Retrying..." : "Retry image"}</span>
              </button>
            )}
            {fullScreenImage.items.length > 1 && (
              <>
                <button className="lightbox-nav lightbox-nav--previous" type="button" onClick={(event) => { event.stopPropagation(); moveLightbox(-1); }} aria-label="Previous image">‹</button>
                <button className="lightbox-nav lightbox-nav--next" type="button" onClick={(event) => { event.stopPropagation(); moveLightbox(1); }} aria-label="Next image">›</button>
                <small className="lightbox-count">{fullScreenImage.index + 1} / {fullScreenImage.items.length}</small>
              </>
            )}
            {lightboxZoom.scale > 1 && (
              <button
                type="button"
                className="lightbox-zoom-reset"
                onClick={(event) => { event.stopPropagation(); resetLightboxZoom(); }}
                aria-label="Reset image zoom"
              >{lightboxZoom.scale.toFixed(1)}× <span>Reset</span></button>
            )}
            <div
              className="lightbox-content"
            >
              <div
                className="lightbox-stage"
                ref={lightboxStageRef}
                onTouchStart={startLightboxGesture}
                onTouchMove={moveLightboxGesture}
                onTouchEnd={finishLightboxGesture}
                onTouchCancel={finishLightboxGesture}
                onClick={(event) => {
                  event.stopPropagation();
                  if (Date.now() - lightboxTouchUsedAtRef.current < 600) return;
                  if (lightboxZoomRef.current.scale > 1) resetLightboxZoom();
                  else setFullScreenImage(null);
                }}
              >
                <img
                  ref={lightboxImageRef}
                  key={selectedLightboxImage.id + "-" + imageReloadVersion}
                  src={selectedLightboxImage.src}
                  alt={selectedLightboxImage.alt}
                  draggable={false}
                  style={{ transform: `translate3d(${lightboxZoom.x}px, ${lightboxZoom.y}px, 0) scale(${lightboxZoom.scale})` }}
                  onError={() => handleImageLoadError(selectedLightboxImage.id)}
                />
                <small className="lightbox-touch-hint" aria-hidden="true">Pinch or double-tap to zoom</small>
              </div>
              {selectedLightboxImage.generation && (
                <details className="generation-details" onClick={(event) => event.stopPropagation()}>
                  <summary>View generation prompt</summary>
                  <div>
                    <strong>Positive</strong>
                    <p>{selectedLightboxImage.generation.positive}</p>
                    <strong>Negative</strong>
                    <p>{selectedLightboxImage.generation.negative}</p>
                    <strong>Seed</strong>
                    <p>{selectedLightboxImage.generation.seed}</p>
                  </div>
                </details>
              )}
              <small className="lightbox-hint">Pinch or double-tap to zoom · swipe or use arrows to browse</small>
            </div>
          </div>
        ), document.body)}
      </section>
    </main>
  );
}
