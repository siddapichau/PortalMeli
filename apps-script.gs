/**
 * PORTAL DE CONTROLES INTERNOS
 * API Google Apps Script + Google Sheets
 *
 * NOTA (continuidade do projeto "API por página + permissões"):
 * - Colunas novas na aba "Paginas": API e Planilha (preenchidas manualmente pelo admin via admin.html).
 * - Ação nova: "obterConfigPagina" -> permite que cada HTML de página busque sua própria
 *   API/Planilha + permissões (podeVer/podeEditar) em vez de ter a API fixa no código.
 * - Nenhuma função existente foi removida ou teve seu comportamento alterado; apenas
 *   extensões aditivas (novas colunas, novos campos, uma ação nova).
 */
const PORTAL = {
  SHEETS: {
    Usuarios: ["ID", "Nome", "Email", "SenhaHash", "Perfil", "Ativo", "CriadoEm", "Favoritos"],
    Paginas: ["ID", "Nome", "Arquivo", "URL", "Icone", "Ordem", "Ativo", "Menu", "Submenu", "Descricao", "API", "Planilha"],
    Menus: ["ID", "Nome", "Icone", "Ordem"],
    Permissoes: ["ID", "Email", "PaginaID", "PodeVer", "PodeEditar"],
    Solicitacoes: ["ID", "Nome", "Email", "Status", "CriadoEm", "SenhaHash"],
    Configuracoes: ["Chave", "Valor"],
    Historico: ["ID", "Data", "Usuario", "Acao", "Detalhe"],
    Sessoes: ["Token", "Email", "ExpiraEm", "UserAgent"]
  },
  PROP_SHEET_ID: "PORTAL_SPREADSHEET_ID",
  SESSION_HOURS: 8
};

function doGet(e) {
  return json_({
    ok: true,
    data: {
      service: "Portal de Controles Internos API",
      message: "API disponível. Envie POST com action no corpo JSON.",
      configured: Boolean(PropertiesService.getScriptProperties().getProperty(PORTAL.PROP_SHEET_ID))
    }
  });
}

function doPost(e) {
  let input = {};
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
    input = JSON.parse(raw);
  } catch (err) {
    return json_({ ok: false, error: "Corpo da requisição inválido. Envie JSON." });
  }

  const action = String(input.action || (e && e.parameter && e.parameter.action) || "");
  try {
    let result;
    switch (action) {
      case "solicitarAcesso": result = requestAccess_(input); break;
      case "setup": result = setup_(input); break;
      case "login": result = login_(input); break;
      case "validarToken": result = validateToken_(input.token); break;
      case "logout": result = logout_(input.token); break;
      case "listarPaginas": result = listPages_(input.token); break;
      case "obterConfigPagina": result = getPageConfig_(input); break; // NOVO
      case "salvarFavoritos": result = saveFavorites_(input); break;
      case "listarUsuarios": result = listUsers_(input.token); break;
      case "salvarUsuario": result = saveUser_(input); break;
      case "excluirUsuario": result = deleteUser_(input); break;
      case "listarPaginasAdmin": result = listPagesAdmin_(input.token); break;
      case "salvarPagina": result = savePage_(input); break;
      case "excluirPagina": result = deletePage_(input); break;
      case "listarMenus": result = listMenus_(input.token); break;
      case "salvarMenu": result = saveMenu_(input); break;
      case "excluirMenu": result = deleteMenu_(input); break;
      case "listarPermissoes": result = listPermissions_(input); break;
      case "salvarPermissao": result = savePermission_(input); break;
      case "excluirPermissao": result = deletePermission_(input); break;
      case "listarSolicitacoes": result = listRequests_(input.token); break;
      case "aprovarSolicitacao": result = approveRequest_(input); break;
      case "excluirSolicitacao": result = deleteRequest_(input); break;
      case "obterConfiguracoes": result = getConfigs_(input.token); break;
      case "salvarConfiguracoes": result = saveConfigs_(input); break;
      case "listarHistorico": result = listHistory_(input.token); break;
      case "enviarEmailMassa": result = sendBulkEmail_(input); break; // NOVO
      default: result = { ok: false, error: "Ação desconhecida." };
    }
    return json_(result);
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return json_({ ok: false, error: err && err.message ? err.message : "Erro interno da API." });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function setup_(input) {
  const sheetId = extractSpreadsheetId_(input.sheetId || input.planilhaId || "");
  if (!sheetId) return { ok: false, error: "Informe um ID ou URL válida da planilha Google Sheets." };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    PropertiesService.getScriptProperties().setProperty(PORTAL.PROP_SHEET_ID, sheetId);
    const ss = SpreadsheetApp.openById(sheetId);
    Object.keys(PORTAL.SHEETS).forEach(function(name) { sheet_(name); });

    const users = readRows_("Usuarios");
    const hasAdmin = users.some(function(u) { return String(u.Perfil).toLowerCase() === "admin"; });

    let adminPadrao = false;
    let credenciais = null;
    if (!hasAdmin) {
      const now = new Date().toISOString();
      appendObject_("Usuarios", {
        ID: Utilities.getUuid(), Nome: "Administrador", Email: "admin@local",
        SenhaHash: sha256_("admin123"), Perfil: "admin", Ativo: true, CriadoEm: now
      });
      adminPadrao = true;
      credenciais = { email: "admin@local", senha: "admin123" };
    }

    return {
      ok: true, data: { mensagem: "instalado", planilha: ss.getName(), abas: Object.keys(PORTAL.SHEETS), adminPadrao: adminPadrao, credenciaisIniciais: credenciais }
    };
  } finally {
    lock.releaseLock();
  }
}

