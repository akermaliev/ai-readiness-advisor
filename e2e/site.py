# v1.2 acceptance test for the public-site features, in a real browser against the built app,
# served WITH the production security headers (security-policy.ts), so the CSP is enforced
# exactly as a host would enforce it.
#
#   C1  landing page, acknowledgement, Terms and Privacy views, refresh, keyboard, 360 px
#   C2  PDF download: offline, every section, numbers match the page, key absent, lazy-loaded
#   C3  zero CSP violations across the whole flow; index.html references only same-origin assets
#
# Run (Node 22.6+ for --experimental-strip-types; pip install playwright pypdf):
#   npm run build
#   python e2e/site.py dist e2e/screenshots
import http.server, json, os, re, subprocess, sys, threading, io, glob
from playwright.sync_api import sync_playwright, expect
from pypdf import PdfReader

DIST, SHOTS = sys.argv[1], sys.argv[2]
os.makedirs(SHOTS, exist_ok=True)
KEY = 'sk-ant-e2e-DO-NOT-LEAK-0000'
results = []
def check(name, cond):
    results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name)

# ---------- serve dist/ with the production headers ----------
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HEADERS = json.loads(subprocess.check_output(
    ['node', '--experimental-strip-types', '--no-warnings', '-e',
     "import('./security-policy.ts').then(m => process.stdout.write(JSON.stringify(m.SECURITY_HEADERS)))"], cwd=ROOT))
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=DIST, **k)
    def end_headers(self):
        for k, v in HEADERS.items(): self.send_header(k, v)
        super().end_headers()
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{srv.server_address[1]}/index.html'

def uc(title, cats, dim='D3'):
    return {'title': title, 'description': f'{title}: a suggested use case.', 'categories': cats, 'targetFunction': 'sales-marketing',
            'expectedOutcome': 'Less manual effort each week.', 'outcomeConfidence': 'medium', 'implementationRisk': 'low',
            'riskDrivers': ['data quality'], 'governanceFlags': [], 'dependsOnDimension': dim, 'isBackOfficeAlternative': False}
LIVE = {'scoreNarrative': 'x', 'imbalanceNote': None,
        'useCases': [uc('Weekly sales report drafting', []), uc('Email subject-line testing', ['personalization-targeting'], 'D1')],
        'roadmap': {'pilotFirst': {'useCaseTitle': 'Weekly sales report drafting', 'rationale': 'Depends on D3 Process definition.',
                                   'successMeasure': 'Hours spent on the weekly report, against a baseline taken before the pilot.', 'stopCondition': 'No time saved after a quarter.', 'goalNote': None},
                    'prerequisite': 'Close the gap in D1 Data maturity & accessibility: agree one customer record.',
                    'defer': [{'useCaseTitle': 'Email subject-line testing', 'until': 'a consumer-data policy exists.', 'unlockAnswers': ['1.2']}]},
        'blockedAcknowledged': []}
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS'}
def mock_api(route):
    if route.request.method == 'OPTIONS': return route.fulfill(status=204, headers=CORS)
    body = {'content': [{'type': 'text', 'text': json.dumps(LIVE)}], 'stop_reason': 'end_turn', 'usage': {'output_tokens': 800, 'output_tokens_details': {'thinking_tokens': 300}}}
    route.fulfill(status=200, headers={**CORS, 'content-type': 'application/json'}, body=json.dumps(body))

overflow = "() => document.documentElement.scrollWidth - document.documentElement.clientWidth"
def new_page(browser, w=900):
    ctx = browser.new_context(viewport={'width': w, 'height': 1000}, accept_downloads=True)
    page = ctx.new_page()
    page.add_init_script("window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));")
    errors = []
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' or 'Content Security Policy' in m.text else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    return ctx, page, errors
def start(page):
    page.get_by_test_id('acknowledge').check()
    page.get_by_role('button', name='Start the assessment').click()
def nums(text):
    return re.findall(r'\d+(?:\.\d+)?', text)

