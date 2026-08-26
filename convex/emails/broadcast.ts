import {
  internalAction,
  internalQuery,
  internalMutation,
  mutation,
  query,
} from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { requirePermission } from "../adminAccess";

/**
 * Debug query to see all users (admin only)
 */
export const debugUsers = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("users"),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      clerkId: v.string(),
      hasEmail: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    await requirePermission(ctx, "emails.send");

    const users = await ctx.db.query("users").collect();

    return users.map((user) => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      clerkId: user.clerkId,
      hasEmail: !!user.email,
    }));
  },
});

/**
 * Search for users by name or email (admin only)
 */
export const searchUsers = query({
  args: {
    query: v.string(),
  },
  returns: v.array(
    v.object({
      _id: v.id("users"),
      name: v.optional(v.string()),
      email: v.string(),
      unsubscribed: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    await requirePermission(ctx, "emails.send");

    const searchTerm = args.query.toLowerCase().trim();
    if (searchTerm.length < 2) {
      return [];
    }

    // Search users by name or email - get all users and filter in JavaScript
    const users = await ctx.db.query("users").collect();

    const matchingUsers = users
      .filter((user) => {
        // Must have email to be included in search results
        if (!user.email || user.email.trim() === "") return false;

        const nameMatch =
          user.name?.toLowerCase().includes(searchTerm) || false;
        const emailMatch =
          user.email.toLowerCase().includes(searchTerm) || false;

        return nameMatch || emailMatch;
      })
      .slice(0, 10); // Limit to 10 results

    // Flag anyone who opted out of all emails so the picker can block them.
    // Only runs for the (max 10) matches, so the lookups stay cheap.
    const results = await Promise.all(
      matchingUsers.map(async (user) => {
        const settings = await ctx.db
          .query("emailSettings")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .unique();
        return {
          _id: user._id,
          name: user.name,
          email: user.email!,
          unsubscribed: !!settings?.unsubscribedAt,
        };
      }),
    );
    return results;
  },
});

/**
 * Validate an optional schedule timestamp. Returns the timestamp when the
 * broadcast should be delayed, or null for an immediate send.
 */
function resolveScheduledAt(scheduledAtMs: number | undefined): number | null {
  if (scheduledAtMs === undefined) return null;
  if (!Number.isFinite(scheduledAtMs)) {
    throw new Error("Invalid schedule time");
  }
  // Allow a small clock-skew grace window, otherwise require a future time
  if (scheduledAtMs < Date.now() - 60 * 1000) {
    throw new Error("Schedule time must be in the future");
  }
  return scheduledAtMs;
}

/**
 * Send broadcast email to selected users
 */
export const sendBroadcastToSelected = mutation({
  args: {
    subject: v.string(),
    htmlContent: v.string(),
    userIds: v.array(v.id("users")),
    scheduledAtMs: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    totalRecipients: v.number(),
    successCount: v.number(),
    failureCount: v.number(),
  }),
  handler: async (ctx, args) => {
    await requirePermission(ctx, "emails.send");

    // Get the current user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Authentication required");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const scheduledAt = resolveScheduledAt(args.scheduledAtMs);

    if (scheduledAt !== null) {
      // Create a queued record now so the schedule is visible and cancellable
      const broadcastId = await ctx.db.insert("broadcastEmails", {
        createdBy: user._id,
        subject: args.subject,
        html: args.htmlContent,
        status: "queued",
        totalRecipients: args.userIds.length,
        sentCount: 0,
        scheduledAt,
        recipientSummary: `${args.userIds.length} selected user${args.userIds.length !== 1 ? "s" : ""}`,
      });
      const scheduledFunctionId = await ctx.scheduler.runAt(
        scheduledAt,
        internal.emails.broadcast.sendBroadcastToSelectedUsers,
        {
          subject: args.subject,
          htmlContent: args.htmlContent,
          userIds: args.userIds,
          adminUserId: user._id,
          broadcastId,
        },
      );
      await ctx.db.patch(broadcastId, { scheduledFunctionId });
      return {
        success: true,
        totalRecipients: args.userIds.length,
        successCount: 0,
        failureCount: 0,
      };
    }

    // Schedule the broadcast email sending via scheduler
    await ctx.scheduler.runAfter(
      0,
      internal.emails.broadcast.sendBroadcastToSelectedUsers,
      {
        subject: args.subject,
        htmlContent: args.htmlContent,
        userIds: args.userIds,
        adminUserId: user._id,
      },
    );

    // Return immediate response since this is scheduled
    return {
      success: true,
      totalRecipients: args.userIds.length,
      successCount: 0,
      failureCount: 0,
    };
  },
});

/**
 * Public mutation for admins to send broadcast emails
 */
export const sendBroadcast = mutation({
  args: {
    subject: v.string(),
    htmlContent: v.string(),
    scheduledAtMs: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    totalRecipients: v.number(),
    successCount: v.number(),
    failureCount: v.number(),
  }),
  handler: async (ctx, args) => {
    await requirePermission(ctx, "emails.send");

    // Get the current user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Authentication required");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new Error("User not found");
    }

    const scheduledAt = resolveScheduledAt(args.scheduledAtMs);

    if (scheduledAt !== null) {
      // Create a queued record now so the schedule is visible and cancellable
      const broadcastId = await ctx.db.insert("broadcastEmails", {
        createdBy: user._id,
        subject: args.subject,
        html: args.htmlContent,
        status: "queued",
        sentCount: 0,
        scheduledAt,
        recipientSummary: "All subscribed users",
      });
      const scheduledFunctionId = await ctx.scheduler.runAt(
        scheduledAt,
        internal.emails.broadcast.sendBroadcastEmail,
        {
          subject: args.subject,
          htmlContent: args.htmlContent,
          adminUserId: user._id,
          broadcastId,
        },
      );
      await ctx.db.patch(broadcastId, { scheduledFunctionId });
      return {
        success: true,
        totalRecipients: 0,
        successCount: 0,
        failureCount: 0,
      };
    }

    // Schedule the broadcast email sending via scheduler (mutations can't call actions directly)
    await ctx.scheduler.runAfter(
      0,
      internal.emails.broadcast.sendBroadcastEmail,
      {
        subject: args.subject,
        htmlContent: args.htmlContent,
        adminUserId: user._id,
      },
    );

    // Return immediate response since this is scheduled
    return {
      success: true,
      totalRecipients: 0, // Will be updated when action runs
      successCount: 0,
      failureCount: 0,
    };
  },
});

