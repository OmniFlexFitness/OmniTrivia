import React, { useState } from "react";
import { Category } from "../types";
import {
  addToCategoryPool,
  readCategoryPool,
  removeFromCategoryPool,
  resetCategoryPool,
  updateInCategoryPool,
} from "../services/categoryPool";
import Button from "./Button";
import Instructions from "./Instructions";
import { Check, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";

/**
 * The host's editor for the category pool — the list the end-of-round ballot
 * draws from.
 *
 * It is deliberately separate from the questions a game is loaded with. The
 * pool is a standing wish list ("would we play this?"), the rounds are what
 * has actually been written; conflating them would mean the room could only
 * ever vote for categories that already exist, which is the opposite of what
 * asking them is for.
 */

const ROW_COLORS = [
  "bg-blue-500",
  "bg-pink-500",
  "bg-green-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-cyan-500",
  "bg-rose-500",
  "bg-lime-500",
  "bg-indigo-500",
  "bg-orange-500",
];

const PoolRow: React.FC<{
  category: Category;
  onChange: (pool: Category[]) => void;
}> = ({ category, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [icon, setIcon] = useState(category.icon);
  const [color, setColor] = useState(category.color);

  const save = () => {
    onChange(updateInCategoryPool(category.id, { name, icon, color }));
    setEditing(false);
  };

  const cancel = () => {
    setName(category.name);
    setIcon(category.icon);
    setColor(category.color);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 bg-slate-900 border border-neon-blue rounded-xl p-2">
        <input
          value={icon}
          onChange={(event) => setIcon(event.target.value)}
          maxLength={4}
          aria-label="Icon"
          className="w-14 text-center text-xl bg-slate-800 border border-slate-600 rounded-lg py-1.5"
        />
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={40}
          aria-label="Category name"
          className="flex-1 min-w-[8rem] bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-white"
        />
        <div className="flex items-center gap-1">
          {ROW_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={swatch}
              onClick={() => setColor(swatch)}
              className={`w-5 h-5 rounded-full ${swatch} ${
                color === swatch ? "ring-2 ring-white" : "opacity-60"
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={save}
          className="p-2 text-neon-green hover:bg-slate-800 rounded-lg"
          title="Save"
        >
          <Check size={16} />
        </button>
        <button
          type="button"
          onClick={cancel}
          className="p-2 text-slate-400 hover:bg-slate-800 rounded-lg"
          title="Cancel"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-lg shrink-0 ${category.color}`}
      >
        {category.icon}
      </div>
      <span className="flex-1 truncate font-bold text-white">
        {category.name}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="p-2 text-slate-400 hover:text-white rounded-lg"
        title="Edit"
      >
        <Pencil size={15} />
      </button>
      <button
        type="button"
        onClick={() => onChange(removeFromCategoryPool(category.id))}
        className="p-2 text-slate-500 hover:text-red-400 rounded-lg"
        title="Remove from the pool"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
};

const CategoryPoolManager: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [pool, setPool] = useState<Category[]>(() => readCategoryPool());
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setPool(addToCategoryPool({ name, icon }));
    setName("");
    setIcon("");
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="max-w-2xl mx-auto my-6 bg-slate-800 border border-slate-700 rounded-2xl p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-2xl font-black text-white">CATEGORY POOL</h2>
            <p className="text-sm text-slate-400">
              {pool.length} categor{pool.length === 1 ? "y" : "ies"} the
              end-of-round vote can offer.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white"
            title="Close"
          >
            <X />
          </button>
        </div>

        <Instructions guide="categoryPool" className="mb-4" />

        <form onSubmit={add} className="flex flex-wrap gap-2 mb-4">
          <input
            value={icon}
            onChange={(event) => setIcon(event.target.value)}
            maxLength={4}
            placeholder="🎯"
            aria-label="Icon for the new category"
            className="w-16 text-center text-xl bg-slate-900 border border-slate-600 rounded-xl py-2"
          />
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            placeholder="Add a category — anything you would write a round about"
            aria-label="New category name"
            className="flex-1 min-w-[12rem] bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-white focus:border-neon-blue outline-none"
          />
          <Button
            type="submit"
            variant="neon"
            disabled={!name.trim()}
            className="flex items-center gap-2 py-2"
          >
            <Plus size={16} /> ADD
          </Button>
        </form>

        <div className="space-y-2 max-h-[45vh] overflow-y-auto custom-scrollbar pr-1">
          {pool.map((category) => (
            <PoolRow key={category.id} category={category} onChange={setPool} />
          ))}
          {pool.length === 0 && (
            <p className="text-center text-slate-500 py-8 text-sm">
              The pool is empty, so no vote will be offered at the end of a
              round. Add a category, or put the defaults back.
            </p>
          )}
        </div>

        <div className="flex justify-between items-center gap-3 mt-5 pt-4 border-t border-slate-700">
          <button
            onClick={() => setPool(resetCategoryPool())}
            className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-slate-500 hover:text-white"
          >
            <RotateCcw size={14} /> restore the defaults
          </button>
          <Button onClick={onClose} variant="secondary" className="py-2">
            DONE
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CategoryPoolManager;
