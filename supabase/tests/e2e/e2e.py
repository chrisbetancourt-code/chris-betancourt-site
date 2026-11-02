"""End-to-end browser tests: real app + real PostgREST/Postgres rules; auth/storage are local test doubles."""
import re, sys, json, subprocess, time, urllib.request
from playwright.sync_api import sync_playwright, expect

SITE = 'http://127.0.0.1:54332'
SB = 'https://ltjegtsprbvbkmxczftg.supabase.co'
SHOTS = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
results = []
def psql(sql):
    return subprocess.check_output(['psql','-h','/tmp','-p','54329','-U','postgres','-d','portal_e2e','-qAt','-c',sql], text=True).strip()
def open_ex(pg, n):
    """Exercises are collapsible now; open exercise n (0-based) if it is closed."""
    ex = pg.locator('.ex').nth(n)
    if not ex.evaluate('e => e.open'):
        ex.locator('summary').first.click()
    return ex
def step(name):
    def deco(fn):
        try: fn(); results.append((True, name)); print('PASS', name)
        except Exception as e: results.append((False, name)); print('FAIL', name, '->', str(e).split('\n')[0][:300])
        return fn
    return deco

MID, BEA_ID = psql("select id from students where full_name='Michael Delgado'"), psql("select id from students where full_name='Bea Student'")
M_ASG = psql("select id from assignments where student_id='%s'" % MID)
# a published lesson belonging to Bea (the "other student" for privacy attacks)
BEA_LESSON = psql("insert into lessons (title) values ('Bea secret lesson') returning id").split('\n')[0]
BEA_ASG = psql("insert into assignments (student_id, lesson_id, lesson_number, status) values ('%s','%s',1,'published') returning id" % (BEA_ID, BEA_LESSON)).split('\n')[0]
psql("insert into teacher_notes (student_id, body) values ('%s','TOP SECRET note about Bea')" % BEA_ID)

