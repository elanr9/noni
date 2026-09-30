// The deep dive behind the Brain page's Industry research panel. Two calls:
// a cheap profile of the product from its own site (fast model), then one
// research run with capped web search that returns a structured industry
// playbook. The playbook renders to brand_docs kind industry_research, the
// compact markdown every generation reads.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { crawlSite } from './crawlSite.ts';
import { askClaude, askClaudeResearch, parseClaudeJson, softenDashes, type ResearchSource } from './wp8.ts';

export type ProductProfile = {
  product_name: string;
  one_liner: string;
  industry: string;
  niche: string;
  audience: Array<{ who: string; situation: string }>;
  problems: string[];
  features: Array<{ name: string; what_it_does: string }>;
  pricing: string | null;
  differentiators: string[];
  research_questions: string[];
};

export type IndustryPlaybook = {
  market: { summary: string; trends: string[] };
  audience: Array<{ who: string; moment: string; fears: string[]; their_words: string[] }>;
  calendar: Array<{ when: string; what: string; why_it_matters: string }>;
  insider_facts: Array<{ fact: string; source_url: string | null }>;
  problems: Array<{
    problem: string;
    in_their_words: string;
    how_it_is_solved_today: string;
    cost_of_getting_it_wrong: string;
  }>;
  myths: Array<{ myth: string; truth: string }>;
  vocabulary: Array<{ term: string; meaning: string }>;
  product_fit: Array<{ problem: string; how_the_product_helps: string }>;
  alternatives: Array<{ name: string; what_it_is: string }>;
  content_angles: Array<{ title: string; search_phrase: string; hook: string; why: string }>;
  never_say: string[];
};

const PROFILE_SYSTEM = `You read a company's own website and profile its product for a research team. Answer with one JSON object and nothing else:
{"product_name": string, "one_liner": string, "industry": string, "niche": string, "audience": [{"who": string, "situation": string}], "problems": string[], "features": [{"name": string, "what_it_does": string}], "pricing": string | null, "differentiators": string[], "research_questions": string[]}
- industry is the broad market (for example "college athletic recruiting"); niche is the exact slice this product serves.
- audience: the people who buy and the people who use, each with the situation that makes them look for help.
- features: only what the site states, each as the concrete thing it does.
- research_questions: 8 to 12 questions a researcher must answer to write expert content for this audience: the rules, calendar and deadlines of this world, what the gatekeepers actually look for, the numbers that matter, common mistakes, costs, and what people get wrong. Specific to this niche, never generic marketing questions.
Never invent facts the site does not state.`;

const RESEARCH_SYSTEM = `You are an industry analyst and the head of content for a company that makes short form videos for its audience. Research the industry the product lives in with web search so a scriptwriter can write like a real insider: the rules, dates, numbers, gatekeepers, costs, mistakes and language of this world. Prefer primary and authoritative sources (governing bodies, official rules, experienced practitioners) over marketing blogs, and prefer current information; note the season or year when a rule changes. Search efficiently: plan the questions first, one search per question, and stop when the playbook is solid.

When you are done, answer with ONE JSON object in a \`\`\`json fence and nothing after it:
{"market": {"summary": string, "trends": string[]}, "audience": [{"who": string, "moment": string, "fears": string[], "their_words": string[]}], "calendar": [{"when": string, "what": string, "why_it_matters": string}], "insider_facts": [{"fact": string, "source_url": string | null}], "problems": [{"problem": string, "in_their_words": string, "how_it_is_solved_today": string, "cost_of_getting_it_wrong": string}], "myths": [{"myth": string, "truth": string}], "vocabulary": [{"term": string, "meaning": string}], "product_fit": [{"problem": string, "how_the_product_helps": string}], "alternatives": [{"name": string, "what_it_is": string}], "content_angles": [{"title": string, "search_phrase": string, "hook": string, "why": string}], "never_say": string[]}
Rules for the fields:
- insider_facts: 15 to 30 specific, checkable facts (numbers, dates, rules, named levels, events, tools, what gatekeepers say they look for), each with the URL it came from. This is the most important field. No generic advice.
- calendar: the dates and windows that drive this audience's decisions.
- audience.their_words and problems.in_their_words: how these people actually phrase it, the words they would type or say.
- myths: things the audience commonly believes that insiders know are wrong.
- product_fit: only mechanisms the product profile states; never invent capability.
- content_angles: 12 to 20 post ideas that would help this audience, each with the phrase they would search.
- never_say: outdated rules, wrong numbers and cliches a writer in this niche must avoid.
Inside string values use single quotes for quoted speech.`;

function extractJsonBlock(text: string): string {
  const fence = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].pop();
  if (fence) return fence[1];
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function normalizePlaybook(raw: Partial<IndustryPlaybook>): IndustryPlaybook {
  return {
    market: {
      summary: String(raw.market?.summary ?? ''),
      trends: arr<string>(raw.market?.trends).map(String),
    },
    audience: arr(raw.audience),
    calendar: arr(raw.calendar),
    insider_facts: arr(raw.insider_facts),
    problems: arr(raw.problems),
    myths: arr(raw.myths),
    vocabulary: arr(raw.vocabulary),
    product_fit: arr(raw.product_fit),
    alternatives: arr(raw.alternatives),
    content_angles: arr(raw.content_angles),
    never_say: arr<string>(raw.never_say).map(String),
  };
}