// Status filter for tag-based broadcasts (which submission statuses to include)
const tagStatusValidator = v.array(
  v.union(
    v.literal("pending"),
    v.literal("approved"),
    v.literal("rejected"),
  ),
);

/**
 * Count subscribed users who authored a story using the given tag.
 * Public (admin) query so the dashboard can preview the recipient count.
 * `statuses` limits which submission statuses count; empty means all.
 */
export const countUsersByTag = query({
  args: {
    tagId: v.id("tags"),
    statuses: v.optional(tagStatusValidator),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    await requirePermission(ctx, "emails.send");

    const statusFilter = args.statuses ?? [];
    // Collect distinct authors of stories that include this tag (and match status)
    const stories = await ctx.db.query("stories").collect();
    const userIds = new Set<Id<"users">>();
    for (const story of stories) {
      if (
        story.userId &&
        story.tagIds.includes(args.tagId) &&
        (statusFilter.length === 0 || statusFilter.includes(story.status))
      ) {
        userIds.add(story.userId);
      }
    }

    // Count only users with an email who haven't unsubscribed
    let count = 0;
    for (const userId of userIds) {
      const user = await ctx.db.get(userId);
      if (!user || !user.email) continue;
      const settings = await ctx.db
        .query("emailSettings")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();
      if (settings?.unsubscribedAt) continue;
      count++;
    }
    return count;
  },
});

/**
 * Internal: distinct, subscribed users who authored a story using a tag.
 */
