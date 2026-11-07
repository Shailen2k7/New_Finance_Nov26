"use client";
import { useEffect, useState, useTransition } from "react";
import type { Category } from "@/lib/db/schema";
import { upsertCategory, type CategoryInputT } from "@/lib/actions/categories";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { CATEGORY_COLORS, CATEGORY_ICONS, ICON_NAMES } from "./icons";
import { cn } from "@/lib/utils";

type Form = { name: string; type: "INCOME" | "EXPENSE"; color: string; icon: string };

export function CategoryModal({ open, category, defaultType, onClose }: { open: boolean; category: Category | null; defaultType: "INCOME" | "EXPENSE"; onClose: () => void }) {
  const [form, setForm] = useState<Form>({ name: "", type: defaultType, color: CATEGORY_COLORS[0], icon: "tag" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(category ? { name: category.name, type: category.type, color: category.color, icon: category.icon } : { name: "", type: defaultType, color: CATEGORY_COLORS[0], icon: "tag" });
  }, [open, category, defaultType]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const hexOk = /^#[0-9a-fA-F]{6}$/.test(form.color);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setError("Name is required");
    if (!hexOk) return setError("Color must be a hex value like #2f7a5c");
    const input: CategoryInputT = { name: form.name, type: form.type, color: form.color, icon: form.icon };
    start(async () => {
      try {
        await upsertCategory(input, category?.id);
        toast.success(category ? "Category updated" : "Category added", form.name);
        onClose();
      } catch (err) {
        const msg = (err as Error).message;
        setError(msg.includes("unique") || msg.includes("duplicate") ? "A category with this name already exists for this type" : msg);
      }
    });
  };

  const Preview = CATEGORY_ICONS[form.icon];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={category ? "Edit category" : "Add category"}
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="category-form" loading={pending}>{category ? "Save changes" : "Add category"}</Button>
        </>
      }
    >
      <form id="category-form" onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: (hexOk ? form.color : "#64748b") + "1a", color: hexOk ? form.color : "#64748b" }}>
            {Preview && <Preview className="h-5 w-5" />}
          </span>
          <Field label="Name" className="flex-1" error={error ?? undefined}>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Software & Subscriptions" autoFocus />
          </Field>
        </div>
        <Field label="Type">
          <Segmented value={form.type} onChange={(v) => set("type", v)} options={[{ value: "INCOME", label: "Income" }, { value: "EXPENSE", label: "Expense" }]} />
        </Field>
        <Field label="Color">
          <div className="flex flex-wrap items-center gap-2">
            {CATEGORY_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => set("color", c)} className={cn("h-7 w-7 rounded-full border-2 transition", form.color.toLowerCase() === c ? "border-ink scale-110" : "border-transparent hover:scale-105")} style={{ background: c }} aria-label={c} />
            ))}
            <Input value={form.color} onChange={(e) => set("color", e.target.value)} className="w-28 font-mono text-[13px]" placeholder="#2f7a5c" />
          </div>
        </Field>
        <Field label="Icon">
          <div className="grid max-h-44 grid-cols-9 gap-1.5 overflow-y-auto rounded-xl border border-line p-2">
            {ICON_NAMES.map((name) => {
              const I = CATEGORY_ICONS[name];
              return (
                <button key={name} type="button" title={name} onClick={() => set("icon", name)} className={cn("flex h-9 items-center justify-center rounded-lg transition", form.icon === name ? "bg-primary text-white" : "text-ink-2 hover:bg-surface-2")}>
                  <I className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        </Field>
      </form>
    </Modal>
  );
}
