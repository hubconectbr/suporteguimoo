
let artigos = [];
let categorias = [];
let currentArticle = null;
let theme = localStorage.getItem("guimoo-theme") || "light";

document.documentElement.setAttribute("data-theme", theme);
updateThemeButton();

async function init(){
  try{
    const [artigosResp, categoriasResp] = await Promise.all([
      fetch("data/artigos.json?v=" + Date.now(), {cache:"no-store"}),
      fetch("data/categorias.json?v=" + Date.now(), {cache:"no-store"})
    ]);

    artigos = await artigosResp.json();

    if (categoriasResp.ok) {
      categorias = await categoriasResp.json();
    } else {
      categorias = [...new Set(artigos.map(a => a.categoria || "Geral"))]
        .sort()
        .map(c => ({nome:c,total:artigos.filter(a => (a.categoria || "Geral") === c).length}));
    }

    prepararIndice();
    renderSugestoes();
  }catch(e){
    document.getElementById("results").innerHTML = `<div class="result-item"><div class="result-title">Erro ao carregar base</div><div class="result-snippet">Verifique se os arquivos data/artigos.json e data/categorias.json foram enviados corretamente.</div></div>`;
  }
}

function prepararIndice(){
  artigos = artigos.map(a => ({
    ...a,
    _search: [
      a.id, a.categoria, a.subcategoria, a.titulo, a.perguntaOriginal,
      a.problema, a.mensagemRapida, a.respostaCompleta, (a.tags||[]).join(" "),
      (a.checklist||[]).join(" "), (a.procedimento||[]).join(" ")
    ].join(" ").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  }));
}

function normalizeText(t){
  return String(t||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}

function scoreArticle(a, q){
  const nq = normalizeText(q);
  if(!nq) return 0;

  const terms = nq.split(/\s+/).filter(Boolean);
  let score = 0;

  const title = normalizeText(a.titulo);
  const pergunta = normalizeText(a.perguntaOriginal || "");
  const tags = normalizeText((a.tags||[]).join(" "));
  const categoria = normalizeText(a.categoria);

  if(title.includes(nq)) score += 80;
  if(pergunta.includes(nq)) score += 70;
  if(tags.includes(nq)) score += 60;
  if(categoria.includes(nq)) score += 30;

  for(const term of terms){
    if(title.includes(term)) score += 18;
    if(pergunta.includes(term)) score += 14;
    if(tags.includes(term)) score += 12;
    if(a._search.includes(term)) score += 4;
  }

  return score;
}

function search(q){
  if(!q.trim()){
    document.getElementById("results").innerHTML = "";
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
  const terms = q.split(/\s+/).filter(t => t.length > 2).slice(0,5);

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
}

function copyQuick(){
  if(!currentArticle) return;

  navigator.clipboard.writeText(currentArticle.mensagemRapida || currentArticle.respostaCompleta || "");
  const toast = document.getElementById("toast");
  toast.style.display = "block";
  setTimeout(()=>toast.style.display="none",1600);
}

function renderSugestoes(){
  const comuns = ["WhatsApp não conecta", "IA não responde", "Não consigo acessar", "Agenda não aparece", "CRM não abre", "Guimoo Sign"];
  document.getElementById("quickSuggestions").innerHTML = comuns.map(s=>`<button onclick="setSearch('${s.replace(/'/g,"\\'")}')">${s}</button>`).join("");
}

function setSearch(v){
  const input = document.getElementById("searchInput");
  input.value = v;
  search(v);
  input.focus();
}

function focusSearch(){
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
    el.innerHTML = `<div class="panel-card"><h1>▶ Tutoriais</h1><p>Espaço para organizar vídeos, aulas rápidas e links de treinamento.</p></div>
    <div class="panel-grid">${categorias.slice(0,14).map(c=>`<div class="panel-card"><h3>${c.nome}</h3><p>${c.total} artigo(s) relacionados.</p></div>`).join("")}</div>`;
  }

  if(type === "procedimentos"){
    el.innerHTML = `<div class="panel-card"><h1>📋 Procedimentos</h1><p>Lista dos procedimentos operacionais cadastrados.</p></div>
    <div class="panel-grid">${artigos.slice(0,80).map(a=>`<div class="panel-card" onclick="openArticle('${a.id}')" style="cursor:pointer"><h3>${a.titulo}</h3><p>${a.id} • ${a.categoria}</p></div>`).join("")}</div>`;
  }

  if(type === "indicadores"){
    el.innerHTML = `<div class="panel-card"><h1>📊 Indicadores</h1><p>Resumo da base de conhecimento.</p></div>
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
  if(btn) btn.textContent = theme === "dark" ? "☀️ Modo claro" : "🌙 Modo escuro";
}

document.addEventListener("keydown", e=>{
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==="k"){
    e.preventDefault();
    focusSearch();
  }
});

document.getElementById("searchInput").addEventListener("input", e=>search(e.target.value));

init();
