export type ProjectStatus = "not-started" | "in-progress" | "done";
export type ProjectPriority =
  | "ultra-high"
  | "high"
  | "medium"
  | "low"
  | "no-priority";
export type ProgressSource = "codex" | "manual" | "calendar";

export type Project = {
  id: string;
  name: string;
  emoji?: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  startDate?: string;
  dueDate?: string;
  progress: number;
  codexEnabled: boolean;
  relatedProjectIds: string[];
  notesCount: number;
  updatedAt: string;
  calendarEventId?: string;
  tags?: string[];
};

export type ProgressLog = {
  id: string;
  projectId: string;
  summary: string;
  minutes: number;
  source: ProgressSource;
  createdAt: string;
};

export type GoogleCalendarState = {
  connected: boolean;
  calendarId?: string;
  lastSyncedAt?: string;
  refreshToken?: string;
};

export type GoogleDriveState = {
  connected: boolean;
  refreshToken?: string;
};

export type AppState = {
  currentProjectId?: string;
  googleCalendar: GoogleCalendarState;
  googleDrive: GoogleDriveState;
  projects: Project[];
  progressLogs: ProgressLog[];
};

export type StatusColumn = {
  status: ProjectStatus;
  count: number;
  projects: Project[];
};

export type PriorityColumn = {
  priority: ProjectPriority;
  count: number;
  projects: Project[];
};

export type Achievement = {
  id: string;
  title: string;
  description: string;
};

export type DashboardStats = {
  totalProjects: number;
  completedProjects: number;
  completionRate: number;
  activeProjects: number;
  codexTrackedProjects: number;
  totalLoggedMinutes: number;
  currentStreakDays: number;
  xp: number;
  level: number;
  focusProject?: Project;
  achievements: Achievement[];
};

export type ProgressInput = Omit<ProgressLog, "id"> & {
  progressDelta?: number;
};

export type CalendarOperation = {
  projectId: string;
  mode: "create" | "update";
  calendarId: string;
  eventId?: string;
  summary: string;
  description: string;
  startDate: string;
  endDate: string;
};

const STATUS_ORDER: ProjectStatus[] = ["not-started", "in-progress", "done"];
const PRIORITY_ORDER: ProjectPriority[] = [
  "ultra-high",
  "high",
  "medium",
  "low",
  "no-priority",
];

const PRIORITY_RANK: Record<ProjectPriority, number> = {
  "ultra-high": 0,
  high: 1,
  medium: 2,
  low: 3,
  "no-priority": 4,
};

const sortProjects = (left: Project, right: Project) => {
  const byPriority = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];

  if (byPriority !== 0) {
    return byPriority;
  }

  const leftDate = left.dueDate ?? left.startDate ?? "9999-12-31";
  const rightDate = right.dueDate ?? right.startDate ?? "9999-12-31";

  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate);
  }

  return left.name.localeCompare(right.name);
};

export const groupProjectsByStatus = (projects: Project[]): StatusColumn[] =>
  STATUS_ORDER.map((status) => {
    const items = projects.filter((project) => project.status === status).sort(sortProjects);

    return {
      status,
      count: items.length,
      projects: items,
    };
  });

export const groupProjectsByPriority = (projects: Project[]): PriorityColumn[] =>
  PRIORITY_ORDER.map((priority) => {
    const items = projects
      .filter((project) => project.priority === priority)
      .sort((left, right) => {
        if (left.status !== right.status) {
          return STATUS_ORDER.indexOf(left.status) - STATUS_ORDER.indexOf(right.status);
        }

        return sortProjects(left, right);
      });

    return {
      priority,
      count: items.length,
      projects: items,
    };
  });