function logAction_(action, detail) {
  try {
    const user = Session.getActiveUser().getEmail() || "Sistema";
    appendObject_("Historico", {
      ID: Utilities.getUuid(),
      Data: new Date().toISOString(),
      Usuario: user,
      Acao: action,
      Detalhe: detail
    });
  } catch(e) { console.error("Erro ao salvar log:", e); }
}

function listHistory_(token) {
  const auth = requireUser_(token);
  if (!auth.ok) return auth;
  let rows = readRows_("Historico");
  rows.sort((a, b) => new Date(b.Data) - new Date(a.Data));
  const recent = rows.slice(0, 5).map(r => ({
    id: r.ID,
    data: r.Data,
    usuario: r.Usuario,
    acao: r.Acao,
    detalhe: r.Detalhe
  }));
  return { ok: true, data: recent };
}

function sendBulkEmail_(input) {
  const auth = requireAdmin_(input.token);
  if (!auth.ok) return auth;
  
  const emails = Array.isArray(input.emails) ? input.emails : [];
  const subject = String(input.subject || "").trim();
  const htmlBody = String(input.htmlBody || "").trim();

  if (!emails.length || !subject || !htmlBody) {
    return { ok: false, error: "Selecione pelo menos um usuário, preencha o assunto e a mensagem." };
  }

  try {
    // Envia em lotes (BCC) para proteger os e-mails dos usuários e evitar spam
    MailApp.sendEmail({
      to: auth.user.email, // Envia para o admin (você) como controle
      bcc: emails.join(','),
      subject: subject,
      htmlBody: htmlBody
    });
    logAction_("Disparo de E-mail", "Assunto: " + subject);
    return { ok: true, data: { mensagem: "E-mails disparados com sucesso!" } };
  } catch(e) {
    return { ok: false, error: "Falha ao enviar e-mail. Verifique sua cota de envio do Google. Erro: " + e.message };
  }
}

function login_(input) {
  const email = normalizeEmail_(input.email);
  const senha = String(input.senha || "");
  if (!email || !senha) return { ok: false, error: "Informe o e-mail e a senha." };

  const user = readRows_("Usuarios").find(function(u) {
    return normalizeEmail_(u.Email) === email && truthy_(u.Ativo);
  });
  if (!user || sha256_(senha) !== String(user.SenhaHash || "")) {
    return { ok: false, error: "Credenciais inválidas." };
  }

  const token = Utilities.getUuid() + "-" + Utilities.getUuid();
  const expiraEm = new Date(Date.now() + PORTAL.SESSION_HOURS * 60 * 60 * 1000).toISOString();
  const ua = String(input.userAgent || "").slice(0, 500);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    cleanupExpiredSessions_();
    appendObject_("Sessoes", { Token: token, Email: normalizeEmail_(user.Email), ExpiraEm: expiraEm, UserAgent: ua });
  } finally {
    lock.releaseLock();
  }

  return {
    ok: true, data: {
      token: token, nome: String(user.Nome || ""), email: normalizeEmail_(user.Email),
      perfil: String(user.Perfil || "user").toLowerCase(), favoritos: String(user.Favoritos || "[]"), expiraEm: expiraEm
    }
  };
}

