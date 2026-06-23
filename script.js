const STORAGE_KEY = 'project-dashboard-data';

const defaultProjects = [
  {
    projectNumber: 'P-1042',
    name: 'North Campus HVAC Upgrade',
    manager: 'Alex',
    internalKickoff: 'Completed',
    materialKickoff: 'In Progress',
    materialOrdered: 'Pending',
    materialReceived: 'Pending',
    status: 'In Progress',
    generalTimeline: 'Q3 2026',
    officialSchedule: '2026-08-18'
  },
  {
    projectNumber: 'P-1048',
    name: 'Warehouse Lighting Retrofit',
    manager: 'Jordan',
    internalKickoff: 'Pending',
    materialKickoff: 'Pending',
    materialOrdered: 'Pending',
    materialReceived: 'Pending',
    status: 'Not Started',
    generalTimeline: 'Q4 2026',
    officialSchedule: '2026-10-02'
  },
  {
    projectNumber: 'P-1053',
    name: 'Main Office Access Control',
    manager: 'Taylor',
    internalKickoff: 'Completed',
    materialKickoff: 'Completed',
    materialOrdered: 'Completed',
    materialReceived: 'Completed',
    status: 'Complete',
    generalTimeline: 'Q2 2026',
    officialSchedule: '2026-06-30'
  },
  {
    projectNumber: 'P-1061',
    name: 'Lab Cooling System Refresh',
    manager: 'Alex',
    internalKickoff: 'In Progress',
    materialKickoff: 'Pending',
    materialOrdered: 'Pending',
    materialReceived: 'In Progress',
    status: 'In Progress',
    generalTimeline: 'Q1 2027',
    officialSchedule: '2027-01-14'
  }
];

let projects = [];

async function loadProjects() {
  try {
    const response = await fetch('/api/projects');
    if (!response.ok) {
      throw new Error('Failed to load projects');
    }
    projects = await response.json();
  } catch (error) {
    projects = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || defaultProjects.slice();
  }
}

async function saveProjects() {
  try {
    const response = await fetch('/api/projects', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(projects)
    });
    if (!response.ok) {
      throw new Error('Failed to save projects');
    }
    return true;
  } catch (error) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    return false;
  }
}

const projectForm = document.getElementById('projectForm');
const tableBody = document.getElementById('projectTableBody');
const managerFilter = document.getElementById('managerFilter');
const ganttChart = document.getElementById('ganttChart');
const ganttRangeLabel = document.getElementById('ganttRangeLabel');
const scheduleBanners = document.getElementById('scheduleBanners');
const scheduleSwimlanes = document.getElementById('scheduleSwimlanes');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('[data-tab-content]');
let editingIndex = null;

function setActiveTab(tabName) {
  tabButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabName);
  });
  tabContents.forEach((content) => {
    content.classList.toggle('active', content.dataset.tabContent === tabName);
  });
}

const statusClassMap = {
  'Completed': 'pill--success',
  'Complete': 'pill--success',
  'In Progress': 'pill--warning',
  'Pending': 'pill--danger',
  'Not Started': 'pill--danger'
};

function getFilteredProjects() {
  const selectedManager = managerFilter?.value || '';
  return selectedManager
    ? projects.filter((project) => project.manager === selectedManager)
    : projects;
}

function updateManagerFilterOptions() {
  if (!managerFilter) return;
  const existingValue = managerFilter.value;
  const managers = [...new Set(projects.map((project) => project.manager).filter(Boolean))].sort();

  managerFilter.innerHTML = '<option value="">All managers</option>' +
    managers.map((manager) => `
      <option value="${manager}">${manager}</option>
    `).join('');

  if (existingValue && managers.includes(existingValue)) {
    managerFilter.value = existingValue;
  }
}

