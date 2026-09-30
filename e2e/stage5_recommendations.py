# Stage 5 acceptance test, in a real browser against the built app.
#
# api.anthropic.com is intercepted, so the real transport, validator, gate check and
# rendering all run without a key or any cost. Scenarios: a gate-violating reply, a
# malformed reply then a valid one (repaired), a malformed reply twice, an HTTP 401, and
# the no-key fallback while offline. Also checks the key goes only to api.anthropic.com, is
# never stored, and is gone after a refresh; that every use case shows its categories; that
# the model's own narrative never renders; and that the request carries the JSON Schema.
#
# Run:
#   npm run build
#   python -m http.server 8765 --directory dist        (in one terminal)
#   pip install playwright && playwright install chromium
#   python e2e/stage5_recommendations.py http://localhost:8765/index.html e2e/screenshots
import json, os, sys
from playwright.sync_api import sync_playwright, expect

URL, SHOTS = sys.argv[1], sys.argv[2]
os.makedirs(SHOTS, exist_ok=True)
KEY = 'sk-ant-e2e-DO-NOT-LEAK-0000'
results = []
def check(name, cond):
    results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name)

def uc(title, cats):
    return {'title': title, 'description': f'{title}: a suggested use case.', 'categories': cats,
            'targetFunction': 'sales-marketing', 'expectedOutcome': 'Higher campaign click-through.',
            'outcomeConfidence': 'low', 'implementationRisk': 'medium', 'riskDrivers': ['data quality'],
            'governanceFlags': [{'type': 'data-sensitivity', 'note': 'Customer data.'}],
            'dependsOnDimension': 'D1', 'isBackOfficeAlternative': False}
# The model's narrative says something false on purpose: it must never reach the page (Fix 2).
MODEL_NARRATIVE = 'Score driven mainly by D4 (process maturity), contributing 3.2 points.'
GATE_VIOLATING = {
  'scoreNarrative': MODEL_NARRATIVE, 'imbalanceNote': None,
  'useCases': [uc('Internal knowledge assistant', ['retrieval-over-internal-content']),
               uc('Email personalization', ['personalization-targeting']),
               {**uc('Weekly sales report drafting', []), 'dependsOnDimension': 'D3'}],
  'roadmap': {'pilotFirst': {'useCaseTitle': 'Internal knowledge assistant', 'rationale': 'Quick win.'},
              # The weak retailer's fix-first dimension is D1; the prerequisite must name it (Fix 1).
              'prerequisite': 'Close the gap in D1 Data maturity & accessibility first.',
              'defer': [{'useCaseTitle': 'Email personalization', 'until': 'a written consumer-data policy exists.'}]},
  'blockedAcknowledged': []}
# Repaired scenario: a valid reply whose pilot depends on D1, the fix-first dimension.
VALID_PILOT_ON_FIX_FIRST = {
  'scoreNarrative': MODEL_NARRATIVE, 'imbalanceNote': None,
  'useCases': [uc('Email personalization', ['personalization-targeting']),
               {**uc('Weekly sales report drafting', []), 'dependsOnDimension': 'D3'}],
  'roadmap': {'pilotFirst': {'useCaseTitle': 'Email personalization', 'rationale': 'Uses existing data.'},
              'prerequisite': 'Close the gap in D1 Data maturity & accessibility first.', 'defer': []},
  'blockedAcknowledged': []}
MALFORMED = 'Here you go! {"scoreNarrative": "x", "useCases": [ }'
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS'}

def run(browser, scenario):
    ctx = browser.new_context(viewport={'width': 900, 'height': 1000})
    page = ctx.new_page()
    seen = {'hosts': set(), 'api_calls': 0, 'headers': None, 'bodies': []}
    page.on('request', lambda r: seen['hosts'].add(r.url.split('/')[2]))
    def handle(route):
        req = route.request
        if req.method == 'OPTIONS':
            return route.fulfill(status=204, headers=CORS)
        seen['api_calls'] += 1; seen['headers'] = req.headers; seen['bodies'].append(req.post_data or '')
        if scenario == 'violating':
            body = {'content': [{'type': 'text', 'text': json.dumps(GATE_VIOLATING)}]}; status = 200
        elif scenario == 'malformed':
            body = {'content': [{'type': 'text', 'text': MALFORMED}]}; status = 200
        elif scenario == 'repaired':
            text = MALFORMED if seen['api_calls'] == 1 else json.dumps(VALID_PILOT_ON_FIX_FIRST)
            body = {'content': [{'type': 'text', 'text': text}], 'stop_reason': 'end_turn'}; status = 200
        else:
            body = {'error': {'type': 'authentication_error', 'message': 'invalid x-api-key'}}; status = 401
        route.fulfill(status=status, headers={**CORS, 'content-type': 'application/json'}, body=json.dumps(body))
    page.route('https://api.anthropic.com/**', handle)
    page.goto(URL)
    page.get_by_role('button', name='Weak — regional retailer').click()
    page.get_by_role('button', name='See my assessment').click()
    report_before = [s.inner_html() for s in page.locator('[data-testid=report] > section:not([data-testid=recommendations])').all()]
    page.get_by_label('Anthropic API key').fill(KEY)
    page.get_by_role('button', name='Generate recommendations').click()
    return ctx, page, seen, report_before