/** The compact markdown the writer reads. Sources stay in company_research. */
export function playbookMarkdown(profile: ProductProfile, p: IndustryPlaybook): string {
  const section = (title: string, lines: string[]) =>
    lines.length ? `## ${title}\n${lines.join('\n')}` : null;
  return [
    `# ${profile.industry}: ${profile.niche}`,
    p.market.summary,
    section('Trends', p.market.trends.map((t) => `- ${t}`)),
    section(
      'Who we talk to',
      p.audience.map(
        (a) =>
          `- ${a.who}. Moment: ${a.moment}. Fears: ${arr<string>(a.fears).join('; ')}. In their words: ${arr<string>(a.their_words).map((w) => `'${w}'`).join(', ')}`,
      ),
    ),
    section('Calendar', p.calendar.map((c) => `- ${c.when}: ${c.what} (${c.why_it_matters})`)),
    section('Insider facts', p.insider_facts.map((f) => `- ${f.fact}`)),
    section(
      'Problems',
      p.problems.map(
        (x) =>
          `- ${x.problem}. They say: '${x.in_their_words}'. Today: ${x.how_it_is_solved_today}. Getting it wrong costs: ${x.cost_of_getting_it_wrong}`,
      ),
    ),
    section('Myths vs truth', p.myths.map((m) => `- Myth: ${m.myth} Truth: ${m.truth}`)),
    section('Vocabulary', p.vocabulary.map((v) => `- ${v.term}: ${v.meaning}`)),
    section(
      `Where ${profile.product_name} fits`,
      p.product_fit.map((f) => `- ${f.problem}: ${f.how_the_product_helps}`),
    ),
    section('Alternatives', p.alternatives.map((a) => `- ${a.name}: ${a.what_it_is}`)),
    section('Never say', p.never_say.map((n) => `- ${n}`)),
  ]
    .filter((l): l is string => Boolean(l && l.trim()))
    .join('\n\n');
}

async function setStage(
  admin: SupabaseClient,
  companyId: string,
  fields: Record<string, unknown>,
) {
  await admin
    .from('company_research')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('company_id', companyId);
}

/**
 * Runs the whole deep dive and records progress on company_research. The
 * industry_research doc is only overwritten when a manager has not edited it.
 */
export async function runCompanyResearch(
  admin: SupabaseClient,
  companyId: string,
  website: string,
): Promise<void> {
  try {
    const [{ data: docs }, { data: company }] = await Promise.all([
      admin.from('brand_docs').select('kind, content, human_edited').eq('company_id', companyId),
      admin.from('companies').select('name').eq('id', companyId).single(),
    ]);
    const doc = (kind: string) =>
      (docs ?? []).find((d) => d.kind === kind) as
        | { content: string; human_edited: boolean }
        | undefined;

    await setStage(admin, companyId, { stage: 'Reading your website' });
    const siteText = await crawlSite(website).catch(() => '');
    if (!siteText.trim() && !doc('product_truth')?.content?.trim()) {
      throw new Error('Could not read that website');
    }

    await setStage(admin, companyId, { stage: 'Profiling the product' });
    const profileInput = [
      `Company: ${company?.name ?? ''}`,
      `Website: ${website}`,
      doc('product_truth')?.content?.trim()
        ? `What the team wrote about the product:\n${doc('product_truth')!.content.trim().slice(0, 3000)}`
        : null,
      doc('audience_niche')?.content?.trim()
        ? `What the team wrote about the audience:\n${doc('audience_niche')!.content.trim().slice(0, 3000)}`
        : null,
      siteText ? `Website text:\n${siteText}` : null,
    ]
      .filter((l): l is string => l !== null)
      .join('\n\n');
    const profile = parseClaudeJson<ProductProfile>(
      await askClaude(PROFILE_SYSTEM, profileInput, 3000, { tier: 'fast' }),
    );
    await setStage(admin, companyId, {
      stage: `Researching ${profile.industry || 'the industry'}`,
      profile,
    });

    const researchInput = [
      `Product profile:\n${JSON.stringify(profile, null, 1)}`,
      `Research questions to answer:\n${arr<string>(profile.research_questions).map((q, i) => `${i + 1}. ${q}`).join('\n')}`,
      `Today's date: ${new Date().toISOString().slice(0, 10)}.`,
    ].join('\n\n');
    const { text, sources } = await askClaudeResearch(RESEARCH_SYSTEM, researchInput, {
      maxSearches: 12,
    });
    const playbook = normalizePlaybook(
      parseClaudeJson<Partial<IndustryPlaybook>>(extractJsonBlock(text)),
    );

    await setStage(admin, companyId, { stage: 'Writing the playbook' });
    if (!doc('industry_research')?.human_edited) {
      const { error } = await admin.from('brand_docs').upsert(
        {
          company_id: companyId,
          kind: 'industry_research',
          content: softenDashes(playbookMarkdown(profile, playbook)),
          human_edited: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id,kind' },
      );
      if (error) throw new Error(`industry_research write failed: ${error.message}`);
    }
    await setStage(admin, companyId, {
      status: 'done',
      stage: null,
      playbook,
      sources: sources.slice(0, 60) satisfies ResearchSource[],
      error: null,
      finished_at: new Date().toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'research failed';
    console.error('company research failed:', message);
    await setStage(admin, companyId, {
      status: 'failed',
      stage: null,
      error: message.slice(0, 500),
      finished_at: new Date().toISOString(),
    });
  }
}
