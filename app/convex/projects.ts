import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
});

export const get = query({
  args: { projectId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const project = await ctx.db
      .query("projects")
      .withIndex("by_project_id", (q) => q.eq("projectId", args.projectId))
      .first();

    if (!project) return null;

    // Check ownership or if project is public
    if (project.userId !== userId && !project.isPublic) {
      return null;
    }

    return project;
  },
});

export const save = mutation({
  args: {
    projectId: v.string(),
    title: v.string(),
    schemaVersion: v.number(),
    participants: v.array(v.any()),
    messages: v.array(v.any()),
    appearance: v.any(),
    exportSettings: v.any(),
    storageId: v.optional(v.id("_storage")),
    createdAt: v.string(),
    updatedAt: v.string(),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be logged in to save project");

    const existing = await ctx.db
      .query("projects")
      .withIndex("by_user_project_id", (q) =>
        q.eq("userId", userId).eq("projectId", args.projectId)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        schemaVersion: args.schemaVersion,
        participants: args.participants,
        messages: args.messages,
        appearance: args.appearance,
        exportSettings: args.exportSettings,
        storageId: args.storageId,
        updatedAt: args.updatedAt,
        isPublic: args.isPublic ?? existing.isPublic,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("projects", {
        userId,
        projectId: args.projectId,
        title: args.title,
        schemaVersion: args.schemaVersion,
        participants: args.participants,
        messages: args.messages,
        appearance: args.appearance,
        exportSettings: args.exportSettings,
        storageId: args.storageId,
        createdAt: args.createdAt,
        updatedAt: args.updatedAt,
        isPublic: args.isPublic ?? false,
      });
    }
  },
});

export const remove = mutation({
  args: { projectId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("projects")
      .withIndex("by_user_project_id", (q) =>
        q.eq("userId", userId).eq("projectId", args.projectId)
      )
      .first();

    if (!existing) return false;
    await ctx.db.delete(existing._id);
    return true;
  },
});

export const duplicate = mutation({
  args: { projectId: v.string(), newProjectId: v.string(), newTitle: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("projects")
      .withIndex("by_user_project_id", (q) =>
        q.eq("userId", userId).eq("projectId", args.projectId)
      )
      .first();

    if (!existing) throw new Error("Project not found");

    const now = new Date().toISOString();
    return await ctx.db.insert("projects", {
      userId,
      projectId: args.newProjectId,
      title: args.newTitle,
      schemaVersion: existing.schemaVersion,
      participants: existing.participants,
      messages: existing.messages,
      appearance: existing.appearance,
      exportSettings: existing.exportSettings,
      storageId: existing.storageId,
      createdAt: now,
      updatedAt: now,
      isPublic: false,
    });
  },
});

export const setPublic = mutation({
  args: { projectId: v.string(), isPublic: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("projects")
      .withIndex("by_user_project_id", (q) =>
        q.eq("userId", userId).eq("projectId", args.projectId)
      )
      .first();

    if (!existing) throw new Error("Project not found");

    await ctx.db.patch(existing._id, { isPublic: args.isPublic });
    return true;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return await ctx.storage.generateUploadUrl();
  },
});