function validateToken_(token) {
  const session = getSession_(token);
  if (!session) return { ok: false, error: "Sessão expirada ou inválida." };

  const user = readRows_("Usuarios").find(function(u) { return normalizeEmail_(u.Email) === normalizeEmail_(session.Email); });
  if (!user || !truthy_(user.Ativo)) {
    removeSession_(token);
    return { ok: false, error: "Usuário inativo ou inexistente." };
  }

  return {
    ok: true, data: {
      email: normalizeEmail_(user.Email), nome: String(user.Nome || ""),
      perfil: String(user.Perfil || "user").toLowerCase(), favoritos: String(user.Favoritos || "[]")
    }
  };
}

function logout_(token) {
  if (!token) return { ok: true, data: { mensagem: "Sessão encerrada." } };
  removeSession_(token);
  return { ok: true, data: { mensagem: "Sessão encerrada." } };
}

function listPages_(token) {
  const auth = requireUser_(token);
  if (!auth.ok) return auth;

  const pages = readRows_("Paginas").filter(function(p) { return truthy_(p.Ativo); });
  const result = pages.map(function(p) {
    const page = safePage_(p);
    if (auth.user.perfil === "admin") { page.podeVer = true; page.podeEditar = true; return page; }
    const permission = readRows_("Permissoes").find(function(r) {
      return normalizeEmail_(r.Email) === normalizeEmail_(auth.user.email) && String(r.PaginaID) === String(p.ID);
    });
    page.podeVer = Boolean(permission && truthy_(permission.PodeVer));
    page.podeEditar = Boolean(permission && truthy_(permission.PodeVer) && truthy_(permission.PodeEditar));
    return page;
  }).filter(function(p) { return p.podeVer; }).sort(function(a, b) { return Number(a.ordem || 0) - Number(b.ordem || 0); });

  const favRaw = String(auth.user.favoritos || "[]");
  let favoritos = [];
  try { favoritos = JSON.parse(favRaw); } catch (e) { favoritos = []; }
  return { ok: true, data: result, favoritos: Array.isArray(favoritos) ? favoritos.map(String) : [] };
}

/**
 * NOVO: cada página HTML chama esta ação (passando token + arquivo, ex.: "avarias.html")
 * para obter sua própria API, o link da planilha e se o usuário logado pode
 * ver/editar aquela página especificamente — em vez de ter o API_URL fixo no HTML.
 */
function getPageConfig_(input) {
  const auth = requireUser_(input.token);
  if (!auth.ok) return auth;

  const arquivo = String(input.arquivo || "").trim();
  if (!arquivo) return { ok: false, error: "Informe o arquivo da página (ex.: avarias.html)." };

  const page = readRows_("Paginas").find(function(p) {
    return String(p.Arquivo || "").trim() === arquivo;
  });
  if (!page || !truthy_(page.Ativo)) return { ok: false, error: "Página não encontrada ou inativa." };

  let podeVer, podeEditar;
  if (auth.user.perfil === "admin") {
    podeVer = true; podeEditar = true;
  } else {
    const permission = readRows_("Permissoes").find(function(r) {
      return normalizeEmail_(r.Email) === normalizeEmail_(auth.user.email) && String(r.PaginaID) === String(page.ID);
    });
    podeVer = Boolean(permission && truthy_(permission.PodeVer));
    podeEditar = Boolean(permission && truthy_(permission.PodeVer) && truthy_(permission.PodeEditar));
  }

  if (!podeVer) return { ok: false, error: "Você não tem permissão para acessar esta página." };

  return {
    ok: true,
    data: {
      id: String(page.ID || ""),
      nome: String(page.Nome || ""),
      arquivo: String(page.Arquivo || ""),
      api: String(page.API || ""),
      planilha: String(page.Planilha || ""),
      podeVer: podeVer,
      podeEditar: podeEditar
    }
  };
}

