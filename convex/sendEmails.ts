import { components, internal } from "./_generated/api";
import { Resend } from "@convex-dev/resend";
import {
  internalMutation,
  internalAction,
  mutation,
  type MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { requirePermission } from "./adminAccess";
import {
  escapeHtml,
  judgingGroupUrls,
  templateEmailShell,
} from "./emails/render";

export const resend: Resend = new Resend(components.resend, {
  testMode: false, // Disable test mode to send to real email addresses
  // Component calls this mutation after verifying each Resend webhook event,
  // keeping emailLogs delivery statuses in sync (delivered/bounced/complained).
  onEmailEvent: internal.emails.queries.handleEmailEvent,
});

// Public mutation for admins to send test emails
export const sendTestEmail = mutation({
  args: {
    to: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    await requirePermission(ctx, "emails.send");

    try {
      await resend.sendEmail(ctx, {
        from: "VibeApps Updates <alerts@updates.vibeapps.dev>",
        to: args.to,
        subject: "VibeApps Updates: Test email from admin",
        html: `
          <h2>Test Email Success!</h2>
          <p>This test email was sent from the VibeApps admin dashboard.</p>
          <p><strong>Sent to:</strong> ${args.to}</p>
          <p><strong>Time:</strong> ${new Date().toISOString()}</p>
          <p>If you received this, your email system is working perfectly! 🎉</p>
        `,
      });

      return {
        success: true,
        message: `Test email sent successfully to ${args.to}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to send test email: ${error}`,
      };
    }
  },
});

// Internal mutation for testing; enforces subject prefix and from address.
export const sendTestEmailInternal = internalMutation({
  args: {
    to: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    try {
      await resend.sendEmail(ctx, {
        from: "VibeApps Updates <alerts@updates.vibeapps.dev>",
        to: args.to || "wayne@convex.dev", // Default to your email
        subject: "VibeApps Updates: Test email from admin",
        html: `
          <h2>Test Email Success!</h2>
          <p>This test email was sent from the VibeApps admin dashboard.</p>
          <p><strong>Sent to:</strong> ${args.to || "wayne@convex.dev"}</p>
          <p><strong>Time:</strong> ${new Date().toISOString()}</p>
          <p>If you received this, your email system is working perfectly! 🎉</p>
        `,
      });

      return {
        success: true,
        message: `Test email sent successfully to ${args.to || "wayne@convex.dev"}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to send test email: ${error}`,
      };
    }
  },
});

// Internal action to send emails (used by other internal functions)
export const sendEmail = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    html: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    try {
      await resend.sendEmail(ctx, {
        from: "VibeApps Updates <alerts@updates.vibeapps.dev>",
        to: args.to,
        subject: withSubjectPrefix(args.subject),
        html: args.html,
      });

      return {
        success: true,
        message: `Email sent successfully to ${args.to}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to send email: ${error}`,
      };
    }
  },
});

// Helper to wrap subjects to always have the required prefix
export function withSubjectPrefix(subject: string): string {
  const prefix = "VibeApps Updates: ";
  return subject.startsWith(prefix) ? subject : `${prefix}${subject}`;
}

const SAMPLE_FROM = "VibeApps Updates <alerts@updates.vibeapps.dev>";

