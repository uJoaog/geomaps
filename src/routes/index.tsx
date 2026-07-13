import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { MapPin, Loader2, Trash2, Download, Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import {
  processLink,
  listLocations,
  clearLocations,
  exportXlsx,
} from "@/lib/locations.functions";

export const Route = createFileRoute("/")({
  component: Index,
});

type LocationRow = {
  id: string;
  city: string | null;
  latitude: number;
  longitude: number;
  link: string;
  created_at: string;
};

function Index() {
  const router = useRouter();
  const process = useServerFn(processLink);
  const list = useServerFn(listLocations);
  const clear = useServerFn(clearLocations);
  const exportFn = useServerFn(exportXlsx);

  const [input, setInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const { data: rows = [], refetch } = useQuery({
    queryKey: ["locations"],
    queryFn: () => list() as Promise<LocationRow[]>,
  });

  const handleProcessAll = async () => {
    const links = input
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (links.length === 0) {
      toast.error("Cole ao menos um link do Google Maps.");
      return;
    }
    setProcessing(true);
    setProgress({ done: 0, total: links.length });
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < links.length; i++) {
      try {
        const res = await process({ data: { link: links[i] } });
        if (res.ok) ok++;
        else fail++;
      } catch {
        fail++;
      }
      setProgress({ done: i + 1, total: links.length });
    }
    setProcessing(false);
    setProgress(null);
    await refetch();
    if (ok > 0) toast.success(`${ok} localização(ões) processada(s).`);
    if (fail > 0) toast.error(`${fail} link(s) não puderam ser processados.`);
    if (ok > 0) setInput("");
  };

  const handleClear = async () => {
    if (rows.length === 0) return;
    if (!confirm("Apagar todos os registros?")) return;
    await clear();
    await refetch();
    toast.success("Tudo limpo.");
  };

  const handleCopy = async () => {
    if (rows.length === 0) return;
    const header = "Cidade\tLatitude\tLongitude\tLink";
    const body = rows
      .map((r) => `${r.city ?? ""}\t${r.latitude}\t${r.longitude}\t${r.link}`)
      .join("\n");
    await navigator.clipboard.writeText(`${header}\n${body}`);
    toast.success("Tabela copiada. Cole no Excel ou Sheets.");
  };

  const handleExport = async () => {
    if (rows.length === 0) return;
    const { base64, filename } = await exportFn();
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  void router;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <Toaster richColors position="top-center" />
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-10 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">GeoMaps</h1>
            <p className="text-sm text-muted-foreground">
              Extraia cidade e coordenadas de links do Google Maps.
            </p>
          </div>
        </header>

        <Card className="mb-6 border-border/60 p-6 shadow-sm">
          <label className="mb-2 block text-sm font-medium">
            Links do Google Maps
          </label>
          <p className="mb-3 text-xs text-muted-foreground">
            Cole um link por linha. Aceita links longos e curtos (maps.app.goo.gl).
          </p>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`https://maps.app.goo.gl/xxxx\nhttps://www.google.com/maps/@-23.5505,-46.6333,15z`}
            rows={6}
            className="font-mono text-sm"
            disabled={processing}
          />
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={handleProcessAll} disabled={processing} size="lg">
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processando {progress?.done}/{progress?.total}
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Processar todos
                </>
              )}
            </Button>
          </div>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div className="text-sm">
              <span className="font-medium">{rows.length}</span>{" "}
              <span className="text-muted-foreground">
                {rows.length === 1 ? "localização" : "localizações"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleCopy} disabled={rows.length === 0}>
                <Copy className="mr-2 h-4 w-4" />
                Copiar tabela
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={rows.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                Exportar XLSX
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                disabled={rows.length === 0}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Limpar tudo
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Cidade</th>
                  <th className="px-4 py-3 font-medium">Latitude</th>
                  <th className="px-4 py-3 font-medium">Longitude</th>
                  <th className="px-4 py-3 font-medium">Link</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                      Nenhuma localização ainda. Cole links acima e clique em "Processar todos".
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">
                        {r.city ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{r.latitude}</td>
                      <td className="px-4 py-3 font-mono text-xs">{r.longitude}</td>
                      <td className="max-w-[24rem] truncate px-4 py-3">
                        <a
                          href={r.link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          {r.link}
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