function isWeekday(date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function addBusinessDays(date, days) {
  const result = new Date(date);
  let added = 0;

  while (added < days) {
    result.setDate(result.getDate() + 1);
    if (isWeekday(result)) {
      added += 1;
    }
  }

  return result;
}

function businessDayDiff(startDate, endDate) {
  let count = 0;
  const current = new Date(startDate);
  while (current <= endDate) {
    if (isWeekday(current)) {
      count += 1;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

function getWeekendDates(startDate, endDate) {
  const weekends = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    if (!isWeekday(current)) {
      weekends.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return weekends;
}

function formatDateLabel(date) {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function formatWeekendRanges(weekendDates) {
  if (!weekendDates.length) {
    return '';
  }

  const ranges = [];
  let start = weekendDates[0];
  let prev = weekendDates[0];

  for (let i = 1; i < weekendDates.length; i += 1) {
    const current = weekendDates[i];
    const dayDiff = Math.round((current - prev) / (1000 * 60 * 60 * 24));

    if (dayDiff === 1) {
      prev = current;
    } else {
      ranges.push([start, prev]);
      start = current;
      prev = current;
    }
  }

  ranges.push([start, prev]);

  return ranges
    .map(([rangeStart, rangeEnd]) => {
      const sameMonth = rangeStart.toLocaleDateString('en-US', { month: 'long' }) ===
        rangeEnd.toLocaleDateString('en-US', { month: 'long' });

      if (sameMonth) {
        return `${rangeStart.toLocaleDateString('en-US', { month: 'long' })} ${rangeStart.getDate()}-${rangeEnd.getDate()} weekend`;
      }

      return `${rangeStart.toLocaleDateString('en-US', { month: 'long' })} ${rangeStart.getDate()} - ${rangeEnd.toLocaleDateString('en-US', { month: 'long' })} ${rangeEnd.getDate()} weekend`;
    })
    .join(', ');
}

function renderDashboard() {
  const internalLane = document.getElementById('internalLane');
  const materialLane = document.getElementById('materialLane');
  const orderedLane = document.getElementById('orderedLane');
  const receivedLane = document.getElementById('receivedLane');
  const statusLane = document.getElementById('statusLane');
  const scheduleSwimlanes = document.getElementById('scheduleSwimlanes');
  const formTitle = document.querySelector('.add-project-panel .panel-header h2');
  const undoMessage = document.getElementById('undoMessage');

  updateManagerFilterOptions();
  const filteredProjects = getFilteredProjects();

  document.getElementById('totalProjects').textContent = filteredProjects.length;
  document.getElementById('orderedCount').textContent = filteredProjects.filter(
    (project) => project.materialOrdered === 'Completed'
  ).length;
  document.getElementById('receivedCount').textContent = filteredProjects.filter(
    (project) => project.materialReceived === 'Completed'
  ).length;
  document.getElementById('kickoffCount').textContent = filteredProjects.filter(
    (project) => project.internalKickoff === 'Completed' || project.materialKickoff === 'Completed'
  ).length;

  tableBody.innerHTML = '';
  internalLane.innerHTML = '';
  materialLane.innerHTML = '';
  orderedLane.innerHTML = '';
  receivedLane.innerHTML = '';
  statusLane.innerHTML = '';
  scheduleBanners.innerHTML = '';
  scheduleSwimlanes.innerHTML = '';
  ganttChart.innerHTML = '';

  filteredProjects.forEach((project) => {
    const projectIndex = projects.indexOf(project);
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>${project.projectNumber}</strong></td>
      <td>${project.name}</td>
      <td>${project.manager || ''}</td>
      <td><span class="pill ${statusClassMap[project.status] || 'pill--neutral'}">${project.status || 'Not Started'}</span></td>
      <td><span class="pill ${statusClassMap[project.internalKickoff] || 'pill--neutral'}">${project.internalKickoff}</span></td>
      <td><span class="pill ${statusClassMap[project.materialKickoff] || 'pill--neutral'}">${project.materialKickoff}</span></td>
      <td><span class="pill ${statusClassMap[project.materialOrdered] || 'pill--neutral'}">${project.materialOrdered}</span></td>
      <td><span class="pill ${statusClassMap[project.materialReceived] || 'pill--neutral'}">${project.materialReceived}</span></td>
      <td>
        <button class="action-btn" data-edit-index="${projectIndex}">Edit</button>
        <button class="action-btn action-btn--danger" data-delete-index="${projectIndex}">Delete</button>
      </td>
    `;
    tableBody.appendChild(row);

    const addLaneCard = (lane, status, title) => {
      const card = document.createElement('div');
      card.className = 'lane-card';
      card.innerHTML = `
        <strong>${project.projectNumber}</strong>
        <div>${project.name}</div>
        <span class="pill ${statusClassMap[status] || 'pill--neutral'}">${status}</span>
      `;
      lane.appendChild(card);
    };

    addLaneCard(internalLane, project.internalKickoff, project.name);
    addLaneCard(materialLane, project.materialKickoff, project.name);
    addLaneCard(orderedLane, project.materialOrdered, project.name);
    addLaneCard(receivedLane, project.materialReceived, project.name);
    addLaneCard(statusLane, project.status || 'Not Started', project.name);
  });

  document.getElementById('internalLaneCount').textContent = filteredProjects.filter(
    (project) => project.internalKickoff !== 'Pending'
  ).length;
  document.getElementById('materialLaneCount').textContent = filteredProjects.filter(
    (project) => project.materialKickoff !== 'Pending'
  ).length;
  document.getElementById('orderedLaneCount').textContent = filteredProjects.filter(
    (project) => project.materialOrdered !== 'Pending'
  ).length;
  document.getElementById('receivedLaneCount').textContent = filteredProjects.filter(
    (project) => project.materialReceived !== 'Pending'
  ).length;
  document.getElementById('statusLaneCount').textContent = filteredProjects.filter(
    (project) => (project.status || 'Not Started') !== 'Not Started'
  ).length;

  const validProjects = filteredProjects.filter((project) => project.officialSchedule);
  const sortedProjects = validProjects.slice().sort((a, b) => a.officialSchedule.localeCompare(b.officialSchedule));

  if (sortedProjects.length > 0) {
    const startDates = sortedProjects.map((project) => new Date(project.officialSchedule));
    const minDate = new Date(Math.min(...startDates.map((date) => date.getTime())));
    const maxDate = new Date(Math.max(...startDates.map((date) => date.getTime())));

    let chartStart = new Date(minDate);
    while (!isWeekday(chartStart)) {
      chartStart.setDate(chartStart.getDate() - 1);
    }
    let chartEnd = new Date(maxDate);
    while (!isWeekday(chartEnd)) {
      chartEnd.setDate(chartEnd.getDate() + 1);
    }
    const totalBusinessDays = Math.max(1, businessDayDiff(chartStart, chartEnd));

    const scale = document.createElement('div');
    scale.className = 'gantt-scale';
    scale.innerHTML = '<span>Project</span>';
    for (let i = 0; i < 6; i += 1) {
      const tick = document.createElement('span');
      const tickDate = addBusinessDays(chartStart, Math.round((totalBusinessDays / 5) * i));
      tick.textContent = tickDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      scale.appendChild(tick);
    }
    ganttChart.appendChild(scale);

    ganttRangeLabel.textContent = `${chartStart.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} - ${chartEnd.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;

    sortedProjects.forEach((project) => {
      const date = new Date(project.officialSchedule);
      const row = document.createElement('div');
      row.className = 'gantt-row';
      const businessStartOffset = Math.max(0, businessDayDiff(chartStart, date));
      const duration = Number(project.duration || 1);
      const durationDays = Math.min(365, Math.max(1, duration));
      const widthPercent = Math.max(2, Math.min(100, (durationDays / Math.max(1, totalBusinessDays)) * 100));
      const leftPercent = Math.min(95, (businessStartOffset / Math.max(1, totalBusinessDays)) * 100);
      const startDateLabel = formatDateLabel(date);
      const endDate = addBusinessDays(date, Math.max(0, durationDays - 1));
      const endDateLabel = formatDateLabel(endDate);
      const workingDays = businessDayDiff(date, endDate);
      const tooltipText = `${startDateLabel} to ${endDateLabel} — ${workingDays} working day${workingDays === 1 ? '' : 's'}`;
      row.innerHTML = `
        <div class="gantt-row-label">
          <strong>${project.projectNumber}</strong>
          <span>${project.name}</span>
        </div>
        <div class="gantt-track">
          <div class="gantt-bar" style="left: ${leftPercent}%; width: ${widthPercent}%">
            <div class="gantt-popup">${tooltipText}</div>
          </div>
        </div>
      `;
      ganttChart.appendChild(row);
    });
  } else {
    ganttRangeLabel.textContent = 'No schedule set';
    ganttChart.innerHTML = '<div class="schedule-detail"><strong>No scheduled dates yet</strong></div>';
  }

  function getWeekRange(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    const friday = new Date(monday);
    friday.setDate(friday.getDate() + 4);
    return {start: monday, end: friday};
  }

  function isDateInWeek(date, weekStart) {
    const d = new Date(date);
    const week = getWeekRange(weekStart);
    return d >= week.start && d <= week.end;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisWeek = getWeekRange(today);
  const nextWeekStart = new Date(thisWeek.end);
  nextWeekStart.setDate(nextWeekStart.getDate() + 3);
  const nextWeek = getWeekRange(nextWeekStart);

  const projectsThisWeek = sortedProjects.filter(p => isDateInWeek(new Date(p.officialSchedule), today));
  const projectsNextWeek = sortedProjects.filter(p => isDateInWeek(new Date(p.officialSchedule), nextWeekStart));

  if (projectsThisWeek.length > 0) {
    const banner = document.createElement('div');
    banner.className = 'schedule-banner';
    banner.innerHTML = `<strong>Starting This Week:</strong> ${projectsThisWeek.map(p => p.projectNumber).join(', ')}`;
    scheduleBanners.appendChild(banner);
  }

  if (projectsNextWeek.length > 0) {
    const banner = document.createElement('div');
    banner.className = 'schedule-banner';
    banner.innerHTML = `<strong>Starting Next Week:</strong> ${projectsNextWeek.map(p => p.projectNumber).join(', ')}`;
    scheduleBanners.appendChild(banner);
  }

  sortedProjects.forEach((project) => {
    const lane = document.createElement('div');
    lane.className = 'schedule-lane';
    lane.innerHTML = `
      <div class="schedule-lane-header">
        <h3>${project.projectNumber}</h3>
        <span class="pill pill--neutral">${project.generalTimeline}</span>
      </div>
      <div class="schedule-lane-body">
        <div class="schedule-detail">
          <small>Project</small>
          <strong>${project.name}</strong>
        </div>
        <div class="schedule-detail">
          <small>Official schedule</small>
          <strong>${project.officialSchedule}</strong>
          <span class="pill ${statusClassMap[project.materialOrdered] || 'pill--neutral'}">Ordered: ${project.materialOrdered}</span>
          <span class="pill ${statusClassMap[project.materialReceived] || 'pill--neutral'}">Received: ${project.materialReceived}</span>
        </div>
      </div>
    `;
    scheduleSwimlanes.appendChild(lane);
  });

  if (!projectForm.dataset.bound) {
    projectForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(projectForm);
      const newProject = {
        projectNumber: formData.get('projectNumber'),
        name: formData.get('name'),
        manager: formData.get('manager') || '',
        status: formData.get('status') || 'Not Started',
        internalKickoff: formData.get('internalKickoff'),
        materialKickoff: formData.get('materialKickoff'),
        materialOrdered: formData.get('materialOrdered'),
        materialReceived: formData.get('materialReceived'),
        generalTimeline: formData.get('generalTimeline'),
        officialSchedule: formData.get('officialSchedule'),
        duration: formData.get('duration') ? Number(formData.get('duration')) : '',
        owner: formData.get('owner') || '',
        priority: formData.get('priority') || 'Medium',
        notes: formData.get('notes') || ''
      };

      if (!newProject.projectNumber || !newProject.name) {
        return;
      }

      if (editingIndex !== null) {
        projects[editingIndex] = newProject;
        editingIndex = null;
      } else {
        projects.push(newProject);
      }

      await saveProjects();
      projectForm.reset();
      const submitButton = projectForm.querySelector('button[type="submit"]');
      if (submitButton) {
        submitButton.textContent = 'Add Project';
      }
      const formTitle = document.querySelector('.add-project-panel .panel-header h2');
      if (formTitle) {
        formTitle.textContent = 'Add a project';
      }
      if (managerFilter && managerFilter.value) {
        managerFilter.value = '';
      }
      renderDashboard();
    });

    projectForm.addEventListener('change', (event) => {
      if (
        event.target.name === 'officialSchedule' ||
        event.target.name === 'generalTimeline' ||
        event.target.name === 'duration'
      ) {
        renderDashboard();
      }
    });

    projectForm.dataset.bound = 'true';
  }

  if (!tableBody.dataset.bound) {
    tableBody.addEventListener('click', (event) => {
      const editButton = event.target.closest('[data-edit-index]');
      const deleteButton = event.target.closest('[data-delete-index]');

      if (editButton) {
        editingIndex = Number(editButton.dataset.editIndex);
        const project = projects[editingIndex];
        if (project) {
          projectForm.elements.projectNumber.value = project.projectNumber || '';
          projectForm.elements.name.value = project.name || '';
          projectForm.elements.status.value = project.status || 'Not Started';
          projectForm.elements.generalTimeline.value = project.generalTimeline || '';
          projectForm.elements.officialSchedule.value = project.officialSchedule || '';
          projectForm.elements.duration.value = project.duration || '';
          projectForm.elements.internalKickoff.value = project.internalKickoff || 'Pending';
          projectForm.elements.materialKickoff.value = project.materialKickoff || 'Pending';
          projectForm.elements.materialOrdered.value = project.materialOrdered || 'Pending';
          projectForm.elements.materialReceived.value = project.materialReceived || 'Pending';
          projectForm.elements.manager.value = project.manager || '';
          projectForm.elements.owner.value = project.owner || '';
          projectForm.elements.priority.value = project.priority || 'Medium';
          projectForm.elements.notes.value = project.notes || '';
          const submitButton = projectForm.querySelector('button[type="submit"]');
          if (submitButton) {
            submitButton.textContent = 'Save Changes';
          }
          const formTitle = document.querySelector('.add-project-panel .panel-header h2');
          if (formTitle) {
            formTitle.textContent = 'Edit project';
          }
          setActiveTab('entry');
          projectForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }

      if (deleteButton) {
        const deleteIndex = Number(deleteButton.dataset.deleteIndex);
        const project = projects[deleteIndex];
        const confirmDelete = window.confirm(
          `Are you sure you want to delete ${project?.projectNumber || 'this project'}?`
        );
        if (confirmDelete) {
          const removedProject = projects.splice(deleteIndex, 1)[0];
          saveProjects();
          renderDashboard();

          const undoMessage = document.getElementById('undoMessage');
          if (undoMessage && removedProject) {
            undoMessage.hidden = false;
            undoMessage.innerHTML = `Deleted ${removedProject.projectNumber}. <button type="button" id="undoDeleteBtn">Undo</button>`;

            document.getElementById('undoDeleteBtn')?.addEventListener('click', () => {
              projects.splice(deleteIndex, 0, removedProject);
              saveProjects();
              undoMessage.hidden = true;
              undoMessage.innerHTML = '';
              renderDashboard();
            });
          }
        }
      }
    });
    tableBody.dataset.bound = 'true';
  }

  if (!document.body.dataset.tabsBound) {
    tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        setActiveTab(button.dataset.tab);
      });
    });
    document.body.dataset.tabsBound = 'true';
  }

  if (managerFilter && !managerFilter.dataset.bound) {
    managerFilter.addEventListener('change', () => {
      renderDashboard();
    });
    managerFilter.dataset.bound = 'true';
  }
}

loadProjects().then(() => {
  renderDashboard();
});
