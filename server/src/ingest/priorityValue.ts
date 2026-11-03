import { PRIORITIES, type Priority } from "../config/constants";

export function parsePriority(value: string | undefined): Priority {
  const normalized = value?.trim().toUpperCase();
  const priority = PRIORITIES.find((candidate) => candidate === normalized);
  if (priority) return priority;
  throw new Error("Gemini returned an invalid priority");
}