with sync_playwright() as p:
    browser = p.chromium.launch()

    # ================= C1: landing, Terms, Privacy =================
    ctx, page, errors = new_page(browser)
    resp = page.goto(URL)
    check('Security headers present on the response', all(resp.headers.get(k.lower()) == v for k, v in HEADERS.items()))
    expect(page.get_by_test_id('landing')).to_be_visible()
    start_btn = page.get_by_role('button', name='Start the assessment')
    check('Landing first: what / why / how / privacy shown', page.get_by_text('A free self-assessment that scores').count() == 1 and page.get_by_test_id('how-to').locator('li').count() == 4 and page.get_by_test_id('privacy-line').is_visible())
    check('Why-it-exists cites its source, with its limits', 'Read the report' in page.get_by_test_id('landing').inner_text() and 'not a cause' in page.get_by_test_id('landing').inner_text())
    check('Start disabled until the box is checked', start_btn.is_disabled())
    check('No worked examples before acknowledgement', page.get_by_role('button', name='Weak — regional retailer').count() == 0)
    page.screenshot(path=f'{SHOTS}/c1-landing.png', full_page=True)
    page.get_by_role('link', name='Read the Terms').click()
    expect(page.get_by_test_id('legal-terms')).to_be_visible()
    check('Terms view opens at #terms', page.url.endswith('#terms') and page.get_by_test_id('landing').is_hidden())
    check('Terms names its author and has no draft notice', 'Written by Aitemir Kermaliev' in page.get_by_test_id('legal-author').inner_text() and page.get_by_test_id('legal-draft').count() == 0)
    check('Terms contact points to GitHub Issues', page.get_by_test_id('legal-terms').get_by_role('link', name='GitHub').get_attribute('href').endswith('/ai-readiness-advisor/issues'))
    check('Terms covers nature, data, keys, model output, warranty, contact', all(t in page.get_by_test_id('legal-terms').inner_text() for t in ['What this tool is', 'No data collection', 'Your API key', 'No warranty', 'Contact']))
    page.screenshot(path=f'{SHOTS}/c1-terms.png', full_page=True)
    page.get_by_test_id('legal-back').click()
    expect(page.get_by_test_id('landing')).to_be_visible()
    check('Back returns to the landing page', page.get_by_test_id('legal-terms').count() == 0)
    page.get_by_test_id('footer').get_by_role('link', name='Privacy').click()
    expect(page.get_by_test_id('legal-privacy')).to_be_visible()
    check('Privacy view opens from the footer', page.url.endswith('#privacy'))
    page.get_by_test_id('legal-back').click()
    expect(page.get_by_test_id('landing')).to_be_visible()
    page.get_by_test_id('acknowledge').check()
    check('Start enabled once checked', start_btn.is_enabled())
    start_btn.click()
    page.get_by_role('button', name='Weak — regional retailer').click()
    expect(page.get_by_role('heading', name='What do you want from AI?')).to_be_visible()
    page.get_by_test_id('footer').get_by_role('link', name='Terms').click()
    expect(page.get_by_test_id('legal-terms')).to_be_visible()
    page.get_by_test_id('legal-back').click()
    expect(page.get_by_role('heading', name='What do you want from AI?')).to_be_visible()
    check('Reading the Terms mid-assessment keeps your answers', page.get_by_role('heading', name='What do you want from AI?').is_visible() and page.get_by_role('button', name='See my assessment').is_enabled())
    page.reload()
    check('A refresh returns to the landing page', page.get_by_test_id('landing').is_visible() and start_btn.is_disabled())
    check(f'C1 flow: zero CSP violations and console errors {errors[:2]} {page.evaluate("window.__csp")}', not errors and page.evaluate('window.__csp') == [])
    ctx.close()

    # keyboard only, landing -> report
    ctx, page, errors = new_page(browser)
    page.goto(URL)
    def tab_to(pred, limit=80):
        for _ in range(limit):
            page.keyboard.press('Tab')
            if page.evaluate(pred): return True
        return False
    ok = tab_to("document.activeElement?.dataset?.testid === 'acknowledge'"); page.keyboard.press('Space')
    ok = ok and tab_to("document.activeElement?.innerText === 'Start the assessment'"); page.keyboard.press('Enter')
    ok = ok and tab_to("document.activeElement?.innerText === 'Weak — regional retailer'"); page.keyboard.press('Enter')
    ok = ok and tab_to("document.activeElement?.innerText === 'See my assessment'"); page.keyboard.press('Enter')
    check('Keyboard only: landing -> report', ok and page.get_by_test_id('report').is_visible())
    ctx.close()

    # 360 px
    ctx, page, errors = new_page(browser, 360)
    page.goto(URL)
    check('360 px landing: no horizontal scroll', page.evaluate(overflow) <= 0)
    page.goto(URL + '#terms'); check('360 px Terms: no horizontal scroll', page.evaluate(overflow) <= 0)
    page.goto(URL + '#privacy'); check('360 px Privacy: no horizontal scroll', page.evaluate(overflow) <= 0)
    page.goto(URL); start(page)
    page.get_by_role('button', name='Weak — regional retailer').click(); page.get_by_role('button', name='See my assessment').click()
    check('360 px report with Save panel: no horizontal scroll', page.evaluate(overflow) <= 0)
    page.screenshot(path=f'{SHOTS}/c1-phone-report.png', full_page=True)
    ctx.close()

    # ================= C2: PDF, per preset =================
    for preset, company, live in [('Weak — regional retailer', 'Acme Retail Co.', True),
                                  ('Realistic median — mid-market manufacturer', '', False),
                                  ('Strong — regional bank operations', 'Northbank', False)]:
        tag = preset.split(' ')[0].lower()
        ctx, page, errors = new_page(browser)
        page.route('https://api.anthropic.com/**', mock_api)
        page.goto(URL); start(page)
        page.get_by_role('button', name=preset).click(); page.get_by_role('button', name='See my assessment').click()
        if live:
            page.get_by_label('Anthropic API key').fill(KEY)
            page.get_by_role('button', name='Generate recommendations').click()
            expect(page.get_by_text('Generated by claude-sonnet-5 for your answers')).to_be_visible()
        report_text = '\n'.join(s.inner_text() for s in page.locator('[data-testid=report] > section:not([data-testid=recommendations]):not([data-testid=save-report])').all())
        if company:
            page.get_by_test_id('company-name').fill('Кыргыз ' + company)
            check(f'{tag}: a non-Latin company name gets the font warning (v1.3)', page.get_by_test_id('company-name-warning').is_visible())
            page.get_by_test_id('company-name').fill(company)
            check(f'{tag}: a Latin company name gets no warning', page.get_by_test_id('company-name-warning').count() == 0)
        has_flags = page.get_by_text('Low-confidence input').count() > 0
        ctx.set_offline(True)
        with page.expect_download() as dl:
            page.get_by_role('button', name='Download PDF').click()
        d = dl.value
        path = f'{SHOTS}/c2-{tag}.pdf'; d.save_as(path)
        raw = open(path, 'rb').read()
        text = '\n'.join(pg.extract_text() for pg in PdfReader(io.BytesIO(raw)).pages)
        flat = ' '.join(text.split())
        today = page.evaluate("() => { const d = new Date(); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }")
        slug = re.sub(r'[^a-z0-9]+', '-', (company or 'Manufacturing & Logistics').lower()).strip('-')
        check(f'{tag}: generated offline, file name {d.suggested_filename}', d.suggested_filename == f'ai-readiness-{slug}-{today}.pdf')
        last = '6' if has_flags else '5'
        sections = ['1. Readiness band and score', '2. Where the score comes from', '3. Diagnostics', '4. Gates', f'{last}. How much the weights matter', 'Fix this first']
        check(f'{tag}: every section present, numbered without gaps (v1.3)', all(s in flat for s in sections) and (has_flags or '6. How much' not in flat))
        check(f'{tag}: disclaimer on page 1 and page numbers in every footer', 'decision rests with you' in PdfReader(io.BytesIO(raw)).pages[0].extract_text().replace('\n', ' ') and all('Page ' in pg.extract_text() for pg in PdfReader(io.BytesIO(raw)).pages))
        # every number in the deterministic report appears in the PDF
        pdf_nums = set(nums(flat))
        missing = sorted({n for n in nums(report_text)} - pdf_nums)
        check(f'{tag}: every number on the report page is in the PDF {missing[:8]}', not missing)
        check(f'{tag}: headline and band match', f'Headline score (weighted geometric mean): {page.get_by_test_id("score-geometric").inner_text()}' in flat)
        if company: check(f'{tag}: company name in the PDF', company in flat)
        if live:
            check(f'{tag}: recommendations included and labeled model-generated', 'Model-generated by claude-sonnet-5' in flat and 'Weekly sales report drafting' in flat)
            check(f'{tag}: "What was wrong" and run details left out', 'What was wrong' not in flat and 'stop_reason' not in flat)
            check(f'{tag}: roadmap steps come before the use cases (v1.3)', 0 <= flat.find('Step 1. Close this gap first') < flat.find('Step 2. Pilot: Weekly sales report drafting') < flat.find('Use cases'))
            check(f'{tag}: the computed path, success measure and stop condition are in the PDF', 'One way to get there' in flat and 'How to tell it worked:' in flat and 'When to stop or rethink:' in flat and 'Waits on: Q1.2' in flat)
            check(f'{tag}: API key absent from the file bytes', KEY.encode() not in raw and b'sk-ant' not in raw)
        else:
            check(f'{tag}: no recommendations section when none generated', 'Recommendations' not in flat)
        check(f'{tag}: zero CSP violations and console errors {errors[:2]}', not errors and page.evaluate('window.__csp') == [])
        ctx.close()

    # ================= C3: build output =================
    html = open(os.path.join(DIST, 'index.html')).read()
    refs = re.findall(r'<(?:script|link)[^>]+(?:src|href)="([^"]+)"', html)
    check(f'index.html references only same-origin assets {refs}', refs and all(r.startswith('./') for r in refs))
    main_js = [os.path.join(DIST, r[2:]) for r in refs if r.endswith('.js')]
    check('PDF library not in the initial bundle', main_js and all('jsPDF' not in open(f).read() for f in main_js))
    check('CSP meta tag present in index.html', 'http-equiv="Content-Security-Policy"' in html and "connect-src 'self' https://api.anthropic.com" in html)
    browser.close()

srv.shutdown()
failed = [n for n, ok in results if not ok]
print(f'\n{len(results) - len(failed)}/{len(results)} checks passed')
sys.exit(1 if failed else 0)