function saveFavorites_(input) {
  const auth = requireUser_(input.token);
  if (!auth.ok) return auth;
  const favs = Array.isArray(input.favoritos) ? input.favoritos.map(String).slice(0, 500) : [];
  const allowed = readRows_("Paginas").filter(function(p){return truthy_(p.Ativo);}).map(function(p){return String(p.ID);});
  const safe = favs.filter(function(id){return allowed.indexOf(id) !== -1;});
  updateObject_("Usuarios", "Email", normalizeEmail_(auth.user.email), {Favoritos: JSON.stringify(safe)});
  return {ok:true, data:safe};
}

function listUsers_(token) {
  const auth = requireAdmin_(token);
  if (!auth.ok) return auth;
  const data = readRows_("Usuarios").map(function(u) {
    return {
      id: String(u.ID || ""), nome: String(u.Nome || ""), email: normalizeEmail_(u.Email),
      perfil: String(u.Perfil || "user").toLowerCase(), ativo: truthy_(u.Ativo), criadoEm: String(u.CriadoEm || "")
    };
  });
  return { ok: true, data: data };
}

function saveUser_(input) {
  const auth = requireAdmin_(input.token);
  if (!auth.ok) return auth;

  const nome = String(input.nome || "").trim();
  const email = normalizeEmail_(input.email);
  const perfil = String(input.perfil || "user").toLowerCase();
  const senha = String(input.senha || "");
  const ativo = input.ativo === true || String(input.ativo).toLowerCase() === "true";

  if (!nome || !email) return { ok: false, error: "Nome e e-mail são obrigatórios." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email !== "admin@local") return { ok: false, error: "Informe um e-mail válido." };
  if (!["admin", "user"].includes(perfil)) return { ok: false, error: "Perfil inválido." };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const users = readRows_("Usuarios");
    const existing = input.id ? users.find(function(u) { return String(u.ID) === String(input.id); }) : null;

    if (input.id && !existing) return { ok: false, error: "Usuário não encontrado." };
    if (!existing && !senha) return { ok: false, error: "A senha é obrigatória para novos usuários." };
    if (senha && senha.length < 8) return { ok: false, error: "A senha deve ter pelo menos 8 caracteres." };

    const duplicate = users.some(function(u) { return normalizeEmail_(u.Email) === email && String(u.ID) !== String(input.id || ""); });
    if (duplicate) return { ok: false, error: "Já existe um usuário com esse e-mail." };

    if (existing && normalizeEmail_(existing.Email) === normalizeEmail_(auth.user.email) && perfil !== "admin") {
      return { ok: false, error: "Você não pode remover seu próprio perfil de administrador." };
    }

    const row = {
      ID: existing ? String(existing.ID) : Utilities.getUuid(),
      Nome: nome, Email: email,
      SenhaHash: senha ? sha256_(senha) : String(existing ? existing.SenhaHash : ""),
      Perfil: perfil, Ativo: ativo,
      CriadoEm: existing ? String(existing.CriadoEm || new Date().toISOString()) : new Date().toISOString()
    };

    if (existing) {
      updateObject_("Usuarios", "ID", row.ID, row);
      logAction_("Editar Usuário", email);
    } else {
      appendObject_("Usuarios", row);
      logAction_("Criar Usuário", email);
    }

    return { ok: true, data: { mensagem: "Usuário salvo.", id: row.ID } };
  } finally {
    lock.releaseLock();
  }
}