export const getUsersByTag = internalQuery({
  args: {
    tagId: v.id("tags"),
    statuses: v.optional(tagStatusValidator),
  },
  returns: v.array(
    v.object({
      _id: v.id("users"),
      email: v.string(),
      name: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const statusFilter = args.statuses ?? [];
    const stories = await ctx.db.query("stories").collect();
    const userIds = new Set<Id<"users">>();
    for (const story of stories) {
      if (
        story.userId &&
        story.tagIds.includes(args.tagId) &&
        (statusFilter.length === 0 || statusFilter.includes(story.status))
      ) {
        userIds.add(story.userId);
      }
    }

    const result: Array<{
      _id: Id<"users">;
      email: string;
      name?: string;
    }> = [];
    for (const userId of userIds) {
      const user = await ctx.db.get(userId);
      if (!user || !user.email) continue;

      const settings = await ctx.db
        .query("emailSettings")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();
      if (settings?.unsubscribedAt) continue;

      result.push({ _id: user._id, email: user.email, name: user.name });
    }
    return result;
  },
});

/**
 * Public mutation for admins to broadcast to everyone who used a tag.
 */
export const sendBroadcastToTag = mutation({
  args: {
    subject: v.string(),
    htmlContent: v.string(),
    tagId: v.id("tags"),
    statuses: v.optional(tagStatusValidator),
    scheduledAtMs: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    totalRecipients: v.number(),
    successCount: v.number(),
    failureCount: v.number(),
  }),
  handler: async (ctx, args) => {
    await requirePermission(ctx, "emails.send");

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Authentication required");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) {
      throw new Error("User not found");
    }

    const scheduledAt = resolveScheduledAt(args.scheduledAtMs);

    if (scheduledAt !== null) {
      // Create a queued record now so the schedule is visible and cancellable
      const tag = await ctx.db.get(args.tagId);
      const broadcastId = await ctx.db.insert("broadcastEmails", {
        createdBy: user._id,
        subject: args.subject,
        html: args.htmlContent,
        status: "queued",
        sentCount: 0,
        scheduledAt,
        recipientSummary: tag
          ? `Users tagged "${tag.name}"`
          : "Users with tag",
      });
      const scheduledFunctionId = await ctx.scheduler.runAt(
        scheduledAt,
        internal.emails.broadcast.sendBroadcastToTagUsers,
        {
          subject: args.subject,
          htmlContent: args.htmlContent,
          tagId: args.tagId,
          statuses: args.statuses,
          adminUserId: user._id,
          broadcastId,
        },
      );
      await ctx.db.patch(broadcastId, { scheduledFunctionId });
      return {
        success: true,
        totalRecipients: 0,
        successCount: 0,
        failureCount: 0,
      };
    }

    // Schedule the send (mutations can't call actions directly)
    await ctx.scheduler.runAfter(
      0,
      internal.emails.broadcast.sendBroadcastToTagUsers,
      {
        subject: args.subject,
        htmlContent: args.htmlContent,
        tagId: args.tagId,
        statuses: args.statuses,
        adminUserId: user._id,
      },
    );

    return {
      success: true,
      totalRecipients: 0,
      successCount: 0,
      failureCount: 0,
    };
  },
});

/**
 * Send broadcast email to all subscribed users who used a tag.
 */
