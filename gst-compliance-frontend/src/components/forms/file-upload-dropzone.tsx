"use client";

import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

export function FileUploadDropzone({
  fileName,
  disabled = false,
  helperText,
  onFileSelect = () => {},
}: {
  fileName?: string | null;
  disabled?: boolean;
  helperText?: string;
  onFileSelect?: (file: File) => void;
}) {
  return (
    <label
      className={cn(
        "flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition hover:border-indigo-300 hover:bg-indigo-50/40",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        type="file"
        className="hidden"
        accept=".csv,.xlsx"
        disabled={disabled}
        onChange={(event) => {
          const nextFile = event.target.files?.[0];
          if (nextFile) {
            onFileSelect(nextFile);
          }
        }}
      />
      <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
        <UploadCloud className="size-5 text-indigo-600" />
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-900">
        {fileName ? `Selected: ${fileName}` : "Drop CSV or Excel files here"}
      </p>
      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
        {helperText ?? "Upload sales, purchase, note, or 2B source files into the monthly workspace for validation and normalization."}
      </p>
    </label>
  );
}