function deleteUser_(input) {
  const auth = requireAdmin_(input.token);
  if (!auth.ok) return auth;
  const id = String(input.id || "");
  const users = readRows_("Usuarios");
  const target = users.find(function(u) { return String(u.ID) === id; });
  if (!target) return { ok: false, error: "Usuário não encontrado." };
  if (normalizeEmail_(target.Email) === normalizeEmail_(auth.user.email)) return { ok: false, error: "Você não pode excluir sua própria conta." };
  if (String(target.Perfil).toLowerCase() === "admin" && users.filter(function(u) { return String(u.Perfil).toLowerCase() === "admin" && truthy_(u.Ativo); }).length <= 1) {
    return { ok: false, error: "Não é possível excluir o último administrador ativo." };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    deleteRowsMatching_("Usuarios", "ID", id);
    deleteRowsMatching_("Permissoes", "Email", normalizeEmail_(target.Email));
    deleteRowsMatching_("Sessoes", "Email", normalizeEmail_(target.Email));
    logAction_("Excluir Usuário", normalizeEmail_(target.Email));
    return { ok: true, data: { mensagem: "Usuário excluído." } };
  } finally {
    lock.releaseLock();
  }
}

function listPagesAdmin_(token) {
  const auth = requireAdmin_(token);
  if (!auth.ok) return auth;
  const data = readRows_("Paginas").map(safePage_).sort(function(a, b) { return Number(a.ordem || 0) - Number(b.ordem || 0); });
  return { ok: true, data: data };
}

function savePage_(input) {
  const auth = requireAdmin_(input.token);
  if (!auth.ok) return auth;

  const nome = String(input.nome || "").trim();
  const arquivo = String(input.arquivo || "").trim();
  const url = String(input.url || "").trim();
  const icone = String(input.icone || "📄").trim();
  const ordem = Number(input.ordem || 0);
  const menu = String(input.menu || "Menu principal").trim() || "Menu principal";
  const submenu = String(input.submenu || "").trim();
  const descricao = String(input.descricao || "").trim();
  const api = String(input.api || "").trim(); // NOVO
  const planilha = String(input.planilha || "").trim(); // NOVO
  const ativo = input.ativo === true || String(input.ativo).toLowerCase() === "true";

  if (!nome) return { ok: false, error: "O nome da página é obrigatório." };
  if (!arquivo && !url) return { ok: false, error: "Informe o arquivo ou uma URL." };
  if (url && !/^https?:\/\//i.test(url)) return { ok: false, error: "A URL deve começar com http:// ou https://." };
  if (arquivo && /(^|[\\/])\.\.([\\/]|$)/.test(arquivo)) return { ok: false, error: "O caminho do arquivo não é permitido." };
  if (api && !/^https?:\/\//i.test(api)) return { ok: false, error: "A API deve começar com http:// ou https://." };
  if (planilha && !/^https?:\/\//i.test(planilha)) return { ok: false, error: "O link da planilha deve começar com http:// ou https://." };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const pages = readRows_("Paginas");
    const existing = input.id ? pages.find(function(p) { return String(p.ID) === String(input.id); }) : null;
    if (input.id && !existing) return { ok: false, error: "Página não encontrada." };

    const row = {
      ID: existing ? String(existing.ID) : Utilities.getUuid(),
      Nome: nome, Arquivo: arquivo, URL: url, Icone: icone, Ordem: ordem, Ativo: ativo, Menu: menu, Submenu: submenu, Descricao: descricao,
      API: api, Planilha: planilha // NOVO
    };
    if (existing) {
      updateObject_("Paginas", "ID", row.ID, row);
      logAction_("Editar Página", nome);
    } else {
      appendObject_("Paginas", row);
      logAction_("Criar Página", nome);
    }

    return { ok: true, data: { mensagem: "Página salva.", id: row.ID } };
  } finally {
    lock.releaseLock();
  }
}

function deletePage_(input) {
  const auth = requireAdmin_(input.token);
  if (!auth.ok) return auth;
  const id = String(input.id || "");
  const page = readRows_("Paginas").find(function(p) { return String(p.ID) === id; });
  if (!page) return { ok: false, error: "Página não encontrada." };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    deleteRowsMatching_("Paginas", "ID", id);
    deleteRowsMatching_("Permissoes", "PaginaID", id);
    logAction_("Excluir Página", page.Nome);
    return { ok: true, data: { mensagem: "Página excluída." } };
  } finally {
    lock.releaseLock();
  }
}

function listMenus_(token) {
  const auth = requireUser_(token);
  if (!auth.ok) return auth;
  const data = readRows_("Menus").map(m => ({
    id: String(m.ID || ""), nome: String(m.Nome || ""), icone: String(m.Icone || "▦"), ordem: Number(m.Ordem || 0)
  })).sort((a,b) => a.ordem - b.ordem);
  return { ok: true, data: data };
}

function saveMenu_(input) {
  const auth = requireAdmin_(input.token);
  if (!auth.ok) return auth;
  const nome = String(input.nome || "").trim();
  const icone = String(input.icone || "▦").trim();
  const ordem = Number(input.ordem || 0);
  if (!nome) return { ok: false, error: "Informe o nome do menu." };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const menus = readRows_("Menus");
    const existing = input.id ? menus.find(m => String(m.ID) === String(input.id)) : null;
    const row = { ID: existing ? existing.ID : Utilities.getUuid(), Nome: nome, Icone: icone, Ordem: ordem };
    if (existing) updateObject_("Menus", "ID", row.ID, row);
    else appendObject_("Menus", row);
    return { ok: true, data: { mensagem: "Menu salvo." } };
  } finally {
    lock.releaseLock();
  }
}