async function sendSampleNotificationEmailsTo(
  ctx: MutationCtx,
  to: string,
): Promise<{ success: boolean; message: string; sent: Array<string> }> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", to))
    .unique();
  const footerOpts = {
    userId: user?._id,
    username: user?.username,
  };
  const groupUrls = judgingGroupUrls("sample-hackathon");
  const name = escapeHtml(user?.name ?? "Wayne");
  const samples: Array<{ key: string; subject: string; html: string }> = [
    {
      key: "submission_confirmation",
      subject: withSubjectPrefix("Submission received: Sample App"),
      html: templateEmailShell(
        `<h1 style="color: #292929; margin-bottom: 10px;">Submission received</h1>
            <p style="color: #666; margin-bottom: 20px;">Hi ${name},</p>
            <p style="color: #666; margin-bottom: 20px;">
              Your submission <strong>Sample App</strong> to <strong>Sample Hackathon</strong>
              was received and is pending review.
            </p>
            <p style="color: #666; margin-bottom: 20px;">
              View it here:
              <a href="https://vibeapps.dev/s/sample-app" style="color: #292929;">https://vibeapps.dev/s/sample-app</a>
            </p>`,
        undefined,
        footerOpts,
      ),
    },
    {
      key: "submission_admin_alert",
      subject: withSubjectPrefix(
        "New submission in Sample Hackathon: Sample App",
      ),
      html: templateEmailShell(
        `<h1 style="color: #292929; margin-bottom: 10px;">New submission in Sample Hackathon</h1>
            <p style="color: #666; margin-bottom: 20px;">
              <strong>Sample App</strong> by ${name} was just submitted to
              <strong>Sample Hackathon</strong>.
            </p>
            <p style="color: #666; margin-bottom: 20px;">
              Review it in the judging group workspace:
              <a href="https://vibeapps.dev/admin/judging/sample-hackathon?section=submissions" style="color: #292929;">Open submissions</a>
            </p>`,
        undefined,
        footerOpts,
      ),
    },
    {
      key: "results_live",
      subject: withSubjectPrefix("Results are live for Sample Hackathon"),
      html: templateEmailShell(
        `<h1 style="color: #292929; margin-bottom: 10px;">Results are live</h1>
            <p style="color: #666; margin-bottom: 20px;">Hi ${name},</p>
            <p style="color: #666; margin-bottom: 20px;">
              The judging results for <strong>Sample Hackathon</strong> are now public.
            </p>
            <p style="color: #666; margin-bottom: 20px;">
              See how everyone did:
              <a href="${groupUrls.resultsurl}" style="color: #292929;">${groupUrls.resultsurl}</a>
            </p>`,
        undefined,
        footerOpts,
      ),
    },
    {
      key: "judging_group",
      subject: withSubjectPrefix("Judging is open for Sample Hackathon"),
      html: templateEmailShell(
        `<h1 style="color: #292929; margin-bottom: 10px;">Judging is open</h1>
            <p style="color: #666; margin-bottom: 20px;">Hi ${name},</p>
            <p style="color: #666; margin-bottom: 20px;">
              Sample Hackathon is ready for judges. Score submissions using the
              criteria in the judging workspace.
            </p>
            <p style="color: #666; margin-bottom: 20px;">
              Start judging:
              <a href="${groupUrls.judgingurl}" style="color: #292929;">${groupUrls.judgingurl}</a>
            </p>`,
        undefined,
        footerOpts,
      ),
    },
  ];

  const sent: Array<string> = [];
  for (const sample of samples) {
    await resend.sendEmail(ctx, {
      from: SAMPLE_FROM,
      to,
      subject: sample.subject,
      html: sample.html,
    });
    sent.push(sample.key);
  }

  return {
    success: true,
    message: `Sent ${sent.length} sample emails to ${to}`,
    sent,
  };
}

const sampleEmailResult = v.object({
  success: v.boolean(),
  message: v.string(),
  sent: v.array(v.string()),
});

// Admin-only branded samples. Bypasses per-type toggles the same way sendTestEmail does.
export const sendSampleNotificationEmails = mutation({
  args: { to: v.optional(v.string()) },
  returns: sampleEmailResult,
  handler: async (ctx, args) => {
    await requirePermission(ctx, "emails.send");
    return await sendSampleNotificationEmailsTo(
      ctx,
      args.to ?? "wayne@convex.dev",
    );
  },
});

export const sendSampleNotificationEmailsInternal = internalMutation({
  args: { to: v.optional(v.string()) },
  returns: sampleEmailResult,
  handler: async (ctx, args) => {
    return await sendSampleNotificationEmailsTo(
      ctx,
      args.to ?? "wayne@convex.dev",
    );
  },
});