with sync_playwright() as p:
    browser = p.chromium.launch()

    # ---------- 1. gate-violating live response ----------
    ctx, page, seen, before = run(browser, 'violating')
    expect(page.get_by_text('Generated by claude-sonnet-5 for your answers')).to_be_visible()
    blocked = page.get_by_test_id('blocked-acknowledged')
    check('Violating suggestion removed from use cases', page.get_by_test_id('use-case').filter(has_text='Internal knowledge assistant').count() == 0)
    check('...and shown as blocked by the code check, with G-U1', blocked.locator('li', has_text='Internal knowledge assistant').filter(has_text='removed by the code check').filter(has_text='G-U1').count() == 1)
    check('...with what would unblock it', blocked.locator('li', has_text='Internal knowledge assistant').filter(has_text='Audit access permissions').count() == 1)
    check('Non-violating suggestion kept (G-R1 only warns)', page.get_by_test_id('use-case').filter(has_text='Email personalization').count() == 1)
    check('Gated back-office fixture surfaced, not dropped', blocked.locator('li', has_text='Supplier invoice and returns documentation triage').filter(has_text='Back-office alternative, blocked').count() == 1)
    check('Banner reports 1 removed suggestion', page.get_by_text('1 suggestion was removed by the code check').count() == 1)
    check('Blocked pilot called out in roadmap', page.get_by_text('The suggested pilot, "Internal knowledge assistant", is blocked by a gate').count() == 1)
    check('Low confidence rendered visibly', page.get_by_text('Low confidence').count() >= 1)
    cards = page.get_by_test_id('use-case').all() + page.get_by_test_id('fixture-use-case').all()
    check(f'Every use-case card shows its categories ({len(cards)} cards)', len(cards) >= 2 and all(c.get_by_test_id('use-case-categories').count() == 1 for c in cards))
    check('Tagged card shows its category label', page.get_by_test_id('use-case').filter(has_text='Email personalization').get_by_text('Personalization or targeting').count() == 1)
    check('Known Area id shown as its label (v1.2 A6)', 'Sales & marketing' in page.get_by_test_id('use-case-area').first.inner_text())
    check('Untagged card says it touches no gated kind of work', page.get_by_test_id('use-case').filter(has_text='Weekly sales report drafting').get_by_text('touches no gated kind of work').count() == 1)
    summary_text = page.get_by_test_id('score-summary').inner_text()
    check('Computed summary shown, labeled no model involved', 'no model involved' in summary_text.lower() and 'headline score is 26' in summary_text)
    check("Model's own narrative never rendered", MODEL_NARRATIVE not in page.inner_text('body') and 'process maturity' not in page.inner_text('body'))
    check('No repair details when the first reply was valid', page.get_by_test_id('reply-problems').count() == 0)
    after = [s.inner_html() for s in page.locator('[data-testid=report] > section:not([data-testid=recommendations])').all()]
    check(f'Deterministic report unchanged by recommendations ({len(before)} sections compared)', before == after and len(before) >= 5)
    h = seen['headers'] or {}
    check('Exactly one API call', seen['api_calls'] == 1)
    check('Key sent in x-api-key header', h.get('x-api-key') == KEY)
    check('Direct-browser-access header present', h.get('anthropic-dangerous-direct-browser-access') == 'true')
    check('Key not in request body', all(KEY not in b for b in seen['bodies']))
    app_host = URL.split('/')[2]
    check(f"Only the app's host + api.anthropic.com contacted {sorted(seen['hosts'])}", seen['hosts'] <= {app_host, 'api.anthropic.com'})
    body = json.loads(seen['bodies'][0])
    check('Prompt carries ScoringOutput + problem statement, no rubric answers', '<scoring_output>' in body['messages'][0]['content'] and '<problem_statement>' in body['messages'][0]['content'] and 'rubricAnswers' not in body['messages'][0]['content'])
    check('Request carries the JSON Schema via output_config.format', body.get('output_config', {}).get('format', {}).get('type') == 'json_schema')
    check('Sonnet 5 request: adaptive thinking, medium effort, 16,000 max tokens (v1.2 A1)', body.get('thinking') == {'type': 'adaptive'} and body['output_config'].get('effort') == 'medium' and body.get('max_tokens') == 16000)
    check('Prompt carries the selected answers (v1.2 A4)', '<selected_answers>' in body['messages'][0]['content'])
    rd = page.get_by_test_id('run-details')
    rd.locator('summary').click()
    check('Run details panel shows stop_reason and time (v1.2)', rd.count() == 1 and 'stop_reason' in rd.inner_text() and ' s' in rd.inner_text())
    check('No deferral line ends in ".." (v1.2 A6)', all(not t.strip().endswith('..') for t in page.get_by_test_id('deferral').all_inner_texts()) and page.get_by_test_id('deferral').count() >= 1)
    check('Prompt names the six dimensions and the fix-first dimension', 'D2 Integration architecture:' in body['system'] and 'The dimension to fix first is D1 Data maturity & accessibility' in body['system'])
    storage = page.evaluate('() => JSON.stringify({l: Object.keys(localStorage), s: Object.keys(sessionStorage), c: document.cookie})')
    check(f'Nothing written to storage or cookies {storage}', storage == '{"l":[],"s":[],"c":""}')
    check('Key not rendered anywhere in page text', KEY not in page.inner_text('body'))
    page.screenshot(path=f'{SHOTS}/4-live-gate-violating.png', full_page=True)
    page.reload()
    page.get_by_role('button', name='Weak — regional retailer').click()
    page.get_by_role('button', name='See my assessment').click()
    check('Key gone after refresh', page.get_by_label('Anthropic API key').input_value() == '')
    ctx.close()

    # ---------- 2a. malformed, then valid -> repaired live result with the details ----------
    ctx, page, seen, before = run(browser, 'repaired')
    expect(page.get_by_text('Generated by claude-sonnet-5 for your answers')).to_be_visible()
    check('Repaired: exactly two calls', seen['api_calls'] == 2)
    check('Banner says the first reply was replaced', page.get_by_text('was replaced on a second attempt').count() == 1)
    details = page.get_by_test_id('reply-problems')
    check('Repair details present and collapsed', details.count() == 1 and details.get_attribute('open') is None)
    details.locator('summary').click()
    check('Repair details name the specific error', 'reply contains no JSON object' in details.inner_text() or 'not valid JSON' in details.inner_text())
    check('Pilot-on-fix-first note shown, naming D1', page.get_by_test_id('pilot-fix-first-note').filter(has_text='D1 Data maturity & accessibility').count() == 1)
    check('Flagged pilot kept, not dropped', page.get_by_test_id('use-case').filter(has_text='Email personalization').count() == 1)
    check('Repair errors do not contain the key', KEY not in page.inner_text('body'))
    page.screenshot(path=f'{SHOTS}/6-live-repaired.png', full_page=True)
    ctx.close()

    # ---------- 2b. malformed twice -> one repair retry -> fallback ----------
    ctx, page, seen, before = run(browser, 'malformed')
    expect(page.get_by_text('Pre-written examples for Retail & E-commerce')).to_be_visible()
    check('Malformed: exactly two calls (one repair retry)', seen['api_calls'] == 2)
    retry = json.loads(seen['bodies'][1])['messages']
    check('Retry carries the bad reply and a repair instruction', [m['role'] for m in retry] == ['user', 'assistant', 'user'] and 'could not be used' in retry[2]['content'])
    check('Fallback explains why', page.get_by_text("did not follow the required format and rules").count() == 1)
    fd = page.get_by_test_id('reply-problems')
    fd.locator('summary').click()
    check('Fallback after two invalid replies shows both attempts\' errors', fd.count() == 1 and 'Still wrong after the retry' in fd.inner_text())
    ctx.close()

    # ---------- 3. HTTP 401 -> error, report intact, fallback one click away ----------
    ctx, page, seen, before = run(browser, 'error')
    expect(page.get_by_text('The request failed')).to_be_visible()
    check('401: no retry', seen['api_calls'] == 1)
    check('Error shows API message', page.get_by_text('invalid x-api-key (HTTP 401)', exact=False).count() == 1)
    after = [s.inner_html() for s in page.locator('[data-testid=report] > section:not([data-testid=recommendations])').all()]
    check('Report intact after API error', before == after)
    page.get_by_role('button', name='Show pre-written examples (no key)').click()
    check('Fallback reachable after an error', page.get_by_text('Pre-written examples for Retail & E-commerce').count() == 1)
    ctx.close()

    # ---------- 4. no key, offline: fallback in one click ----------
    ctx = browser.new_context(viewport={'width': 900, 'height': 1000}); page = ctx.new_page()
    page.goto(URL)
    page.get_by_role('button', name='Weak — regional retailer').click()
    ctx.set_offline(True)
    reqs = []; page.on('request', lambda r: reqs.append(r.url))
    page.get_by_role('button', name='See my assessment').click()
    check('Generate disabled without a key', page.get_by_role('button', name='Generate recommendations').is_disabled())
    page.get_by_role('button', name='Show pre-written examples (no key)').click()
    expect(page.get_by_text('Pre-written examples for Retail & E-commerce')).to_be_visible()
    check('Fallback drops the gated retrieval example', page.get_by_test_id('blocked-acknowledged').locator('li', has_text='Product description drafting').count() == 1)
    check('Fallback summary states the real headline (26)', 'headline score is 26' in page.get_by_test_id('score-summary').inner_text())
    check('Fallback pilot depends on D1 (no alternative for this retailer): flagged', page.get_by_test_id('pilot-fix-first-note').count() == 1)
    check(f'No-key path made zero requests ({len(reqs)})', len(reqs) == 0)
    page.screenshot(path=f'{SHOTS}/5-fallback-offline.png', full_page=True)
    browser.close()

failed = [n for n, ok in results if not ok]
print(f'\n{len(results) - len(failed)}/{len(results)} checks passed')
sys.exit(1 if failed else 0)
