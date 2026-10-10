import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Image as ImageIcon, Clapperboard, AudioLines, Upload, Download, Play, Sparkles,
  Mic, ScanText, Wand2, FlaskConical, X,
} from "lucide-react";
import { IMAGE_MODELS, VIDEO_MODELS, TTS_PRESETS } from "../lib/puter";
import { store, fileToDataUrl, uid } from "../lib/store";
import { Field, Seg, Toggle, Chip, Select, Btn, Spinner, Section } from "./ui";

async function puter(): Promise<any> {
  const { loadPuter } = await import("../lib/puter");
  return loadPuter();
}
const errMsg = (e: any) => e?.message || e?.error || (typeof e === "string" ? e : "Unknown error");

/* ── shared shells ─────────────────────────────────────────── */

function PageHead({ icon, title, chip }: { icon: React.ReactNode; title: string; chip?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-center gap-2.5">
      <span className="text-[var(--color-ink-2)]">{icon}</span>
      <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
      {chip}
    </div>
  );
}

function EmptyBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-64 place-items-center rounded-2xl border border-dashed border-[var(--color-line)] px-6 text-center text-[13.5px] text-[var(--color-ink-3)]">
      {children}
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-fit rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-3.5">
      {children}
    </div>
  );
}

/* ═══════════════════════════ IMAGE LAB ═══════════════════════════ */

