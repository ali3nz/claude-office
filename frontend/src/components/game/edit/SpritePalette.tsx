"use client";

/**
 * SpritePalette Component (issue 246)
 *
 * Palette panel listing available office sprites grouped by folder category.
 * Sprites have thumbnails rendered from their public path and are draggable
 * onto the canvas to insert a new sprite instance.
 */

import { useState, useMemo, type DragEvent } from "react";
import { X, Search, Plus, GripVertical } from "lucide-react";
import {
  SPRITE_CATALOG_GROUPS,
  type SpriteCatalogItem,
} from "@/constants/spriteCatalog";
import { useOfficeEditStore } from "@/stores/officeEditStore";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/constants/canvas";

export function SpritePalette() {
  const isPaletteOpen = useOfficeEditStore((s) => s.isPaletteOpen);
  const setPaletteOpen = useOfficeEditStore((s) => s.setPaletteOpen);
  const insertEntity = useOfficeEditStore((s) => s.insertEntity);

  const [search, setSearch] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string>("all");

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    return SPRITE_CATALOG_GROUPS.map((group) => {
      if (selectedFolder !== "all" && group.folder !== selectedFolder) {
        return { ...group, items: [] };
      }
      const matchingItems = group.items.filter((item) => {
        if (!query) return true;
        return (
          item.name.toLowerCase().includes(query) ||
          item.id.toLowerCase().includes(query)
        );
      });
      return { ...group, items: matchingItems };
    }).filter((group) => group.items.length > 0);
  }, [search, selectedFolder]);

  if (!isPaletteOpen) return null;

  const handleDragStart = (e: DragEvent<HTMLDivElement>, item: SpriteCatalogItem) => {
    e.dataTransfer.setData("text/plain", item.spritePath);
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({
        spritePath: item.spritePath,
        name: item.name,
      }),
    );
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleQuickInsert = (item: SpriteCatalogItem) => {
    // Insert near center of canvas
    insertEntity(item.spritePath, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, item.name);
  };

  return (
    <div
      role="dialog"
      aria-label="Sprite Palette"
      className="absolute right-4 top-16 bottom-6 w-80 z-50 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl shadow-2xl flex flex-col overflow-hidden text-white font-sans transition-all duration-200"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/60">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold tracking-wide text-slate-200">
            Sprite Palette
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono">
            Drag to Canvas
          </span>
        </div>
        <button
          onClick={() => setPaletteOpen(false)}
          className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors"
          title="Close Palette"
        >
          <X size={16} />
        </button>
      </div>

      {/* Search and Category Filter */}
      <div className="p-3 border-b border-slate-800 space-y-2 bg-slate-900/80">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="Search sprites..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:border-purple-500"
          />
        </div>

        {/* Category Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none text-[11px]">
          <button
            onClick={() => setSelectedFolder("all")}
            className={`px-2 py-1 rounded whitespace-nowrap font-medium transition-colors ${
              selectedFolder === "all"
                ? "bg-purple-600 text-white"
                : "bg-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            All
          </button>
          {SPRITE_CATALOG_GROUPS.map((g) => (
            <button
              key={g.folder}
              onClick={() => setSelectedFolder(g.folder)}
              className={`px-2 py-1 rounded whitespace-nowrap font-medium transition-colors ${
                selectedFolder === g.folder
                  ? "bg-purple-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {g.title}
            </button>
          ))}
        </div>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {filteredGroups.length === 0 ? (
          <div className="text-center text-xs text-slate-500 py-8">
            No sprites found matching &quot;{search}&quot;
          </div>
        ) : (
          filteredGroups.map((group) => (
            <div key={group.folder} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 px-1">
                <span>{group.title}</span>
                <span className="text-[10px] text-slate-500">
                  {group.items.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, item)}
                    className="group relative flex flex-col items-center justify-center p-2 rounded-lg bg-slate-800/80 border border-slate-700/60 hover:border-purple-500/80 hover:bg-slate-800 cursor-grab active:cursor-grabbing transition-all select-none"
                    title={`Drag onto floor or click + to insert`}
                  >
                    <div className="h-14 w-full flex items-center justify-center overflow-hidden mb-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.spritePath}
                        alt={item.name}
                        className="max-h-12 max-w-full object-contain pointer-events-none drop-shadow"
                        loading="lazy"
                      />
                    </div>
                    <span className="text-[11px] font-medium text-slate-300 text-center line-clamp-1 w-full px-1">
                      {item.name}
                    </span>

                    {/* Quick insert button on hover */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQuickInsert(item);
                      }}
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 bg-purple-600 hover:bg-purple-500 text-white rounded shadow transition-opacity"
                      title="Insert at center"
                    >
                      <Plus size={10} />
                    </button>

                    <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 text-slate-400">
                      <GripVertical size={12} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer tip */}
      <div className="p-2.5 bg-slate-950/80 border-t border-slate-800 text-[11px] text-slate-400 text-center">
        💡 Drag sprite to drop on the office canvas
      </div>
    </div>
  );
}