const getCurrentStreakDays = (progressLogs: ProgressLog[], now: string) => {
  const days = new Set(
    progressLogs.map((log) => log.createdAt.slice(0, 10)).filter(Boolean),
  );

  let streak = 0;
  const cursor = new Date(now);

  while (true) {
    const dayKey = cursor.toISOString().slice(0, 10);

    if (!days.has(dayKey)) {
      break;
    }

    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return streak;
};

const getAchievements = (
  state: AppState,
  streak: number,
  totalLoggedMinutes: number,
): Achievement[] => {
  const achievements: Achievement[] = [];

  if (totalLoggedMinutes >= 120) {
    achievements.push({
      id: "deep-work",
      title: "Deep Work",
      description: "120+ focused minutes logged across projects.",
    });
  }

  if (state.projects.some((project) => project.status === "done")) {
    achievements.push({
      id: "shipped",
      title: "Shipped",
      description: "At least one project reached the done lane.",
    });
  }

  if (state.progressLogs.some((log) => log.source === "codex")) {
    achievements.push({
      id: "codex-loop",
      title: "Codex Loop",
      description: "Codex is actively feeding progress into the workspace.",
    });
  }

  if (streak >= 5) {
    achievements.push({
      id: "consistency",
      title: "Consistency",
      description: "Maintained a five day streak.",
    });
  }

  return achievements;
};

export const calculateDashboardStats = (
  state: AppState,
  now = new Date().toISOString(),
): DashboardStats => {
  const totalProjects = state.projects.length;
  const completedProjects = state.projects.filter(
    (project) => project.status === "done",
  ).length;
  const activeProjects = state.projects.filter(
    (project) => project.status === "in-progress",
  ).length;
  const codexTrackedProjects = state.projects.filter(
    (project) => project.codexEnabled,
  ).length;
  const totalLoggedMinutes = state.progressLogs.reduce(
    (sum, log) => sum + log.minutes,
    0,
  );
  const currentStreakDays = getCurrentStreakDays(state.progressLogs, now);
  const xp = totalLoggedMinutes + completedProjects * 120 + currentStreakDays * 20;
  const level = Math.max(1, Math.floor(xp / 100) + 1);
  const completionRate =
    totalProjects === 0 ? 0 : Math.round((completedProjects / totalProjects) * 100);

  return {
    totalProjects,
    completedProjects,
    completionRate,
    activeProjects,
    codexTrackedProjects,
    totalLoggedMinutes,
    currentStreakDays,
    xp,
    level,
    focusProject: state.projects.find(
      (project) => project.id === state.currentProjectId,
    ),
    achievements: getAchievements(state, currentStreakDays, totalLoggedMinutes),
  };
};

const inferProgress = (project: Project, input: ProgressInput) => {
  if (typeof input.progressDelta === "number") {
    return Math.min(100, Math.max(0, project.progress + input.progressDelta));
  }

  return Math.min(100, Math.max(project.progress, project.progress + Math.round(input.minutes / 12)));
};

export const appendProgressLog = (
  state: AppState,
  input: ProgressInput,
): AppState => {
  const logId = `log-${crypto.randomUUID()}`;

  return {
    ...state,
    projects: state.projects.map((project) => {
      if (project.id !== input.projectId) {
        return project;
      }

      const progress = inferProgress(project, input);
      const status: ProjectStatus =
        progress >= 100 ? "done" : project.status === "done" ? "done" : "in-progress";

      return {
        ...project,
        progress,
        status,
        updatedAt: input.createdAt,
      };
    }),
    progressLogs: [
      ...state.progressLogs,
      {
        id: logId,
        projectId: input.projectId,
        summary: input.summary,
        minutes: input.minutes,
        source: input.source,
        createdAt: input.createdAt,
      },
    ],
  };
};

export const buildCalendarOperations = (
  projects: Project[],
  calendarId: string,
): CalendarOperation[] =>
  projects
    .filter(
      (project) =>
        project.status !== "done" &&
        Boolean(project.startDate || project.dueDate),
    )
    .sort(sortProjects)
    .map((project) => {
      const startDate = project.startDate ?? project.dueDate!;
      const endDate = project.dueDate ?? startDate;

      return {
        projectId: project.id,
        mode: project.calendarEventId ? "update" : "create",
        calendarId,
        eventId: project.calendarEventId,
        summary: `${project.emoji ? `${project.emoji} ` : ""}${project.name}`,
        description: [
          `Status: ${project.status}`,
          `Priority: ${project.priority}`,
          `Progress: ${project.progress}%`,
        ].join("\n"),
        startDate,
        endDate,
      };
    });
