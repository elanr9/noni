/**
 * Deep link grammar: noni://<role>/<company_id>/<screen>[/<id>]
 *
 * role    creator | manager
 * screen  creator: home | posts | chat | profile | assignment/<assignment_id>
 *                  | post/<task_id> | posts/<assignment_id> | channel/<chat_id>
 *         manager: home | settings | analytics | review/<assignment_id>
 *                  | week/<campaign_id> | chat/<creator_id> | messages/<chat_id>
 *                  | account-approval/<account_id> | creator/<profile_id>
 *                  | music/<assignment_id>
 *
 * The client (lib/deep-link.ts) parses the same grammar and maps it to routes.
 */
export type LinkRole = 'creator' | 'manager';

export type CreatorScreen =
  | 'home'
  | 'posts'
  | 'chat'
  | 'profile'
  | 'assignment'
  | 'post'
  | 'channel';

export type ManagerScreen =
  | 'home'
  | 'settings'
  | 'analytics'
  | 'review'
  | 'week'
  | 'chat'
  | 'messages'
  | 'account-approval'
  | 'creator'
  | 'music';

export function creatorLink(
  companyId: string,
  screen: CreatorScreen,
  id?: string | null,
): string {
  return build('creator', companyId, screen, id);
}

export function managerLink(
  companyId: string,
  screen: ManagerScreen,
  id?: string | null,
): string {
  return build('manager', companyId, screen, id);
}

function build(role: LinkRole, companyId: string, screen: string, id?: string | null): string {
  const base = `noni://${role}/${companyId}/${screen}`;
  return id ? `${base}/${id}` : base;
}
