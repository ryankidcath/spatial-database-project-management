"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setOrganizationModuleAction } from "./workspace-modules-actions";
import type { ModuleRegistryRow, OrganizationModuleRow } from "./workspace-modules";

type Props = {
  organizationId: string;
  moduleRegistry: ModuleRegistryRow[];
  organizationModules: OrganizationModuleRow[];
};

export function OrganizationModuleToggles({
  organizationId,
  moduleRegistry,
  organizationModules,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const optional = moduleRegistry.filter((m) => !m.is_core);

  const isOn = (code: string) =>
    organizationModules.some(
      (r) =>
        r.organization_id === organizationId &&
        r.module_code === code &&
        r.is_enabled
    );

  const toggle = (moduleCode: string, next: boolean) => {
    setMessage(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("organization_id", organizationId);
      fd.set("module_code", moduleCode);
      fd.set("enabled", next ? "true" : "false");
      const res = await setOrganizationModuleAction(fd);
      if (res.error) {
        setMessage(res.error);
        return;
      }
      router.refresh();
    });
  };

  if (optional.length === 0) return null;

  return (
    <div className="mt-6 border-t border-slate-100 pt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Modul organisasi
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Anggota project di organisasi ini dapat mengaktifkan atau menonaktifkan
        modul opsional (RPC aman — <code className="text-[11px]">core_pm</code>{" "}
        tetap aktif).
      </p>
      <ul className="mt-2 space-y-2">
        {optional.map((m) => {
          const on = isOn(m.module_code);
          return (
            <li
              key={m.module_code}
              className="flex items-center justify-between gap-2 rounded-md border border-slate-100 px-2 py-1.5 text-sm"
            >
              <span className="min-w-0 truncate">{m.display_name}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => toggle(m.module_code, !on)}
                className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium disabled:opacity-50 ${
                  on
                    ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {on ? "Aktif" : "Off"}
              </button>
            </li>
          );
        })}
      </ul>
      {message && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
