const STORAGE_KEY = "organizador-clientes-v1";
const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];
const MONTHS_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const ICONS = {
  inicio: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/></svg>`,
  clientes: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><path d="M4 19c.6-3 2.6-5 5-5s4.4 2 5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16.2 14.2c2.2.3 3.8 2.1 4.3 4.8"/></svg>`,
  pagos: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/></svg>`,
  tareas: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></svg>`,
};

const state = {
  view: "inicio",
  clients: [],
  payments: [],
  tasks: [],
  filters: { nombre: "", contratoFrom: "", contratoTo: "", pagoFrom: "", pagoTo: "" },
  paymentsPeriod: currentPeriod(),
  paymentsQuery: "",
  taskFilter: "pendientes",
  taskClientId: "",
  sheet: null,
};

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function currentPeriod(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function periodLabel(period) {
  const [year, month] = period.split("-");
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

function shiftPeriod(period, delta) {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return currentPeriod(date);
}

function todayISO() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  const [year, month, day] = value.split("-");
  if (!day) return `${MONTHS_SHORT[Number(month) - 1]} ${year}`;
  return `${day}/${month}/${year}`;
}

function formatMoney(value) {
  const amount = Number(value) || 0;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(amount);
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Buen día";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function longDate(date = new Date()) {
  return date.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    state.clients = data.clients || [];
    state.payments = data.payments || [];
    state.tasks = data.tasks || [];
  } catch (error) {
    console.warn("No se pudo leer localStorage", error);
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    clients: state.clients,
    payments: state.payments,
    tasks: state.tasks,
  }));
}

function clientById(id) {
  return state.clients.find((client) => client.id === id);
}

function paymentFor(clientId, period) {
  return state.payments.find((payment) => payment.clientId === clientId && payment.period === period);
}

function refreshLastPayment(clientId) {
  const client = clientById(clientId);
  if (!client) return;
  const paid = state.payments
    .filter((payment) => payment.clientId === clientId && payment.status === "pagado" && payment.paidAt)
    .sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));
  client.ultimoPago = paid[0]?.paidAt || "";
}

function clientsForPeriod(period) {
  return state.clients.filter((client) => !client.fechaContrato || client.fechaContrato.slice(0, 7) <= period);
}