export const sendBroadcastToTagUsers = internalAction({
  args: {
    subject: v.string(),
    htmlContent: v.string(),
    tagId: v.id("tags"),
    statuses: v.optional(tagStatusValidator),
    adminUserId: v.id("users"),
    broadcastId: v.optional(v.id("broadcastEmails")),
  },
  returns: v.object({
    success: v.boolean(),
    totalRecipients: v.number(),
    successCount: v.number(),
    failureCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const users: Array<{
      _id: any;
      email: string;
      name?: string;
    }> = await ctx.runQuery(internal.emails.broadcast.getUsersByTag, {
      tagId: args.tagId,
      statuses: args.statuses,
    });

    if (users.length === 0) {
      // Close out a scheduled record even when nobody matches at send time
      if (args.broadcastId) {
        await ctx.runMutation(internal.emails.broadcast.updateBroadcastRecord, {
          broadcastId: args.broadcastId,
          sentCount: 0,
          status: "completed",
        });
      }
      return {
        success: true,
        totalRecipients: 0,
        successCount: 0,
        failureCount: 0,
      };
    }

    // Reuse the queued record from a scheduled send, or create one now
    const broadcastId: Id<"broadcastEmails"> =
      args.broadcastId ??
      (await ctx.runMutation(internal.emails.broadcast.createBroadcastRecord, {
        createdBy: args.adminUserId,
        subject: args.subject,
        html: args.htmlContent,
        totalRecipients: users.length,
      }));
    if (args.broadcastId) {
      await ctx.runMutation(internal.emails.broadcast.markBroadcastSending, {
        broadcastId,
        totalRecipients: users.length,
      });
    }

    let successCount = 0;
    let failureCount = 0;

    // Send in batches to respect rate limits
    const batchSize = 10;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);

      for (const user of batch) {
        try {
          const unsubscribeToken = await ctx.runMutation(
            internal.emails.linkHelpers.generateUnsubscribeToken,
            {
              userId: user._id,
              purpose: "all",
            },
          );

          const userWithDetails = await ctx.runQuery(
            internal.emails.queries.getUserWithEmail,
            { userId: user._id },
          );

          const emailTemplate = await ctx.runQuery(
            internal.emails.templates.generateBroadcastEmail,
            {
              subject: args.subject,
              content: args.htmlContent,
              userId: user._id,
              userName: user.name || "User",
              userUsername: userWithDetails?.username,
              unsubscribeToken,
            },
          );

          const result = await ctx.runAction(internal.emails.resend.sendEmail, {
            to: user.email,
            subject: emailTemplate.subject,
            html: emailTemplate.html,
            emailType: "admin_broadcast",
            userId: user._id,
            unsubscribeToken,
            metadata: {
              broadcastId,
              adminUserId: args.adminUserId,
              tagId: args.tagId,
            },
          });

          if (result.success) {
            successCount++;
          } else {
            failureCount++;
          }
        } catch (error) {
          console.error(
            `Failed to send tag broadcast email to ${user.email}:`,
            error,
          );
          failureCount++;
        }
      }

      if (i + batchSize < users.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    await ctx.runMutation(internal.emails.broadcast.updateBroadcastRecord, {
      broadcastId,
      sentCount: successCount,
      status: "completed",
    });

    return {
      success: true,
      totalRecipients: users.length,
      successCount,
      failureCount,
    };
  },
});

/**
 * Get user by ID with email
 */
export const getUserById = internalQuery({
  args: {
    userId: v.id("users"),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      email: v.string(),
      name: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || !user.email) {
      return null;
    }
    return {
      _id: user._id,
      email: user.email,
      name: user.name,
    };
  },
});

/**
 * Get all users who haven't unsubscribed from emails
 */
export const getEmailSubscribedUsers = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("users"),
      email: v.string(),
      name: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    // Get all users; the loop below skips anyone without an email address
    const users = await ctx.db.query("users").collect();

    // Filter out users who have unsubscribed from all emails
    const subscribedUsers = [];
    for (const user of users) {
      if (!user.email) continue;

      const emailSettings = await ctx.db
        .query("emailSettings")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .unique();

      // Skip if user has unsubscribed from all emails
      if (emailSettings?.unsubscribedAt) {
        continue;
      }

      subscribedUsers.push({
        _id: user._id,
        email: user.email,
        name: user.name,
      });
    }

    return subscribedUsers;
  },
});

/**
 * Send broadcast email to selected users
 */
