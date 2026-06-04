import React, { useMemo, useState } from "react";
import DataTable from "../../dashboardcomponents/DataTable";
import DisplayCharts from "../../DisplayCharts";
import { useVisualizationFallback } from "../../utils/useVisualizationFallback";
import { FiGrid, FiTrendingUp, FiBarChart2, FiPieChart } from "react-icons/fi";

const DISPLAY_OPTIONS = [
  { value: "table", label: "Table", icon: <FiGrid size={13} /> },
  { value: "line",  label: "Line",  icon: <FiTrendingUp size={13} /> },
  { value: "bar",   label: "Bar",   icon: <FiBarChart2 size={13} /> },
  { value: "pie",   label: "Pie",   icon: <FiPieChart size={13} /> },
];

const DisplayTypeSelect = ({ value, onChange }) => (
  <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 p-0.5">
    {DISPLAY_OPTIONS.map((opt) => (
      <button
        key={opt.value}
        type="button"
        onClick={() => onChange(opt.value)}
        title={opt.label}
        className={[
          "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
          value === opt.value
            ? "bg-white text-slate-900 shadow-sm"
            : "text-slate-400 hover:text-slate-200",
        ].join(" ")}
      >
        {opt.icon}
        <span className="hidden sm:inline">{opt.label}</span>
      </button>
    ))}
  </div>
);

const normalizeDisplayType = (value) => {
  const normalized = String(value || "table").toLowerCase();
  return DISPLAY_OPTIONS.some((opt) => opt.value === normalized) ? normalized : "table";
};

const ResultVisualization = ({
  title = "AI Results",
  rows = [],
  metadata = null,
  showPopup,
  showDisplaySelector = true,
  displayType,
  onDisplayTypeChange,
  defaultRows,
}) => {
  const [internalDisplayType, setInternalDisplayType] = useState(() =>
    normalizeDisplayType(metadata?.preferredDisplay || "table")
  );

  const safeRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);

  const activeDisplayType = normalizeDisplayType(
    displayType ?? internalDisplayType ?? metadata?.preferredDisplay ?? "table"
  );

  const { fallbackToTable, handleDisplayChange } = useVisualizationFallback({
    displayType: activeDisplayType,
    data: safeRows,
    onDisplayChange: (next) => {
      setInternalDisplayType(next);
      onDisplayTypeChange?.(next);
    },
    showPopup,
    invalidDataReason: "Invalid data structure",
  });

  const effectiveDisplayType = activeDisplayType;
  const shouldShowTable = fallbackToTable || effectiveDisplayType === "table";

  const selector = showDisplaySelector ? (
    <DisplayTypeSelect value={effectiveDisplayType} onChange={handleDisplayChange} />
  ) : null;

  if (shouldShowTable) {
    return (
      <div className="space-y-3">
        <DataTable
          title={title}
          data={safeRows}
          defaultRows={defaultRows || 10}
          headerActions={selector}
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-3 bg-slate-900 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="text-xs text-slate-400">Visual summary of the current result set</p>
        </div>
        {selector}
      </div>
      <div className="overflow-auto p-4">
        <DisplayCharts
          data={safeRows}
          view={effectiveDisplayType}
          width={1200}
          height={360}
        />
      </div>
    </div>
  );
};

export default ResultVisualization;