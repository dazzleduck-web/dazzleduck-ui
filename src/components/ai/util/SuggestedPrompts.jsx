import React from "react";

const SuggestedPrompts = ({ onPromptSelect }) => {
  const prompts = [
    {
      title: "Named Queries",
      description: "List all available named queries I can execute"
    },
    {
      title: "Custom Query",
      description: "Help me write and execute a custom SQL query"
    },
    {
      title: "Learn Queries",
      description: "Explain how named queries work in this system"
    }
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-slate-600">Try asking:</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {prompts.map((prompt, index) => (
          <button
            key={index}
            onClick={() => onPromptSelect(prompt.description)}
            className="group relative rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition-all hover:border-blue-300 hover:bg-blue-50 hover:shadow-md active:scale-95"
          >
            <div className="font-medium text-xs text-slate-900 group-hover:text-blue-900">
              {prompt.title}
            </div>
            <div className="mt-1.5 text-xs text-slate-500 group-hover:text-blue-700 line-clamp-2">
              {prompt.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default SuggestedPrompts;