function filteredClients() {
  const { nombre, contratoFrom, contratoTo, pagoFrom, pagoTo } = state.filters;
  const query = nombre.trim().toLowerCase();
  return [...state.clients]
    .filter((client) => {
      if (query && !`${client.nombre} ${client.sistema}`.toLowerCase().includes(query)) return false;
      if (contratoFrom && (!client.fechaContrato || client.fechaContrato < contratoFrom)) return false;
      if (contratoTo && (!client.fechaContrato || client.fechaContrato > contratoTo)) return false;
      if (pagoFrom && (!client.ultimoPago || client.ultimoPago < pagoFrom)) return false;
      if (pagoTo && (!client.ultimoPago || client.ultimoPago > pagoTo)) return false;
      return true;
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

function activeFiltersCount() {
  const { contratoFrom, contratoTo, pagoFrom, pagoTo } = state.filters;
  return [contratoFrom, contratoTo, pagoFrom, pagoTo].filter(Boolean).length;
}

function monthGrid(client) {
  const now = new Date();
  const cells = [];
  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const period = currentPeriod(date);
    const payment = paymentFor(client.id, period);
    const contracted = !client.fechaContrato || client.fechaContrato.slice(0, 7) <= period;
    let kind = "";
    if (contracted && payment?.status === "pagado") kind = "paid";
    else if (contracted && (payment?.status === "pendiente" || period <= currentPeriod())) kind = "due";
    cells.push({ period, label: MONTHS_SHORT[date.getMonth()], kind });
  }
  return cells;
}

function renderTopbar() {
  const titles = {
    inicio: { eye: "Cuaderno", title: greeting() },
    clientes: { eye: "Agenda", title: "Clientes" },
    pagos: { eye: "Cobros", title: "Pagos" },
    tareas: { eye: "Pedidos", title: "Tareas" },
  };
  const current = titles[state.view];
  document.getElementById("topbar").innerHTML = `
    <p class="eyebrow">${current.eye}</p>
    <h1>${current.title}</h1>
  `;
}

function renderNav() {
  const items = [
    ["inicio", "Inicio"],
    ["clientes", "Clientes"],
    ["pagos", "Pagos"],
    ["tareas", "Tareas"],
  ];
  document.getElementById("nav").innerHTML = items.map(([id, label]) => `
    <button type="button" data-nav="${id}" class="${state.view === id ? "active" : ""}">
      ${ICONS[id]}
      <span>${label}</span>
    </button>
  `).join("");
}

function renderInicio() {
  const period = currentPeriod();
  const monthClients = clientsForPeriod(period);
  const paid = monthClients.filter((client) => paymentFor(client.id, period)?.status === "pagado");
  const pending = monthClients.filter((client) => paymentFor(client.id, period)?.status !== "pagado");
  const paidAmount = paid.reduce((sum, client) => sum + Number(paymentFor(client.id, period)?.amount || client.monto || 0), 0);
  const pendingAmount = pending.reduce((sum, client) => sum + Number(client.monto || 0), 0);
  const openTasks = state.tasks.filter((task) => !task.completed);
  const ratio = monthClients.length ? Math.round((paid.length / monthClients.length) * 100) : 0;

  const pendingRows = pending.slice(0, 4).map((client) => `
    <article class="card row" data-open-client="${client.id}">
      <div class="mini">${escapeHtml(initials(client.nombre))}</div>
      <div class="grow">
        <div class="ellipsis"><strong>${escapeHtml(client.nombre)}</strong></div>
        <div class="muted ellipsis">${escapeHtml(client.sistema) || "Sin sistema"} · ${formatMoney(client.monto)}</div>
      </div>
      <span class="status-pill no">Aún no pagó</span>
    </article>
  `).join("") || `<div class="card empty"><strong>Mes al día</strong>Nadie tiene el pago pendiente este mes.</div>`;

  const taskRows = openTasks.slice(0, 4).map((task) => {
    const client = clientById(task.clientId);
    return `
      <article class="card" data-nav="tareas">
        <div class="ellipsis"><strong>${escapeHtml(task.titulo)}</strong></div>
        <div class="muted">${escapeHtml(client?.nombre || "Cliente")} · Pedido el ${formatDate(task.requestedAt)}</div>
      </article>
    `;
  }).join("") || `<div class="card empty"><strong>Sin pendientes</strong>No hay modificaciones abiertas.</div>`;

  document.getElementById("main").innerHTML = `
    <p class="hero-date">${longDate()}</p>
    <section class="stats">
      <article class="stat card"><span>Aún no pagaron</span><b>${pending.length}</b></article>
      <article class="stat card"><span>Cobrado este mes</span><b>${formatMoney(paidAmount)}</b></article>
      <article class="stat card"><span>Por cobrar</span><b>${formatMoney(pendingAmount)}</b></article>
      <article class="stat card"><span>Tareas abiertas</span><b>${openTasks.length}</b></article>
    </section>
    <div class="card">
      <div class="muted">${paid.length} de ${monthClients.length} clientes pagaron ${periodLabel(period).toLowerCase()}</div>
      <div class="progress"><span style="width:${ratio}%"></span></div>
    </div>
    <div class="section-head">
      <h2>Pagos pendientes</h2>
      <button class="linkish" data-nav="pagos" type="button">Ver mes</button>
    </div>
    <div class="stack">${pendingRows}</div>
    <div class="section-head mods">
      <h2>Modificaciones</h2>
      <button class="linkish" data-nav="tareas" type="button">Ver tareas</button>
    </div>
    <div class="stack stack-mods">${taskRows}</div>
    <div class="card">
      <strong>Respaldo local</strong>
      <p class="muted">Todo queda en este celular, en el navegador. En Chrome o Safari: menú → Agregar a pantalla de inicio. Exportá una copia por las dudas.</p>
      <div class="backup-row">
        <button class="btn ghost" data-export type="button">Exportar</button>
        <button class="btn ghost" data-import type="button">Importar</button>
      </div>
    </div>
  `;
}

function renderClientes() {
  const clients = filteredClients();
  const filtersOn = activeFiltersCount();
  const cards = clients.map((client, index) => {
    const current = paymentFor(client.id, currentPeriod());
    const paid = current?.status === "pagado";
    return `
      <article class="card client-card" data-open-client="${client.id}" style="animation-delay:${index * 0.04}s">
        <div class="mini">${escapeHtml(initials(client.nombre))}</div>
        <div class="grow">
          <div class="ellipsis"><strong>${escapeHtml(client.nombre)}</strong></div>
          <div class="muted ellipsis">${escapeHtml(client.sistema) || "Sin sistema"} · ${formatMoney(client.monto)}</div>
          <div class="dates">
            <span>Contrato ${formatDate(client.fechaContrato)}</span>
            <span>Último pago ${formatDate(client.ultimoPago)}</span>
          </div>
        </div>
        <span class="status-pill ${paid ? "ok" : "no"}">${paid ? "Pagó" : "Pendiente"}</span>
      </article>
    `;
  }).join("") || `<div class="card empty"><strong>Sin clientes</strong>Agregá el primero para empezar a registrar pagos y pedidos.</div>`;

  document.getElementById("main").innerHTML = `
    <div class="search-row">
      <input class="search" data-filter-nombre type="search" placeholder="Buscar por nombre o sistema" value="${escapeHtml(state.filters.nombre)}" />
      <button class="icon-btn" data-open-filters type="button" aria-label="Filtros">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
      </button>
    </div>
    <div class="chips">
      <span class="chip ${filtersOn ? "on" : ""}">${filtersOn ? `${filtersOn} filtros` : "Contrato y último pago"}</span>
      <span class="chip">${state.clients.length} ${state.clients.length === 1 ? "cliente" : "clientes"}</span>
    </div>
    <div class="stack">${cards}</div>
    <button class="fab" data-new-client type="button">+ Cliente</button>
  `;
}

function renderPagos() {
  const period = state.paymentsPeriod;
  const query = state.paymentsQuery.trim().toLowerCase();
  const clients = clientsForPeriod(period)
    .filter((client) => !query || client.nombre.toLowerCase().includes(query) || client.sistema.toLowerCase().includes(query))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const paidCount = clients.filter((client) => paymentFor(client.id, period)?.status === "pagado").length;

  const rows = clients.map((client) => {
    const payment = paymentFor(client.id, period);
    const paid = payment?.status === "pagado";
    return `
      <article class="card pay-row">
        <div>
          <div class="ellipsis"><strong>${escapeHtml(client.nombre)}</strong></div>
          <div class="muted">${escapeHtml(client.sistema) || "Sin sistema"} · ${formatMoney(payment?.amount || client.monto)}</div>
          <div class="dates">${paid ? `Registrado el ${formatDate(payment.paidAt)}` : "Todavía no hay registro este mes"}</div>
        </div>
        <div class="pay-actions">
          ${paid ? `<span class="stamp">Pagado<br>${formatDate(payment.paidAt)}</span>` : ""}
          <button class="toggle ${paid ? "paid" : "pending"}" data-toggle-pay="${client.id}">
            ${paid ? "Pagó" : "Aún no pagó"}
          </button>
        </div>
      </article>
    `;
  }).join("") || `<div class="card empty"><strong>Nada para este mes</strong>No hay clientes con contrato vigente en ${periodLabel(period).toLowerCase()}.</div>`;

  document.getElementById("main").innerHTML = `
    <div class="month-bar">
      <button class="icon-btn ghost" data-shift-month="-1" type="button" aria-label="Mes anterior">‹</button>
      <h2>${periodLabel(period)}</h2>
      <button class="icon-btn ghost" data-shift-month="1" type="button" aria-label="Mes siguiente">›</button>
    </div>
    <input class="search" data-pay-query type="search" placeholder="Filtrar clientes de este mes" value="${escapeHtml(state.paymentsQuery)}" />
    <div class="card" style="margin-top:12px">
      ${paidCount} de ${clients.length} marcados como pagados
      <div class="progress"><span style="width:${clients.length ? (paidCount / clients.length) * 100 : 0}%"></span></div>
    </div>
    <div class="stack" style="margin-top:12px">${rows}</div>
  `;
}

function renderTareas() {
  const clientFilter = state.taskClientId;
  let tasks = [...state.tasks].sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));
  if (state.taskFilter === "pendientes") tasks = tasks.filter((task) => !task.completed);
  if (state.taskFilter === "hechas") tasks = tasks.filter((task) => task.completed);
  if (clientFilter) tasks = tasks.filter((task) => task.clientId === clientFilter);

  const options = state.clients
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
    .map((client) => `<option value="${client.id}" ${client.id === clientFilter ? "selected" : ""}>${escapeHtml(client.nombre)}</option>`)
    .join("");

  const list = tasks.map((task) => {
    const client = clientById(task.clientId);
    return `
      <article class="card task ${task.completed ? "done-text" : ""}">
        <button class="check ${task.completed ? "done" : ""}" data-toggle-task="${task.id}" type="button" aria-label="Tachar tarea">
          ${task.completed ? "✓" : ""}
        </button>
        <div>
          <div class="title"><strong>${escapeHtml(task.titulo)}</strong></div>
          <div class="muted">${escapeHtml(client?.nombre || "Cliente")} · ${escapeHtml(task.detalle || "Sin detalle")}</div>
          <div class="dates">
            <span>Pedido el ${formatDate(task.requestedAt)}</span>
            ${task.completed ? `<span>Hecho el ${formatDate(task.completedAt)}</span>` : "<span>Pendiente</span>"}
          </div>
        </div>
      </article>
    `;
  }).join("") || `<div class="card empty"><strong>Nada por acá</strong>Registrá una solicitud de modificación para seguirla con fechas.</div>`;

  document.getElementById("main").innerHTML = `
    <div class="chips">
      <button class="chip ${state.taskFilter === "pendientes" ? "on" : ""}" data-task-filter="pendientes" type="button">Pendientes</button>
      <button class="chip ${state.taskFilter === "hechas" ? "on" : ""}" data-task-filter="hechas" type="button">Hechas</button>
      <button class="chip ${state.taskFilter === "todas" ? "on" : ""}" data-task-filter="todas" type="button">Todas</button>
    </div>
    <div class="field">
      <select data-task-client>
        <option value="">Todos los clientes</option>
        ${options}
      </select>
    </div>
    <div class="stack stack-mods">${list}</div>
    <button class="fab" data-new-task type="button">+ Solicitud</button>
  `;
}

