import { useRef, useState } from "react";
import { useStations, useGlobalRate } from "@/lib/hooks";
import { api } from "@/lib/api";
import { formatNaira } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, MapPin, Plus, Trash2, X } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { Station } from "@/lib/types";
import { VarianceBadge, computeVariance } from "@/components/VarianceBadge";

const emptyForm = { name: "", address: "", latitude: 6.5244, longitude: 3.3792, pricingPerKwh: 85 };

export default function Stations() {
  const { data: stations = [], isLoading } = useStations();
  const { data: globalRate } = useGlobalRate();
  const gRate = globalRate?.ratePerKwh ?? 0;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Station | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [imagesFor, setImagesFor] = useState<Station | null>(null);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const newFileRef = useRef<HTMLInputElement>(null);
  const [resetTarget, setResetTarget] = useState<Station | null>(null);

  const openNew = () => { setEditing(null); setForm(emptyForm); setPendingImages([]); setOpen(true); };
  const openEdit = (s: Station) => {
    setEditing(s);
    setForm({
      name: s.name,
      address: s.address || "",
      latitude: s.latitude ?? 0,
      longitude: s.longitude ?? 0,
      pricingPerKwh: s.pricingPerKwh ?? 85,
    });
    setPendingImages([]);
    setOpen(true);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        name: form.name,
        address: form.address,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        pricingPerKwh: Number(form.pricingPerKwh),
      };
      let stationId = editing?.id;
      if (editing) {
        await api.put(`/admin/stations/${editing.id}`, payload);
      } else {
        const res = await api.post(`/admin/stations`, payload);
        stationId = res.data?.id || res.data?.station?.id;
      }
      if (stationId && pendingImages.length > 0) {
        for (const f of pendingImages) {
          await uploadImage(stationId, f);
        }
      }
      toast.success(editing ? "Station updated" : "Station created");
      setOpen(false);
      setPendingImages([]);
      qc.invalidateQueries({ queryKey: ["stations"] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to save station");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (s: Station) => {
    if (!confirm(`Delete ${s.name}? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/stations/${s.id}`);
      toast.success("Station deleted");
      qc.invalidateQueries({ queryKey: ["stations"] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed");
    }
  };

const uploadImage = async (stationId: string, file: File) => {
  const fd = new FormData();
  fd.append("images", file);
    try {
      await api.post(`/admin/stations/${stationId}/images`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Image uploaded");
      qc.invalidateQueries({ queryKey: ["stations"] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Upload failed");
    }
  };

  const deleteImage = async (imageId: string) => {
    try {
      await api.delete(`/admin/images/${imageId}`);
      toast.success("Image deleted");
      qc.invalidateQueries({ queryKey: ["stations"] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Delete failed");
    }
  };

  const resetToGlobal = async (s: Station) => {
    try {
      await api.put(`/admin/stations/${s.id}`, { pricingPerKwh: gRate });
      toast.success("Pricing reset to global rate");
      qc.invalidateQueries({ queryKey: ["stations"] });
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to reset");
    } finally {
      setResetTarget(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-navy">My Stations</h2>
        <Button onClick={openNew} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" /> Add New Station
        </Button>
      </div>

      {isLoading ? (
        <div className="bg-card p-8 rounded-xl text-center text-muted-foreground">Loading…</div>
      ) : stations.length === 0 ? (
        <div className="bg-card p-12 rounded-xl text-center border border-border">
          <p className="text-muted-foreground">No stations yet. Add your first station to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {stations.map((s) => {
            const bays = s.bays || [];
            const avail = bays.filter((b) => (b.status || "").toUpperCase() === "AVAILABLE").length;
            const occ = bays.filter((b) => (b.status || "").toUpperCase() === "OCCUPIED").length;
            const off = bays.filter((b) => ["OFFLINE", "FAULT"].includes((b.status || "").toUpperCase())).length;
            return (
              <div key={s.id} className="bg-card border border-border rounded-xl p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-navy text-lg">{s.name}</h3>
                    <div className="flex items-center text-xs text-muted-foreground mt-1 gap-1">
                      <MapPin className="h-3 w-3" /> {s.address || s.city || "—"}
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${s.status === "INACTIVE" ? "bg-muted text-muted-foreground" : "bg-success/15 text-success"}`}>
                    {s.status || "ACTIVE"}
                  </span>
                </div>
                {s.images && s.images.length > 0 && (
                  <div className="mt-3 flex gap-2 overflow-x-auto">
                    {s.images.slice(0, 4).map((img) => (
                      <img key={img.id} src={img.url} alt={s.name} className="h-16 w-16 object-cover rounded-md border border-border" />
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-4 gap-2 mt-4 text-center">
                  <Stat n={bays.length} label="Total" />
                  <Stat n={avail} label="Available" color="text-success" />
                  <Stat n={occ} label="Occupied" color="text-primary" />
                  <Stat n={off} label="Offline" color="text-destructive" />
                </div>
                <div className="mt-3 inline-block bg-primary/10 text-primary text-xs font-semibold px-2 py-1 rounded-full">
                  ₦{s.pricingPerKwh ?? 0}/kWh
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Global: <span className="text-foreground">{formatNaira(gRate)}/kWh</span></span>
                  <span className="text-navy font-semibold">Yours: {formatNaira(s.pricingPerKwh)}/kWh</span>
                  <VarianceBadge stationRate={s.pricingPerKwh} globalRate={gRate} />
                  {Math.abs(computeVariance(s.pricingPerKwh, gRate)) > 0.05 && gRate > 0 && (
                    <Button variant="outline" size="sm" className="h-7 text-xs border-primary/40 text-primary hover:bg-primary/10 ml-auto" onClick={() => setResetTarget(s)}>
                      Reset to Global
                    </Button>
                  )}
                </div>
                <div className="flex gap-2 mt-4">
                  <Link to={`/stations/${s.id}/bays`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">Manage Bays</Button>
                  </Link>
                  <Button variant="outline" size="sm" onClick={() => setImagesFor(s)}>
                    <ImagePlus className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEdit(s)}>Edit</Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => remove(s)}>Delete</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ImagesDialog
        station={imagesFor}
        onClose={() => setImagesFor(null)}
        onUpload={uploadImage}
        onDelete={deleteImage}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Station" : "Add New Station"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Station Name" className="col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Address" className="col-span-2"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
            <div className="col-span-2">
              <Label className="text-xs">Price per kWh (₦)</Label>
              <div className="mt-1"><Input type="number" value={form.pricingPerKwh} onChange={(e) => setForm({ ...form, pricingPerKwh: Number(e.target.value) })} /></div>
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">Global baseline rate: {formatNaira(gRate)}/kWh</span>
                <button type="button" className="text-primary hover:underline" onClick={() => setForm({ ...form, pricingPerKwh: gRate })}>
                  Use global rate
                </button>
              </div>
              <PricingHint rate={Number(form.pricingPerKwh)} globalRate={gRate} />
            </div>
            <Field label="Latitude"><Input type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: Number(e.target.value) })} /></Field>
            <Field label="Longitude"><Input type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: Number(e.target.value) })} /></Field>
            <div className="col-span-2">
              <Label className="text-xs">Images</Label>
              <input
                ref={newFileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = e.target.files ? Array.from(e.target.files) : [];
                  setPendingImages((prev) => [...prev, ...files]);
                  if (newFileRef.current) newFileRef.current.value = "";
                }}
              />
              <Button type="button" variant="outline" size="sm" className="mt-1 w-full" onClick={() => newFileRef.current?.click()}>
                <ImagePlus className="h-4 w-4 mr-2" /> Add Image(s)
              </Button>
              {pendingImages.length > 0 && (
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {pendingImages.map((f, i) => (
                    <div key={i} className="relative group">
                      <img src={URL.createObjectURL(f)} alt="" className="w-full h-16 object-cover rounded border border-border" />
                      <button
                        type="button"
                        onClick={() => setPendingImages((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {!editing && (
                <p className="text-[10px] text-muted-foreground mt-1">Images will upload after the station is created.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={submitting} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {submitting ? "Saving…" : "Save Station"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset pricing to global rate?</AlertDialogTitle>
            <AlertDialogDescription>
              Reset pricing to global rate of {formatNaira(gRate)}/kWh? This will replace your current rate of {formatNaira(resetTarget?.pricingPerKwh)}/kWh.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => resetTarget && resetToGlobal(resetTarget)}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const Stat = ({ n, label, color = "text-foreground" }: any) => (
  <div>
    <div className={`text-lg font-bold tabular ${color}`}>{n}</div>
    <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
  </div>
);

const Field = ({ label, children, className = "" }: any) => (
  <div className={className}>
    <Label className="text-xs">{label}</Label>
    <div className="mt-1">{children}</div>
  </div>
);

function PricingHint({ rate, globalRate }: { rate: number; globalRate: number }) {
  if (!globalRate) return null;
  const diff = rate - globalRate;
  const pct = (diff / globalRate) * 100;
  if (Math.abs(pct) < 0.05) {
    return <p className="text-[11px] text-muted-foreground mt-1">Matches global rate</p>;
  }
  if (diff > 0) {
    return <p className="text-[11px] text-success mt-1">Your rate is {formatNaira(diff)} ({pct.toFixed(1)}%) above the global rate</p>;
  }
  return <p className="text-[11px] text-warning mt-1">Your rate is {formatNaira(Math.abs(diff))} ({Math.abs(pct).toFixed(1)}%) below the global rate</p>;
}

function ImagesDialog({
  station,
  onClose,
  onUpload,
  onDelete,
}: {
  station: Station | null;
  onClose: () => void;
  onUpload: (stationId: string, file: File) => Promise<void>;
  onDelete: (imageId: string) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !station) return;
    setBusy(true);
    for (const f of Array.from(files)) {
      await onUpload(station.id, f);
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Dialog open={!!station} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Images — {station?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handleFiles(e.target.files)}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="w-full"
            >
              <ImagePlus className="h-4 w-4 mr-2" />
              {busy ? "Uploading…" : "Upload Image(s)"}
            </Button>
          </div>
          {station?.images && station.images.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {station.images.map((img) => (
                <div key={img.id} className="relative group">
                  <img src={img.url} alt="" className="w-full h-24 object-cover rounded-md border border-border" />
                  <button
                    onClick={() => onDelete(img.id)}
                    className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                    aria-label="Delete image"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">No images yet.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-2" /> Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}