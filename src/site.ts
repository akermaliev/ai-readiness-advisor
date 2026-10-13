/**
 * Site-wide facts shown on the landing page, the Terms and Privacy views, and the footer.
 * One place, so launch settings are changed once. Nothing here reaches the score or the prompt.
 */

/** Keep in step with package.json (asserted by a unit test). */
export const APP_VERSION = '1.3.0';

/** Public source repository, linked from the footer. */
export const REPO_URL = 'https://github.com/akermaliev/ai-readiness-advisor';

/** The live site (GitHub Pages). */
export const SITE_URL = 'https://akermaliev.github.io/ai-readiness-advisor/';

/** Where questions go from the Terms and Privacy views: the repo's issue tracker, no personal email. */
export const CONTACT_URL = `${REPO_URL}/issues`;

/** Who wrote the Terms and Privacy text, stated on both views. */
export const LEGAL_AUTHOR = 'Aitemir Kermaliev';

export const LEGAL_LAST_UPDATED = '2026-10-12';

/** The one statistic the landing page cites, with its limits (Part D rules apply). */
export const WHY_SOURCE = {
  title: 'MIT NANDA, The GenAI Divide: State of AI in Business 2025',
  // No MIT-hosted copy was found; this is a copy hosted by a third party.
  url: 'https://mlq.ai/media/quarterly_decks/v0.1_State_of_AI_in_Business_2025_Report.pdf',
} as const;
