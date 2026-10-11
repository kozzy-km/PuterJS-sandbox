import { memo } from "react";
import type { ChatMessage, ToolCallRecord, AppSettings } from "../lib/store";
import { timeAgo } from "../lib/store";
import { getModel, type AIModel } from "../lib/puter";
import { Md, Thinking, ToolTray, TypingDots, AttachmentThumbs, ErrorCard, MsgActions, ImageResult } from "./ChatView";
import { cn } from "../utils/cn";

/* ═══════════════════════════════════════════════════════════════════════════
   Thread pieces — extracted from App and memoised.

   Why: the composer's `input` state used to live at the top of App, so every
   keystroke (and every scroll-driven `setAtBottom`) re-rendered the whole app,
   message list included — hundreds of markdown nodes re-reconciled per key
   press on a phone. These components are `memo`d and receive only props that
   stay identical while typing or scrolling, so React skips them entirely.
   `MessageList` also never re-renders while an answer streams: only
   `StreamingBlock` does.
   ═══════════════════════════════════════════════════════════════════════════ */

const ModelAvatar = ({ m, className }: { m: AIModel; className?: string }) => (
  <span
    className={cn(
      "grid h-5 w-5 shrink-0 place-items-center rounded-md text-[9.5px] font-bold text-white",
      className,
    )}
    style={{ background: m.color === "#e5e5e5" || m.color === "#d4d4d8" ? "#3f3f46" : m.color }}
  >
    {m.name[0] ?? "N"}
  </span>
);

/** getModel() scans the catalog; cache per id so a message list stays cheap. */
const modelCache = new Map<string, AIModel>();
function resolveModel(id?: string, fallback?: AIModel): AIModel {
  if (!id) return fallback ?? getModel("");
  let hit = modelCache.get(id);
  if (!hit) { hit = getModel(id); modelCache.set(id, hit); }
  return hit;
}

export interface MessageListProps {
  messages: ChatMessage[];
  settings: AppSettings;
  model: AIModel;
  streaming: boolean;
  copiedId: string | null;
  onCopy: (m: ChatMessage) => void;
  onEdit: (m: ChatMessage) => void;
  onDelete: (m: ChatMessage) => void;
  onSpeak: (text: string) => void;
  onRegen: () => void;
}

export const MessageList = memo(function MessageList({
  messages, settings, model, streaming, copiedId, onCopy, onEdit, onDelete, onSpeak, onRegen,
}: MessageListProps) {
  const lastId = messages.length ? messages[messages.length - 1].id : null;
  return (
    <>
      {messages.map((m) => {
        const msgModel = resolveModel(m.model, model);

        if (m.role === "user") {
          return (
            <div key={m.id} className="msg-in group flex flex-col items-end">
              {m.attachments && m.attachments.length > 0 && (
                <div className="mb-1.5"><AttachmentThumbs atts={m.attachments} /></div>
              )}
              <div className="max-w-[86%] whitespace-pre-wrap rounded-[20px] rounded-br-[7px] bg-[var(--color-panel-2)] px-4 py-2.5 text-[15px] leading-relaxed sm:max-w-[75%]">
                {m.text}
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-[10px] text-[var(--color-ink-3)]">{timeAgo(m.ts)}</span>
                <MsgActions
                  m={m} copied={copiedId === m.id} isLast={false}
                  onCopy={() => onCopy(m)}
                  onEdit={() => onEdit(m)}
                  onDelete={() => onDelete(m)}
                />
              </div>
            </div>
          );
        }

        return (
          <div key={m.id} className="msg-in group">
            <div className="mb-1.5 flex items-center gap-2">
              <ModelAvatar m={msgModel} />
              <span className="truncate text-[11.5px] font-medium text-[var(--color-ink-3)]">
                {msgModel.name} · {timeAgo(m.ts)}
              </span>
              {m.usage && settings.showTokens && (
                <span className="shrink-0 font-mono text-[10px] text-[var(--color-ink-3)]">
                  ↑{m.usage.in} ↓{m.usage.out}
                </span>
              )}
            </div>

            {m.error ? <ErrorCard msg={m.error} /> : (
              <div className="space-y-1">
                {settings.showThinking && m.reasoning && <Thinking text={m.reasoning} />}
                {settings.showTools && m.toolCalls?.length ? <ToolTray tools={m.toolCalls} /> : null}
                {m.text && m.text !== "—" && <Md text={m.text} />}
                {m.images?.map((src, k) => <ImageResult key={k} src={src} alt="generated" />)}
              </div>
            )}

            {!m.error && (
              <div className="mt-1">
                <MsgActions
                  m={m} copied={copiedId === m.id}
                  isLast={m.id === lastId && !streaming}
                  onCopy={() => onCopy(m)}
                  onSpeak={() => onSpeak(m.text)}
                  onRegen={onRegen}
                />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
});

export interface StreamingBlockProps {
  model: AIModel;
  showThinking: boolean;
  showTools: boolean;
  streamText: string;
  streamReason: string;
  streamTools: ToolCallRecord[];
  streamImages: string[];
}

export const StreamingBlock = memo(function StreamingBlock({
  model, showThinking, showTools, streamText, streamReason, streamTools, streamImages,
}: StreamingBlockProps) {
  return (
    <div className="msg-in">
      <div className="mb-1.5 flex items-center gap-2">
        <ModelAvatar m={model} className="animate-pulse" />
        <span className="text-[11.5px] font-medium text-[var(--color-ink-3)]">{model.name} is thinking…</span>
      </div>
      <div className="space-y-1">
        {showThinking && streamReason && <Thinking text={streamReason} streaming />}
        {showTools && streamTools.length > 0 && <ToolTray tools={streamTools} streaming />}
        {streamImages.map((src, k) => <ImageResult key={k} src={src} alt="generating" />)}
        {streamText ? <Md text={streamText} caret /> : <TypingDots />}
      </div>
    </div>
  );
});
