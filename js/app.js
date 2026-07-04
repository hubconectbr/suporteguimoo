
let artigos = [];
let categorias = [];
let currentArticle = null;
let theme = localStorage.getItem("guimoo-theme") || "light";

document.documentElement.setAttribute("data-theme", theme);
updateThemeButton();

const STOP_WORDS = new Set([
  "o","a","os","as","um","uma","uns","umas","de","do","da","dos","das","para","pra",
  "por","com","sem","em","no","na","nos","nas","meu","minha","meus","minhas","que",
  "e","ou","ao","aos","à","às","como","quando","onde","qual","quais","isso","esse",
  "essa","este","esta","ele","ela","eles","elas","cliente","usuário","usuario"
]);

const SINONIMOS = {
  "caiu": ["desconectado","offline","parou","instavel","instável","não conecta","nao conecta","não envia","nao envia","conexão","conexao"],
  "cair": ["desconectado","offline","parou","instavel","instável","conexão","conexao"],
  "fora": ["offline","desconectado","indisponivel","indisponível"],
  "zap": ["whatsapp","conexão","conexao"],
  "wpp": ["whatsapp","conexão","conexao"],
  "whats": ["whatsapp"],
  "mensagem": ["envio","enviar","disparo","conversa"],
  "mensagens": ["envio","enviar","disparo","conversa"],
  "entra": ["login","acesso","senha","hub"],
  "entrar": ["login","acesso","senha","hub"],
  "acessar": ["login","acesso","senha","hub"],
  "abre": ["carrega","página","pagina","sistema","acesso"],
  "abrir": ["carrega","página","pagina","sistema","acesso"],
  "branco": ["página branca","pagina branca","cache","navegador"],
  "travou": ["erro","instabilidade","cache","navegador"],
  "travando": ["erro","instabilidade","cache","navegador"],
  "lento": ["delay","demora","instabilidade"],
  "demora": ["delay","lento","resposta"],
  "responde": ["ia","agente","gatilho","resposta"],
  "responder": ["ia","agente","gatilho","resposta"],
  "bot": ["ia","agente","gatilho"],
  "robô": ["ia","agente","gatilho"],
  "robo": ["ia","agente","gatilho"],
  "agenda": ["agendamento","google agenda","calendar","calendário","calendario"],
  "agendar": ["agenda","agendamento","google agenda","calendar"],
  "assinatura": ["guimoo sign","contrato","documento","assinar"],
  "contrato": ["guimoo sign","assinatura","documento","assinar"],
  "app": ["aplicativo","mobile","celular","android"],
  "celular": ["app","aplicativo","mobile","android"],
  "plano": ["financeiro","assinatura","pagamento","cobrança","cobranca"]
};

async function init(){
  try{
    const [artigosResp, categoriasResp] = await Promise.all([
      fetch("data/artigos.json?v=" + Date.now(), {cache:"no-store"}),
      fetch("data/categorias.json?v=" + Date.now(), {cache:"no-store"})
    ]);

    artigos = await artigosResp.json();

    if(categoriasResp.ok){
      categorias = await categoriasResp.json();
    }else{
      categorias = [...new Set(artigos.map(a => a.categoria || "Geral"))]
        .sort()
        .map(c => ({nome:c,total:artigos.filter(a => (a.categoria || "Geral") === c).length}));
    }

    prepararIndice();
    renderSugestoes();
  }catch(e){
    const results = document.getElementById("results");
    results.classList.remove("hidden");
    results.innerHTML = `<div class="result-item"><div class="result-title">Erro ao carregar base</div><div class="result-snippet">Verifique se os arquivos data/artigos.json e data/categorias.json foram enviados corretamente.</div></div>`;
  }
}

