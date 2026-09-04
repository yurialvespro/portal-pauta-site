import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Search, Sparkles, X, Plus, ArrowLeft, UserPlus,
  Copy, Check, Loader2, RefreshCw, Zap, ExternalLink, AlertTriangle,
} from "lucide-react";

/* ---------------------------------------------------------------
   TOKENS — monday.com style reference
--------------------------------------------------------------- */
const C = {
  violet: "#6161FF",
  ink: "#333333",
  slate: "#535768",
  iron: "#808080",
  fog: "#CACBCD",
  mist: "#D0D4E4",
  pebble: "#DDDFEB",
  cloud: "#F5F6F8",
  snow: "#FFFFFF",
  shadowDust: "#E6E7EA",
  mint: "#BCFE90",
  sky: "#ABF0FF",
  apricot: "#FF8940",
  lavender: "#EDDFF7",
  periwinkle: "#E7ECFF",
  cornflower: "#93BEFF",
  aqua: "#D1FAFF",
  cottonCandy: "#E98DFE",
  ultraViolet: "#9450FD",
  electricCyan: "#3AC9FF",
  forest: "#2A5C4E",
  peony: "#FCD0F8",
  periwinkleWash: "#DBDBFF",
  shadowXl: "rgba(205, 208, 223, 0.4) 0px 2px 48px 0px",
};

const RADIUS = { nav: 6, cards: 24, badges: 6, images: 12, inputs: 6, buttons: 160 };

const EDITOR_PALETTE = [C.ultraViolet, C.electricCyan, C.forest, C.cottonCandy, "#E0731E", "#3B6FD1"];

// fontes hoje rastreadas de verdade pelo crawler (github actions rodando a cada 30 min)
const SOURCES_DIREITA = ["Jovem Pan", "Gazeta do Povo", "Revista Oeste", "Brasil Paralelo", "Terça Livre", "Pleno.News", "Crusoé"];
const SOURCES_MAINSTREAM = ["G1", "UOL", "Folha de São Paulo", "CNN Brasil", "Estadão", "BBC Brasil", "Poder360"];


// link "raw" do noticias.json gerado pelo crawler no GitHub — ajuste se trocar de repositório
const NOTICIAS_URL = "https://raw.githubusercontent.com/yurialvespro/portal-pauta-crawler/main/noticias.json";

const RELEVANCE_FLOOR = 50; // segunda trava de segurança, além da que já roda no crawler

const STATUS_OPTIONS = {
  fazendo: { text: "Fazendo", color: "#B35900", bg: C.apricot + "26" },
  feito: { text: "Feito no Drive", color: "#1F7A5C", bg: C.mint + "4D" },
};

function relevanceLabel(score) {
  if (score >= 75) return { text: "Alta relevância", color: "#B35900", bg: C.apricot + "26" };
  return { text: "Relevância moderada", color: "#2F5FAE", bg: C.cornflower + "26" };
}

function sourceStyle(tipo) {
  return tipo === "direita"
    ? { color: "#B35900", bg: C.apricot + "1F" }
    : { color: "#2F5FAE", bg: C.cornflower + "26" };
}

// o crawler manda a data em formato RFC822 (ex: "Wed, 02 Sep 2026 00:25:03 -0000") — o Date do JS já entende isso
function minutesSince(rawDate) {
  if (!rawDate) return 999999;
  const parsed = new Date(rawDate);
  if (isNaN(parsed.getTime())) return 999999;
  return Math.max(0, Math.round((Date.now() - parsed.getTime()) / 60000));
}

function relativeTime(rawDate) {
  const mins = minutesSince(rawDate);
  if (mins >= 999999) return "";
  if (mins < 1) return "agora mesmo";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.round(hours / 24);
  return `há ${days}d`;
}