function renderSheet() {
  const root = document.getElementById("sheet");
  const sheet = state.sheet;
  if (!sheet) {
    root.innerHTML = "";
    return;
  }

  if (sheet.type === "filters") {
    const f = state.filters;
    root.innerHTML = overlay(`
      <div class="sheet-head">
        <h2>Filtros</h2>
        <button class="linkish" data-dismiss-sheet type="button">Cerrar</button>
      </div>
      <div class="grid-2">
        <div class="field"><label>Contrato desde</label><input type="date" name="contratoFrom" value="${f.contratoFrom}" /></div>
        <div class="field"><label>Contrato hasta</label><input type="date" name="contratoTo" value="${f.contratoTo}" /></div>
        <div class="field"><label>Último pago desde</label><input type="date" name="pagoFrom" value="${f.pagoFrom}" /></div>
        <div class="field"><label>Último pago hasta</label><input type="date" name="pagoTo" value="${f.pagoTo}" /></div>
      </div>
      <div class="actions">
        <button class="btn ghost" data-clear-filters type="button">Limpiar</button>
        <button class="btn copper wide" data-apply-filters type="button">Aplicar</button>
      </div>
    `, "Filtros de clientes");
    return;
  }

  if (sheet.type === "client-form") {
    const client = sheet.id ? clientById(sheet.id) : {
      nombre: "", sistema: "", monto: "", fechaContrato: todayISO(), notas: "",
    };
    const sistemas = [...new Set(state.clients.map((item) => item.sistema).filter(Boolean))];
    root.innerHTML = overlay(`
      <div class="sheet-head">
        <h2>${sheet.id ? "Editar cliente" : "Nuevo cliente"}</h2>
        <button class="linkish" data-dismiss-sheet type="button">Cerrar</button>
      </div>
      <form data-save-client="${sheet.id || ""}">
        <div class="field"><label>Nombre</label><input name="nombre" required value="${escapeHtml(client.nombre)}" /></div>
        <div class="field">
          <label>Sistema</label>
          <input name="sistema" list="sistemas" value="${escapeHtml(client.sistema)}" />
          <datalist id="sistemas">${sistemas.map((item) => `<option value="${escapeHtml(item)}">`).join("")}</datalist>
        </div>
        <div class="grid-2">
          <div class="field"><label>Pago mensual</label><input name="monto" type="number" min="0" inputmode="decimal" value="${escapeHtml(client.monto)}" /></div>
          <div class="field"><label>Fecha de contrato</label><input name="fechaContrato" type="date" value="${client.fechaContrato || ""}" /></div>
        </div>
        <div class="field"><label>Notas</label><textarea name="notas" placeholder="Detalles, accesos, acuerdos...">${escapeHtml(client.notas || "")}</textarea></div>
        <button class="btn copper wide" type="submit">Guardar</button>
      </form>
    `, "Formulario de cliente", true);
    return;
  }

  if (sheet.type === "client-detail") {
    const client = clientById(sheet.id);
    if (!client) {
      root.innerHTML = "";
      return;
    }
    const tasks = state.tasks.filter((task) => task.clientId === client.id).sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));
    const months = monthGrid(client).map((cell) => `
      <div class="month-cell ${cell.kind}">${cell.label}</div>
    `).join("");
    const taskList = tasks.slice(0, 6).map((task) => `
      <div class="muted">${task.completed ? "✓" : "○"} ${escapeHtml(task.titulo)} · ${formatDate(task.requestedAt)}</div>
    `).join("") || `<div class="muted">Todavía no pidió modificaciones.</div>`;
    root.innerHTML = overlay(`
      <div class="sheet-head">
        <h2>${escapeHtml(client.nombre)}</h2>
        <button class="linkish" data-edit-client="${client.id}" type="button">Editar</button>
      </div>
      <div class="detail-kv">
        <div class="kv"><span>Sistema</span><b>${escapeHtml(client.sistema) || "—"}</b></div>
        <div class="kv"><span>Pago</span><b>${formatMoney(client.monto)}</b></div>
        <div class="kv"><span>Contrato</span><b>${formatDate(client.fechaContrato)}</b></div>
        <div class="kv"><span>Último pago</span><b>${formatDate(client.ultimoPago)}</b></div>
      </div>
      ${client.notas ? `<div class="card"><div class="muted">Notas</div>${escapeHtml(client.notas)}</div>` : ""}
      <div class="section-head"><h2>Pagos recientes</h2></div>
      <div class="months">${months}</div>
      <div class="section-head"><h2>Solicitudes</h2></div>
      <div class="card stack stack-mods">${taskList}</div>
      <div class="actions">
        <button class="btn ghost" data-new-task="${client.id}" type="button">Pedir cambio</button>
        <button class="btn danger" data-delete-client="${client.id}" type="button">Eliminar</button>
      </div>
    `, client.nombre, true);
    return;
  }

  if (sheet.type === "task-form") {
    const preset = sheet.clientId || "";
    const options = state.clients
      .slice()
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
      .map((client) => `<option value="${client.id}" ${client.id === preset ? "selected" : ""}>${escapeHtml(client.nombre)}</option>`)
      .join("");
    root.innerHTML = overlay(`
      <div class="sheet-head">
        <h2>Nueva solicitud</h2>
        <button class="linkish" data-dismiss-sheet type="button">Cerrar</button>
      </div>
      <form data-save-task>
        <div class="field">
          <label>Cliente</label>
          <select name="clientId" required>
            <option value="">Elegí un cliente</option>
            ${options}
          </select>
        </div>
        <div class="field"><label>Qué pidió</label><input name="titulo" required placeholder="Ej: cambiar logo, agregar módulo" /></div>
        <div class="field"><label>Detalle</label><textarea name="detalle" placeholder="Anotá lo que hay que hacer"></textarea></div>
        <div class="field"><label>Fecha del pedido</label><input name="requestedAt" type="date" value="${todayISO()}" /></div>
        <button class="btn copper wide" type="submit">Registrar</button>
      </form>
    `, "Nueva solicitud", true);
    return;
  }

  if (sheet.type === "pay-date") {
    const client = clientById(sheet.clientId);
    root.innerHTML = overlay(`
      <div class="sheet-head">
        <h2>Registrar pago</h2>
        <button class="linkish" data-dismiss-sheet type="button">Cerrar</button>
      </div>
      <p class="muted">${escapeHtml(client?.nombre || "")} · ${periodLabel(sheet.period)}</p>
      <form data-confirm-pay>
        <div class="field"><label>Fecha de pago</label><input name="paidAt" type="date" value="${todayISO()}" /></div>
        <button class="btn copper wide" type="submit">Marcar como pagado</button>
      </form>
    `, "Registrar pago");
  }
}

