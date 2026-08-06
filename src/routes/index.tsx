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
    let cancelled = false;
    const fetchRows = async () => {
      try {
        const rows = (await list()) as LocationRow[];
        if (cancelled) return;
        setItems((prev) => {
          const existingIds = new Set(
            prev.filter((i) => i.kind === "row").map((i) => (i as { row: LocationRow }).row.id),
          );
          const merged: Item[] = [...prev];
          for (const row of rows) {
            if (!existingIds.has(row.id)) merged.push({ kind: "row", row });
          }
          return merged;
        });
      } catch {
        // ignore
      }
    };
    fetchRows();
    const id = setInterval(fetchRows, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [list]);

  const successCount = items.filter((i) => i.kind === "row").length;

  const handleProcessAll = async () => {
    // Extrai todas as URLs http(s) do texto colado, aceitando qualquer separador
    // (espaço, vírgula, ponto-e-vírgula, quebra de linha, ou grudadas). Vírgulas
    // dentro do URL (ex.: @lat,lng do Google Maps) são preservadas porque cada
    // nova URL começa com "http", então cortamos no próximo "http".
    // URLs do Google Maps podem conter aspas simples/duplas (ex.: 19°13'24.7"S).
    // Só cortamos em espaços e em `<>` (delimitadores de HTML).
    const matches = input.match(/https?:\/\/[^\s<>]+/gi) ?? [];
    const links = matches
      .flatMap((tok) => tok.split(/(?=https?:\/\/)/))
      .map((l) => l.replace(/[),;.\]>`]+$/, "").trim())
      .filter((l) => /^https?:\/\//i.test(l));
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
      // Tenta até 2 vezes; erros de tentativas intermediárias não geram alerta.
      let finalRes:
        | { ok: true; row: LocationRow }
        | { ok: false; error: string }
        | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = (await process({ data: { link } })) as
            | { ok: true; row: LocationRow }
            | { ok: false; error: string };
          finalRes = res;
          if (res.ok) break;
        } catch (e) {
          finalRes = {
            ok: false,
            error: e instanceof Error ? e.message : "Erro desconhecido",
          };
        }
        if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
      }
      if (finalRes && finalRes.ok) {
        ok++;
        const row = finalRes.row;
        setItems((prev) => {
          if (prev.some((it) => it.kind === "row" && it.row.id === row.id)) return prev;
          return [...prev, { kind: "row", row }];
        });
      } else {
        fail++;
        setItems((prev) => [
          ...prev,
          {
            kind: "error",
            link,
            message: finalRes?.error ?? "Erro desconhecido",
            key: `${Date.now()}-${i}`,
          },
        ]);
      }
      setProgress({ done: i + 1, total: links.length });
    }
    setProcessing(false);
    setProgress(null);
    if (ok > 0) toast.success(`${ok} localização(ões) processada(s).`);
    if (fail > 0) toast.warning(`${fail} link(s) com erro (linha marcada na tabela).`);
    if (ok > 0) setInput("");
  };

  const handleClear = async () => {
    if (items.length === 0) return;
    try {
      await clear();
    } catch {
      // ignora: a limpeza local ainda acontece
    }
    setItems([]);
    toast.success("Tudo limpo.");
  };

  const exportRows = () =>
    items.map((it) =>
      it.kind === "row"
        ? {
            city: it.row.city ?? "",
            latitude: it.row.latitude as number | string,
            longitude: it.row.longitude as number | string,
            link: it.row.link,
          }
        : { city: "Erro ao processar", latitude: "", longitude: "", link: it.link },
    );

  const handleCopy = async () => {
    if (items.length === 0) return;
    const body = exportRows()
      .map((r) => `${r.city}\t${r.latitude}\t${r.longitude}\t${r.link}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(body);
      toast.success("Tabela copiada. Cole no Excel ou Sheets.");
    } catch {
      toast.error("Não foi possível copiar. Verifique as permissões do navegador.");
    }
  };

  const handleExport = async () => {
    if (items.length === 0) return;
    try {
      const { base64, filename } = await exportFn({ data: { rows: exportRows() } });
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
    } catch {
      toast.error("Não foi possível gerar o arquivo XLSX.");
    }
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
              <Button variant="outline" size="sm" onClick={handleCopy} disabled={items.length === 0}>
                <Copy className="mr-2 h-4 w-4" />
                Copiar tabela
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={items.length === 0}>
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
                          <td className="border border-border px-3 py-2 font-medium text-destructive">
                            <span className="flex items-center gap-1.5">
                              <AlertCircle className="h-4 w-4 shrink-0" />
                              Erro ao processar
                            </span>
                          </td>
                          <td className="border border-border px-3 py-2" />
                          <td className="border border-border px-3 py-2" />
                          <td className="max-w-[24rem] truncate border border-border px-3 py-2 text-xs text-muted-foreground">
                            {item.link}
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
