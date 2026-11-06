/* StudyFlow — funcionalidades com persistência local */
(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const STORAGE_KEY = "studyflow-data-v1";
  const DEFAULT_SUBJECTS = ["Matemática", "Português", "História", "Geografia", "Biologia", "Física", "Inglês"];
  const SUBJECT_ICONS = ["∑", "Aa", "⌛", "⌖", "✿", "⚛", "文", "✦", "▤"];
  const TYPE_LABELS = { prova: "Prova", trabalho: "Trabalho", atividade: "Atividade", outro: "Outro" };
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const formatDate = (iso, options = { day: "2-digit", month: "short", year: undefined }) => {
    if (!iso) return "Sem data";
    const [y, m, d] = iso.split("-").map(Number);
    return new Intl.DateTimeFormat("pt-BR", options).format(new Date(y, m - 1, d));
  };
  const safeLoad = () => {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        tasks: Array.isArray(data.tasks) ? data.tasks : [],
        subjects: Array.isArray(data.subjects) && data.subjects.length ? data.subjects : [...DEFAULT_SUBJECTS],
        events: Array.isArray(data.events) ? data.events : [],
        sessions: Array.isArray(data.sessions) ? data.sessions : []
      };
    } catch (error) {
      console.warn("Não foi possível ler os dados salvos.", error);
      return { tasks: [], subjects: [...DEFAULT_SUBJECTS], events: [], sessions: [] };
    }
  };
  let data = safeLoad();
  let selectedDate = todayISO();
  const current = new Date();
  let calendarYear = current.getFullYear();
  let calendarMonth = current.getMonth();
  let timerMode = "study";
  let timerDuration = 25 * 60;
  let remainingSeconds = timerDuration;
  let timerInterval = null;
  let timerRunning = false;
  let toastTimeout = null;

  function saveData() {
    // O armazenamento pode ser bloqueado em prévias/abas privadas.
    // Retornamos o resultado para não informar sucesso quando falhar.
    try {
      const serialized = JSON.stringify(data);
      window.localStorage.setItem(STORAGE_KEY, serialized);
      // Confirma que o valor foi realmente gravado e pode ser lido.
      if (window.localStorage.getItem(STORAGE_KEY) !== serialized) {
        throw new Error("A gravação não pôde ser confirmada.");
      }
      return true;
    } catch (error) {
      console.error("Falha ao salvar os dados do StudyFlow:", error);
      showToast("O navegador bloqueou o salvamento. Abra o projeto no navegador normalmente e permita o armazenamento local.");
      return false;
    }
  }
  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove("show"), 2800);
  }
  function navigate(view) {
    const valid = ["dashboard", "tarefas", "calendario", "cronometro", "materias", "progresso"];
    if (!valid.includes(view)) view = "dashboard";
    $$(".view").forEach(section => section.classList.toggle("active", section.id === `view-${view}`));
    $$("[data-view]").forEach(link => {
      const active = link.dataset.view === view;
      link.classList.toggle("active", active);
      if (link.matches("a")) active ? link.setAttribute("aria-current", "page") : link.removeAttribute("aria-current");
    });
    const labels = { dashboard: "Visão geral", tarefas: "Minhas tarefas", calendario: "Calendário", cronometro: "Foco Pomodoro", materias: "Matérias", progresso: "Meu progresso" };
    $("#crumb").textContent = labels[view];
    if (view === "tarefas") renderTasks();
    if (view === "calendario") renderCalendar();
    if (view === "materias") renderSubjects();
    if (view === "progresso") renderProgress();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function fillSubjectOptions() {
    const options = data.subjects.map(subject => `<option value="${escapeHTML(subject)}">${escapeHTML(subject)}</option>`).join("");
    $("#taskSubject").innerHTML = options;
    $("#eventSubject").innerHTML = `<option value="">Sem matéria específica</option>${options}`;
    const currentFilter = $("#filterSubject").value;
    $("#filterSubject").innerHTML = `<option value="">Todas as matérias</option>${options}`;
    $("#filterSubject").value = data.subjects.includes(currentFilter) ? currentFilter : "";
  }
  function dueLabel(task) {
    if (task.completed) return `Concluída · ${formatDate(task.due)}`;
    if (task.due < todayISO()) return `Atrasada · ${formatDate(task.due)}`;
    if (task.due === todayISO()) return `Entrega hoje`;
    return `Até ${formatDate(task.due)}`;
  }
  function taskIsOverdue(task) { return !task.completed && task.due < todayISO(); }
  function priorityLabel(priority) { return ({ alta: "Alta", media: "Média", baixa: "Baixa" })[priority] || "Média"; }
  function renderDashboard() {
    const pending = data.tasks.filter(task => !task.completed);
    const completed = data.tasks.filter(task => task.completed);
    const total = data.tasks.length;
    const percent = total ? Math.round(completed.length / total * 100) : 0;
    const upcoming = data.events.filter(event => event.date >= todayISO()).length;
    $("#pendingCount").textContent = pending.length;
    $("#completedCount").textContent = completed.length;
    $("#upcomingCount").textContent = upcoming;
    $("#progressPercent").textContent = `${percent}%`;
    $("#progressBar").style.width = `${percent}%`;
    $("#progressCaption").textContent = total ? (percent === 100 ? "Tudo concluído. Parabéns!" : "Continue no seu ritmo!") : "Adicione sua primeira tarefa.";
    $("#todayDate").textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).format(new Date());
    $("#todayLabel").textContent = new Intl.DateTimeFormat("pt-BR", { weekday: "long", month: "long", day: "numeric" }).format(new Date()).toUpperCase();
    const soon = [...pending].sort((a, b) => a.due.localeCompare(b.due)).slice(0, 4);
    $("#dashboardTasks").innerHTML = soon.length ? soon.map(task => `
      <div class="task-preview ${task.completed ? "done" : ""}">
        <button class="task-check" data-complete="${task.id}" aria-label="Concluir ${escapeHTML(task.title)}">✓</button>
        <div class="task-preview-main"><strong>${escapeHTML(task.title)}</strong><small class="${taskIsOverdue(task) ? "overdue-label" : ""}">${escapeHTML(task.subject)} · ${escapeHTML(dueLabel(task))}</small></div>
        <span class="priority-pill priority-${task.priority}">${priorityLabel(task.priority)}</span>
      </div>`).join("") : `<div class="empty-state"><span>✧</span>${total ? "Nenhuma tarefa pendente. Aproveite seu progresso!" : "Suas tarefas aparecerão aqui quando você adicionar uma."}</div>`;
    renderWeeklyChart($("#weeklyChart"));
  }
  function renderTasks() {
    const subject = $("#filterSubject").value;
    const priority = $("#filterPriority").value;
    const status = $("#filterStatus").value;
    let tasks = [...data.tasks];
    if (subject) tasks = tasks.filter(task => task.subject === subject);
    if (priority) tasks = tasks.filter(task => task.priority === priority);
    if (status === "ativas") tasks = tasks.filter(task => !task.completed);
    if (status === "concluidas") tasks = tasks.filter(task => task.completed);
    tasks.sort((a, b) => Number(a.completed) - Number(b.completed) || a.due.localeCompare(b.due));
    $("#taskList").innerHTML = tasks.length ? tasks.map(task => `
      <article class="task-item ${task.completed ? "done" : ""} ${taskIsOverdue(task) ? "overdue" : ""}">
        <button class="task-check ${task.completed ? "checked" : ""}" data-complete="${task.id}" aria-label="${task.completed ? "Reabrir" : "Concluir"} ${escapeHTML(task.title)}">${task.completed ? "✓" : ""}</button>
        <div class="task-item-body"><h3>${escapeHTML(task.title)}</h3>${task.description ? `<p>${escapeHTML(task.description)}</p>` : ""}
          <div class="task-meta"><span class="subject-tag">${escapeHTML(task.subject)}</span><span class="date-tag ${taskIsOverdue(task) ? "overdue-label" : ""}">${escapeHTML(dueLabel(task))}</span><span class="priority-pill priority-${task.priority}">${priorityLabel(task.priority)}</span></div>
        </div>
        <div class="task-actions"><button class="mini-button" data-edit-task="${task.id}" aria-label="Editar ${escapeHTML(task.title)}" title="Editar">✎</button><button class="mini-button delete" data-delete-task="${task.id}" aria-label="Excluir ${escapeHTML(task.title)}" title="Excluir">×</button></div>
      </article>`).join("") : `<div class="empty-state"><span>☷</span>Nenhuma tarefa encontrada com esses filtros.</div>`;
  }
  function openTaskDialog(task = null) {
    $("#taskForm").reset();
    $("#taskId").value = task?.id || "";
    $("#taskDialogTitle").textContent = task ? "Editar tarefa" : "Nova tarefa";
    $("#taskTitle").value = task?.title || "";
    $("#taskDescription").value = task?.description || "";
    $("#taskSubject").value = task?.subject || data.subjects[0] || "";
    $("#taskDue").value = task?.due || todayISO();
    $("#taskPriority").value = task?.priority || "media";
    $("#taskDialog").showModal();
    $("#taskTitle").focus();
  }
  function toggleTask(id) {
    const task = data.tasks.find(item => item.id === id);
    if (!task) return;
    task.completed = !task.completed;
    task.completedAt = task.completed ? todayISO() : null;
    saveData(); renderAll();
    showToast(task.completed ? "Tarefa concluída. Muito bem!" : "Tarefa voltou para pendentes.");
  }
  function deleteTask(id) {
    const task = data.tasks.find(item => item.id === id);
    if (!task || !confirm(`Deseja excluir a tarefa "${task.title}"? Essa ação não pode ser desfeita.`)) return;
    data.tasks = data.tasks.filter(item => item.id !== id);
    saveData(); renderAll(); showToast("Tarefa excluída.");
  }
  function renderCalendar() {
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0);
    $("#calendarMonth").textContent = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(firstDay);
    const names = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    let html = names.map(name => `<div class="weekday">${name}</div>`).join("");
    const offset = firstDay.getDay();
    const totalCells = Math.ceil((offset + lastDay.getDate()) / 7) * 7;
    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - offset + 1;
      const date = new Date(calendarYear, calendarMonth, dayNum);
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const inMonth = date.getMonth() === calendarMonth;
      const events = data.events.filter(event => event.date === iso);
      html += `<button class="calendar-day ${inMonth ? "" : "muted-day"} ${iso === todayISO() ? "today" : ""} ${iso === selectedDate ? "selected" : ""}" data-calendar-date="${iso}" aria-label="${formatDate(iso, { day: "numeric", month: "long", year: "numeric" })}${events.length ? `, ${events.length} compromisso(s)` : ""}"><span class="day-number">${date.getDate()}</span><span class="day-dots">${events.slice(0, 4).map(event => `<i class="legend-dot ${event.type}-dot ${event.type === "prova" ? "blue-dot" : event.type === "trabalho" ? "purple-dot" : event.type === "atividade" ? "green-dot" : "gray-dot"}"></i>`).join("")}</span></button>`;
    }
    $("#calendarGrid").innerHTML = html;
    renderDayEvents();
  }
  function renderDayEvents() {
    $("#selectedDateTitle").textContent = `Compromissos · ${formatDate(selectedDate, { day: "numeric", month: "long" })}`;
    const events = data.events.filter(event => event.date === selectedDate).sort((a, b) => a.title.localeCompare(b.title));
    $("#dayEventList").innerHTML = events.length ? events.map(event => `
      <div class="event-row"><i class="event-color ${event.type}"></i><div class="event-row-main"><strong>${escapeHTML(event.title)}</strong><small>${TYPE_LABELS[event.type] || "Outro"}${event.subject ? ` · ${escapeHTML(event.subject)}` : ""}${event.description ? ` · ${escapeHTML(event.description)}` : ""}</small></div><button class="mini-button delete" data-delete-event="${event.id}" aria-label="Excluir ${escapeHTML(event.title)}">×</button></div>`).join("") : `<div class="empty-state"><span>▦</span>Nenhum compromisso nesta data.</div>`;
  }
  function addEvent() {
    $("#eventForm").reset();
    $("#eventDate").value = selectedDate || todayISO();
    $("#eventDialog").showModal();
    $("#eventTitle").focus();
  }
  function renderSubjects() {
    $("#subjectGrid").innerHTML = data.subjects.map((subject, index) => {
      const tasks = data.tasks.filter(task => task.subject === subject);
      const pending = tasks.filter(task => !task.completed).length;
      const done = tasks.filter(task => task.completed).length;
      return `<article class="subject-card"><div class="subject-card-top"><span class="subject-icon">${SUBJECT_ICONS[index % SUBJECT_ICONS.length]}</span><button class="mini-button delete" data-delete-subject="${escapeHTML(subject)}" aria-label="Excluir matéria ${escapeHTML(subject)}" title="Excluir matéria">×</button></div><h3>${escapeHTML(subject)}</h3><p>${pending} pendente${pending === 1 ? "" : "s"}</p><div class="subject-card-bottom"><span>Concluídas <strong>${done}</strong></span><span>Total <strong>${tasks.length}</strong></span></div></article>`;
    }).join("");
  }
  function getWeeklyCounts() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - i);
      const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const count = data.tasks.filter(task => task.completed && task.completedAt === iso).length;
      days.push({ iso, label: new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date).replace(".", ""), count });
    }
    return days;
  }
  function renderWeeklyChart(container) {
    const days = getWeeklyCounts();
    const max = Math.max(1, ...days.map(day => day.count));
    container.innerHTML = days.map(day => `<div class="chart-day" title="${day.count} tarefa(s) em ${formatDate(day.iso)}"><div class="chart-bar-wrap"><div class="chart-bar" style="height:${day.count ? Math.max(7, day.count / max * 100) : 3}%"></div></div><strong>${day.count}</strong><small>${escapeHTML(day.label)}</small></div>`).join("");
  }
  function renderProgress() {
    const done = data.tasks.filter(task => task.completed).length;
    const total = data.tasks.length;
    const minutes = data.sessions.reduce((sum, session) => sum + (Number(session.minutes) || 25), 0);
    $("#progressDone").textContent = done;
    $("#progressMinutes").textContent = `${minutes} min`;
    $("#completionRate").textContent = `${total ? Math.round(done / total * 100) : 0}%`;
    renderWeeklyChart($("#progressChart"));
    $("#subjectProgress").innerHTML = data.subjects.map(subject => {
      const tasks = data.tasks.filter(task => task.subject === subject);
      const complete = tasks.filter(task => task.completed).length;
      const percent = tasks.length ? Math.round(complete / tasks.length * 100) : 0;
      return `<div class="subject-progress-row"><strong>${escapeHTML(subject)}</strong><div class="subject-progress-track"><div class="subject-progress-fill" style="width:${percent}%"></div></div><small>${complete}/${tasks.length}</small></div>`;
    }).join("");
  }
  function renderTimer() {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    $("#timerDisplay").textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    $("#timerModeLabel").textContent = timerMode === "study" ? "Hora de focar" : "Hora de descansar";
    $("#timerStart").textContent = timerRunning ? "Ⅱ Pausar" : remainingSeconds === timerDuration ? "▶ Iniciar" : "▶ Continuar";
    $$(".timer-tab").forEach(tab => tab.classList.toggle("active", tab.dataset.mode === timerMode));
    const elapsed = timerDuration - remainingSeconds;
    const angle = Math.max(0, elapsed / timerDuration * 360);
    $("#timerRing").style.background = `conic-gradient(#8ca7f2 0deg, #b5a6ee ${angle}deg, #f0edfb ${angle}deg)`;
    $("#sessionCount").textContent = data.sessions.length;
    const totalMinutes = data.sessions.reduce((sum, session) => sum + (Number(session.minutes) || 25), 0);
    $("#focusTimeTotal").textContent = `${totalMinutes} min`;
    $("#sessionHistory").innerHTML = data.sessions.length ? [...data.sessions].slice(-5).reverse().map(session => `<div class="session-history-row"><span>${escapeHTML(formatDate(session.date))} · Foco</span><span>${Number(session.minutes) || 25} min</span></div>`).join("") : `<div class="empty-state">Suas sessões completas aparecerão aqui.</div>`;
  }
  function stopTimer() { if (timerInterval) clearInterval(timerInterval); timerInterval = null; timerRunning = false; }
  function setTimerMode(mode) {
    stopTimer();
    timerMode = mode;
    timerDuration = (mode === "study" ? 25 : 5) * 60;
    remainingSeconds = timerDuration;
    $("#timerHint").textContent = mode === "study" ? "Seu próximo passo começa agora." : "Respire, alongue-se e recarregue.";
    renderTimer();
  }
  function startTimer() {
    if (timerRunning) { stopTimer(); renderTimer(); $("#timerHint").textContent = "Cronômetro pausado. Continue quando quiser."; return; }
    if (remainingSeconds <= 0) remainingSeconds = timerDuration;
    timerRunning = true; renderTimer();
    $("#timerHint").textContent = "Você está no controle do seu foco.";
    timerInterval = setInterval(() => {
      remainingSeconds--;
      if (remainingSeconds <= 0) {
        stopTimer();
        if (timerMode === "study") {
          data.sessions.push({ id: uid(), date: todayISO(), minutes: 25, completedAt: new Date().toISOString() });
          saveData();
          $("#timerHint").textContent = "Sessão concluída! Hora de fazer uma pausa.";
          showToast("Parabéns! Sessão de foco registrada.");
        } else {
          $("#timerHint").textContent = "Pausa concluída. Pronto para focar novamente?";
          showToast("Pausa concluída. Você consegue!");
        }
        renderAll();
        renderTimer();
        return;
      }
      renderTimer();
    }, 1000);
  }
  function renderAll() {
    fillSubjectOptions();
    renderDashboard();
    renderTasks();
    renderCalendar();
    renderSubjects();
    renderProgress();
    renderTimer();
  }

  // Navegação por links e botões com data-view.
  document.addEventListener("click", event => {
    const nav = event.target.closest("[data-view]");
    if (nav) { event.preventDefault(); navigate(nav.dataset.view); }
    const complete = event.target.closest("[data-complete]");
    if (complete) toggleTask(complete.dataset.complete);
    const edit = event.target.closest("[data-edit-task]");
    if (edit) openTaskDialog(data.tasks.find(task => task.id === edit.dataset.editTask));
    const remove = event.target.closest("[data-delete-task]");
    if (remove) deleteTask(remove.dataset.deleteTask);
    const day = event.target.closest("[data-calendar-date]");
    if (day) { selectedDate = day.dataset.calendarDate; const date = new Date(`${selectedDate}T12:00:00`); calendarYear = date.getFullYear(); calendarMonth = date.getMonth(); renderCalendar(); }
    const removeEvent = event.target.closest("[data-delete-event]");
    if (removeEvent) {
      const item = data.events.find(entry => entry.id === removeEvent.dataset.deleteEvent);
      if (item && confirm(`Excluir o compromisso "${item.title}"?`)) { data.events = data.events.filter(entry => entry.id !== item.id); saveData(); renderAll(); showToast("Compromisso excluído."); }
    }
    const removeSubject = event.target.closest("[data-delete-subject]");
    if (removeSubject) {
      const subject = removeSubject.dataset.deleteSubject;
      const linked = data.tasks.some(task => task.subject === subject) || data.events.some(item => item.subject === subject);
      if (linked) { showToast("Esta matéria tem tarefas ou compromissos vinculados. Remova-os primeiro."); return; }
      if (confirm(`Excluir a matéria "${subject}"?`)) { data.subjects = data.subjects.filter(item => item !== subject); saveData(); renderAll(); showToast("Matéria excluída."); }
    }
    const timerTab = event.target.closest("[data-mode]");
    if (timerTab) setTimerMode(timerTab.dataset.mode);
  });
  $("#quickAddBtn").addEventListener("click", () => openTaskDialog());
  $("#addTaskBtn").addEventListener("click", () => openTaskDialog());
  $$(".close-dialog").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));
  function submitTaskForm(event) {
    if (event) event.preventDefault();
    const form = $("#taskForm");
    // Validação explícita para que o formulário funcione de forma consistente
    // ao abrir index.html diretamente ou por um servidor local.
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const id = $("#taskId").value.trim();
    const title = $("#taskTitle").value.trim();
    const subject = $("#taskSubject").value;
    const due = $("#taskDue").value;
    if (!title || !subject || !due) {
      showToast("Preencha título, matéria e data de entrega.");
      return;
    }
    const previousTasks = data.tasks.map(item => ({ ...item }));
    const existing = id ? data.tasks.find(item => item.id === id) : null;
    if (id && !existing) {
      showToast("Não foi possível localizar a tarefa para editar.");
      return;
    }
    const task = {
      id: id || uid(), title,
      description: $("#taskDescription").value.trim(), subject, due,
      priority: $("#taskPriority").value || "media",
      completed: existing ? existing.completed : false,
      completedAt: existing ? existing.completedAt : null
    };
    if (existing) data.tasks = data.tasks.map(item => item.id === id ? task : item);
    else data.tasks.push(task);

    // Atualiza a lista imediatamente; se o armazenamento falhar, avisa claramente.
    renderAll();
    if (!saveData()) {
      // Mantém a tarefa visível nesta sessão, mesmo se o navegador bloquear localStorage.
      // O aviso informa que ela pode não permanecer após fechar/atualizar a página.
      showToast("Tarefa adicionada nesta sessão, mas não foi salva no navegador. Tente abrir pelo Live Server.");
      $("#taskDialog").close();
      return;
    }
    $("#taskDialog").close();
    showToast(id ? "Tarefa atualizada e salva!" : "Tarefa adicionada e salva!");
  }
  $("#taskForm").addEventListener("submit", submitTaskForm);
  // Fallback explícito: cobre navegadores em que o envio do diálogo não dispara como esperado.
  $("#taskForm button[type=submit]").addEventListener("click", event => {
    event.preventDefault();
    submitTaskForm();
  });
  $("#filterSubject").addEventListener("change", renderTasks);
  $("#filterPriority").addEventListener("change", renderTasks);
  $("#filterStatus").addEventListener("change", renderTasks);
  $("#addEventBtn").addEventListener("click", addEvent);
  $("#eventForm").addEventListener("submit", event => {
    event.preventDefault();
    const item = { id: uid(), title: $("#eventTitle").value.trim(), type: $("#eventType").value, date: $("#eventDate").value, subject: $("#eventSubject").value, description: $("#eventDescription").value.trim() };
    if (!item.title || !item.date) { showToast("Preencha o título e a data do compromisso."); return; }
    data.events.push(item); selectedDate = item.date;
    const date = new Date(`${selectedDate}T12:00:00`); calendarYear = date.getFullYear(); calendarMonth = date.getMonth();
    saveData(); $("#eventDialog").close(); renderAll(); showToast("Compromisso salvo no calendário.");
  });
  $("#prevMonth").addEventListener("click", () => { calendarMonth--; if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; } renderCalendar(); });
  $("#nextMonth").addEventListener("click", () => { calendarMonth++; if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; } renderCalendar(); });
  $("#todayBtn").addEventListener("click", () => { const now = new Date(); calendarYear = now.getFullYear(); calendarMonth = now.getMonth(); selectedDate = todayISO(); renderCalendar(); });
  $("#subjectForm").addEventListener("submit", event => {
    event.preventDefault();
    const input = $("#subjectName");
    const subject = input.value.trim();
    if (!subject) { showToast("Digite o nome da matéria."); return; }
    if (data.subjects.some(item => item.toLocaleLowerCase("pt-BR") === subject.toLocaleLowerCase("pt-BR"))) { showToast("Essa matéria já está cadastrada."); input.focus(); return; }
    data.subjects.push(subject); saveData(); input.value = ""; renderAll(); showToast("Matéria adicionada!");
  });
  $("#timerStart").addEventListener("click", startTimer);
  $("#timerReset").addEventListener("click", () => { stopTimer(); remainingSeconds = timerDuration; renderTimer(); $("#timerHint").textContent = "Cronômetro reiniciado."; });
  window.addEventListener("hashchange", () => navigate(location.hash.replace("#", "") || "dashboard"));
  // Inicialização: a página sempre começa na seção indicada no endereço ou no painel.
  navigate(location.hash.replace("#", "") || "dashboard");
  renderAll();
})();