function normalizeText(t){
  return String(t||"")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[^\w\s#]/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function tokenize(text){
  return normalizeText(text)
    .split(" ")
    .filter(t => t && !STOP_WORDS.has(t));
}

function expandQuery(q){
  const tokens = tokenize(q);
  const expanded = new Set(tokens);

  for(const token of tokens){
    if(SINONIMOS[token]){
      SINONIMOS[token].forEach(s => tokenize(s).forEach(x => expanded.add(x)));
    }
  }

  // Regras compostas de intenção
  const nq = normalizeText(q);
  if(nq.includes("whatsapp") && (nq.includes("caiu") || nq.includes("parou") || nq.includes("fora"))){
    ["desconectado","conexao","qr","envio","mensagens","instancia"].forEach(x=>expanded.add(x));
  }
  if((nq.includes("ia") || nq.includes("agente")) && (nq.includes("nao responde") || nq.includes("não responde") || nq.includes("parou"))){
    ["gatilho","ativa","conexao","resposta","leads"].forEach(x=>expanded.add(x));
  }
  if(nq.includes("nao consigo acessar") || nq.includes("não consigo acessar") || nq.includes("login")){
    ["senha","hub","cache","conta","acesso"].forEach(x=>expanded.add(x));
  }

  return [...expanded];
}

function prepararIndice(){
  artigos = artigos.map(a => {
    const searchText = [
      a.id, a.categoria, a.subcategoria, a.titulo, a.perguntaOriginal,
      a.problema, a.mensagemRapida, a.respostaCompleta, (a.tags||[]).join(" "),
      (a.checklist||[]).join(" "), (a.procedimento||[]).join(" "),
      (a.relacionados||[]).join(" ")
    ].join(" ");

    return {
      ...a,
      _search: normalizeText(searchText),
      _title: normalizeText(a.titulo),
      _question: normalizeText(a.perguntaOriginal || ""),
      _tags: normalizeText((a.tags||[]).join(" ")),
      _category: normalizeText(a.categoria || "")
    };
  });
}

function scoreArticle(a, q){
  const nq = normalizeText(q);
  if(!nq) return 0;

  const terms = expandQuery(q);
  let score = 0;

  // Frase completa tem peso maior
  if(a._title.includes(nq)) score += 120;
  if(a._question.includes(nq)) score += 100;
  if(a._tags.includes(nq)) score += 80;
  if(a._category.includes(nq)) score += 45;
  if(a._search.includes(nq)) score += 35;

  // Termos expandidos por sinônimos
  for(const term of terms){
    if(a._title.includes(term)) score += 24;
    if(a._question.includes(term)) score += 18;
    if(a._tags.includes(term)) score += 16;
    if(a._category.includes(term)) score += 10;
    if(a._search.includes(term)) score += 6;
  }

  // Boosts por intenção
  if(terms.includes("whatsapp") && (terms.includes("desconectado") || terms.includes("conexao") || terms.includes("envio")) && a._category.includes("whatsapp")) score += 55;
  if((terms.includes("ia") || terms.includes("agente")) && a._category.includes("agentes")) score += 45;
  if((terms.includes("login") || terms.includes("senha") || terms.includes("acesso")) && a._category.includes("acesso")) score += 45;
  if((terms.includes("agenda") || terms.includes("agendamento")) && a._category.includes("agenda")) score += 45;

  return score;
}

function executarPesquisa(){
  const input = document.getElementById("searchInput");
  search(input.value);
}

function search(q){
  const resultsEl = document.getElementById("results");

  if(!q.trim()){
    resultsEl.classList.add("hidden");
    resultsEl.innerHTML = "";
    return;
  }

  const results = artigos
    .map(a => ({...a, _score: scoreArticle(a, q)}))
    .filter(a => a._score > 0)
    .sort((a,b)=>b._score-a._score)
    .slice(0, 12);

  renderResults(results, q);
}

function renderResults(results, q){
  const el = document.getElementById("results");
  el.classList.remove("hidden");

  if(!results.length){
    el.innerHTML = `<div class="result-item"><div class="result-title">Nenhum resultado encontrado</div><div class="result-snippet">Tente termos como: WhatsApp, login, IA, agenda, CRM, assinatura, app.</div></div>`;
    return;
  }

  el.innerHTML = results.map(a => `
    <div class="result-item" onclick="openArticle('${a.id}')">
      <div class="result-title">${highlight(a.titulo, q)}</div>
      <div class="result-meta">${a.id} • ${a.categoria || "Geral"}${a.subcategoria ? " • " + a.subcategoria : ""} • ${a.tempo || "2 min"}</div>
      <div class="result-snippet">${highlight((a.problema || a.perguntaOriginal || "").slice(0,220), q)}</div>
    </div>
  `).join("");
}

function highlight(text, q){
  if(!q.trim()) return text || "";
  let result = text || "";
  const terms = tokenize(q).filter(t => t.length > 2).slice(0,5);

  for(const term of terms){
    const re = new RegExp(`(${escapeRegExp(term)})`, "ig");
    result = result.replace(re, `<span class="highlight">$1</span>`);
  }

  return result;
}

function escapeRegExp(s){
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function openArticle(id){
  const a = artigos.find(x => x.id === id);
  if(!a) return;

  currentArticle = a;
  document.getElementById("home").classList.add("hidden");
  document.getElementById("panelView").classList.add("hidden");
  document.getElementById("articleView").classList.remove("hidden");

  document.getElementById("articleContent").innerHTML = `
    <h1>${a.titulo}</h1>
    <div class="meta">
      <span class="badge">${a.id}</span>
      <span class="badge">${a.categoria || "Geral"}</span>
      ${a.subcategoria ? `<span class="badge">${a.subcategoria}</span>` : ""}
      <span class="badge">${a.tempo || "2 min"}</span>
      <span class="badge">${a.dificuldade || "Padrão"}</span>
    </div>

    <h2>O problema</h2>
    <p>${a.problema || a.perguntaOriginal || ""}</p>

    <div class="quick-box">
      <div class="copy-row">
        <h2>Mensagem rápida</h2>
        <button class="copy-btn" onclick="copyQuick()">Copiar resposta</button>
      </div>
      <p style="white-space:pre-line">${a.mensagemRapida || a.respostaCompleta || ""}</p>
    </div>

    <h2>Checklist</h2>
    <ul class="clean">${(a.checklist||[]).map(i=>`<li>${i}</li>`).join("") || "<li>Validar informações principais com o cliente.</li>"}</ul>

    <h2>Procedimento</h2>
    <ol class="steps">${(a.procedimento||[]).map(i=>`<li>${i}</li>`).join("") || `<li>${a.respostaCompleta || a.mensagemRapida || ""}</li>`}</ol>

    <h2>Quando escalar</h2>
    <ul class="clean">${(a.escalonamento||[]).map(i=>`<li>${i}</li>`).join("") || "<li>Escalar quando o procedimento padrão não resolver.</li>"}</ul>
  `;

  document.getElementById("articleSide").innerHTML = `
    <h3>Ações rápidas</h3>
    <button class="side-action" onclick="copyQuick()">📋 Copiar mensagem rápida</button>
    <button class="side-action">▶ Abrir tutorial</button>
    <button class="side-action">📞 Abrir reunião remota</button>
    <button class="side-action">🚨 Reportar problema técnico</button>

    <h3>Tags</h3>
    <div>${(a.tags||[]).map(t=>`<span class="tag">${t}</span>`).join("")}</div>

    <h3>Feedback</h3>
    <button class="side-action">👍 Resolveu</button>
    <button class="side-action">👎 Não resolveu</button>
  `;
}

function goHome(){
  document.getElementById("articleView").classList.add("hidden");
  document.getElementById("panelView").classList.add("hidden");
  document.getElementById("home").classList.remove("hidden");
  setTimeout(() => document.getElementById("searchInput").focus(), 100);
}

function copyQuick(){
  if(!currentArticle) return;
  navigator.clipboard.writeText(currentArticle.mensagemRapida || currentArticle.respostaCompleta || "");
  const toast = document.getElementById("toast");
  toast.style.display = "block";
  setTimeout(()=>toast.style.display="none",1600);
}

function renderSugestoes(){
  const comuns = ["WhatsApp caiu", "IA não responde", "Não consigo acessar", "Agenda não aparece", "CRM não abre", "Guimoo Sign"];
  document.getElementById("suggestions").innerHTML = comuns.map(s=>`<button onclick="setSearch('${s.replace(/'/g,"\\'")}')">${s}</button>`).join("");
}

function setSearch(v){
  const input = document.getElementById("searchInput");
  input.value = v;
  search(v);
  input.focus();
}

function focusSearch(){
  executarPesquisa();
  document.getElementById("searchInput").focus();
}

function luckySearch(){
  const q = document.getElementById("searchInput").value || "whatsapp";
  const first = artigos
    .map(a=>({...a,_score:scoreArticle(a,q)}))
    .filter(a=>a._score>0)
    .sort((a,b)=>b._score-a._score)[0] || artigos[0];

  openArticle(first.id);
}

function openPanel(type){
  document.getElementById("home").classList.add("hidden");
  document.getElementById("articleView").classList.add("hidden");
  document.getElementById("panelView").classList.remove("hidden");

  const el = document.getElementById("panelContent");

  if(type === "tutoriais"){
    el.innerHTML = `<div class="panel-card"><h1>Tutoriais</h1><p>Espaço para organizar vídeos, aulas rápidas e links de treinamento.</p></div>
    <div class="panel-grid">${categorias.slice(0,14).map(c=>`<div class="panel-card"><h3>${c.nome}</h3><p>${c.total} artigo(s) relacionados.</p></div>`).join("")}</div>`;
  }

  if(type === "procedimentos"){
    el.innerHTML = `<div class="panel-card"><h1>Procedimentos</h1><p>Lista dos procedimentos operacionais cadastrados.</p></div>
    <div class="panel-grid">${artigos.slice(0,80).map(a=>`<div class="panel-card" onclick="openArticle('${a.id}')" style="cursor:pointer"><h3>${a.titulo}</h3><p>${a.id} • ${a.categoria}</p></div>`).join("")}</div>`;
  }

  if(type === "indicadores"){
    el.innerHTML = `<div class="panel-card"><h1>Indicadores</h1><p>Resumo da base de conhecimento.</p></div>
    <div class="panel-grid">
      <div class="panel-card"><h3>${artigos.length}</h3><p>Artigos cadastrados</p></div>
      <div class="panel-card"><h3>${categorias.length}</h3><p>Categorias</p></div>
      <div class="panel-card"><h3>${artigos.filter(a=>(a.tags||[]).length).length}</h3><p>Artigos com tags</p></div>
      <div class="panel-card"><h3>${artigos.filter(a=>a.mensagemRapida).length}</h3><p>Mensagens rápidas</p></div>
    </div>`;
  }
}

function toggleTheme(){
  theme = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("guimoo-theme", theme);
  updateThemeButton();
}

function updateThemeButton(){
  const btn = document.getElementById("themeBtn");
  if(btn) btn.textContent = theme === "dark" ? "Modo claro" : "Modo escuro";
}

document.addEventListener("keydown", e=>{
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==="k"){
    e.preventDefault();
    document.getElementById("searchInput").focus();
  }
});

document.getElementById("searchInput").addEventListener("input", e=>search(e.target.value));
document.getElementById("searchInput").addEventListener("keydown", e=>{
  if(e.key === "Enter"){
    e.preventDefault();
    executarPesquisa();
  }
});

document.getElementById("articleSearch").addEventListener("keydown", e=>{
  if(e.key === "Enter"){
    goHome();
    setSearch(e.target.value);
  }
});

init();