export const sendBroadcastToSelectedUsers = internalAction({
  args: {
    subject: v.string(),
    htmlContent: v.string(),
    userIds: v.array(v.id("users")),
    adminUserId: v.id("users"),
    broadcastId: v.optional(v.id("broadcastEmails")),
  },
  returns: v.object({
    success: v.boolean(),
    totalRecipients: v.number(),
    successCount: v.number(),
    failureCount: v.number(),
  }),
  handler: async (ctx, args) => {
    // Get selected users with their email addresses
    const users: Array<{
      _id: any;
      email: string;
      name?: string;
    }> = [];

    for (const userId of args.userIds) {
      const user = await ctx.runQuery(internal.emails.broadcast.getUserById, {
        userId,
      });
      if (user && user.email) {
        // Check if user has unsubscribed
        const emailSettings = await ctx.runQuery(
          internal.emails.helpers.getUserEmailSettings,
          { userId: user._id },
        );

        // Skip if user has unsubscribed from all emails
        if (!emailSettings?.unsubscribedAt) {
          users.push(user);
        }
      }
    }

    if (users.length === 0) {
      // Close out a scheduled record even when nobody matches at send time
      if (args.broadcastId) {
        await ctx.runMutation(internal.emails.broadcast.updateBroadcastRecord, {
          broadcastId: args.broadcastId,
          sentCount: 0,
          status: "completed",
        });
      }
      return {
        success: true,
        totalRecipients: 0,
        successCount: 0,
        failureCount: 0,
      };
    }

    // Reuse the queued record from a scheduled send, or create one now
    const broadcastId: Id<"broadcastEmails"> =
      args.broadcastId ??
      (await ctx.runMutation(internal.emails.broadcast.createBroadcastRecord, {
        createdBy: args.adminUserId,
        subject: args.subject,
        html: args.htmlContent,
        totalRecipients: users.length,
      }));
    if (args.broadcastId) {
      await ctx.runMutation(internal.emails.broadcast.markBroadcastSending, {
        broadcastId,
        totalRecipients: users.length,
      });
    }

    let successCount = 0;
    let failureCount = 0;

    // Send emails in batches to respect rate limits
    const batchSize = 10;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);

      for (const user of batch) {
        try {
          // Generate unsubscribe token for this user
          const unsubscribeToken = await ctx.runMutation(
            internal.emails.linkHelpers.generateUnsubscribeToken,
            {
              userId: user._id,
              purpose: "all",
            },
          );

          // Get user username for template
          const userWithDetails = await ctx.runQuery(
            internal.emails.queries.getUserWithEmail,
            { userId: user._id },
          );

          // Generate broadcast email template with unsubscribe functionality
          const emailTemplate = await ctx.runQuery(
            internal.emails.templates.generateBroadcastEmail,
            {
              subject: args.subject,
              content: args.htmlContent,
              userId: user._id,
              userName: user.name || "User",
              userUsername: userWithDetails?.username,
              unsubscribeToken,
            },
          );

          const result = await ctx.runAction(internal.emails.resend.sendEmail, {
            to: user.email,
            subject: emailTemplate.subject,
            html: emailTemplate.html,
            emailType: "admin_broadcast",
            userId: user._id,
            unsubscribeToken,
            metadata: {
              broadcastId,
              adminUserId: args.adminUserId,
            },
          });

          if (result.success) {
            successCount++;
          } else {
            failureCount++;
          }
        } catch (error) {
          console.error(
            `Failed to send broadcast email to ${user.email}:`,
            error,
          );
          failureCount++;
        }
      }

      // Add delay between batches to respect rate limits
      if (i + batchSize < users.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Update broadcast record with results
    await ctx.runMutation(internal.emails.broadcast.updateBroadcastRecord, {
      broadcastId,
      sentCount: successCount,
      status: "completed",
    });

    return {
      success: true,
      totalRecipients: users.length,
      successCount,
      failureCount,
    };
  },
});

/**
 * Send broadcast email to all subscribed users
 */
export const sendBroadcastEmail = internalAction({
  args: {
    subject: v.string(),
    htmlContent: v.string(),
    adminUserId: v.id("users"),
    broadcastId: v.optional(v.id("broadcastEmails")),
  },
  returns: v.object({
    success: v.boolean(),
    totalRecipients: v.number(),
    successCount: v.number(),
    failureCount: v.number(),
  }),
  handler: async (ctx, args) => {
    // Get all subscribed users
    const users: Array<{
      _id: any;
      email: string;
      name?: string;
    }> = await ctx.runQuery(
      internal.emails.broadcast.getEmailSubscribedUsers,
      {},
    );

    if (users.length === 0) {
      // Close out a scheduled record even when nobody matches at send time
      if (args.broadcastId) {
        await ctx.runMutation(internal.emails.broadcast.updateBroadcastRecord, {
          broadcastId: args.broadcastId,
          sentCount: 0,
          status: "completed",
        });
      }
      return {
        success: true,
        totalRecipients: 0,
        successCount: 0,
        failureCount: 0,
      };
    }

    // Reuse the queued record from a scheduled send, or create one now
    const broadcastId: Id<"broadcastEmails"> =
      args.broadcastId ??
      (await ctx.runMutation(internal.emails.broadcast.createBroadcastRecord, {
        createdBy: args.adminUserId,
        subject: args.subject,
        html: args.htmlContent,
        totalRecipients: users.length,
      }));
    if (args.broadcastId) {
      await ctx.runMutation(internal.emails.broadcast.markBroadcastSending, {
        broadcastId,
        totalRecipients: users.length,
      });
    }

    let successCount = 0;
    let failureCount = 0;

    // Send emails in batches to respect rate limits
    const batchSize = 10;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);

      for (const user of batch) {
        try {
          // Generate unsubscribe token for this user
          const unsubscribeToken = await ctx.runMutation(
            internal.emails.linkHelpers.generateUnsubscribeToken,
            {
              userId: user._id,
              purpose: "all",
            },
          );

          // Get user username for template
          const userWithDetails = await ctx.runQuery(
            internal.emails.queries.getUserWithEmail,
            { userId: user._id },
          );

          // Generate broadcast email template with unsubscribe functionality
          const emailTemplate = await ctx.runQuery(
            internal.emails.templates.generateBroadcastEmail,
            {
              subject: args.subject,
              content: args.htmlContent,
              userId: user._id,
              userName: user.name || "User",
              userUsername: userWithDetails?.username,
              unsubscribeToken,
            },
          );

          const result = await ctx.runAction(internal.emails.resend.sendEmail, {
            to: user.email,
            subject: emailTemplate.subject,
            html: emailTemplate.html,
            emailType: "admin_broadcast",
            userId: user._id,
            unsubscribeToken,
            metadata: {
              broadcastId,
              adminUserId: args.adminUserId,
            },
          });

          if (result.success) {
            successCount++;
          } else {
            failureCount++;
          }
        } catch (error) {
          console.error(
            `Failed to send broadcast email to ${user.email}:`,
            error,
          );
          failureCount++;
        }
      }

      // Add delay between batches to respect rate limits
      if (i + batchSize < users.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Update broadcast record with results
    await ctx.runMutation(internal.emails.broadcast.updateBroadcastRecord, {
      broadcastId,
      sentCount: successCount,
      status: "completed",
    });

    return {
      success: true,
      totalRecipients: users.length,
      successCount,
      failureCount,
    };
  },
});

