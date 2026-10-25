import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,
  projects: defineTable({
    userId: v.id("users"),
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
  })
    .index("by_user", ["userId"])
    .index("by_user_updated", ["userId", "updatedAt"])
    .index("by_project_id", ["projectId"])
    .index("by_user_project_id", ["userId", "projectId"]),
});