function deleteMenu_(input) {
  const auth = requireAdmin_(input.token);
  if (!auth.ok) return auth;
  deleteRowsMatching_("Menus", "ID", String(input.id || ""));
  return { ok: true, data: { mensagem: "Menu excluído." } };
}

function listPermissions_(input) {
  const auth = requireAdmin_(input.token);
  if (!auth.ok) return auth;
  const email = normalizeEmail_(input.email);
  if (!email) return { ok: false, error: "Informe o e-mail do usuário." };

  const pages = readRows_("Paginas").map(function(p) {
    const permission = readRows_("Permissoes").find(function(r) {
      return normalizeEmail_(r.Email) === email && String(r.PaginaID) === String(p.ID);
    });
    return {
      paginaId: String(p.ID), nome: String(p.Nome || ""), arquivo: String(p.Arquivo || ""),
      ativo: truthy_(p.Ativo), podeVer: Boolean(permission && truthy_(permission.PodeVer)),
      podeEditar: Boolean(permission && truthy_(permission.PodeEditar)), permissaoId: permission ? String(permission.ID || "") : ""
    };
  });
  return { ok: true, data: pages };
}

function savePermission_(input) {
  const auth = requireAdmin_(input.token);
  if (!auth.ok) return auth;

  const email = normalizeEmail_(input.email);
  const paginaId = String(input.paginaId || input.PaginaID || "");
  const podeVer = input.podeVer === true || String(input.podeVer).toLowerCase() === "true";
  const podeEditar = input.podeEditar === true || String(input.podeEditar).toLowerCase() === "true";

  if (!email || !paginaId) return { ok: false, error: "Usuário e página são obrigatórios." };
  if (podeEditar && !podeVer) return { ok: false, error: "Para editar, o usuário também precisa poder visualizar." };

  const userExists = readRows_("Usuarios").some(function(u) { return normalizeEmail_(u.Email) === email; });
  const pageExists = readRows_("Paginas").some(function(p) { return String(p.ID) === paginaId; });
  if (!userExists) return { ok: false, error: "Usuário não encontrado." };
  if (!pageExists) return { ok: false, error: "Página não encontrada." };

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const permissions = readRows_("Permissoes");
    const existing = permissions.find(function(r) { return normalizeEmail_(r.Email) === email && String(r.PaginaID) === paginaId; });

    if (!podeVer && !podeEditar) {
      if (existing) deleteRowsMatching_("Permissoes", "ID", String(existing.ID));
      return { ok: true, data: { mensagem: "Permissão removida." } };
    }

    const row = { ID: existing ? String(existing.ID) : Utilities.getUuid(), Email: email, PaginaID: paginaId, PodeVer: podeVer, PodeEditar: podeEditar };
    if (existing) updateObject_("Permissoes", "ID", row.ID, row);
    else appendObject_("Permissoes", row);
    return { ok: true, data: { mensagem: "Permissão salva." } };
  } finally {
    lock.releaseLock();
  }
}

function deletePermission_(input) {
  const auth = requireAdmin_(input.token);
  if (!auth.ok) return auth;
  deleteRowsMatching_("Permissoes", "ID", String(input.id || ""));
  return { ok: true, data: { mensagem: "Permissão excluída." } };
}

