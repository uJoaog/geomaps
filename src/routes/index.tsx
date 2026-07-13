import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MapPin, Loader2, Trash2, Download, Copy, Sparkles, AlertCircle } from "lucide-react";
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

type Item =
  | { kind: "row"; row: LocationRow }
  | { kind: "error"; link: string; message: string; key: string };

function Index() {
  const process = useServerFn(processLink);
  const list = useServerFn(listLocations);
  const clear = useServerFn(clearLocations);
  const exportFn = useServerFn(exportXlsx);

  const [input, setInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const rows = (await list()) as LocationRow[];
        setItems(rows.map((row) => ({ kind: "row", row }) as Item));
      } catch {
        // ignore
      }
    })();
  }, [list]);

  const successCount = items.filter((i) => i.kind === "row").length;

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
      const link = links[i];
      try {
        const res = await process({ data: { link } });
        if (res.ok) {
          ok++;
          const row = res.row as LocationRow;
          setItems((prev) => [...prev, { kind: "row", row }]);
        } else {
          fail++;
          setItems((prev) => [
            ...prev,
            { kind: "error", link, message: res.error, key: `${Date.now()}-${i}` },
          ]);
        }
      } catch (e) {
        fail++;
        setItems((prev) => [
          ...prev,
          {
            kind: "error",
            link,
            message: e instanceof Error ? e.message : "Erro desconhecido",
            key: `${Date.now()}-${i}`,
          },
        ]);
      }
      setProgress({ done: i + 1, total: links.length });
    }
    setProcessing(false);
    setProgress(null);
    if (ok > 0) toast.success(`${ok} localização(ões) processada(s).`);
    if (fail > 0) toast.error(`${fail} link(s) não puderam ser processados.`);
    if (ok > 0) setInput("");
  };

  const handleClear = async () => {
    if (items.length === 0) return;
    if (!confirm("Apagar todos os registros?")) return;
    await clear();
    setItems([]);
    toast.success("Tudo limpo.");
  };

  const handleCopy = async () => {
    const rows = items.filter((i) => i.kind === "row").map((i) => (i as { row: LocationRow }).row);
    if (rows.length === 0) return;
    const header = "Cidade\tLatitude\tLongitude\tLink";
    const body = rows
      .map((r) => `${r.city ?? ""}\t${r.latitude}\t${r.longitude}\t${r.link}`)
      .join("\n");
    await navigator.clipboard.writeText(`${header}\n${body}`);
    toast.success("Tabela copiada. Cole no Excel ou Sheets.");
  };

  const handleExport = async () => {
    if (successCount === 0) return;
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
              <span className="font-medium">{successCount}</span>{" "}
              <span className="text-muted-foreground">
                {successCount === 1 ? "localização" : "localizações"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleCopy} disabled={successCount === 0}>
                <Copy className="mr-2 h-4 w-4" />
                Copiar tabela
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={successCount === 0}>
                <Download className="mr-2 h-4 w-4" />
                Exportar XLSX
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                disabled={items.length === 0}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Limpar tudo
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-12 border border-border px-3 py-2 text-center font-medium">#</th>
                  <th className="border border-border px-3 py-2 font-medium">Cidade</th>
                  <th className="border border-border px-3 py-2 font-medium">Latitude</th>
                  <th className="border border-border px-3 py-2 font-medium">Longitude</th>
                  <th className="border border-border px-3 py-2 font-medium">Link</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="border border-border px-4 py-12 text-center text-muted-foreground">
                      Nenhuma localização ainda. Cole links acima e clique em "Processar todos".
                    </td>
                  </tr>
                ) : (
                  items.map((item, idx) => {
                    if (item.kind === "error") {
                      return (
                        <tr key={item.key} className="bg-destructive/5">
                          <td className="border border-border px-3 py-2 text-center text-xs text-muted-foreground">
                            {idx + 1}
                          </td>
                          <td
                            colSpan={4}
                            className="border border-border px-3 py-2 text-destructive"
                          >
                            <div className="flex items-start gap-2">
                              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="font-medium">Erro: {item.message}</div>
                                <div className="truncate text-xs text-muted-foreground">
                                  {item.link}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    const r = item.row;
                    return (
                      <tr key={r.id} className="hover:bg-muted/20">
                        <td className="border border-border px-3 py-2 text-center text-xs text-muted-foreground">
                          {idx + 1}
                        </td>
                        <td className="border border-border px-3 py-2 font-medium">
                          {r.city ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="border border-border px-3 py-2 font-mono text-xs">
                          {r.latitude}
                        </td>
                        <td className="border border-border px-3 py-2 font-mono text-xs">
                          {r.longitude}
                        </td>
                        <td className="max-w-[24rem] truncate border border-border px-3 py-2">
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
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
