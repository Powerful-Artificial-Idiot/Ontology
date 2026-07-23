import {
  Boxes,
  Archive,
  ArrowRightFromLine,
  BarChart3,
  Building2,
  CircleDot,
  Code2,
  Component as ComponentIcon,
  DraftingCompass,
  Factory,
  FileCog,
  FileText,
  Gauge,
  GitCommitHorizontal,
  Handshake,
  PackageCheck,
  PackageOpen,
  Package,
  Puzzle,
  SearchCheck,
  ShieldCheck,
  SquareActivity,
  Store,
  TriangleAlert,
  Truck,
  Warehouse,
  Wrench,
} from "lucide-react";
import type { StackObject, StackObjectType, ViewMode, VisualConfig } from "../types";

const iconByName = {
  Boxes,
  Archive,
  ArrowRightFromLine,
  BarChart3,
  Building2,
  CircleDot,
  Code2,
  Component: ComponentIcon,
  DraftingCompass,
  Factory,
  FileCog,
  FileText,
  Gauge,
  GitCommitHorizontal,
  Handshake,
  PackageCheck,
  PackageOpen,
  Package,
  Puzzle,
  SearchCheck,
  ShieldCheck,
  SquareActivity,
  Store,
  TriangleAlert,
  Truck,
  Warehouse,
  Wrench,
};

type VisualSize = "sm" | "md" | "lg";

const sizeClass: Record<VisualSize, string> = {
  sm: "h-5 w-5 rounded-md",
  md: "h-10 w-10 rounded-xl",
  lg: "h-14 w-14 rounded-xl",
};

const iconSizeClass: Record<VisualSize, string> = {
  sm: "h-3.5 w-3.5",
  md: "h-5 w-5",
  lg: "h-7 w-7",
};

export function getVisualConfig(object: StackObject, _viewMode: ViewMode): VisualConfig {
  if (object.visual) {
    return {
      kind: object.visual.kind,
      icon: object.visual.icon ? iconByName[object.visual.icon as keyof typeof iconByName] : undefined,
      src: object.visual.src,
      label: object.visual.alt ?? object.label,
      className: colorForType(object.type),
      backgroundClassName: backgroundForType(object.type),
    };
  }

  const fallback = fallbackVisualByType[object.type] ?? fallbackVisualByType.Default;

  return {
    ...fallback,
    label: object.label,
  };
}

export function NodeVisual({
  object,
  viewMode,
  size = "md",
}: {
  object: StackObject;
  viewMode: ViewMode;
  size?: VisualSize;
}) {
  const visual = getVisualConfig(object, viewMode);

  return (
    <div
      className={[
        "relative grid shrink-0 place-items-center overflow-hidden border border-white/70 shadow-sm",
        sizeClass[size],
        visual.backgroundClassName,
      ].join(" ")}
      aria-label={visual.label}
      title={visual.label}
    >
      {visual.kind === "thumbnail" ? (
        <Thumbnail object={object} size={size} visual={visual} />
      ) : (
        <IconVisual visual={visual} size={size} />
      )}
    </div>
  );
}

function IconVisual({ visual, size }: { visual: VisualConfig; size: VisualSize }) {
  const Icon = visual.icon ?? CircleDot;
  return <Icon className={[iconSizeClass[size], visual.className].join(" ")} strokeWidth={1.9} />;
}

function Thumbnail({
  object,
  size,
  visual,
}: {
  object: StackObject;
  size: VisualSize;
  visual: VisualConfig;
}) {
  if (visual.src) {
    return <img src={visual.src} alt={visual.label} className="h-full w-full object-cover" />;
  }

  if (object.type === "Product") {
    return <ProductThumbnail size={size} />;
  }

  if (object.type === "Material") {
    return <MaterialThumbnail size={size} />;
  }

  return <ComponentThumbnail object={object} size={size} />;
}

function ProductThumbnail({ size }: { size: VisualSize }) {
  return (
    <div className={["relative", size === "sm" ? "h-4 w-4" : size === "lg" ? "h-10 w-10" : "h-7 w-7"].join(" ")}>
      <div className="absolute inset-x-1 top-1 h-[42%] rounded-md border border-blue-500/55 bg-blue-100" />
      <div className="absolute inset-x-0 bottom-1 h-[48%] rounded-lg border border-blue-600/60 bg-white/80" />
      <div className="absolute left-[26%] top-[45%] h-[26%] w-[48%] rounded-full border border-blue-600/55 bg-blue-50" />
    </div>
  );
}

function MaterialThumbnail({ size }: { size: VisualSize }) {
  return (
    <div className={["relative", size === "sm" ? "h-4 w-4" : size === "lg" ? "h-10 w-10" : "h-7 w-7"].join(" ")}>
      <div className="absolute bottom-1 left-0 h-[54%] w-[74%] rounded-sm border border-slate-500/50 bg-slate-200" />
      <div className="absolute right-0 top-1 h-[54%] w-[74%] rounded-sm border border-slate-500/40 bg-white/65" />
      <div className="absolute left-[18%] top-[34%] h-px w-[62%] bg-slate-500/50" />
    </div>
  );
}

