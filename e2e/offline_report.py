# Stage 4 acceptance test: the deterministic report renders with the network cut.
#
# Walks the full intake by clicking (profile, D1-D6, problem statement), turns the
# browser offline BEFORE pressing submit, then checks every report section renders,
# the headline numbers match the engine, and no network request is even attempted.
#
# Run:
#   npm run build
#   python -m http.server 8765 --directory dist        (in one terminal)
#   pip install playwright && playwright install chromium
#   python e2e/offline_report.py http://localhost:8765/index.html e2e/screenshots
import os
import sys
from playwright.sync_api import sync_playwright, expect

URL = sys.argv[1]
SHOTS = sys.argv[2]
os.makedirs(SHOTS, exist_ok=True)

ANSWERS = {
  'D1': ['A database or SaaS system', 'Partly, one domain only', 'Only pre-built reports', 'Checked when something breaks'],
  'D2': ['Some systems, inconsistently', 'Modern on-prem or hybrid', 'Mostly consistent, some legacy gaps', 'Separately only'],
  'D3': ['Partially documented', 'Broadly similar', 'Measured occasionally', 'Known informally'],
  # Fifth D4 answer is the unscored impact-assessment question (v1.1, issue 9).
  'D4': ['Draft or informal', 'Minimal sensitive data', 'None', 'Partially, with effort', 'No'],
  'D5': ['An existing IT/ops team', 'Some data/analytics capability', 'Tried, stalled', 'Buy or partner: a vendor tool, or in-house plus external expertise'],
  'D6': ['Named and engaged', 'Approved for a pilot', 'Specific but unmeasured', 'Not considered'],
}
results = []
def check(name, cond):
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name)

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={'width': 900, 'height': 1000})
    page = ctx.new_page()
    requests_after_offline = []
    offline = {'on': False}
    page.on('request', lambda r: requests_after_offline.append(r.url) if offline['on'] else None)
    console_errors = []
    page.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: console_errors.append(str(e)))

    page.goto(URL)
    cont = page.get_by_role('button', name='Continue')
    check('Continue disabled before profile answered', cont.is_disabled())
    page.get_by_label('Manufacturing & Logistics').check()
    check('Continue still disabled with size missing', cont.is_disabled())
    page.get_by_label('50-250', exact=True).check()
    check('Continue enabled once profile complete', cont.is_enabled())
    cont.click()

    for dim, labels in ANSWERS.items():
        expect(page.get_by_role('heading', level=1)).to_contain_text(dim)
        fieldsets = page.locator('fieldset')
        check(f'{dim}: blocked before answering', cont.is_disabled())
        n = len(labels)
        check(f'{dim}: {n} questions shown', fieldsets.count() == n)
        for i, label in enumerate(labels):
            fieldsets.nth(i).get_by_label(label, exact=True).check()
            if i < n - 1:
                check(f'{dim}: still blocked after {i+1}/{n}', cont.is_disabled())
        check(f'{dim}: unblocked after {n}/{n}', cont.is_enabled())
        if dim == 'D4':
            check('D4: impact-assessment question marked "Not scored"', page.get_by_test_id('impact-assessment').get_by_text('Not scored', exact=True).count() == 1)
        cont.click()

    expect(page.get_by_role('heading', level=1)).to_have_text('What do you want from AI?')
    check('Problem screen has no step counter', page.get_by_text('step 8').count() == 0 and page.get_by_text('of 7').count() == 0)
    submit = page.get_by_role('button', name='See my assessment')
    check('Submit blocked before intent answered', submit.is_disabled())
    page.get_by_label('Forecasting & planning').check()
    page.get_by_label('Sales & marketing').check()
    check('Back-office nudge note shown for sales & marketing', page.get_by_text('back-office alternative').count() > 0)
    check('Submit enabled', submit.is_enabled())
    page.screenshot(path=f'{SHOTS}/1-problem-screen.png', full_page=True)

    # ---- cut the network, then submit ----
    ctx.set_offline(True)
    offline['on'] = True
    submit.click()

    report = page.get_by_test_id('report')
    expect(report).to_be_visible()
    check('Headline geometric = 51', page.get_by_test_id('score-geometric').inner_text() == '51')
    check('Arithmetic = 52', page.get_by_test_id('score-arithmetic').inner_text() == '52')
    check('Band = Operational-capable', page.get_by_text('Operational-capable', exact=True).count() >= 1)
    check('Disclaimer line visible', page.get_by_test_id('disclaimer').is_visible())
    for n, title in [(1, 'Readiness band and score'), (2, 'Where the score comes from'), (3, 'Diagnostics'),
                     (4, 'Gates'), (6, 'How much the weights matter')]:
        check(f'Section {n} rendered: {title}', page.get_by_role('heading', name=title).is_visible())
    # The deterministic report's own sections; the optional Recommendations section below it is not one.
    headings = [h.inner_text() for h in page.locator('section:not([data-testid=recommendations]) h2').all()]
    check(f'Section order matches tech doc: {headings}', headings == [
        'Readiness band and score', 'Where the score comes from', 'Diagnostics', 'Gates', 'How much the weights matter'])
    check('6 dimension rows', page.locator('section').nth(1).locator('li').count() == 6)
    check('Fix-this-first list present', page.get_by_test_id('sensitivity-list').locator('li').count() >= 1)
    check('Gate G-U? / G-M? evaluated (list or pass note)', page.get_by_text('checked and passed').count() + page.get_by_test_id('gate-list').count() >= 1)
    check('G-U5 fires: minimal sensitive data, no impact assessment (issue 9, ruling 6)', 'G-U5' in report.inner_text())
    check('Unscored answer did not move the score (still 51)', page.get_by_test_id('score-geometric').inner_text() == '51')
    check('No floor note when no dimension is 0', page.get_by_test_id('floor-note').count() == 0)
    check('Cross-profile line present', 'depending on which industry profile' in page.get_by_test_id('cross-profile-line').inner_text()
          or 'under every industry profile' in page.get_by_test_id('cross-profile-line').inner_text())
    page.wait_for_timeout(1500)
    check(f'Zero network requests attempted after going offline ({len(requests_after_offline)})', len(requests_after_offline) == 0)
    check(f'No console errors ({console_errors[:3]})', len(console_errors) == 0)
    page.screenshot(path=f'{SHOTS}/2-report-offline.png', full_page=True)

    # dark-mode render for visual QA
    dark = browser.new_context(viewport={'width': 900, 'height': 1000}, color_scheme='dark')
    dp = dark.new_page(); dp.goto(URL)
    dp.get_by_role('button', name='Weak — regional retailer').click()
    dp.get_by_role('button', name='See my assessment').click()
    dp.screenshot(path=f'{SHOTS}/3-report-weak-dark.png', full_page=True)

    # strong persona: the flat fix-first ranking (+2, +1, +1) is qualified (issue 2)
    sp = browser.new_context(viewport={'width': 900, 'height': 1000}).new_page(); sp.goto(URL)
    sp.get_by_role('button', name='Strong — regional bank operations').click()
    sp.get_by_role('button', name='See my assessment').click()
    check('Strong persona: flat ranking qualified', sp.get_by_test_id('flat-sensitivity').count() == 1)
    check('Median walk: no flat qualifier (+9 top move)', page.get_by_test_id('flat-sensitivity').count() == 0)

    # spec ruling 1: a dimension at 0 is named, and the headline is called floor-dominated
    zp = browser.new_context(viewport={'width': 900, 'height': 1000}).new_page(); zp.goto(URL)
    zp.get_by_role('button', name='Weak — regional retailer').click()
    zp.get_by_role('button', name='Back to the rubric').click()   # D6
    zp.get_by_role('button', name='Back').click()                 # D5
    zp.get_by_role('button', name='Back').click()                 # D4
    expect(zp.get_by_role('heading', level=1)).to_contain_text('D4')
    zfs = zp.locator('fieldset')
    for i, label in enumerate(['No', 'Yes, heavily, no controls mapped', 'None', 'No']):
        zfs.nth(i).get_by_label(label, exact=True).check()
    for _ in range(3):                                            # D5, D6, problem
        zp.get_by_role('button', name='Continue').click()
    zp.get_by_role('button', name='See my assessment').click()
    note = zp.get_by_test_id('floor-note')
    check('Zero dimension: floor note shown', note.count() == 1)
    check('...naming D4 Governance & compliance', zp.get_by_text('D4 Governance & compliance scores 0, so the floor sets your headline').count() == 1)
    zp.screenshot(path=f'{SHOTS}/7-floor-note.png', full_page=False)
    browser.close()

failed = [n for n, ok in results if not ok]
print(f'\n{len(results) - len(failed)}/{len(results)} checks passed')
sys.exit(1 if failed else 0)