export function ImageLab({ onToast }: { onToast: (m: string) => void }) {
  const s = store.settings;
  const [prompt, setPrompt] = useState("A cinematic portrait of a fox in neon Tokyo rain, 85mm, shallow depth of field");
  const [model, setModel] = useState(s.imgModel);
  const [quality, setQuality] = useState(s.imgQuality);
  const [ratio, setRatio] = useState(s.imgRatio);
  const [ref, setRef] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<any[]>(() =>
    (store.gallery ?? []).filter((g: any) => g.kind === "image").slice(0, 12));
  const [testMode, setTestMode] = useState(s.testMode);
  const fileRef = useRef<HTMLInputElement>(null);

  const meta = IMAGE_MODELS.find((m) => m.id === model) ?? IMAGE_MODELS[0];

  async function generate() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    try {
      const p = await puter();
      const [w, h] = ratio.split(":").map(Number);
      const opts: any = { model, test_mode: testMode };
      if (meta.provider === "openai") opts.quality = quality.toLowerCase();
      else if (meta.provider === "gemini") opts.quality = quality;
      else if (meta.provider === "xai") opts.quality = quality.toLowerCase();
      if (meta.provider !== "cloudflare") opts.ratio = { w, h };
      if (ref) opts.input_image = ref;

      const imgEl = await p.ai.txt2img(prompt, opts);
      const src = imgEl?.src || String(imgEl);
      const rec = { src, prompt, model, ts: Date.now(), kind: "image", id: uid() };
      setResults((r) => [rec, ...r].slice(0, 24));
      store.gallery = [rec, ...(store.gallery ?? [])].slice(0, 60);
      onToast("Image rendered");
    } catch (e: any) {
      onToast("Image failed: " + errMsg(e));
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 pb-10 pt-6 lg:grid-cols-[330px_1fr]">
      <Panel>
        <PageHead icon={<ImageIcon size={17} />} title="Image Lab" chip={<Chip tone="green">txt2img</Chip>} />

        <div className="space-y-4">
          <Field label="Prompt">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-xl border border-[var(--color-line)] bg-[var(--color-panel-2)] p-3 text-[13.5px] leading-relaxed outline-none focus:border-[var(--color-line-2)]"
            />
          </Field>

          <Field label="Model" hint={meta.desc}>
            <Select
              value={model}
              onChange={(v) => {
                setModel(v);
                const m = IMAGE_MODELS.find((x) => x.id === v);
                if (m) setQuality(m.qualities[0]);
              }}
              options={IMAGE_MODELS.map((m) => ({ value: m.id, label: m.name, hint: m.provider }))}
              searchable
            />
          </Field>

          <Field label="Quality">
            <Select
              value={quality}
              onChange={setQuality}
              options={meta.qualities.map((q) => ({ value: q, label: q }))}
              size="sm"
            />
          </Field>

          <Field label="Aspect ratio">
            <Seg
              size="sm"
              value={ratio}
              onChange={setRatio}
              options={["1:1", "16:9", "9:16", "4:3", "3:4"].map((r) => ({ v: r, label: r }))}
            />
          </Field>

          <Field label="Edit reference" hint="image-to-image: upload a base to repaint">
            <div className="flex items-center gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                className="press flex items-center gap-1.5 rounded-xl border border-dashed border-[var(--color-line-2)] px-3 py-2 text-[12px] font-medium hover:bg-[var(--color-panel-2)]"
              >
                <Upload size={13} />{ref ? "Replace" : "Upload"}
              </button>
              {ref && (
                <>
                  <img src={ref} className="h-10 w-10 rounded-lg object-cover" alt="" />
                  <button onClick={() => setRef(null)} aria-label="Remove reference" className="press text-[var(--color-ink-3)] hover:text-red-500">
                    <X size={14} />
                  </button>
                </>
              )}
              <input
                ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={async (e) => { const f = e.target.files?.[0]; if (f) setRef(await fileToDataUrl(f)); }}
              />
            </div>
          </Field>

          <div className="flex items-center justify-between rounded-xl bg-[var(--color-panel-2)] px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-[12.5px] font-medium">
              <FlaskConical size={13} /> Test mode <span className="text-[var(--color-ink-3)]">(free sample)</span>
            </span>
            <Toggle on={testMode} onChange={setTestMode} label="Test mode" />
          </div>

          <Btn
            variant="primary"
            size="lg"
            className="w-full"
            disabled={busy || !prompt.trim()}
            onClick={generate}
          >
            {busy ? <Spinner size={16} /> : <Wand2 size={16} />}
            {busy ? "Rendering…" : "Generate image"}
          </Btn>
        </div>
      </Panel>

      <div>
        {results.length === 0 ? (
          <EmptyBox>No renders yet — describe something beautiful →</EmptyBox>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AnimatePresence initial={false}>
              {results.map((r, i) => (
                <motion.figure
                  key={(r.id ?? "") + r.ts + i}
                  layout
                  initial={{ opacity: 0, y: 14, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 380, damping: 34 }}
                  className="group overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)]"
                >
                  <div className="relative">
                    <img src={r.src} alt={r.prompt} className="aspect-square w-full object-cover" loading="lazy" />
                    <div className="absolute inset-x-0 bottom-0 flex translate-y-2 gap-2 bg-gradient-to-t from-black/75 to-transparent p-3 opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                      <a
                        href={r.src}
                        download={`nexus-${r.ts}.png`}
                        className="press flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-black"
                      >
                        <Download size={12} /> Save
                      </a>
                      <a
                        href={r.src} target="_blank" rel="noreferrer"
                        className="press flex items-center gap-1 rounded-lg bg-white/22 px-2.5 py-1.5 text-[11.5px] font-semibold text-white backdrop-blur"
                      >
                        Open
                      </a>
                    </div>
                  </div>
                  <figcaption className="p-3">
                    <p className="line-clamp-2 text-[12px] leading-relaxed text-[var(--color-ink-2)]">{r.prompt}</p>
                    <p className="mt-1 truncate font-mono text-[10px] text-[var(--color-ink-3)]">{r.model}</p>
                  </figcaption>
                </motion.figure>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════ VIDEO LAB ═══════════════════════════ */

export function VideoLab({ onToast }: { onToast: (m: string) => void }) {
  const s = store.settings;
  const [prompt, setPrompt] = useState("A fox sprinting through a snow-covered forest at dusk, cinematic drone push-in");
  const [model, setModel] = useState(s.vidModel);
  const [seconds, setSeconds] = useState(s.vidSeconds);
  const [size, setSize] = useState(s.vidSize);
  const [audio, setAudio] = useState(s.vidAudio);
  const [neg, setNeg] = useState(s.vidNeg);
  const [refImg, setRefImg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [clips, setClips] = useState<any[]>(() =>
    (store.gallery ?? []).filter((g: any) => g.kind === "video").slice(0, 8));
  const [testMode, setTestMode] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const meta = VIDEO_MODELS.find((m) => m.id === model) ?? VIDEO_MODELS[0];

  async function generate() {
    if (!prompt.trim() || busy) return;
    setBusy(true); setElapsed(0);
    const tick = setInterval(() => setElapsed((e) => e + 1), 1000);
    try {
      const p = await puter();
      const opts: any = {
        model, seconds, size,
        generate_audio: audio,
        negative_prompt: neg || undefined,
        test_mode: testMode,
      };
      if (refImg) opts.input_reference = refImg;
      const vid: any = await p.ai.txt2vid(prompt, opts);
      const src = vid?.src || vid?.currentSrc || String(vid);
      const rec = { src, prompt, model, ts: Date.now(), kind: "video", id: uid() };
      setClips((c) => [rec, ...c].slice(0, 12));
      store.gallery = [rec, ...(store.gallery ?? [])].slice(0, 60);
      onToast("Video ready");
    } catch (e: any) {
      onToast("Video failed: " + errMsg(e));
    }
    clearInterval(tick); setBusy(false);
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 pb-10 pt-6 lg:grid-cols-[330px_1fr]">
      <Panel>
        <PageHead icon={<Clapperboard size={17} />} title="Video Lab" chip={<Chip tone="violet">txt2vid</Chip>} />

        <div className="space-y-4">
          <Field label="Prompt" hint="Subject + motion + camera + mood">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-xl border border-[var(--color-line)] bg-[var(--color-panel-2)] p-3 text-[13.5px] leading-relaxed outline-none focus:border-[var(--color-line-2)]"
            />
          </Field>

          <Field label="Model" hint={meta.desc}>
            <Select
              value={model}
              onChange={(v) => {
                setModel(v);
                const m = VIDEO_MODELS.find((x) => x.id === v);
                if (m) { setSeconds(m.seconds[Math.min(2, m.seconds.length - 1)] ?? m.seconds[0]); setSize(m.sizes[0]); }
              }}
              options={VIDEO_MODELS.map((m) => ({ value: m.id, label: m.name, hint: m.desc }))}
              searchable
            />
          </Field>

          <Field label={`Length · ${seconds}s`}>
            <Seg
              size="sm"
              value={String(seconds)}
              onChange={(v) => setSeconds(Number(v))}
              options={meta.seconds.map((x) => ({ v: String(x), label: `${x}s` }))}
            />
          </Field>

          <Field label="Size">
            <Seg
              size="sm"
              value={size}
              onChange={(v) => setSize(v)}
              options={meta.sizes.map((x) => ({ v: x, label: String(x) }))}
            />
          </Field>

          <Field label="Negative prompt">
            <input
              value={neg}
              onChange={(e) => setNeg(e.target.value)}
              placeholder="blurry, text, watermark"
              className="w-full rounded-xl border border-[var(--color-line)] bg-transparent p-2.5 text-[13px] outline-none focus:border-[var(--color-line-2)]"
            />
          </Field>

          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-xl bg-[var(--color-panel-2)] px-3 py-2.5 text-[12.5px] font-medium">
              <span>Soundtrack</span><Toggle on={audio} onChange={setAudio} label="Soundtrack" />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-[var(--color-panel-2)] px-3 py-2.5 text-[12.5px] font-medium">
              <span className="flex items-center gap-1.5"><FlaskConical size={13} /> Test mode</span>
              <Toggle on={testMode} onChange={setTestMode} label="Test mode" />
            </div>
          </div>

          <Field label="First frame (image-to-video)">
            <div className="flex items-center gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                className="press flex items-center gap-1.5 rounded-xl border border-dashed border-[var(--color-line-2)] px-3 py-2 text-[12px] font-medium hover:bg-[var(--color-panel-2)]"
              >
                <Upload size={13} />{refImg ? "Replace" : "Upload frame"}
              </button>
              {refImg && <img src={refImg} className="h-10 w-16 rounded-lg object-cover" alt="" />}
              <input
                ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={async (e) => { const f = e.target.files?.[0]; if (f) setRefImg(await fileToDataUrl(f)); }}
              />
            </div>
          </Field>

          <Btn
            variant="primary" size="lg" className="w-full"
            disabled={busy || !prompt.trim()}
            onClick={generate}
          >
            {busy ? <Spinner size={16} /> : <Play size={16} fill="currentColor" />}
            {busy ? `Rendering… ${elapsed}s` : "Generate video"}
          </Btn>
          {busy && (
            <p className="text-center text-[11.5px] text-[var(--color-ink-3)]">
              Video takes 30s–3min. Keep this tab open.
            </p>
          )}
        </div>
      </Panel>

      <div className="space-y-4">
        {clips.length === 0 && !busy && <EmptyBox>No clips yet — direct your first shot →</EmptyBox>}

        {busy && (
          <div className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)]">
            <div className="thinking-track h-[3px] bg-[var(--color-panel-2)] text-[var(--color-ink-2)]" />
            <div className="grid h-56 place-items-center text-[13px] text-[var(--color-ink-3)]">
              <span className="flex items-center gap-2.5">
                <Spinner size={16} /> Rendering on {meta.name}… {elapsed}s
              </span>
            </div>
          </div>
        )}

        {clips.map((c, i) => (
          <motion.figure
            key={(c.id ?? "") + c.ts + i}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)]"
          >
            <video src={c.src} controls preload="metadata" className="max-h-[420px] w-full bg-black" />
            <figcaption className="flex items-center gap-2 p-3 text-[12px]">
              <span className="line-clamp-1 min-w-0 flex-1 text-[var(--color-ink-2)]">{c.prompt}</span>
              <Chip>{c.model}</Chip>
              <a
                href={c.src} download={`nexus-${c.ts}.mp4`}
                className="press flex shrink-0 items-center gap-1 font-semibold hover:underline"
              >
                <Download size={12} /> MP4
              </a>
            </figcaption>
          </motion.figure>
        ))}
      </div>
    </div>
  );
}

/* ═════════════════════ VOICE LAB (TTS + STT + OCR) ═════════════════════ */

export function VoiceLab({ onToast }: { onToast: (m: string) => void }) {
  const s = store.settings;
  const [tab, setTab] = useState<"tts" | "stt" | "ocr">("tts");
  const [text, setText] = useState("Hello world! Nexus is a local-first AI studio — no accounts, everything saved on this device.");
  const [provider, setProvider] = useState(s.ttsProvider);
  const [voice, setVoice] = useState(s.ttsVoice);
  const [vmodel, setVmodel] = useState(s.ttsModel);
  const [instructions, setInstructions] = useState(s.ttsInstructions);
  const [busy, setBusy] = useState(false);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [ocrText, setOcrText] = useState("");
  const [ocrImg, setOcrImg] = useState<string | null>(null);
  const fRef = useRef<HTMLInputElement>(null);
  const preset = TTS_PRESETS.find((t) => t.provider === provider) ?? TTS_PRESETS[0];

  async function speak() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const p = await puter();
      const audio: any = await p.ai.txt2speech(text.slice(0, 3000), {
        provider, voice, model: vmodel,
        instructions: provider === "openai" || provider === "gemini" ? instructions : undefined,
        language: "en-US",
        engine: provider === "aws-polly" ? vmodel : undefined,
      });
      const src = audio?.src || audio?.currentSrc || "";
      setAudioSrc(src);
      new Audio(src).play().catch(() => {});
      onToast("Speech synthesized");
    } catch (e: any) {
      onToast("TTS failed: " + errMsg(e));
    }
    setBusy(false);
  }

  async function transcribeFile(f: File) {
    setBusy(true); setTranscript("Transcribing…");
    try {
      const p = await puter();
      const r: any = await p.ai.speech2txt(f, { model: "whisper-1" });
      setTranscript(typeof r === "string" ? r : r?.text || JSON.stringify(r, null, 2));
      onToast("Transcribed");
    } catch (e: any) {
      setTranscript("Failed: " + errMsg(e));
    }
    setBusy(false);
  }

  async function runOcr() {
    if (!ocrImg) return;
    setBusy(true); setOcrText("Reading image…");
    try {
      const p = await puter();
      if (p.ai.img2txt) {
        const r: any = await p.ai.img2txt(ocrImg);
        setOcrText(typeof r === "string" ? r : r?.text || JSON.stringify(r, null, 2));
      } else {
        const r: any = await p.ai.chat(
          "Transcribe ALL text visible in this image. Return only the text.",
          ocrImg,
          { model: "gpt-5.4-nano" },
        );
        const c = r?.message?.content ?? r;
        setOcrText(typeof c === "string" ? c : JSON.stringify(c, null, 2));
      }
      onToast("OCR done");
    } catch (e: any) {
      setOcrText("Failed: " + errMsg(e));
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 px-4 pb-10 pt-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2.5">
          <AudioLines size={17} className="text-[var(--color-ink-2)]" />
          <h2 className="text-[15px] font-bold tracking-tight">Voice &amp; OCR Lab</h2>
        </div>
        <div className="w-full sm:ml-auto sm:w-72">
          <Seg
            value={tab}
            onChange={setTab}
            options={[
              { v: "tts" as const, label: "Text → Speech" },
              { v: "stt" as const, label: "Speech → Text" },
              { v: "ocr" as const, label: "OCR" },
            ]}
          />
        </div>
      </div>

      {tab === "tts" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <Panel>
            <div className="space-y-4">
              <Field label={`Script · ${text.length} / 3000 chars`}>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={7}
                  className="w-full resize-none rounded-xl border border-[var(--color-line)] bg-[var(--color-panel-2)] p-3 text-[13.5px] leading-relaxed outline-none focus:border-[var(--color-line-2)]"
                />
              </Field>
              <Field label="Style instructions" hint="OpenAI + Gemini only">
                <input
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-line)] bg-transparent p-2.5 text-[13px] outline-none focus:border-[var(--color-line-2)]"
                />
              </Field>
              {audioSrc && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                  <audio src={audioSrc} controls className="w-full" />
                </motion.div>
              )}
              <Btn
                variant="primary" size="lg" className="w-full"
                disabled={busy || !text.trim()} onClick={speak}
              >
                {busy ? <Spinner size={16} /> : <Sparkles size={16} />}
                {busy ? "Synthesizing…" : "Synthesize & play"}
              </Btn>
            </div>
          </Panel>

          <Panel>
            <div className="space-y-4">
              <Field label="Provider">
                <Select
                  value={provider}
                  onChange={(v) => {
                    setProvider(v);
                    const pr = TTS_PRESETS.find((t) => t.provider === v);
                    if (pr) { setVmodel(pr.models[0]); setVoice(pr.voices[0].split(" ")[0]); }
                  }}
                  options={TTS_PRESETS.map((t) => ({ value: t.provider, label: t.name }))}
                />
              </Field>
              <Field label="Model / engine">
                <Select
                  value={vmodel}
                  onChange={setVmodel}
                  options={preset.models.map((m) => ({ value: m, label: m }))}
                />
              </Field>
              <Field label="Voice">
                <Select
                  value={voice}
                  onChange={setVoice}
                  options={preset.voices.map((v) => ({ value: v.split(" ")[0], label: v }))}
                  searchable={preset.voices.length > 8}
                />
                {provider === "elevenlabs" && (
                  <input
                    value={voice}
                    onChange={(e) => setVoice(e.target.value)}
                    placeholder="Paste ElevenLabs voice ID"
                    className="mt-2 w-full rounded-xl border border-[var(--color-line)] bg-transparent p-2.5 font-mono text-[12px] outline-none focus:border-[var(--color-line-2)]"
                  />
                )}
              </Field>
              <div className="rounded-xl bg-[var(--color-panel-2)] p-3 text-[11.5px] leading-relaxed text-[var(--color-ink-2)]">
                xAI voices: <b>eve</b> (energetic) · <b>ara</b> (warm) · <b>rex</b> (confident) · <b>sal</b> (smooth) · <b>leo</b> (authoritative). Supports <code className="font-mono">[pause] [laugh] &lt;whisper&gt;</code> tags.
              </div>
            </div>
          </Panel>
        </div>
      )}

      {tab === "stt" && (
        <Panel>
          <div
            onClick={() => fRef.current?.click()}
            className="press grid cursor-pointer place-items-center gap-2.5 rounded-2xl border border-dashed border-[var(--color-line-2)] px-6 py-14 text-center hover:bg-[var(--color-panel-2)]"
          >
            <Mic size={24} className="text-[var(--color-ink-3)]" />
            <p className="text-[13.5px] font-medium">Drop an audio file or click to transcribe</p>
            <p className="font-mono text-[11px] text-[var(--color-ink-3)]">whisper-1 · mp3 / wav / m4a</p>
            <input
              ref={fRef} type="file" accept="audio/*,video/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) transcribeFile(f); }}
            />
          </div>
          {transcript && (
            <div className="mt-4 whitespace-pre-wrap rounded-xl bg-[var(--color-panel-2)] p-4 text-[13.5px] leading-relaxed">
              {transcript}
            </div>
          )}
          <p className="mt-3 text-[11.5px] text-[var(--color-ink-3)]">
            Tip: use the mic in the chat composer to record, then transcribe here.
          </p>
        </Panel>
      )}

      {tab === "ocr" && (
        <div className="grid gap-5 md:grid-cols-2">
          <Panel>
            <label className="press grid cursor-pointer place-items-center gap-2.5 rounded-xl border border-dashed border-[var(--color-line-2)] py-12 text-[13px] font-medium hover:bg-[var(--color-panel-2)]">
              <ScanText size={22} className="text-[var(--color-ink-3)]" />
              {ocrImg ? "Replace image" : "Upload image with text"}
              <input
                type="file" accept="image/*" className="hidden"
                onChange={async (e) => { const f = e.target.files?.[0]; if (f) setOcrImg(await fileToDataUrl(f)); }}
              />
            </label>
            {ocrImg && (
              <img src={ocrImg} className="mt-3 max-h-72 w-full rounded-xl bg-[var(--color-panel-2)] object-contain" alt="" />
            )}
            <Btn
              variant="primary" className="mt-3 w-full"
              disabled={!ocrImg || busy} onClick={runOcr}
            >
              {busy ? <Spinner size={15} /> : <ScanText size={15} />} Extract text
            </Btn>
          </Panel>
          <div className="whitespace-pre-wrap rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4 text-[13.5px] leading-relaxed">
            {ocrText || <span className="text-[var(--color-ink-3)]">OCR output appears here…</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export { Section };
