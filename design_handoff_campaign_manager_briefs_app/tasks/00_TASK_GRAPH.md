# Task graph

Wave 0 (must land first, blocks everything):
- agent-0-foundation

Wave 1 (parallel, disjoint files):
- agent-1-review-queues
- agent-2-post-review-revision
- agent-3-music-approval
- agent-4-account-approval
- agent-5-briefs
- agent-6-library-and-chat
- agent-7-analytics-stripe
- agent-8-auth-and-branding

Wave 2:
- Final QA agent runs QA_CHECKLIST.md and files fixes back to the owning agent.

Conflict notes: agents 2, 3, 4 all use the shared Sheet, checkbox reason row, note block, and confirmation takeover from agent-0. If those primitives already exist in components/admin/shared, extend rather than duplicate. RequestChangesSheet.tsx is owned by agent-2; agents 3 and 4 build their own sheets from shared parts.