function listRequests_(token) {
  const auth = requireAdmin_(token);
  if (!auth.ok) return auth;
  const data = readRows_("Solicitacoes").map(r => ({
    id: String(r.ID || ""), nome: String(r.Nome || ""), email: String(r.Email || ""), criadoEm: String(r.CriadoEm || "")
  }));
  return { ok: true, data: data };
}

function approveRequest_(input) {
  const auth = requireAdmin_(input.token);
  if (!auth.ok) return auth;
  const id = String(input.id || "");
  const sh = sheet_("Solicitacoes");
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const idIdx = headers.indexOf("ID");
  const row = values.find(r => String(r[idIdx]) === id);
  if(!row) return { ok: false, error: "Solicitação não encontrada." };

  const nome = row[headers.indexOf("Nome")];
  const email = normalizeEmail_(row[headers.indexOf("Email")]);
  const hash = row[headers.indexOf("SenhaHash")];

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const users = readRows_("Usuarios");
    if(users.some(u => normalizeEmail_(u.Email) === email)) {
      return { ok: false, error: "Este e-mail já possui uma conta ativa." };
    }
    appendObject_("Usuarios", {
      ID: Utilities.getUuid(), Nome: nome, Email: email, SenhaHash: hash, Perfil: "user", Ativo: true, CriadoEm: new Date().toISOString()
    });
    deleteRowsMatching_("Solicitacoes", "ID", id);
    logAction_("Aprovar Acesso", email);
    return { ok: true, data: { mensagem: "Solicitação aprovada." } };
  } finally {
    lock.releaseLock();
  }
}

function deleteRequest_(input) {
  const auth = requireAdmin_(input.token);
  if (!auth.ok) return auth;
  deleteRowsMatching_("Solicitacoes", "ID", String(input.id || ""));
  return { ok: true, data: { mensagem: "Solicitação removida." } };
}

function getConfigs_(token) {
  const auth = requireUser_(token);
  if (!auth.ok) return auth;
  const rows = readRows_("Configuracoes");
  const out = {};
  rows.forEach(r => { out[r.Chave] = r.Valor; });
  return { ok: true, data: out };
}

function saveConfigs_(input) {
  const auth = requireAdmin_(input.token);
  if (!auth.ok) return auth;
  const configs = input.configs || {};
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = sheet_("Configuracoes");
    const values = sh.getDataRange().getValues();
    const headers = values[0];
    const chaveIdx = headers.indexOf("Chave");
    Object.keys(configs).forEach(k => {
      let found = false;
      for(let i=1; i<values.length; i++) {
        if(String(values[i][chaveIdx]) === k) {
          sh.getRange(i+1, headers.indexOf("Valor")+1).setValue(configs[k]);
          found = true;
          break;
        }
      }
      if(!found) sh.appendRow([k, configs[k]]);
    });
    return { ok: true, data: { mensagem: "Configurações salvas." } };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------- Autorização ------------------------- */
function requireUser_(token) {
  const validation = validateToken_(token);
  if (!validation.ok) return validation;
  return { ok: true, user: validation.data };
}

function requireAdmin_(token) {
  const auth = requireUser_(token);
  if (!auth.ok) return auth;
  if (String(auth.user.perfil).toLowerCase() !== "admin") return { ok: false, error: "Acesso restrito ao administrador." };
  return auth;
}

function getSession_(token) {
  if (!token) return null;
  const sessions = readRows_("Sessoes");
  const session = sessions.find(function(s) { return String(s.Token) === String(token); });
  if (!session) return null;
  const expiry = new Date(session.ExpiraEm).getTime();
  if (!Number.isFinite(expiry) || expiry <= Date.now()) {
    removeSession_(token);
    return null;
  }
  return session;
}

function cleanupExpiredSessions_() {
  const sessions = readRows_("Sessoes");
  const now = Date.now();
  sessions.forEach(function(s) {
    const expiry = new Date(s.ExpiraEm).getTime();
    if (!Number.isFinite(expiry) || expiry <= now) deleteRowsMatching_("Sessoes", "Token", String(s.Token));
  });
}

function removeSession_(token) {
  deleteRowsMatching_("Sessoes", "Token", String(token || ""));
}

/* ---------------------- Google Sheets helpers ------------------ */
function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(PORTAL.PROP_SHEET_ID) || "1CZyuYHPbRQLlIXyqe7XjYdXkIG7RqLtpHAKLhCc3HzU";
  return SpreadsheetApp.openById(id);
}