function ComponentThumbnail({ object, size }: { object: StackObject; size: VisualSize }) {
  const compact = size === "sm";
  const lowerLabel = object.label.toLowerCase();

  if (lowerLabel.includes("seal ring")) {
    return (
      <div
        className={[
          "rounded-full border-2 border-cyan-600/70 bg-cyan-50",
          compact ? "h-3.5 w-3.5" : size === "lg" ? "h-9 w-9" : "h-6 w-6",
        ].join(" ")}
      >
        <div className="m-[23%] h-[54%] w-[54%] rounded-full bg-white" />
      </div>
    );
  }

  if (lowerLabel.includes("push rod")) {
    return (
      <div className={["relative", compact ? "h-4 w-4" : size === "lg" ? "h-10 w-10" : "h-7 w-7"].join(" ")}>
        <div className="absolute left-[45%] top-[8%] h-[84%] w-[16%] rounded-full bg-cyan-600/75" />
        <div className="absolute left-[28%] top-[10%] h-[18%] w-[50%] rounded-full border border-cyan-700/50 bg-white" />
        <div className="absolute left-[25%] bottom-[8%] h-[18%] w-[56%] rounded-full border border-cyan-700/50 bg-cyan-100" />
      </div>
    );
  }

  if (lowerLabel.includes("diaphragm")) {
    return (
      <div className={["relative", compact ? "h-4 w-4" : size === "lg" ? "h-10 w-10" : "h-7 w-7"].join(" ")}>
        <div className="absolute inset-[12%] rounded-full border border-cyan-700/55 bg-cyan-100" />
        <div className="absolute inset-x-[18%] top-[43%] h-[14%] rounded-full bg-cyan-600/45" />
      </div>
    );
  }

  return <Puzzle className={[iconSizeClass[size], "text-cyan-600"].join(" ")} strokeWidth={1.9} />;
}

function colorForType(type: StackObjectType) {
  return fallbackVisualByType[type]?.className ?? fallbackVisualByType.Default.className;
}

function backgroundForType(type: StackObjectType) {
  return fallbackVisualByType[type]?.backgroundClassName ?? fallbackVisualByType.Default.backgroundClassName;
}