/**
 * Create broadcast email record
 */
export const createBroadcastRecord = internalMutation({
  args: {
    createdBy: v.id("users"),
    subject: v.string(),
    html: v.string(),
    totalRecipients: v.number(),
  },
  returns: v.id("broadcastEmails"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("broadcastEmails", {
      createdBy: args.createdBy,
      subject: args.subject,
      html: args.html,
      status: "sending",
      totalRecipients: args.totalRecipients,
      sentCount: 0,
    });
  },
});

/**
 * Update broadcast email record
 */
export const updateBroadcastRecord = internalMutation({
  args: {
    broadcastId: v.id("broadcastEmails"),
    sentCount: v.number(),
    status: v.union(
      v.literal("draft"),
      v.literal("queued"),
      v.literal("sending"),
      v.literal("completed"),
      v.literal("cancelled"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.broadcastId, {
      sentCount: args.sentCount,
      status: args.status,
    });
    return null;
  },
});

/**
 * Mark a queued (scheduled) broadcast as sending with the final recipient count
 */
export const markBroadcastSending = internalMutation({
  args: {
    broadcastId: v.id("broadcastEmails"),
    totalRecipients: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.broadcastId, {
      status: "sending",
      totalRecipients: args.totalRecipients,
    });
    return null;
  },
});

/**
 * List queued (scheduled) broadcasts for the admin dashboard, soonest first
 */
export const listScheduledBroadcasts = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("broadcastEmails"),
      _creationTime: v.number(),
      subject: v.string(),
      scheduledAt: v.optional(v.number()),
      recipientSummary: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    await requirePermission(ctx, "emails.send");

    const queued = await ctx.db
      .query("broadcastEmails")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .collect();

    return queued
      .sort((a, b) => (a.scheduledAt ?? 0) - (b.scheduledAt ?? 0))
      .map((b) => ({
        _id: b._id,
        _creationTime: b._creationTime,
        subject: b.subject,
        scheduledAt: b.scheduledAt,
        recipientSummary: b.recipientSummary,
      }));
  },
});

/**
 * Cancel a scheduled broadcast before it sends. Idempotent: if the job has
 * already started (status is no longer queued) this is a no-op.
 */
export const cancelScheduledBroadcast = mutation({
  args: {
    broadcastId: v.id("broadcastEmails"),
  },
  returns: v.object({ cancelled: v.boolean() }),
  handler: async (ctx, args) => {
    await requirePermission(ctx, "emails.send");

    const broadcast = await ctx.db.get(args.broadcastId);
    if (!broadcast || broadcast.status !== "queued") {
      return { cancelled: false };
    }

    if (broadcast.scheduledFunctionId) {
      await ctx.scheduler.cancel(broadcast.scheduledFunctionId);
    }

    await ctx.db.patch(args.broadcastId, {
      status: "cancelled",
      cancelledAt: Date.now(),
    });
    return { cancelled: true };
  },
});