function sheet_(name) {
  const ss = spreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (PORTAL.SHEETS[name]) {
      const headers = PORTAL.SHEETS[name];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

function readRows_(name) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).filter(function(row) { return row.some(function(value) { return value !== "" && value !== null; }); }).map(function(row) {
    const obj = {};
    headers.forEach(function(header, i) { obj[header] = row[i]; });
    return obj;
  });
}

function appendObject_(name, obj) {
  const sh = sheet_(name);
  const headers = PORTAL.SHEETS[name];
  sh.appendRow(headers.map(function(header) { return Object.prototype.hasOwnProperty.call(obj, header) ? obj[header] : ""; }));
}

function updateObject_(name, key, value, obj) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  if (!values.length) throw new Error("Aba sem cabeçalhos.");
  const headers = values[0].map(String);
  const keyIndex = headers.indexOf(key);
  if (keyIndex < 0) throw new Error("Coluna não encontrada: " + key);

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][keyIndex]) === String(value)) {
      const updated = headers.map(function(header, j) { return Object.prototype.hasOwnProperty.call(obj, header) ? obj[header] : values[i][j]; });
      sh.getRange(i + 1, 1, 1, headers.length).setValues([updated]);
      return true;
    }
  }
  return false;
}

function deleteRowsMatching_(name, key, value) {
  if (!value) return;
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return;
  const headers = values[0].map(String);
  const index = headers.indexOf(key);
  if (index < 0) throw new Error("Coluna não encontrada: " + key);

  for (let i = values.length - 1; i >= 1; i--) {
    if (String(values[i][index]) === String(value)) sh.deleteRow(i + 1);
  }
}

function safePage_(p) {
  return {
    id: String(p.ID || ""), nome: String(p.Nome || ""), arquivo: String(p.Arquivo || ""),
    url: String(p.URL || ""), icone: String(p.Icone || "📄"), ordem: Number(p.Ordem || 0),
    menu: String(p.Menu || "Menu principal"), submenu: String(p.Submenu || ""),
    descricao: String(p.Descricao || ""), api: String(p.API || ""), planilha: String(p.Planilha || ""),
    ativo: truthy_(p.Ativo)
  };
}

function extractSpreadsheetId_(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(text)) return text;
  return "";
}

function normalizeEmail_(value) {
  return String(value || "").trim().toLowerCase();
}

function truthy_(value) {
  return value === true || String(value).trim().toLowerCase() === "true" || String(value).trim() === "1";
}

function sha256_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8);
  return bytes.map(function(byte) {
    const unsigned = (byte + 256) % 256;
    return unsigned.toString(16).padStart(2, "0");
  }).join("");
}

function requestAccess_(input) {
  const email = String(input.email || "").trim().toLowerCase();
  const nome = String(input.nome || "").trim().slice(0, 120);
  const senha = String(input.senha || "");
  
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Informe um e-mail válido." };
  if (senha.length < 8) return { ok: false, error: "A senha deve ter pelo menos 8 caracteres." };

  const sh = sheet_("Solicitacoes");
  const users = readRows_("Usuarios");
  if (users.some(u => String(u.Email || "").toLowerCase() === email && String(u.Ativo).toLowerCase() !== "false")) {
    return { ok: false, error: "Este e-mail já possui uma conta. Entre em contato com o administrador." };
  }

  const last = sh.getLastRow();
  if (last > 1) {
    const emails = sh.getRange(2, 3, last - 1, 1).getDisplayValues().flat().map(v => String(v).toLowerCase());
    if (emails.includes(email)) return { ok: true, message: "Sua solicitação já está registrada." };
  }
  
  sh.appendRow([Utilities.getUuid(), nome || "Não informado", email, "PENDENTE", new Date(), sha256_(senha)]);
  return { ok: true, message: "Solicitação registrada." };
}
