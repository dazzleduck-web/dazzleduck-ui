import React from "react";
import ToolBadge from "./ToolBadge";

const VARIANT_STYLES = {
  default: "bg-white text-slate-800 border-slate-200/70",
  error: "bg-red-50 text-red-900 border-red-200",
  confirmation: "bg-amber-50 text-amber-950 border-amber-200",
};

const ChatMessage = ({ message, variant = "default" }) => {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} px-1 py-0.5`}>
      <div
        className={[
          "relative max-w-[85%] rounded-2xl border px-4 py-3 text-sm leading-relaxed shadow-sm",
          isUser
            ? "rounded-br-sm bg-slate-900 text-white border-slate-700/50"
            : `rounded-bl-sm ${VARIANT_STYLES[variant] ?? VARIANT_STYLES.default}`,
        ].join(" ")}
      >
        <p className="whitespace-pre-wrap break-words">
          {message.content}
        </p>

        {Array.isArray(message.toolCalls) && message.toolCalls.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-white/10 pt-2.5">
            {message.toolCalls.map((tool, index) => (
              <ToolBadge
                key={`${tool.name}-${index}`}
                name={tool.name}
                status={tool.status}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;