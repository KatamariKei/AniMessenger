import { useEffect, useRef, useState } from "react";
import { api } from "./api";

export function UserPortraitEditor({ imageUrl, prompt, disabled = false, onPromptChange, onChange, onBusy }: { imageUrl: string; prompt: string; disabled?: boolean; onPromptChange: (prompt: string) => void; onChange: (url: string) => void; onBusy: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const working = (value: boolean) => { if (alive.current) { setBusy(value); onBusy(value); } };
  const upload = async (file?: File) => {
    if (!file || busy || disabled) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setError("Choose a JPG, PNG, or WebP image under 10 MB."); return;
    }
    working(true); setError(""); setStatus("Uploading portrait…");
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(Error("The image couldn't be read.")); reader.readAsDataURL(file);
      });
      const result = await api.upload(data);
      if (alive.current) { onChange(result.url); setStatus("Portrait ready. Save settings to keep it."); }
    } catch { if (alive.current) setError("The portrait couldn't be uploaded. Your previous image is unchanged."); }
    finally { working(false); if (uploadRef.current) uploadRef.current.value = ""; }
  };
  const generate = async () => {
    if (busy || disabled || !prompt.trim()) return;
    working(true); setError(""); setStatus("Creating your portrait… You can explore the other tabs.");
    try {
      const job = await api.userPortrait(prompt);
      const started = Date.now();
      while (alive.current && Date.now() - started < 300000) {
        const result = await api.userPortraitStatus(job.promptId);
        if (!alive.current) return;
        if (result.status === "error") throw Error(result.error || "Image creation was interrupted.");
        if (result.status === "complete" && result.imageUrl) { onChange(result.imageUrl); setStatus("Portrait ready. Save settings to keep it."); return; }
        await new Promise(resolve => window.setTimeout(resolve, 2000));
      }
      if (alive.current) throw Error("Image creation took too long. Check ComfyUI and try again.");
    } catch (reason) { if (alive.current) { setStatus(""); setError(reason instanceof Error ? reason.message : "The portrait couldn't be created."); } }
    finally { working(false); }
  };
  return <div className="user-portrait-editor">
    <div className="user-portrait-generator">
      <label><span>Describe your portrait</span><textarea rows={4} maxLength={2000} value={prompt} onChange={event => onPromptChange(event.target.value)} placeholder="An adult with short dark hair, round glasses and a teal jacket, warm anime-style portrait…" /></label>
      <button type="button" onClick={() => void generate()} disabled={busy || disabled || !prompt.trim()}>{busy ? "Working…" : imageUrl ? "Regenerate portrait" : "Generate portrait"}</button>
      <small>Uses your saved image setup and global quality prompts, with the same gray studio background as character portraits. Save settings to keep your image and prompt.</small>
    </div>
    <div className="user-portrait-tools">
      <input ref={uploadRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => void upload(event.target.files?.[0])} />
      <button type="button" className="quiet-button" onClick={() => uploadRef.current?.click()} disabled={busy || disabled}>Upload instead</button>
      {imageUrl && <button type="button" className="quiet-button" onClick={() => { onChange(""); setStatus(""); }} disabled={busy || disabled}>Remove</button>}
    </div>
    <small>JPG, PNG, or WebP · up to 10 MB. A photo, illustration, or avatar is welcome.</small>
    {status && <p role="status" aria-live="polite">{status}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