with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    def new_ctx(w=1280, h=900):
        c = b.new_context(viewport={'width': w, 'height': h}, accept_downloads=False)
        def route(r):
            u = r.request.url
            if u.startswith(SB): return r.fulfill(response=r.fetch(url=u.replace(SB, 'http://127.0.0.1:54331')))
            if 'fonts.g' in u: return r.abort()
            return r.continue_()
        c.route('**/*', route)
        return c
    errors = []
    def page_of(c):
        pg = c.new_page()
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' and 'Failed to load resource' not in m.text and 'fonts' not in m.text else None)
        return pg
    def login(pg, email, pw='password123'):
        pg.goto(SITE + '/lessons/'); pg.fill('input[type=email]', email); pg.fill('input[type=password]', pw); pg.click('button[type=submit]')

    # ---------------- teacher ----------------
    tctx = new_ctx(); t = page_of(tctx)

    @step('Sign-in page shows; wrong password gives a clear message')
    def _():
        t.goto(SITE + '/lessons/'); expect(t.locator('h1')).to_have_text('Sign in')
        t.fill('input[type=email]', 'chris@test.local'); t.fill('input[type=password]', 'nope'); t.click('button[type=submit]')
        expect(t.locator('.form-err')).to_contain_text('do not match')

    @step('Teacher signs in and sees dashboard with both students and stats')
    def _():
        t.fill('input[type=password]', 'password123'); t.click('button[type=submit]')
        expect(t.locator('h1')).to_have_text('Your students')
        expect(t.locator('.tbl-row')).to_have_count(2)
        expect(t.locator('.stat').first).to_contain_text('2')
        t.screenshot(path=SHOTS + '/teacher-dash.png', full_page=True)

    @step('Teacher opens Michael: seeded lesson, private note, account state')
    def _():
        t.click('.tbl-row:has-text("Michael Delgado")')
        expect(t.locator('h1')).to_have_text('Michael Delgado')
        expect(t.locator('.lesson-li')).to_contain_text('Building the Foundation for Worship Guitar')
        expect(t.locator('body')).to_contain_text('Account created')
        t.screenshot(path=SHOTS + '/teacher-student.png', full_page=True)

    @step('Seeded lesson page: tab, chords, agenda 60 min, 5 exercises, objectives, YouTube embed')
    def _():
        t.click('.lesson-li .row-link')
        expect(t.locator('h1')).to_contain_text('Building the Foundation')
        expect(t.locator('.ex')).to_have_count(5)
        expect(t.locator('pre.tab').filter(has_text='e|---0---1---3---1---0---|')).to_have_count(1)
        expect(t.locator('figure.tabfig').filter(has_text='Your four chords').locator('pre.tab').filter(has_text='G           Em')).to_have_count(1)
        expect(t.locator('.agenda tfoot')).to_contain_text('60 min')
        expect(t.locator('.checks li')).to_have_count(4)
        expect(t.locator('iframe[src*="youtube-nocookie.com/embed/JXFh--1GmGM"]')).to_have_count(1)
        expect(t.locator('.teacher-tools')).to_contain_text('TO VERIFY')
        t.screenshot(path=SHOTS + '/teacher-lesson.png', full_page=True)

    @step('Lesson sections are collapsible: open/close with a click and with the keyboard')
    def _():
        grp = t.locator('details.grp', has=t.locator('summary', has_text='What we are working on'))
        assert not grp.evaluate('e => e.open')
        expect(grp.locator('li').first).not_to_be_visible()
        grp.locator('summary').click(); assert grp.evaluate('e => e.open'); expect(grp.locator('li').first).to_be_visible()
        grp.locator('summary').focus(); t.keyboard.press('Enter'); assert not grp.evaluate('e => e.open')
        agenda = t.locator('details.sec', has=t.locator('summary', has_text='Lesson agenda'))
        assert agenda.evaluate('e => e.open'); agenda.locator('summary').click()
        expect(agenda.locator('table')).not_to_be_visible(); agenda.locator('summary').click()
        expect(agenda.locator('table')).to_be_visible()

    @step('Sections menu: opens, lists every section, jumps to and opens a collapsed one, closes on Escape / outside click')
    def _():
        btn = t.locator('.secnav-btn'); panel = t.locator('#secnav')
        expect(btn).to_be_visible(); expect(panel).to_be_hidden()
        btn.click(); expect(panel).to_be_visible(); expect(btn).to_have_attribute('aria-expanded', 'true')
        labels = panel.locator('.secnav-item').all_inner_texts()
        for want in ['Top of lesson', 'Lesson', 'Lesson agenda', 'Homework', 'Teacher tools', '5. Learn the Song']:
            assert any(l.strip().lower() == want.lower() for l in labels), (want, labels)
        ex5 = t.locator('#secnav .secnav-item', has_text='5. Learn the Song'); ex5.click()
        expect(panel).to_be_hidden()
        card = t.locator('.ex').nth(4); assert card.evaluate('e => e.open')
        top = card.evaluate('e => e.getBoundingClientRect().top'); assert -2 <= top < 200, top
        btn.click(); t.keyboard.press('Escape'); expect(panel).to_be_hidden()
        btn.click(); expect(panel).to_be_visible(); t.mouse.click(5, 300); expect(panel).to_be_hidden()
        btn.click(); t.locator('#secnav .secnav-tools >> text=Close all').click()
        assert t.locator('details.sec[open]').count() == 0
        t.locator('.secnav-tools >> text=Open all').click()
        assert t.locator('details.sec:not([open])').count() == 0
        t.keyboard.press('Escape')
        t.screenshot(path=SHOTS + '/lesson-menu-desktop.png')

    @step('Teacher can tick an objective and mark exercise state is visible')
    def _():
        t.locator('.checks input').first.check(); t.wait_for_timeout(400)
        assert psql("select count(*) from objective_achievements") == '1'

    @step('Add student via the form (no email) then invite without email is refused politely')
    def _():
        t.goto(SITE + '/lessons/#/'); t.click('text=Add student >> nth=0')
        t.fill('.modal-card input[type=text] >> nth=0', 'Carlos Rivera'); t.click('.modal-card button[type=submit]')
        expect(t.locator('h1')).to_have_text('Carlos Rivera')
        t.click('text=Send invitation'); expect(t.locator('.toast.error')).to_contain_text('email')

    @step('Add email, send invitation: account created and linked server-side')
    def _():
        t.click('text=Edit details'); t.fill('.modal-card input[type=email]', 'carlos@test.local'); t.click('.modal-card button[type=submit]')
        t.wait_for_timeout(500); t.click('text=Send invitation'); expect(t.locator('.toast').last).to_contain_text('Invitation sent')
        assert psql("select count(*) from students s join profiles p on p.id=s.user_id where s.email='carlos@test.local' and p.role='student'") == '1'

    @step('Student account created by invite is a student, never a teacher')
    def _():
        assert psql("select role from profiles where email='carlos@test.local'") == 'student'

    @step('Create a new lesson for Michael: draft is hidden, blocks/exercises save, then publish')
    def _():
        t.goto(SITE + '/lessons/#/s/%s/new' % MID)
        expect(t.locator('h1')).to_have_text('Create a lesson')
        t.fill('label:has-text("Lesson title") + input', 'Lesson 3 Test Draft')
        t.fill('label:has-text("Main objective") + textarea', 'Learn the pentatonic box')
        t.locator('.block-edit').count()
        t.select_option('select[aria-label="Type of block to add"]', 'tab'); t.click('text=Add block')
        t.locator('.block-edit textarea').first.fill('e|--5--8--|\nB|--5--8--|')
        t.locator('.ex-edit').first.locator('label:has-text("Title") + input').fill('Box Shape')
        t.locator('.ex-edit').first.locator('label:has-text("Instructions") + textarea').fill('Play it slowly.')
        t.locator('.ex-edit').first.locator('label:has-text("Reference links") + textarea').fill('Tutorial | https://youtu.be/JXFh--1GmGM')
        t.click('text=Save draft'); expect(t.locator('h1')).to_have_text('Lesson 3 Test Draft')
        expect(t.locator('.banner')).to_contain_text('Draft')
        assert psql("select status from assignments a join lessons l on l.id=a.lesson_id where l.title='Lesson 3 Test Draft'") == 'draft'
        assert psql("select count(*) from exercises e join lessons l on l.id=e.lesson_id where l.title='Lesson 3 Test Draft' and e.reference_links::text like '%youtu.be%'") == '1'
        assert psql("select content->0->>'type' from lessons where title='Lesson 3 Test Draft'") == 'tab'

    @step('Editing a lesson keeps ids (no silent history loss); invalid link is rejected')
    def _():
        t.click('text=Edit lesson')
        t.locator('.ex-edit').first.locator('label:has-text("Reference links") + textarea').fill('Bad | javascript:alert(1)')
        t.click('text=Save draft'); expect(t.locator('.form-err').last).to_contain_text('reference link')
        t.locator('.ex-edit').first.locator('label:has-text("Reference links") + textarea').fill('Tutorial | https://youtu.be/JXFh--1GmGM')
        before = psql("select id from exercises where title='Box Shape'")
        t.click('text=Save draft'); expect(t.locator('h1')).to_have_text('Lesson 3 Test Draft')
        assert psql("select id from exercises where title='Box Shape'") == before

    # ---------------- student ----------------
    sctx = new_ctx(); s = page_of(sctx)

    @step('Student cannot see the draft lesson; sees Lesson 2 dashboard')
    def _():
        login(s, 'michael@test.local')
        expect(s.locator('h1')).to_have_text('Hi, Michael')
        expect(s.locator('body')).not_to_contain_text('Lesson 3 Test Draft')
        expect(s.locator('.cont-t')).to_have_text('Building the Foundation for Worship Guitar')
        expect(s.locator('ul.plain .ex-link')).to_have_count(5)
        s.screenshot(path=SHOTS + '/student-dash.png', full_page=True)

    @step('Teacher publishes the draft; student then sees it')
    def _():
        t.click('text=Publish to student'); expect(t.locator('.toast').last).to_contain_text('Published'); t.wait_for_timeout(400)
        s.reload(); expect(s.locator('.cont-t')).to_be_visible()
        assert psql("select count(*) from assignments where status='published' and student_id='%s'" % MID) == '2'

    @step('Student opens lesson, marks an exercise complete and undoes it')
    def _():
        s.goto(SITE + '/lessons/#/s/%s/l/%s' % (MID, M_ASG))
        expect(s.locator('.ex')).to_have_count(5)
        ex = s.locator('.ex').nth(0)
        ex.locator('text=Mark as completed').click(); s.wait_for_timeout(600)
        assert s.locator('.ex').nth(0).evaluate('e => e.open'), 'exercise snapped shut after marking complete'
        expect(s.locator('.ex').nth(0)).to_contain_text('Completed')
        assert psql("select count(*) from exercise_completions where student_id='%s'" % MID) == '1'
        s.locator('.ex').nth(0).locator('text=tap to undo').click(); s.wait_for_timeout(600)
        assert psql("select count(*) from exercise_completions where student_id='%s'" % MID) == '0'
        s.locator('.ex').nth(0).locator('text=Mark as completed').click(); s.wait_for_timeout(600)

    @step('Student sees no teacher tools or private notes on the lesson page')
    def _():
        expect(s.locator('.teacher-tools')).to_have_count(0)
        expect(s.locator('body')).not_to_contain_text('TO VERIFY')
        expect(s.locator('body')).not_to_contain_text('Teaching principles')

    @step('Completing does not happen just from uploading a video (exercise 3 stays "To do")')
    def _():
        ex3 = s.locator('.ex').nth(2)
        ex3.locator('input.file').set_input_files(files=[{'name': 'clip.mp4', 'mimeType': 'video/mp4', 'buffer': b'\x00\x00\x00\x18ftypmp42' + b'0' * 3000}])
        expect(s.locator('.toast').last).to_contain_text('Video uploaded', timeout=8000); s.wait_for_timeout(600)
        expect(s.locator('.ex').nth(2).locator('.sub')).to_have_count(1)
        expect(s.locator('.ex').nth(2)).to_contain_text('Not completed yet')
        expect(s.locator('.ex').nth(2).locator('.sub')).to_contain_text('Submitted')
        assert psql("select status from submissions where student_id='%s'" % MID) == 'submitted'

    @step('Upload rules: wrong file type and over-limit sizes give clear messages')
    def _():
        ex = s.locator('.ex').nth(3)
        ex.locator('input.file').set_input_files(files=[{'name': 'notes.txt', 'mimeType': 'text/plain', 'buffer': b'hello'}])
        expect(ex.locator('.upl-msg')).to_contain_text('not supported')
        import tempfile, os
        big = os.path.join(tempfile.mkdtemp(), 'big.mp4')
        with open(big, 'wb') as fh: fh.truncate(51 * 1024 * 1024)
        ex.locator('input.file').set_input_files(big)
        expect(ex.locator('.upl-msg')).to_contain_text('limit is 50 MB')

    @step('iPhone-style .MOV (video/quicktime) is accepted')
    def _():
        ex = s.locator('.ex').nth(1)
        ex.locator('input.file').set_input_files(files=[{'name': 'IMG_0001.MOV', 'mimeType': 'video/quicktime', 'buffer': b'moov' + b'1' * 2000}])
        expect(s.locator('.toast').last).to_contain_text('Video uploaded', timeout=8000)

    @step('Student can watch their own video via a short-lived signed link (loaded only on click)')
    def _():
        s.wait_for_timeout(600)
        assert s.locator('.player video').count() == 0
        open_ex(s, 2); s.locator('.ex').nth(2).locator('text=Watch video').click()
        expect(s.locator('.ex').nth(2).locator('video')).to_have_attribute('src', re.compile(r'/storage/v1/object/sign/submissions/.+token='))

    # ---------------- review & feedback ----------------
    @step('Teacher sees video waiting, marks in review, leaves feedback with a timestamp')
    def _():
        t.goto(SITE + '/lessons/#/'); expect(t.locator('.stat').nth(2)).to_contain_text('2')
        t.goto(SITE + '/lessons/#/s/%s/l/%s' % (MID, M_ASG))
        ex3 = open_ex(t, 2)
        ex3.locator('text=Mark in review').click(); t.wait_for_timeout(600)
        expect(t.locator('.ex').nth(2).locator('.sub')).to_contain_text('In review')
        f = t.locator('.ex').nth(2).locator('.fbform')
        f.locator('textarea').nth(0).fill('Nice steady timing!'); f.locator('textarea').nth(1).fill('Relax your picking wrist.'); f.locator('input[placeholder="m:ss"]').fill('0:12')
        f.locator('text=Send feedback').click(); t.wait_for_timeout(800)
        expect(t.locator('.ex').nth(2).locator('.sub')).to_contain_text('Feedback ready')
        assert psql("select timestamp_seconds from feedback") == '12'

    @step('Student sees the feedback, suggestions and "Feedback ready" status')
    def _():
        s.reload(); s.wait_for_timeout(800)
        open_ex(s, 2)
        sub = s.locator('.ex').nth(2).locator('.sub')
        expect(sub).to_contain_text('Nice steady timing!'); expect(sub).to_contain_text('Relax your picking wrist.'); expect(sub).to_contain_text('Feedback ready')
        expect(sub.locator('.fbform')).to_have_count(0)
        s.goto(SITE + '/lessons/#/'); expect(s.locator('body')).to_contain_text('Nice steady timing!')
        s.screenshot(path=SHOTS + '/student-dash-after.png', full_page=True)

    @step('Student cannot delete a video once it has been reviewed')
    def _():
        s.goto(SITE + '/lessons/#/s/%s/l/%s' % (MID, M_ASG)); s.wait_for_timeout(800)
        open_ex(s, 1); open_ex(s, 2)
        expect(s.locator('.ex').nth(2).locator('text=Delete this video')).to_have_count(0)
        expect(s.locator('.ex').nth(1).locator('text=Delete this video')).to_have_count(1)

    @step('Teacher marks lesson complete; it moves to the student\'s learning history')
    def _():
        t.click('text=Mark lesson complete'); t.wait_for_timeout(600)
        s.goto(SITE + '/lessons/#/'); s.wait_for_timeout(800)
        expect(s.locator('.card:has-text("Learning history")')).to_contain_text('Building the Foundation')

    # ---------------- privacy attacks through the real UI/API ----------------
    @step("ATTACK: Michael opens Bea's lesson by URL (her student id + her assignment id)")
    def _():
        s.goto(SITE + '/lessons/#/s/%s/l/%s' % (BEA_ID, BEA_ASG)); s.wait_for_timeout(800)
        expect(s.locator('h1')).to_have_text('Page not found'); expect(s.locator('body')).not_to_contain_text('Bea secret lesson')

    @step("ATTACK: Michael pairs his own id with Bea's assignment id")
    def _():
        s.goto(SITE + '/lessons/#/s/%s/l/%s' % (MID, BEA_ASG)); s.wait_for_timeout(800)
        expect(s.locator('h1')).to_have_text('Page not found'); expect(s.locator('body')).not_to_contain_text('Bea secret lesson')

    @step("ATTACK: Michael opens Bea's teacher profile URL, new-lesson and edit pages")
    def _():
        s.goto(SITE + '/lessons/#/s/%s' % BEA_ID); s.wait_for_timeout(800)
        expect(s.locator('h1')).to_have_text('Hi, Michael')
        s.goto(SITE + '/lessons/#/s/%s/new' % BEA_ID); s.wait_for_timeout(500)
        expect(s.locator('h1')).to_contain_text('do not have access')
        s.goto(SITE + '/lessons/#/s/%s/l/%s/edit' % (MID, M_ASG)); s.wait_for_timeout(500)
        expect(s.locator('h1')).to_contain_text('do not have access')

    @step("ATTACK: Michael's own token asks the API directly for Bea's data, notes and files")
    def _():
        out = s.evaluate("""async ([sb, bea, asg]) => {
          const sess = JSON.parse(localStorage.getItem('cb_lessons_session'));
          const h = { apikey: 'x', Authorization: 'Bearer ' + sess.access_token };
          const get = async (p) => (await (await fetch(sb + '/rest/v1/' + p, { headers: h })).json());
          return {
            students: (await get('students?select=full_name')).map(x => x.full_name),
            beaAsg: (await get('assignments?id=eq.' + asg)).length,
            notes: (await get('teacher_notes?select=*')).length,
            subs: (await get('submissions?student_id=eq.' + bea)).length,
            fb: (await get('feedback?select=submission_id')).length,
            profiles: (await get('profiles?select=email')).map(x => x.email),
          };
        }""", [SB, BEA_ID, BEA_ASG])
        assert out['students'] == ['Michael Delgado'], out
        assert out['beaAsg'] == 0 and out['notes'] == 0 and out['subs'] == 0, out
        assert out['profiles'] == ['michael@test.local'], out

    @step("ATTACK: Michael tries to sign / read Bea's video file and to promote himself")
    def _():
        # put a real file in Bea's folder, then try to sign a link as Michael
        name = '%s/%s/secret.mp4' % (BEA_ID, BEA_ASG)
        psql("insert into storage.objects (bucket_id, name) values ('submissions','%s')" % name)
        r = s.evaluate("""async ([sb, name, mid]) => {
          const sess = JSON.parse(localStorage.getItem('cb_lessons_session'));
          const h = { apikey: 'x', Authorization: 'Bearer ' + sess.access_token, 'Content-Type': 'application/json' };
          const sign = await fetch(sb + '/storage/v1/object/sign/submissions/' + name, { method: 'POST', headers: h, body: '{"expiresIn":60}' });
          const promote = await fetch(sb + '/rest/v1/profiles?id=eq.' + mid, { method: 'PATCH', headers: { ...h, Prefer: 'return=representation' }, body: '{"role":"teacher"}' });
          return { sign: sign.status, promote: promote.status, promoted: (await promote.text()) };
        }""", [SB, name, '00000000-0000-0000-0000-0000000000b1'])
        assert r['sign'] == 400, r
        assert r['promote'] in (401, 403) or r['promoted'] in ('[]', ''), r
        assert psql("select role from profiles where email='michael@test.local'") == 'student'

    @step('Signed out: protected data not reachable, login shown')
    def _():
        s.click('text=Sign out'); expect(s.locator('h1')).to_have_text('Sign in')
        s.goto(SITE + '/lessons/#/s/%s/l/%s' % (MID, M_ASG)); s.wait_for_timeout(600)
        expect(s.locator('h1')).to_have_text('Sign in')

    @step('Linked-less login (no student profile) sees a clear "not set up" page, no data')
    def _():
        psql("insert into auth.users (id,email) values ('00000000-0000-0000-0000-0000000000d1','stray@test.local')")
        c = new_ctx(); pg = page_of(c); login(pg, 'stray@test.local')
        expect(pg.locator('h1')).to_contain_text('not set up'); c.close()

    @step('Invite link flow: set a password, then sign in with it (teacher-sent invitation)')
    def _():
        c = new_ctx(); pg = page_of(c)
        # simulate Supabase redirecting back with tokens in the URL fragment
        import base64, hmac, hashlib
        def b64(x): return base64.urlsafe_b64encode(x).rstrip(b'=').decode()
        uid = psql("select id from auth.users where email='carlos@test.local'")
        head = b64(json.dumps({'alg':'HS256','typ':'JWT'}).encode()); pl = b64(json.dumps({'sub': uid, 'role': 'authenticated', 'email': 'carlos@test.local', 'exp': int(time.time()) + 3600}).encode())
        sig = b64(hmac.new(b'test-jwt-secret-test-jwt-secret-1234567890', (head + '.' + pl).encode(), hashlib.sha256).digest())
        pg.goto(SITE + '/lessons/#access_token=%s.%s.%s&refresh_token=r-%s&expires_in=3600&type=invite' % (head, pl, sig, uid))
        expect(pg.locator('h1')).to_contain_text('Create your password')
        pg.fill('input[autocomplete=new-password] >> nth=0', 'short'); pg.fill('input[autocomplete=new-password] >> nth=1', 'short'); pg.click('button[type=submit]')
        expect(pg.locator('.form-err')).to_contain_text('at least 8')
        pg.fill('input[autocomplete=new-password] >> nth=0', 'GoodPass123'); pg.fill('input[autocomplete=new-password] >> nth=1', 'GoodPass123'); pg.click('button[type=submit]')
        expect(pg.locator('h1')).to_have_text('Hi, Carlos'); c.close()

    @step('Invite endpoint refuses: no token, a student token, wrong method')
    def _():
        import urllib.error
        def call(method, token=None, data=b'{"studentId":"%s"}' % MID.encode()):
            rq = urllib.request.Request(SITE + '/api/invite', data=data if method == 'POST' else None, method=method, headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + token} if token else {})})
            try: return urllib.request.urlopen(rq).status
            except urllib.error.HTTPError as e: return e.code
        tok = s.evaluate("() => { const x = JSON.parse(localStorage.getItem('cb_lessons_session')); return x && x.access_token }")
        if not tok:
            c2 = new_ctx(); p2 = page_of(c2); login(p2, 'bea@test.local'); p2.wait_for_timeout(700)
            tok = p2.evaluate("() => JSON.parse(localStorage.getItem('cb_lessons_session')).access_token"); c2.close()
        assert call('POST') == 401
        assert call('POST', tok) == 403
        assert call('GET', tok) == 405
        assert call('POST', tok, data=b'{"studentId":"nope"}') in (400, 403)

    # ---------------- phone layout ----------------
    @step('Phone (390px): student dashboard, lesson page and tab scroll without page overflow')
    def _():
        c = new_ctx(390, 844); pg = page_of(c); login(pg, 'michael@test.local')
        expect(pg.locator('h1')).to_have_text('Hi, Michael')
        pg.screenshot(path=SHOTS + '/m-dash.png', full_page=True)
        assert not pg.evaluate('document.documentElement.scrollWidth > innerWidth')
        pg.goto(SITE + '/lessons/#/s/%s/l/%s' % (MID, M_ASG)); pg.wait_for_timeout(900)
        pg.screenshot(path=SHOTS + '/m-lesson.png', full_page=True)
        assert not pg.evaluate('document.documentElement.scrollWidth > innerWidth')
        pg.locator('.secnav-btn').click(); pan = pg.locator('#secnav'); expect(pan).to_be_visible()
        bb = pan.bounding_box(); assert bb['x'] >= 0 and bb['x'] + bb['width'] <= 390 and bb['y'] >= 0 and bb['y'] + bb['height'] <= 844, bb
        bt = pg.locator('.secnav-btn').bounding_box(); assert bt['height'] >= 44, bt
        pg.screenshot(path=SHOTS + '/m-lesson-menu.png')
        pg.locator('#secnav .secnav-item', has_text='Homework').click(); pg.wait_for_timeout(300)
        assert pg.locator('#homework').evaluate('e => e.open')
        assert not pg.evaluate('document.documentElement.scrollWidth > innerWidth')
        c.close()
        c = new_ctx(390, 844); pg = page_of(c); login(pg, 'chris@test.local'); pg.wait_for_timeout(800)
        pg.screenshot(path=SHOTS + '/m-teacher.png', full_page=True)
        assert not pg.evaluate('document.documentElement.scrollWidth > innerWidth')
        pg.goto(SITE + '/lessons/#/s/%s/new' % MID); pg.wait_for_timeout(900)
        assert not pg.evaluate('document.documentElement.scrollWidth > innerWidth')
        pg.screenshot(path=SHOTS + '/m-editor.png', full_page=False); c.close()

    # ---------------- existing site untouched ----------------
    @step('Main website still loads: no errors, booking form + new Lessons link present')
    def _():
        c = new_ctx(); pg = page_of(c); before = len(errors)
        pg.goto(SITE + '/index.html'); pg.wait_for_timeout(1200)
        expect(pg.locator('#bookingForm')).to_have_count(1)
        expect(pg.locator('header.nav ul a[href="/lessons/"]')).to_have_count(1)
        expect(pg.locator('#menuPanel a[href="/lessons/"]')).to_have_count(1)
        expect(pg.locator('footer a[href="/lessons/"]')).to_have_count(1)
        assert len(errors) == before, errors[before:]
        c.close()

    @step('No unexpected JavaScript errors in any portal page')
    def _():
        assert not errors, errors[:5]
    b.close()

fails = [n for ok, n in results if not ok]
print('\n%d passed, %d failed' % (len(results) - len(fails), len(fails)))
sys.exit(1 if fails else 0)
