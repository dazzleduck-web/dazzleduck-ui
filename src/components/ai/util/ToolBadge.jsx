import React from "react";

const statusClasses = {
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  pending_confirmation: "bg-amber-100 text-amber-700 border-amber-200",
  error: "bg-rose-100 text-rose-700 border-rose-200",
};

const ToolBadge = ({ name, status = "completed" }) => {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClasses[status] || statusClasses.completed}`}>
      <span>{name}</span>
      <span className="opacity-70">•</span>
      <span className="uppercase tracking-wide">{status.replace(/_/g, " ")}</span>
    </span>
  );
};

export default ToolBadge;