function overlay(inner, label, full = false) {
  return `
    <div class="overlay" data-close-sheet>
      <section class="sheet ${full ? "full" : ""}" role="dialog" aria-label="${escapeHtml(label)}">
        <div class="handle"></div>
        ${inner}
      </section>
    </div>
  `;
}

function render() {
  renderTopbar();
  renderNav();
  if (state.view === "inicio") renderInicio();
  if (state.view === "clientes") renderClientes();
  if (state.view === "pagos") renderPagos();
  if (state.view === "tareas") renderTareas();
  renderSheet();
}

function openSheet(sheet) {
  state.sheet = sheet;
  render();
}

function closeSheet() {
  state.sheet = null;
  render();
}

function upsertPayment(clientId, period, status, paidAt) {
  const client = clientById(clientId);
  const existing = paymentFor(clientId, period);
  if (existing) {
    existing.status = status;
    existing.paidAt = status === "pagado" ? paidAt : "";
    existing.amount = Number(existing.amount || client?.monto || 0);
  } else {
    state.payments.push({
      id: uid(),
      clientId,
      period,
      status,
      paidAt: status === "pagado" ? paidAt : "",
      amount: Number(client?.monto || 0),
    });
  }
  refreshLastPayment(clientId);
  save();
}

function bindEvents() {
  document.body.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-nav]");
    if (nav) {
      state.view = nav.dataset.nav;
      state.sheet = null;
      render();
      return;
    }

    if (event.target.matches("[data-close-sheet]") || event.target.closest("[data-dismiss-sheet]")) {
      closeSheet();
      return;
    }

    const openClient = event.target.closest("[data-open-client]");
    if (openClient) {
      openSheet({ type: "client-detail", id: openClient.dataset.openClient });
      return;
    }

    if (event.target.closest("[data-new-client]")) {
      openSheet({ type: "client-form" });
      return;
    }

    const editClient = event.target.closest("[data-edit-client]");
    if (editClient) {
      openSheet({ type: "client-form", id: editClient.dataset.editClient });
      return;
    }

    const deleteClient = event.target.closest("[data-delete-client]");
    if (deleteClient) {
      const client = clientById(deleteClient.dataset.deleteClient);
      if (client && confirm(`¿Eliminar a ${client.nombre}? También se borran sus pagos y solicitudes.`)) {
        const id = client.id;
        state.clients = state.clients.filter((item) => item.id !== id);
        state.payments = state.payments.filter((item) => item.clientId !== id);
        state.tasks = state.tasks.filter((item) => item.clientId !== id);
        save();
        closeSheet();
      }
      return;
    }

    if (event.target.closest("[data-open-filters]")) {
      openSheet({ type: "filters" });
      return;
    }

    if (event.target.closest("[data-clear-filters]")) {
      state.filters = { ...state.filters, contratoFrom: "", contratoTo: "", pagoFrom: "", pagoTo: "" };
      closeSheet();
      return;
    }

    if (event.target.closest("[data-apply-filters]")) {
      const sheet = document.querySelector(".sheet");
      state.filters.contratoFrom = sheet.querySelector('[name="contratoFrom"]').value;
      state.filters.contratoTo = sheet.querySelector('[name="contratoTo"]').value;
      state.filters.pagoFrom = sheet.querySelector('[name="pagoFrom"]').value;
      state.filters.pagoTo = sheet.querySelector('[name="pagoTo"]').value;
      closeSheet();
      return;
    }

    const shift = event.target.closest("[data-shift-month]");
    if (shift) {
      state.paymentsPeriod = shiftPeriod(state.paymentsPeriod, Number(shift.dataset.shiftMonth));
      render();
      return;
    }

    const togglePay = event.target.closest("[data-toggle-pay]");
    if (togglePay) {
      const clientId = togglePay.dataset.togglePay;
      const current = paymentFor(clientId, state.paymentsPeriod);
      if (current?.status === "pagado") {
        upsertPayment(clientId, state.paymentsPeriod, "pendiente", "");
        render();
      } else {
        openSheet({ type: "pay-date", clientId, period: state.paymentsPeriod });
      }
      return;
    }

    if (event.target.closest("[data-new-task]")) {
      const preset = event.target.closest("[data-new-task]").dataset.newTask || "";
      openSheet({ type: "task-form", clientId: preset });
      return;
    }

    const taskFilter = event.target.closest("[data-task-filter]");
    if (taskFilter) {
      state.taskFilter = taskFilter.dataset.taskFilter;
      render();
      return;
    }

    const toggleTask = event.target.closest("[data-toggle-task]");
    if (toggleTask) {
      const task = state.tasks.find((item) => item.id === toggleTask.dataset.toggleTask);
      if (task) {
        task.completed = !task.completed;
        task.completedAt = task.completed ? todayISO() : "";
        save();
        render();
      }
      return;
    }

    if (event.target.closest("[data-export]")) {
      const blob = new Blob([JSON.stringify({
        clients: state.clients,
        payments: state.payments,
        tasks: state.tasks,
        exportedAt: new Date().toISOString(),
      }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `clientes-${todayISO()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }

    if (event.target.closest("[data-import]")) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const data = JSON.parse(await file.text());
          state.clients = data.clients || [];
          state.payments = data.payments || [];
          state.tasks = data.tasks || [];
          save();
          render();
        } catch {
          alert("El archivo no se pudo leer.");
        }
      };
      input.click();
    }
  });

  document.body.addEventListener("input", (event) => {
    if (event.target.matches("[data-filter-nombre]")) {
      state.filters.nombre = event.target.value;
      const cursor = event.target.selectionStart;
      renderClientes();
      renderSheet();
      const input = document.querySelector("[data-filter-nombre]");
      if (input) {
        input.focus();
        input.setSelectionRange(cursor, cursor);
      }
      return;
    }
    if (event.target.matches("[data-pay-query]")) {
      state.paymentsQuery = event.target.value;
      const cursor = event.target.selectionStart;
      renderPagos();
      const input = document.querySelector("[data-pay-query]");
      if (input) {
        input.focus();
        input.setSelectionRange(cursor, cursor);
      }
    }
  });

  document.body.addEventListener("change", (event) => {
    if (event.target.matches("[data-task-client]")) {
      state.taskClientId = event.target.value;
      render();
    }
  });

  document.body.addEventListener("submit", (event) => {
    const clientForm = event.target.closest("[data-save-client]");
    if (clientForm) {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(clientForm).entries());
      const id = clientForm.dataset.saveClient;
      if (id) {
        const client = clientById(id);
        Object.assign(client, {
          nombre: data.nombre.trim(),
          sistema: data.sistema.trim(),
          monto: Number(data.monto || 0),
          fechaContrato: data.fechaContrato,
          notas: data.notas.trim(),
        });
      } else {
        const created = {
          id: uid(),
          nombre: data.nombre.trim(),
          sistema: data.sistema.trim(),
          monto: Number(data.monto || 0),
          fechaContrato: data.fechaContrato,
          ultimoPago: "",
          notas: data.notas.trim(),
          createdAt: todayISO(),
        };
        state.clients.push(created);
      }
      save();
      closeSheet();
      state.view = "clientes";
      render();
      return;
    }

    if (event.target.closest("[data-save-task]")) {
      event.preventDefault();
      const form = event.target.closest("[data-save-task]");
      const data = Object.fromEntries(new FormData(form).entries());
      state.tasks.push({
        id: uid(),
        clientId: data.clientId,
        titulo: data.titulo.trim(),
        detalle: data.detalle.trim(),
        requestedAt: data.requestedAt || todayISO(),
        completed: false,
        completedAt: "",
      });
      save();
      state.view = "tareas";
      closeSheet();
      return;
    }

    if (event.target.closest("[data-confirm-pay]")) {
      event.preventDefault();
      const paidAt = event.target.closest("[data-confirm-pay]").paidAt.value || todayISO();
      upsertPayment(state.sheet.clientId, state.sheet.period, "pagado", paidAt);
      closeSheet();
    }
  });
}

function registerPWA() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

load();
bindEvents();
registerPWA();
render();
