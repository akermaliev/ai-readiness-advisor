/**
 * Site-wide facts shown on the landing page, the Terms and Privacy views, and the footer.
 * One place, so launch settings are changed once. Nothing here reaches the score or the prompt.
 */

/** Keep in step with package.json (asserted by a unit test). */
export const APP_VERSION = '1.3.0';

/** Public source repository. Null while the repo is private; the footer then omits the link. */
export const REPO_URL: string | null = null;

/**
 * Contact address for the Terms and Privacy views. Null until chosen; the views then say it
 * will be added before launch. Not the author's personal address unless he decides so.
 */
export const CONTACT_EMAIL: string | null = null;

/**
 * False until the Terms and Privacy text has been reviewed by someone qualified. While false,
 * both views carry a visible "draft" notice, so an unreviewed draft cannot ship silently.
 */
export const LEGAL_TEXT_REVIEWED = false;

export const LEGAL_LAST_UPDATED = '2026-09-30';

/** The one statistic the landing page cites, with its limits (Part D rules apply). */
export const WHY_SOURCE = {
  title: 'MIT NANDA, The GenAI Divide: State of AI in Business 2025',
  // No MIT-hosted copy was found; this is a copy hosted by a third party.
  url: 'https://mlq.ai/media/quarterly_decks/v0.1_State_of_AI_in_Business_2025_Report.pdf',
} as const;
