"use client";

import { useState, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronDown, ArrowUpAZ, ArrowDownAZ, Search } from "lucide-react";

interface ColumnFilterProps {
  label: string;
  values: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  onSortAsc: () => void;
  onSortDesc: () => void;
  active: boolean;
}

export function ColumnFilter({ label, values, selected, onChange, onSortAsc, onSortDesc, active }: ColumnFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [tempSelected, setTempSelected] = useState<string[]>(selected);

  const filteredValues = useMemo(() => {
    if (!search) return values;
    return values.filter((v) => v.toLowerCase().includes(search.toLowerCase()));
  }, [values, search]);

  const handleOpen = () => {
    setTempSelected(selected);
    setSearch("");
  };

  const handleToggle = (value: string) => {
    setTempSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const handleSelectAll = () => setTempSelected(values);
  const handleClear = () => setTempSelected([]);

  const handleApply = () => {
    onChange(tempSelected);
    setOpen(false);
  };

  const handleCancel = () => {
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) handleOpen(); }}>
      <PopoverTrigger asChild>
        <button className={`flex items-center gap-0.5 hover:text-slate-900 ${active ? "text-emerald-600" : ""}`}>
          {label}
          <ChevronDown className={`w-3 h-3 ${active ? "text-emerald-600" : "text-slate-400"}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <div className="border-b border-slate-200 p-1">
          <button onClick={() => { onSortAsc(); setOpen(false); }} className="flex items-center gap-2 w-full px-2 py-1.5 text-xs hover:bg-slate-100 rounded">
            <ArrowUpAZ className="w-3.5 h-3.5" /> Sort A to Z
          </button>
          <button onClick={() => { onSortDesc(); setOpen(false); }} className="flex items-center gap-2 w-full px-2 py-1.5 text-xs hover:bg-slate-100 rounded">
            <ArrowDownAZ className="w-3.5 h-3.5" /> Sort Z to A
          </button>
        </div>
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-200">
          <button onClick={handleSelectAll} className="text-[10px] text-blue-600 hover:underline">Select all</button>
          <button onClick={handleClear} className="text-[10px] text-blue-600 hover:underline">Clear</button>
        </div>
        <div className="p-2 border-b border-slate-200">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="h-7 pl-7 text-xs" />
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto p-1">
          {filteredValues.length === 0 ? (
            <div className="text-xs text-slate-400 text-center py-2">No values found</div>
          ) : (
            filteredValues.map((value) => (
              <label key={value} className="flex items-center gap-2 px-2 py-1 hover:bg-slate-50 rounded cursor-pointer">
                <Checkbox checked={tempSelected.includes(value)} onCheckedChange={() => handleToggle(value)} className="h-3.5 w-3.5" />
                <span className="text-xs truncate">{value || "(blank)"}</span>
              </label>
            ))
          )}
        </div>
        <div className="flex justify-end gap-2 p-2 border-t border-slate-200">
          <Button size="sm" variant="ghost" onClick={handleCancel} className="h-7 text-xs">Cancel</Button>
          <Button size="sm" onClick={handleApply} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700">OK</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
