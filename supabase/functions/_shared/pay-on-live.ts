// Creator post pay at go-live (migration 144). Shared by post-applied paths:
// publish-due (Upload-Post finished later) and post-approved (finished inline).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { formatCentsDollars } from './credits.ts';
import { creatorLink } from './deep-link.ts';
import { creatorRecipients, sendPushWithPrefs as sendPush } from './push.ts';

/**
 * Post pay ($10 video, $5 static) lands the moment a post goes live, not at
 * the next daily views poll. Views pay still comes from poll-metrics. Passing
 * 0 views is safe: pay_assignment never lowers a view count already paid.
 * A shortfall in credits is retried by the next poll.
 */
export async function payOnLive(
  admin: SupabaseClient,
  assignmentId: string,
  postId: string,
): Promise<void> {
  try {
    const { data, error } = await admin.rpc('pay_assignment', {
      p_assignment: assignmentId,
      p_views: 0,
      p_post_id: postId,
    });
    if (error) throw error;
    const result = (data ?? {}) as {
      paid_base_cents?: number;
      paid_view_cents?: number;
      creator_id?: string;
      company_id?: string;
    };
    const paid = (result.paid_base_cents ?? 0) + (result.paid_view_cents ?? 0);
    if (paid > 0 && result.creator_id && result.company_id) {
      const recipients = await creatorRecipients(admin, result.creator_id, result.company_id);
      await sendPush(admin, recipients, {
        title: `${formatCentsDollars(paid)} earned`,
        body: 'Your post got paid.',
        data: {
          event: 'bounty_earned',
          company_id: result.company_id,
          deep_link: creatorLink(result.company_id, 'assignment', assignmentId),
          assignment_id: assignmentId,
          post_id: postId,
          amount_cents: String(paid),
        },
      });
    }
  } catch (e) {
    console.error('pay on live:', assignmentId, e);
  }
}

