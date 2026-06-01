import React from "react";
import ToolBadge from "./ToolBadge";

const ChatMessage = ({ message }) => {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm border ${isUser ? "bg-slate-900 text-white border-slate-800" : "bg-white text-slate-800 border-slate-200"}`}>
        <div className="whitespace-pre-wrap text-sm leading-6">{message.content}</div>

        {Array.isArray(message.toolCalls) && message.toolCalls.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.toolCalls.map((tool, index) => (
              <ToolBadge key={`${tool.name}-${index}`} name={tool.name} status={tool.status} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