/* ---------------------------------------------------------------
   MAIN APP
--------------------------------------------------------------- */
export default function App() {
  const [items, setItems] = useState([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [feedError, setFeedError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const [editors, setEditors] = useState([
    { id: "e1", name: "Mamador", color: EDITOR_PALETTE[0] },
    { id: "e2", name: "Carol", color: EDITOR_PALETTE[1] },
    { id: "e3", name: "Mateus", color: EDITOR_PALETTE[2] },
  ]);
  const [assignments, setAssignments] = useState({});
  const [statuses, setStatuses] = useState({}); // { itemId: 'fazendo' | 'feito' }
  const [statusPopoverFor, setStatusPopoverFor] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [assignPopoverFor, setAssignPopoverFor] = useState(null);
  const [addingEditor, setAddingEditor] = useState(false);
  const [newEditorName, setNewEditorName] = useState("");
  const [newEditorColor, setNewEditorColor] = useState(EDITOR_PALETTE[0]);
  const [openItemId, setOpenItemId] = useState(null);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [scriptError, setScriptError] = useState(null);
  const [scriptResult, setScriptResult] = useState(null);
  const [copied, setCopied] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("recentes");
  const [relevanceFilter, setRelevanceFilter] = useState("todas");
  const [assignmentFilter, setAssignmentFilter] = useState("todas");
  const saveTimer = useRef(null);

  // carrega quadro (editores/atribuições/status) salvo entre sessões
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("portal-pauta:board", true);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          if (parsed.editors) setEditors(parsed.editors);
          if (parsed.assignments) setAssignments(parsed.assignments);
          if (parsed.statuses) setStatuses(parsed.statuses);
        }
      } catch (e) {
        // sem quadro salvo ainda
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persist = useCallback((nextEditors, nextAssignments, nextStatuses) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await window.storage.set("portal-pauta:board", JSON.stringify({ editors: nextEditors, assignments: nextAssignments, statuses: nextStatuses }), true);
      } catch (e) {
        console.error("Falha ao salvar:", e);
      }
    }, 250);
  }, []);

  useEffect(() => { if (loaded) persist(editors, assignments, statuses); }, [editors, assignments, statuses, loaded, persist]);

  // busca o noticias.json real, gerado pelo crawler no GitHub Actions
  const fetchNoticias = useCallback(async () => {
    setLoadingFeed(true);
    setFeedError(null);
    try {
      const res = await fetch(`${NOTICIAS_URL}?t=${Date.now()}`); // cache-bust simples
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
      setLastFetch(data.generated_at ? new Date(data.generated_at) : new Date());
    } catch (e) {
      setFeedError(
        "Não consegui buscar as notícias atualizadas. Confira se o repositório no GitHub está público e se o link do noticias.json está certo."
      );
    } finally {
      setLoadingFeed(false);
    }
  }, []);

  useEffect(() => { fetchNoticias(); }, [fetchNoticias]);

  const ranked = items
    .map(it => ({ ...it, minutesAgo: minutesSince(it.publishedRaw) }))
    .filter(it => (it.score ?? 0) >= RELEVANCE_FLOOR)
    .filter(it => {
      if (relevanceFilter === "alta") return it.score >= 75;
      if (relevanceFilter === "moderada") return it.score < 75;
      return true;
    })
    .filter(it => {
      if (assignmentFilter === "todas") return true;
      if (assignmentFilter === "nao_atribuida") return !assignments[it.id];
      return assignments[it.id] === assignmentFilter;
    })
    .filter(it => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        it.title.toLowerCase().includes(q) ||
        it.source.toLowerCase().includes(q) ||
        (it.tags || []).some(t => t.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => (sortBy === "recentes" ? a.minutesAgo - b.minutesAgo : b.score - a.score));

  function assignEditor(itemId, editorId) {
    setAssignments(prev => ({ ...prev, [itemId]: editorId }));
    setAssignPopoverFor(null);
  }

  function setStatus(itemId, statusKey) {
    setStatuses(prev => {
      const next = { ...prev };
      if (!statusKey) delete next[itemId];
      else next[itemId] = statusKey;
      return next;
    });
    setStatusPopoverFor(null);
  }

  function addEditor() {
    const name = newEditorName.trim();
    if (!name) return;
    setEditors(prev => [...prev, { id: "e" + Date.now(), name, color: newEditorColor }]);
    setNewEditorName("");
    setAddingEditor(false);
  }

  async function generateScript(item) {
    setScriptResult(null);
    setScriptError(null);
    setScriptLoading(true);

    // Faz uma chamada à função serverless e devolve o JSON, com mensagem clara
    // caso o servidor responda uma página de erro em vez de JSON.
    async function chamarEtapa(corpo) {
      const response = await fetch("/.netlify/functions/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });

      const rawText = await response.text();

      let data;
      try {
        data = JSON.parse(rawText);
      } catch {
        if (rawText.trim().startsWith("<")) {
          throw new Error(
            "O servidor devolveu uma página de erro em vez do conteúdo — normalmente é o tempo limite de 30s do Netlify. Tente de novo."
          );
        }
        throw new Error(`Resposta inesperada do servidor: ${rawText.slice(0, 200)}`);
      }

      if (!response.ok) {
        const base = typeof data?.error === "string" ? data.error : JSON.stringify(data?.error || data);
        throw new Error(base);
      }
      return data;
    }

    try {
      const base = {
        title: item.title,
        source: item.source,
        category: item.category,
        summary: item.summary,
      };

      // Etapa 1 — roteiro narrado (a parte mais longa, sozinha cabe no limite de tempo).
      const roteiro = await chamarEtapa({ ...base, etapa: "roteiro" });

      // Mostra já o roteiro enquanto os metadados ainda são gerados.
      setScriptResult({ ...roteiro, titulos: [], descricao_seo: "", tags: [] });

      // Etapa 2 — títulos, descrição e tags, com base no roteiro que acabou de sair.
      const metadados = await chamarEtapa({
        ...base,
        etapa: "metadados",
        roteiroGerado: [roteiro.gancho, roteiro.roteiro, roteiro.encerramento].filter(Boolean).join("\n\n"),
      });

      setScriptResult({ ...roteiro, ...metadados });
    } catch (e) {
      setScriptError(`Não foi possível gerar o roteiro: ${e.message}`);
    } finally {
      setScriptLoading(false);
    }
  }

  function copyToClipboard(text, key) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => {});
  }

  function copyFullScript(result) {
    const full = `GANCHO\n${result.gancho}\n\nROTEIRO\n${result.roteiro}\n\nENCERRAMENTO\n${result.encerramento}\n\nTÍTULOS\n${(result.titulos || []).map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\nDESCRIÇÃO (SEO)\n${result.descricao_seo}\n\nTAGS\n${(result.tags || []).join(", ")}`;
    copyToClipboard(full, "full");
  }

  const openItem = items.find(it => it.id === openItemId);

  return (
    <div style={{ background: C.cloud, color: C.ink, minHeight: "100vh", fontFamily: "'Poppins', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-thumb { background: ${C.pebble}; border-radius: 4px; }
      `}</style>

      <header style={{ background: C.snow, borderBottom: `1px solid ${C.pebble}`, padding: "16px 28px", position: "sticky", top: 0, zIndex: 20 }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div style={{ width: 32, height: 32, borderRadius: RADIUS.badges, background: C.violet, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Zap size={16} color={C.snow} fill={C.snow} />
            </div>
            <div>
              <div style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: C.iron, fontWeight: 500 }}>
                Curadoria automática · direita + mainstream
              </div>
              <h1 style={{ fontWeight: 700, fontSize: 20, margin: "1px 0 0", color: C.ink, letterSpacing: "-0.02em" }}>Portal de Pauta</h1>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div style={{ fontSize: 11, color: C.iron, textAlign: "right", lineHeight: 1.5 }}>
              <div><span style={{ color: C.slate, fontWeight: 500 }}>direita:</span> {SOURCES_DIREITA.join(" · ")}</div>
              <div><span style={{ color: C.slate, fontWeight: 500 }}>mainstream:</span> {SOURCES_MAINSTREAM.join(" · ")}</div>
            </div>
            <button
              onClick={fetchNoticias}
              disabled={loadingFeed}
              className="flex items-center gap-2"
              style={{
                background: loadingFeed ? C.cloud : C.violet, color: loadingFeed ? C.slate : C.snow,
                border: loadingFeed ? `1px solid ${C.pebble}` : "none",
                borderRadius: RADIUS.buttons, padding: "10px 20px", fontSize: 13.5, fontWeight: 500,
                cursor: loadingFeed ? "default" : "pointer", fontFamily: "'Poppins', sans-serif",
              }}
            >
              <RefreshCw size={14} className={loadingFeed ? "animate-spin" : ""} />
              {loadingFeed ? "Buscando..." : "Atualizar agora"}
            </button>
          </div>
        </div>
        {lastFetch && !loadingFeed && !feedError && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: C.iron }}>
            dados de: {lastFetch.toLocaleString("pt-BR")} · o crawler roda sozinho a cada 30 min no GitHub — este botão só recarrega a última versão salva
          </div>
        )}
      </header>

      <main style={{ maxWidth: 800, margin: "0 auto", padding: "24px 20px 64px" }}>
        {feedError ? (
          <div style={{ background: C.snow, border: `1px solid ${C.mist}`, borderRadius: RADIUS.cards, padding: 28, textAlign: "center" }}>
            <AlertTriangle size={22} color="#B3261E" style={{ marginBottom: 10 }} />
            <p style={{ fontSize: 14, color: C.ink, marginBottom: 14 }}>{feedError}</p>
            <button
              onClick={fetchNoticias}
              className="flex items-center gap-2"
              style={{ background: C.violet, color: "#FFFFFF", border: "none", borderRadius: RADIUS.buttons, padding: "10px 20px", fontSize: 13.5, fontWeight: 500, cursor: "pointer", margin: "0 auto", fontFamily: "'Poppins', sans-serif" }}
            >
              <RefreshCw size={14} /> Tentar de novo
            </button>
          </div>
        ) : !openItem ? (
          <div>
            <FilterBar
              editors={editors}
              searchQuery={searchQuery} setSearchQuery={setSearchQuery}
              sortBy={sortBy} setSortBy={setSortBy}
              relevanceFilter={relevanceFilter} setRelevanceFilter={setRelevanceFilter}
              assignmentFilter={assignmentFilter} setAssignmentFilter={setAssignmentFilter}
            />
            {loadingFeed && items.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 10px", color: C.iron, fontSize: 13.5 }}>
                <Loader2 size={20} className="animate-spin" style={{ marginBottom: 8 }} />
                <div>Buscando notícias reais...</div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {ranked.map(item => (
                  <NewsRow
                    key={item.id}
                    item={item}
                    editors={editors}
                    assignedId={assignments[item.id]}
                    statusKey={statuses[item.id]}
                    statusPopoverFor={statusPopoverFor}
                    setStatusPopoverFor={setStatusPopoverFor}
                    setStatus={setStatus}
                    onOpen={() => { setOpenItemId(item.id); setScriptResult(null); setScriptError(null); }}
                    assignPopoverFor={assignPopoverFor}
                    setAssignPopoverFor={setAssignPopoverFor}
                    assignEditor={assignEditor}
                    addingEditor={addingEditor}
                    setAddingEditor={setAddingEditor}
                    newEditorName={newEditorName}
                    setNewEditorName={setNewEditorName}
                    newEditorColor={newEditorColor}
                    setNewEditorColor={setNewEditorColor}
                    addEditor={addEditor}
                  />
                ))}
                {ranked.length === 0 && (
                  <div style={{ textAlign: "center", padding: "48px 10px", color: C.iron, fontSize: 13.5, border: `1px dashed ${C.pebble}`, borderRadius: RADIUS.cards, background: C.snow }}>
                    Nenhuma notícia bate com esses filtros.
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <ArticleView
            item={openItem}
            editors={editors}
            assignedId={assignments[openItem.id]}
            statusKey={statuses[openItem.id]}
            statusPopoverFor={statusPopoverFor}
            setStatusPopoverFor={setStatusPopoverFor}
            setStatus={setStatus}
            onBack={() => setOpenItemId(null)}
            assignPopoverFor={assignPopoverFor}
            setAssignPopoverFor={setAssignPopoverFor}
            assignEditor={assignEditor}
            addingEditor={addingEditor}
            setAddingEditor={setAddingEditor}
            newEditorName={newEditorName}
            setNewEditorName={setNewEditorName}
            newEditorColor={newEditorColor}
            setNewEditorColor={setNewEditorColor}
            addEditor={addEditor}
            onGenerate={() => generateScript(openItem)}
            scriptLoading={scriptLoading}
            scriptError={scriptError}
            scriptResult={scriptResult}
            copyToClipboard={copyToClipboard}
            copyFullScript={copyFullScript}
            copied={copied}
          />
        )}
      </main>
    </div>
  );
}

/* ---------------------------------------------------------------
   SELO DE FONTE
--------------------------------------------------------------- */
function SourceBadge({ source, tipo }) {
  const s = sourceStyle(tipo);
  return (
    <span style={{
      fontWeight: 500, fontSize: 12, color: s.color, background: s.bg,
      borderRadius: RADIUS.badges, padding: "3px 9px", whiteSpace: "nowrap",
    }}>
      {source}
    </span>
  );
}

/* ---------------------------------------------------------------
   BARRA DE FILTROS
--------------------------------------------------------------- */
function FilterBar({ editors, searchQuery, setSearchQuery, sortBy, setSortBy, relevanceFilter, setRelevanceFilter, assignmentFilter, setAssignmentFilter }) {
  const selectStyle = {
    background: C.cloud, border: `1px solid ${C.pebble}`, borderRadius: RADIUS.inputs, color: C.ink,
    fontSize: 12.5, padding: "8px 10px", fontFamily: "'Poppins', sans-serif", cursor: "pointer",
  };
  return (
    <div style={{ background: C.snow, border: `1px solid ${C.mist}`, borderRadius: RADIUS.cards, padding: 20, marginBottom: 16, boxShadow: C.shadowXl }}>
      <div className="flex items-center gap-2" style={{ marginBottom: 14, background: C.cloud, borderRadius: RADIUS.inputs, padding: "9px 12px" }}>
        <Search size={14} color={C.iron} />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar por palavra-chave, tag ou fonte..."
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13.5, color: C.ink, fontFamily: "'Poppins', sans-serif" }}
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} style={{ background: "transparent", border: "none", color: C.iron, cursor: "pointer", display: "flex" }}>
            <X size={14} />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: C.slate, fontWeight: 500 }}>
          Priorizar por
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selectStyle}>
            <option value="relevancia">Relevância</option>
            <option value="recentes">Hora (mais recentes)</option>
          </select>
        </label>

        <select value={relevanceFilter} onChange={(e) => setRelevanceFilter(e.target.value)} style={selectStyle}>
          <option value="todas">Toda relevância</option>
          <option value="alta">Só alta relevância</option>
          <option value="moderada">Só relevância moderada</option>
        </select>

        <select value={assignmentFilter} onChange={(e) => setAssignmentFilter(e.target.value)} style={selectStyle}>
          <option value="todas">Toda atribuição</option>
          <option value="nao_atribuida">Não atribuídas</option>
          {editors.map(ed => (
            <option key={ed.id} value={ed.id}>{ed.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   ETIQUETA (label) DE EDITOR
--------------------------------------------------------------- */
function EditorTag({ item, editors, assignedId, popoverOpen, setPopoverOpen, assignEditor, addingEditor, setAddingEditor, newEditorName, setNewEditorName, newEditorColor, setNewEditorColor, addEditor }) {
  const assigned = editors.find(e => e.id === assignedId);
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setPopoverOpen(popoverOpen === item.id ? null : item.id); }}
        className="flex items-center gap-1.5"
        style={assigned ? {
          background: assigned.color, border: "none",
          borderRadius: RADIUS.badges, padding: "4px 10px", fontSize: 11.5, fontWeight: 500, cursor: "pointer",
          color: "#FFFFFF", whiteSpace: "nowrap", fontFamily: "'Poppins', sans-serif",
        } : {
          background: C.cloud, border: `1px dashed ${C.fog}`,
          borderRadius: RADIUS.badges, padding: "4px 9px", fontSize: 11.5, cursor: "pointer",
          color: C.slate, whiteSpace: "nowrap", fontFamily: "'Poppins', sans-serif",
        }}
      >
        {assigned ? (
          <><span style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.85)", display: "inline-block" }} />{assigned.name}</>
        ) : (
          <><UserPlus size={11} /> Atribuir</>
        )}
      </button>

      {popoverOpen === item.id && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: 30, right: 0, background: C.snow, border: `1px solid ${C.mist}`,
            borderRadius: RADIUS.inputs, padding: 8, zIndex: 30, minWidth: 170, boxShadow: C.shadowXl,
          }}
        >
          {editors.map(ed => (
            <button
              key={ed.id}
              onClick={() => assignEditor(item.id, ed.id)}
              className="flex items-center gap-2"
              style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", color: C.ink, padding: "7px 8px", borderRadius: RADIUS.inputs, cursor: "pointer", fontSize: 13, fontFamily: "'Poppins', sans-serif" }}
              onMouseEnter={(e) => e.currentTarget.style.background = C.cloud}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: ed.color, display: "inline-block" }} />
              {ed.name}
            </button>
          ))}
          <div style={{ borderTop: `1px solid ${C.pebble}`, marginTop: 6, paddingTop: 6 }}>
            {!addingEditor ? (
              <button onClick={() => setAddingEditor(true)} className="flex items-center gap-1.5" style={{ width: "100%", background: "transparent", border: "none", color: C.slate, padding: "7px 8px", cursor: "pointer", fontSize: 12.5, fontFamily: "'Poppins', sans-serif" }}>
                <Plus size={12} /> Novo editor
              </button>
            ) : (
              <div style={{ padding: "4px 4px 2px" }}>
                <input
                  autoFocus value={newEditorName} onChange={(e) => setNewEditorName(e.target.value)}
                  placeholder="Nome" onKeyDown={(e) => e.key === "Enter" && addEditor()}
                  style={{ width: "100%", background: C.cloud, border: `1px solid ${C.pebble}`, borderRadius: RADIUS.inputs, color: C.ink, fontSize: 12.5, padding: "6px 8px", marginBottom: 6, fontFamily: "'Poppins', sans-serif" }}
                />
                <div className="flex items-center gap-1.5" style={{ marginBottom: 6, flexWrap: "wrap" }}>
                  {EDITOR_PALETTE.map(c => (
                    <button key={c} onClick={() => setNewEditorColor(c)} style={{ width: 16, height: 16, borderRadius: "50%", background: c, border: newEditorColor === c ? "2px solid #333333" : "2px solid transparent", cursor: "pointer" }} />
                  ))}
                </div>
                <button onClick={addEditor} style={{ width: "100%", background: C.violet, color: "#FFFFFF", fontWeight: 500, border: "none", borderRadius: RADIUS.buttons, padding: "6px 0", fontSize: 12, cursor: "pointer", fontFamily: "'Poppins', sans-serif" }}>
                  Adicionar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   ETIQUETA DE STATUS DE PRODUÇÃO — Fazendo / Feito no Drive
--------------------------------------------------------------- */
function StatusTag({ item, statusKey, popoverOpen, setPopoverOpen, setStatus }) {
  const current = statusKey ? STATUS_OPTIONS[statusKey] : null;
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={(e) => { e.stopPropagation(); setPopoverOpen(popoverOpen === item.id ? null : item.id); }}
        className="flex items-center gap-1.5"
        style={current ? {
          background: current.bg, border: "none", color: current.color,
          borderRadius: RADIUS.badges, padding: "4px 10px", fontSize: 11.5, fontWeight: 500, cursor: "pointer",
          whiteSpace: "nowrap", fontFamily: "'Poppins', sans-serif",
        } : {
          background: C.cloud, border: `1px dashed ${C.fog}`, color: C.slate,
          borderRadius: RADIUS.badges, padding: "4px 9px", fontSize: 11.5, cursor: "pointer",
          whiteSpace: "nowrap", fontFamily: "'Poppins', sans-serif",
        }}
      >
        {current ? current.text : "+ Status"}
      </button>

      {popoverOpen === item.id && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", top: 30, right: 0, background: C.snow, border: `1px solid ${C.mist}`,
            borderRadius: RADIUS.inputs, padding: 8, zIndex: 30, minWidth: 160, boxShadow: C.shadowXl,
          }}
        >
          {Object.entries(STATUS_OPTIONS).map(([key, opt]) => (
            <button
              key={key}
              onClick={() => setStatus(item.id, key)}
              className="flex items-center gap-2"
              style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", padding: "7px 8px", borderRadius: RADIUS.inputs, cursor: "pointer", fontSize: 13, fontFamily: "'Poppins', sans-serif" }}
              onMouseEnter={(e) => e.currentTarget.style.background = C.cloud}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: opt.color, display: "inline-block" }} />
              {opt.text}
            </button>
          ))}
          {statusKey && (
            <div style={{ borderTop: `1px solid ${C.pebble}`, marginTop: 6, paddingTop: 6 }}>
              <button
                onClick={() => setStatus(item.id, null)}
                style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", color: C.iron, padding: "7px 8px", cursor: "pointer", fontSize: 12.5, fontFamily: "'Poppins', sans-serif" }}
              >
                Limpar status
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   LISTA DE NOTÍCIAS (estilo portal)
--------------------------------------------------------------- */
function NewsRow({ item, editors, assignedId, statusKey, statusPopoverFor, setStatusPopoverFor, setStatus, onOpen, assignPopoverFor, setAssignPopoverFor, ...editorProps }) {
  const rel = relevanceLabel(item.score);
  return (
    <div
      onClick={onOpen}
      style={{ background: C.snow, border: `1px solid ${C.mist}`, borderRadius: RADIUS.cards, padding: 20, cursor: "pointer", boxShadow: C.shadowXl }}
    >
      <div className="flex items-center justify-between gap-3" style={{ marginBottom: 10 }}>
        <div className="flex items-center gap-2">
          <SourceBadge source={item.source} tipo={item.tipo} />
          <span style={{ fontSize: 11, color: C.iron }}>{relativeTime(item.publishedRaw)}</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 500, color: rel.color, background: rel.bg, borderRadius: RADIUS.badges, padding: "3px 9px", whiteSpace: "nowrap" }}>
          {rel.text} · {item.score}
        </span>
      </div>
      <h2 style={{ fontWeight: 500, fontSize: 17, lineHeight: 1.4, margin: "0 0 12px", color: C.ink, letterSpacing: "-0.01em" }}>
        {item.title}
      </h2>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
          {(item.tags || []).slice(0, 3).map(t => (
            <span key={t} style={{ fontSize: 11, color: C.slate, background: C.periwinkleWash + "80", borderRadius: RADIUS.badges, padding: "3px 8px" }}>{t}</span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <StatusTag item={item} statusKey={statusKey} popoverOpen={statusPopoverFor} setPopoverOpen={setStatusPopoverFor} setStatus={setStatus} />
          <EditorTag item={item} editors={editors} assignedId={assignedId} popoverOpen={assignPopoverFor} setPopoverOpen={setAssignPopoverFor} {...editorProps} />
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   VISUALIZAÇÃO DO ARTIGO + GERAÇÃO DE ROTEIRO
--------------------------------------------------------------- */
function ArticleView({
  item, editors, assignedId, statusKey, statusPopoverFor, setStatusPopoverFor, setStatus, onBack, assignPopoverFor, setAssignPopoverFor, onGenerate,
  scriptLoading, scriptError, scriptResult, copyToClipboard, copyFullScript, copied, ...editorProps
}) {
  const rel = relevanceLabel(item.score);
  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5" style={{ background: "transparent", border: "none", color: C.slate, cursor: "pointer", fontSize: 13, fontWeight: 500, marginBottom: 16, padding: 0, fontFamily: "'Poppins', sans-serif" }}>
        <ArrowLeft size={14} /> Voltar para a lista
      </button>

      <div style={{ background: C.snow, border: `1px solid ${C.mist}`, borderRadius: RADIUS.cards, padding: 28, boxShadow: C.shadowXl }}>
        <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginBottom: 10 }}>
          <div className="flex items-center gap-2">
            <SourceBadge source={item.source} tipo={item.tipo} />
            <span style={{ fontSize: 11.5, color: C.iron }}>
              {item.category} · {relativeTime(item.publishedRaw)}
            </span>
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 500, color: rel.color, background: rel.bg, borderRadius: RADIUS.badges, padding: "3px 9px" }}>
            {rel.text} · {item.score}
          </span>
        </div>

        <h1 style={{ fontWeight: 500, fontSize: 26, lineHeight: 1.35, margin: "8px 0 18px", color: C.ink, letterSpacing: "-0.02em" }}>{item.title}</h1>

        <div className="flex items-center justify-between flex-wrap gap-3" style={{ marginBottom: 20, paddingBottom: 18, borderBottom: `1px solid ${C.pebble}` }}>
          <div className="flex flex-wrap gap-1.5">
            {(item.tags || []).map(t => (
              <span key={t} style={{ fontSize: 11.5, color: C.slate, background: C.periwinkleWash + "80", borderRadius: RADIUS.badges, padding: "3px 9px" }}>{t}</span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <StatusTag item={item} statusKey={statusKey} popoverOpen={statusPopoverFor} setPopoverOpen={setStatusPopoverFor} setStatus={setStatus} />
            <EditorTag item={item} editors={editors} assignedId={assignedId} popoverOpen={assignPopoverFor} setPopoverOpen={setAssignPopoverFor} {...editorProps} />
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 15, lineHeight: 1.7, color: C.ink, margin: "0 0 12px", fontWeight: 300 }}>
            {item.summary || "Sem resumo disponível para esta notícia — abra o link para ler na fonte original."}
          </p>
          {item.link && (
            <a
              href={item.link} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5"
              style={{ fontSize: 13, color: C.violet, fontWeight: 500, textDecoration: "none", width: "fit-content" }}
            >
              Ler matéria completa em {item.source} <ExternalLink size={13} />
            </a>
          )}
        </div>

        {!scriptResult && (
          <button
            onClick={onGenerate}
            disabled={scriptLoading}
            className="flex items-center gap-2"
            style={{ background: C.violet, color: "#FFFFFF", border: "none", borderRadius: RADIUS.buttons, padding: "12px 22px", fontSize: 14.5, fontWeight: 500, cursor: scriptLoading ? "default" : "pointer", opacity: scriptLoading ? 0.7 : 1, fontFamily: "'Poppins', sans-serif" }}
          >
            {scriptLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {scriptLoading ? "Gerando roteiro..." : "Criar roteiro"}
          </button>
        )}

        {scriptError && (
          <div style={{ color: "#B3261E", fontSize: 13.5, marginTop: 12 }}>
            {scriptError}
            <button onClick={onGenerate} style={{ marginLeft: 10, color: C.violet, background: "transparent", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "'Poppins', sans-serif" }}>Tentar de novo</button>
          </div>
        )}

        {scriptResult && (
          <div style={{ marginTop: 10, borderTop: `1px solid ${C.pebble}`, paddingTop: 22 }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.1em", color: C.violet, fontWeight: 700 }}>Roteiro gerado</span>
              <button onClick={() => copyFullScript(scriptResult)} className="flex items-center gap-1.5" style={{ background: "transparent", border: `1px solid ${C.pebble}`, borderRadius: RADIUS.buttons, padding: "7px 14px", color: copied === "full" ? C.violet : C.slate, fontSize: 12.5, cursor: "pointer", fontWeight: 500, fontFamily: "'Poppins', sans-serif" }}>
                {copied === "full" ? <Check size={13} /> : <Copy size={13} />} {copied === "full" ? "Copiado!" : "Copiar roteiro completo"}
              </button>
            </div>
            <div style={{ fontSize: 12, color: C.iron, marginBottom: 16 }}>
              {estimateNarrationTime(scriptResult)}
            </div>

            <Block label="Gancho inicial" text={scriptResult.gancho} onCopy={() => copyToClipboard(scriptResult.gancho, "gancho")} copied={copied === "gancho"} />
            <Block label="Roteiro" text={scriptResult.roteiro} onCopy={() => copyToClipboard(scriptResult.roteiro, "roteiro")} copied={copied === "roteiro"} multiline />
            <Block label="Encerramento" text={scriptResult.encerramento} onCopy={() => copyToClipboard(scriptResult.encerramento, "encerramento")} copied={copied === "encerramento"} multiline />

            <div style={{ marginTop: 16 }}>
              <SectionLabel text="Opções de título" />
              <div className="flex flex-col gap-2" style={{ marginTop: 8 }}>
                {(scriptResult.titulos || []).map((t, i) => (
                  <div key={i} className="flex items-center justify-between gap-2" style={{ background: C.cloud, borderRadius: RADIUS.inputs, padding: "9px 12px" }}>
                    <span style={{ fontSize: 13.5, fontWeight: 400 }}>{t}</span>
                    <CopyBtn onClick={() => copyToClipboard(t, "titulo" + i)} copied={copied === "titulo" + i} />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <Block label="Descrição (SEO)" text={scriptResult.descricao_seo} onCopy={() => copyToClipboard(scriptResult.descricao_seo, "desc")} copied={copied === "desc"} />
            </div>

            <div style={{ marginTop: 16 }}>
              <SectionLabel text="Tags" />
              <div className="flex flex-wrap gap-1.5" style={{ marginTop: 8 }}>
                {(scriptResult.tags || []).map((t, i) => (
                  <span key={i} style={{ fontSize: 11.5, color: C.slate, background: C.periwinkleWash + "80", borderRadius: RADIUS.badges, padding: "3px 9px" }}>{t}</span>
                ))}
              </div>
              <button onClick={() => copyToClipboard((scriptResult.tags || []).join(", "), "tags")} style={{ marginTop: 10, fontSize: 12, color: C.violet, background: "transparent", border: "none", cursor: "pointer", fontWeight: 500, fontFamily: "'Poppins', sans-serif" }}>
                {copied === "tags" ? "Copiado!" : "Copiar todas as tags"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function estimateNarrationTime(result) {
  const fullText = [result.gancho, result.roteiro, result.encerramento].filter(Boolean).join(" ");
  const wordCount = fullText.trim().split(/\s+/).filter(Boolean).length;
  const minutes = wordCount / 150; // ritmo de fala natural em português
  const min = Math.floor(minutes);
  const sec = Math.round((minutes - min) * 60);
  return `≈ ${min}min${sec.toString().padStart(2, "0")}s de narração estimada · ${wordCount} palavras`;
}

function SectionLabel({ text }) {
  return <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: C.iron, fontWeight: 500 }}>{text}</span>;
}

function Block({ label, text, onCopy, copied, multiline }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="flex items-center justify-between">
        <SectionLabel text={label} />
        <CopyBtn onClick={onCopy} copied={copied} />
      </div>
      <p style={{ fontSize: 14.5, lineHeight: 1.65, marginTop: 8, whiteSpace: multiline ? "pre-line" : "normal", fontWeight: 300, color: C.ink }}>{text}</p>
    </div>
  );
}

function CopyBtn({ onClick, copied }) {
  return (
    <button onClick={onClick} style={{ background: "transparent", border: "none", color: copied ? C.violet : C.iron, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 500, fontFamily: "'Poppins', sans-serif" }}>
      {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copiado" : "Copiar"}
    </button>
  );
}