const fallbackVisualByType: Record<string, VisualConfig> = {
  Product: {
    kind: "thumbnail",
    label: "Product thumbnail",
    className: "text-blue-600",
    backgroundClassName: "bg-blue-50",
  },
  Material: {
    kind: "thumbnail",
    label: "Material thumbnail",
    className: "text-slate-600",
    backgroundClassName: "bg-slate-100",
  },
  Component: {
    kind: "thumbnail",
    label: "Component thumbnail",
    className: "text-cyan-600",
    backgroundClassName: "bg-cyan-50",
  },
  Process: {
    kind: "icon",
    icon: GitCommitHorizontal,
    label: "Process icon",
    className: "text-indigo-600",
    backgroundClassName: "bg-indigo-50",
  },
  Operation: {
    kind: "icon",
    icon: GitCommitHorizontal,
    label: "Operation icon",
    className: "text-indigo-600",
    backgroundClassName: "bg-indigo-50",
  },
  Machine: {
    kind: "icon",
    icon: Factory,
    label: "Machine icon",
    className: "text-slate-600",
    backgroundClassName: "bg-slate-100",
  },
  Fixture: {
    kind: "icon",
    icon: Wrench,
    label: "Fixture icon",
    className: "text-violet-600",
    backgroundClassName: "bg-violet-50",
  },
  Quality: {
    kind: "icon",
    icon: ShieldCheck,
    label: "Quality icon",
    className: "text-orange-600",
    backgroundClassName: "bg-orange-50",
  },
  "Quality Characteristic": {
    kind: "icon",
    icon: Gauge,
    label: "Quality characteristic icon",
    className: "text-orange-600",
    backgroundClassName: "bg-orange-50",
  },
  "Key Characteristic": {
    kind: "icon",
    icon: Gauge,
    label: "Key characteristic icon",
    className: "text-indigo-600",
    backgroundClassName: "bg-indigo-50",
  },
  CTQ: {
    kind: "icon",
    icon: ShieldCheck,
    label: "CTQ icon",
    className: "text-orange-600",
    backgroundClassName: "bg-orange-50",
  },
  Inspection: {
    kind: "icon",
    icon: SearchCheck,
    label: "Inspection icon",
    className: "text-amber-600",
    backgroundClassName: "bg-amber-50",
  },
  "Inspection Method": {
    kind: "icon",
    icon: SearchCheck,
    label: "Inspection method icon",
    className: "text-amber-600",
    backgroundClassName: "bg-amber-50",
  },
  "Control Method": {
    kind: "icon",
    icon: ShieldCheck,
    label: "Control method icon",
    className: "text-amber-600",
    backgroundClassName: "bg-amber-50",
  },
  Specification: {
    kind: "icon",
    icon: DraftingCompass,
    label: "Specification icon",
    className: "text-slate-700",
    backgroundClassName: "bg-slate-100",
  },
  "Control Limit": {
    kind: "icon",
    icon: Gauge,
    label: "Control limit icon",
    className: "text-amber-700",
    backgroundClassName: "bg-amber-50",
  },
  "Measurement System": {
    kind: "icon",
    icon: SearchCheck,
    label: "Measurement system icon",
    className: "text-teal-700",
    backgroundClassName: "bg-teal-50",
  },
  "Metric Observation": {
    kind: "icon",
    icon: BarChart3,
    label: "Metric observation icon",
    className: "text-blue-700",
    backgroundClassName: "bg-blue-50",
  },
  "Reaction Plan": {
    kind: "icon",
    icon: ShieldCheck,
    label: "Reaction plan icon",
    className: "text-red-700",
    backgroundClassName: "bg-red-50",
  },
  "Engineering Change": {
    kind: "icon",
    icon: FileCog,
    label: "Engineering change icon",
    className: "text-indigo-700",
    backgroundClassName: "bg-indigo-50",
  },
  "Governed Document": {
    kind: "icon",
    icon: FileText,
    label: "Governed document icon",
    className: "text-zinc-700",
    backgroundClassName: "bg-zinc-100",
  },
  PFMEA: {
    kind: "icon",
    icon: TriangleAlert,
    label: "PFMEA risk icon",
    className: "text-red-600",
    backgroundClassName: "bg-red-50",
  },
  "PFMEA Risk": {
    kind: "icon",
    icon: TriangleAlert,
    label: "PFMEA risk icon",
    className: "text-red-600",
    backgroundClassName: "bg-red-50",
  },
  "Control Plan Item": {
    kind: "icon",
    icon: FileCog,
    label: "Control plan item icon",
    className: "text-slate-600",
    backgroundClassName: "bg-slate-100",
  },
  Document: {
    kind: "icon",
    icon: FileText,
    label: "Document icon",
    className: "text-zinc-600",
    backgroundClassName: "bg-zinc-100",
  },
  "Engineering Spec": {
    kind: "icon",
    icon: DraftingCompass,
    label: "Engineering spec icon",
    className: "text-purple-600",
    backgroundClassName: "bg-purple-50",
  },
  Program: {
    kind: "icon",
    icon: Code2,
    label: "Program icon",
    className: "text-emerald-600",
    backgroundClassName: "bg-emerald-50",
  },
  Supplier: {
    kind: "icon",
    icon: Truck,
    label: "Supplier icon",
    className: "text-slate-600",
    backgroundClassName: "bg-slate-100",
  },
  Customer: {
    kind: "icon",
    icon: Building2,
    label: "Customer icon",
    className: "text-blue-600",
    backgroundClassName: "bg-blue-50",
  },
  "Inventory Buffer": {
    kind: "icon",
    icon: Archive,
    label: "Inventory buffer icon",
    className: "text-teal-600",
    backgroundClassName: "bg-teal-50",
  },
  "WIP Buffer": {
    kind: "icon",
    icon: PackageOpen,
    label: "WIP buffer icon",
    className: "text-emerald-600",
    backgroundClassName: "bg-emerald-50",
  },
  "FIFO Lane": {
    kind: "icon",
    icon: ArrowRightFromLine,
    label: "FIFO lane icon",
    className: "text-cyan-600",
    backgroundClassName: "bg-cyan-50",
  },
  Supermarket: {
    kind: "icon",
    icon: Warehouse,
    label: "Supermarket icon",
    className: "text-indigo-600",
    backgroundClassName: "bg-indigo-50",
  },
  "Process Box": {
    kind: "icon",
    icon: SquareActivity,
    label: "Process box icon",
    className: "text-slate-600",
    backgroundClassName: "bg-slate-100",
  },
  "Bottleneck Marker": {
    kind: "icon",
    icon: TriangleAlert,
    label: "Bottleneck marker icon",
    className: "text-red-600",
    backgroundClassName: "bg-red-50",
  },
  "Value Stream Metric": {
    kind: "icon",
    icon: BarChart3,
    label: "Value stream metric icon",
    className: "text-amber-600",
    backgroundClassName: "bg-amber-50",
  },
  "Finished Goods Inventory": {
    kind: "icon",
    icon: PackageCheck,
    label: "Finished goods inventory icon",
    className: "text-green-600",
    backgroundClassName: "bg-green-50",
  },
  Default: {
    kind: "icon",
    icon: CircleDot,
    label: "Default object icon",
    className: "text-slate-600",
    backgroundClassName: "bg-slate-100",
  },
};
