"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  parseGoToLatLng,
  parseGoToUtm,
} from "@/lib/workspace-map-go-to-xy";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGoTo: (lat: number, lng: number) => void;
};

type Tab = "latlng" | "utm48" | "utm49";

export function WorkspaceSpatialGoToDialog({
  open,
  onOpenChange,
  onGoTo,
}: Props) {
  const [tab, setTab] = useState<Tab>("latlng");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [east, setEast] = useState("");
  const [north, setNorth] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    setError(null);
    let parsed;
    if (tab === "latlng") {
      parsed = parseGoToLatLng(lat, lng);
    } else {
      parsed = parseGoToUtm(tab === "utm48" ? 48 : 49, east, north);
    }
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    onGoTo(parsed.lat, parsed.lng);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Go to XY</DialogTitle>
          <DialogDescription>
            Loncat ke koordinat di peta (WGS84 atau UTM).
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-lg border border-border p-1">
          {(
            [
              ["latlng", "Lon/Lat"],
              ["utm48", "UTM 48S"],
              ["utm49", "UTM 49S"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                tab === id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
              onClick={() => {
                setTab(id);
                setError(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "latlng" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="goto-lat">Latitude</Label>
              <Input
                id="goto-lat"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="-6.74"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goto-lng">Longitude</Label>
              <Input
                id="goto-lng"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="108.55"
                inputMode="decimal"
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="goto-east">Eastings (m)</Label>
              <Input
                id="goto-east"
                value={east}
                onChange={(e) => setEast(e.target.value)}
                placeholder="720000"
                inputMode="decimal"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goto-north">Northings (m)</Label>
              <Input
                id="goto-north"
                value={north}
                onChange={(e) => setNorth(e.target.value)}
                placeholder="9250000"
                inputMode="decimal"
              />
            </div>
          </div>
        )}

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button type="button" onClick={handleSubmit}>
            Loncat ke titik
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
