export interface DependencyAnalyzerSkill {
  analyze(subtasks: any[]): Promise<{
    graph: any;
    parallelGroups: string[][];
    hasConflicts: boolean;
    conflictDetails?: Array<{ files: string[]; tasks: string[] }>;
  }>;
}

export class DefaultDependencyAnalyzerSkill implements DependencyAnalyzerSkill {
  async analyze(subtasks: any[]): Promise<{
    graph: any;
    parallelGroups: string[][];
    hasConflicts: boolean;
    conflictDetails?: Array<{ files: string[]; tasks: string[] }>;
  }> {
    const graph: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};
    const taskMap: Record<string, any> = {};

    // Initialize structures
    for (const task of subtasks) {
      graph[task.id] = [];
      inDegree[task.id] = 0;
      taskMap[task.id] = task;
    }

    // Build graph
    for (const task of subtasks) {
      const deps = task.dependencies || [];
      for (const depId of deps) {
        if (graph[depId]) {
          graph[depId].push(task.id);
          inDegree[task.id]++;
        }
      }
    }

    // Topological sort to find parallel groups
    const parallelGroups: string[][] = [];
    let queue: string[] = [];

    // Find initial tasks with 0 dependencies
    for (const [id, degree] of Object.entries(inDegree)) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    let processedCount = 0;

    while (queue.length > 0) {
      const nextQueue: string[] = [];
      const currentGroup: string[] = [...queue];
      parallelGroups.push(currentGroup);

      for (const id of queue) {
        processedCount++;
        for (const dependent of graph[id] || []) {
          inDegree[dependent]--;
          if (inDegree[dependent] === 0) {
            nextQueue.push(dependent);
          }
        }
      }
      queue = nextQueue;
    }

    const hasCycles = processedCount < subtasks.length;
    let hasConflicts = hasCycles;
    const conflictDetails: Array<{ files: string[]; tasks: string[] }> = [];

    if (hasCycles) {
      // Find all tasks that are part of a cycle
      const cyclicTasks = Object.keys(inDegree).filter(id => inDegree[id] > 0);
      conflictDetails.push({
        files: [],
        tasks: cyclicTasks
      });
      return {
        graph,
        parallelGroups: [],
        hasConflicts: true,
        conflictDetails
      };
    }

    // Check for file conflicts within parallel groups
    for (const group of parallelGroups) {
      const fileToTasks: Record<string, string[]> = {};

      for (const taskId of group) {
        const task = taskMap[taskId];
        const files = task.estimatedFiles || [];
        for (const file of files) {
          if (!fileToTasks[file]) {
            fileToTasks[file] = [];
          }
          fileToTasks[file].push(taskId);
        }
      }

      for (const [file, tasks] of Object.entries(fileToTasks)) {
        if (tasks.length > 1) {
          hasConflicts = true;
          conflictDetails.push({
            files: [file],
            tasks: tasks
          });
        }
      }
    }

    return {
      graph,
      parallelGroups,
      hasConflicts,
      ...(conflictDetails.length > 0 ? { conflictDetails } : {})
    };
  }
}
