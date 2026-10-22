import { openDB } from "idb";
import type { Project } from "./types";

const DB = "chat-reel";
const STORE = "projects";
const dbp = openDB(DB, 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
  },
});

export async function saveProject(p: Project) {
  (await dbp).put(STORE, { ...p, updatedAt: new Date().toISOString() });
}
export async function loadProject(id: string): Promise<Project | undefined> {
  return (await dbp).get(STORE, id);
}
export async function listProjects(): Promise<Project[]> {
  return (await dbp).getAll(STORE);
}
