const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const fixture=JSON.parse(fs.readFileSync(process.env.TEST_FIXTURE_PATH || 'work/test-accounts.json'));
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Supabase test environment is required');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';
const checks=[];let browser; const guidance='SYNTHETIC E2E clinician-approved update '+Date.now()+': use revised dosage.';
const pass=name=>{checks.push({name,status:'PASS'});console.log('PASS:',name)};
async function api(role){const user=fixture.users.find(u=>u.role===role);const c=createClient(url,key,{auth:{persistSession:false}});const r=await c.auth.signInWithPassword({email:user.email,password:fixture.password});if(r.error)throw r.error;return c;}
async function login(page,role){const u=fixture.users.find(u=>u.role===role);await page.goto(base+'/login');await page.getByLabel('Email',{exact:true}).fill(u.email);await page.getByLabel('Password',{exact:true}).fill(fixture.password);await page.getByRole('button',{name:'Log in',exact:true}).click();await page.waitForURL(role==='patient'?'**/patient':'**/dashboard',{timeout:60000});}
(async()=>{
 browser=await chromium.launch({channel:'chrome',headless:true});
 const pt=await api('clinician'), patientApi=await api('patient'), outsider=await api('outsider'), admin=await api('admin');pass('Four independent real Supabase password logins');
 const pc=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const patient=await pc.newPage();const errors=[];patient.on('pageerror',e=>errors.push(e.message));
 await patient.goto(base+'/patient');await patient.getByText('Secure session required.').waitFor();pass('Fresh browser denies unauthenticated patient data');
 const linked=await pt.from('patients').select('patient_profile_id').eq('id',fixture.patientId).single();
 if(!linked.data.patient_profile_id){const invite=await pt.rpc('create_patient_invite',{p_patient_id:fixture.patientId});if(invite.error)throw invite.error;await patient.goto(base+'/invite?token='+encodeURIComponent(invite.data)+'&mode=signin');await patient.getByRole('link',{name:/log in|sign in/i}).first().click();await patient.getByLabel('Email',{exact:true}).fill(fixture.users[1].email);await patient.getByLabel('Password',{exact:true}).fill(fixture.password);await patient.getByRole('button',{name:'Log in',exact:true}).click();await patient.waitForURL('**/patient',{timeout:60000});pass('Fresh patient claims clinician-generated invitation through login');}
 else await login(patient,'patient');
 await patient.getByText('SYNTHETIC PWA movement plan',{exact:true}).waitFor({timeout:60000});pass('Patient Today shows assigned program');assert.equal(await patient.locator('.patient-exercise-preview').count(),0);await patient.getByText('10 minutes at the start → 15 minutes now',{exact:false}).waitFor();pass('Today prioritizes meaningful goal progress without exercise history');
 await patient.getByRole('navigation',{name:'Patient app navigation'}).getByRole('link',{name:'Program',exact:true}).click();await patient.getByRole('button',{name:"Start today's program"}).click();
 const cards=patient.locator('.patient-exercise-entry');
 for(let i=0;i<3;i++){await cards.first().waitFor();assert.equal(await cards.count(),1);await cards.first().getByRole('button',{name:['Completed','Partially completed','Skipped'][i],exact:true}).click();await cards.first().getByLabel('Difficulty',{exact:true}).selectOption(i===1?'too_hard':'appropriate');await patient.getByRole('button',{name:i===2?'Finish and share feedback':'Next exercise',exact:true}).click();}
 pass('Focused session displays one exercise at a time');
 await patient.getByRole('button',{name:'Worse',exact:true}).click();await patient.getByLabel('Pain after').fill('4');await patient.getByLabel('Anything your therapist should know?').fill('SYNTHETIC E2E: knee felt harder during the second exercise.');
 await patient.getByRole('button',{name:'Finish today’s program',exact:true}).click();await patient.getByText('Your session and feedback are saved.',{exact:false}).waitFor({timeout:60000});
 const logs=await patientApi.from('exercise_adherence_logs').select('completion_status,session_id').eq('patient_id',fixture.patientId).order('created_at',{ascending:false}).limit(3);assert.deepEqual(new Set(logs.data.map(x=>x.completion_status)),new Set(['completed','partial','skipped']));pass('Completed/partial/skipped and feedback persisted in real database');
 await patient.screenshot({path:'work/patient-session-mobile.png',fullPage:true});
 assert.equal(await patient.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);pass('Patient program fits 390px mobile viewport');
 const cc=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const clinician=await cc.newPage();clinician.on('pageerror',e=>errors.push(e.message));await login(clinician,'clinician');
 await clinician.getByText('Patient feedback to review',{exact:false}).first().waitFor({timeout:60000});pass('Clinician Today inbox receives synthetic feedback');
 await clinician.goto(base+'/patients/'+fixture.patientId);await clinician.getByRole('heading',{name:'Since Last Visit',exact:true}).waitFor();await clinician.getByText('SYNTHETIC E2E: knee felt harder during the second exercise.',{exact:false}).first().waitFor();pass('Patient Workspace shows Since Last Visit and patient comment');
 await clinician.screenshot({path:'work/clinician-workspace-mobile.png',fullPage:true});
 await patient.goto(base+'/patient/messages');await clinician.goto(base+'/patients/'+fixture.patientId+'/decision');await clinician.getByLabel('Patient-facing guidance').fill(guidance);assert.equal(await clinician.getByRole('button',{name:'Approve and publish guidance'}).isEnabled(),false);await clinician.getByRole('checkbox',{name:'I reviewed this guidance and approve showing it to the patient.'}).check();await clinician.getByRole('button',{name:'Approve and publish guidance'}).click();await clinician.getByText('Approved guidance saved',{exact:false}).waitFor({timeout:60000});pass('Explicit clinician approval required before publishing guidance');
 await patient.getByText(guidance,{exact:true}).first().waitFor({timeout:60000});pass('Patient sees approved guidance through automatic Messages refresh without reload'); await clinician.getByRole('button',{name:'Evaluate with v0.1 rules',exact:true}).click();await clinician.getByText('More information needed',{exact:true}).waitFor();assert.equal(await clinician.getByRole('button',{name:'Mark feedback reviewed',exact:true}).isEnabled(),false);pass('Missing engine inputs never produce a treatment suggestion or fake saved evaluation');
 await clinician.getByText('Assess inputs and inspect missing information',{exact:true}).click();
 await clinician.locator('#engine-redFlag').selectOption('true');await clinician.getByRole('button',{name:'Evaluate with v0.1 rules',exact:true}).click();await clinician.getByText('Refer / urgent escalation',{exact:true}).waitFor();await clinician.getByLabel('Your assessment of this suggestion').selectOption('rejected');await clinician.getByLabel('Reason for disagreement (optional)').fill('Synthetic test only: confirming safety priority.');pass('Recovered safety rule explains findings and supports clinician disagreement');assert.equal(await clinician.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await clinician.screenshot({path:'work/engine-review-mobile.png',fullPage:true});
 const beforeReview=await patientApi.from('home_programs').select('patient_explanation').eq('id',fixture.programId).single();assert.equal(beforeReview.data.patient_explanation,guidance);pass('Engine evaluation does not publish its output to patient');
 await clinician.getByLabel('Review rationale').fill('SYNTHETIC E2E review: considered all submitted activity.');await clinician.getByRole('button',{name:'Mark feedback reviewed'}).click();await clinician.getByText('Review recorded. Return to Today to see the updated inbox.').waitFor();const savedReview=await pt.from('clinical_engine_reviews').select('disposition,disagreement_reason').eq('patient_id',fixture.patientId).order('created_at',{ascending:false}).limit(1).single();assert.ifError(savedReview.error);assert.equal(savedReview.data.disposition,'rejected');pass('Clinician review and disagreement persist without sending automatic advice');
 await clinician.goto(base+'/program-builder/'+fixture.patientId);await clinician.getByRole('button',{name:/Save Program/i}).waitFor({timeout:60000});
 // Use the actual dosage input label from the program builder.
 const videoField=clinician.getByRole('region',{name:'Exercise demonstration settings'}).first();
 await videoField.getByLabel('Video URL (optional)',{exact:true}).fill('https://youtu.be/M7lc1UVf-VE');
 const approval=videoField.getByRole('checkbox');assert.equal(await approval.isEnabled(),false);
 await videoField.getByRole('button',{name:'Load video demonstration'}).click();await approval.check();
 await videoField.getByLabel('Video URL (optional)',{exact:true}).fill('https://www.youtube.com/watch?v=M7lc1UVf-VE');assert.equal(await approval.isChecked(),false);assert.equal(await approval.isEnabled(),false);
 await videoField.getByRole('button',{name:'Load video demonstration'}).click();await approval.check();
 pass('Program Builder inline video preview and explicit approval reset on change');
 const sets=clinician.getByLabel('Sets',{exact:true});await sets.first().fill('1');await clinician.getByRole('button',{name:/Save Program/i}).click();await clinician.getByText('Program saved.',{exact:false}).first().waitFor({timeout:60000});
 await patient.goto(base+'/patient/program');await patient.getByRole('button',{name:"Start today's program"}).click();await patient.getByText(/1 sets/).first().waitFor();pass('Clinician program dosage update reaches patient');
 await patient.getByRole('button',{name:'Load video demonstration'}).click();
 const player=patient.frameLocator('iframe[title="SYNTHETIC movement 0 video demonstration"]');
 await player.getByRole('button',{name:/^Play( video)?$/}).click({timeout:45000});
 await patient.waitForTimeout(4000);
 const playback=await player.locator('video').evaluate(v=>({time:v.currentTime,paused:v.paused,error:v.error?.code}));
 assert(playback.time>0&&!playback.paused&&!playback.error,JSON.stringify(playback));pass('Patient YouTube iframe actually plays on mobile viewport');
 for(let i=0;i<3;i++){await patient.locator('.patient-exercise-entry').getByRole('button',{name:'Completed',exact:true}).click();await patient.getByRole('button',{name:i===2?'Finish and share feedback':'Next exercise',exact:true}).click();}
 await patient.getByRole('button',{name:'Better',exact:true}).click();await patient.getByLabel('Anything your therapist should know?').fill('SYNTHETIC subsequent response after clinician update.');await patient.getByRole('button',{name:'Finish today’s program',exact:true}).click();await patient.getByText('Your session and feedback are saved.',{exact:false}).waitFor({timeout:60000});
 await patient.goto(base+'/patient/messages');await patient.getByText('SYNTHETIC subsequent response after clinician update.',{exact:true}).waitFor();await patient.getByText('SYNTHETIC E2E: knee felt harder during the second exercise.',{exact:true}).first().waitFor();pass('Next session response is saved and check-in conversation history survives navigation');
 await clinician.locator('.more-navigation summary').click();for(const name of ['Programs','Exercise Library','Schedule','Analytics','Care Team','Settings'])assert.equal(await clinician.locator('.more-menu').getByRole('link',{name,exact:true}).isVisible(),true);assert.equal(await clinician.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert(await clinician.locator('.sidebar .nav').evaluate(el=>Math.abs(el.getBoundingClientRect().bottom-innerHeight)<2));pass('Clinician mobile navigation contains Today/Patients/Messages/More and required menu');
 await patient.goto(base+'/patient/messages');
 await patient.getByLabel('Share an update or question').fill('SYNTHETIC message continuity');await patient.getByRole('button',{name:'Send message',exact:true}).click();await patient.getByText('Message saved.',{exact:true}).waitFor();
 await clinician.goto(base+'/messages/'+fixture.patientId);await clinician.getByText('SYNTHETIC message continuity',{exact:true}).waitFor();
 await clinician.getByLabel('Write a message to your patient').fill('SYNTHETIC reviewed clinician reply');await clinician.getByRole('button',{name:'Send message',exact:true}).click();await clinician.getByText('Message saved.',{exact:true}).waitFor();
 await patient.getByText('SYNTHETIC reviewed clinician reply',{exact:true}).waitFor({timeout:45000});await patient.reload();await patient.getByText('SYNTHETIC message continuity',{exact:true}).waitFor();pass('Two-way authored messages persist and refresh across independent sessions');
 const second=await browser.newContext({viewport:{width:1280,height:800}});const secondPage=await second.newPage();await login(secondPage,'patient');await secondPage.getByText('SYNTHETIC PWA movement plan',{exact:true}).waitFor();await secondPage.goto(base+'/login');await secondPage.waitForURL('**/patient');pass('Second independent patient session and home-screen session resume');
 for(const table of ['patients','daily_checkins','exercise_adherence_logs']){const r=await outsider.from(table).select('id').eq(table==='patients'?'id':'patient_id',fixture.patientId);assert.ifError(r.error);assert.equal(r.data.length,0);}const program=await outsider.from('home_programs').select('id').eq('id',fixture.programId);assert.equal(program.data.length,0);
 const deny=await outsider.from('home_programs').update({patient_explanation:'UNAUTHORIZED'}).eq('id',fixture.programId).select('id');assert.equal(deny.data?.length||0,0);const patientDeny=await patientApi.from('home_programs').update({patient_explanation:'UNAUTHORIZED PATIENT'}).eq('id',fixture.programId).select('id');assert.equal(patientDeny.data?.length||0,0);pass('RLS denies unrelated clinician reads/updates and patient treatment edits');
 for(const other of [outsider,admin]){
  for(const table of ['patients','episodes','goals','progress_metrics','home_programs','home_program_exercises','exercises','daily_checkins','exercise_adherence_logs','clinical_decisions','visit_notes','clinical_engine_reviews','care_messages','engine_program_changes']){
   const r=await other.from(table).select('id');assert.ifError(r.error);assert.equal(r.data.length,0,table+' unrelated access');
  }
  const r=await other.from('care_messages').insert({patient_id:fixture.patientId,author_id:(await other.auth.getUser()).data.user.id,body:'SYNTHETIC denied',kind:'clinician_message'});assert(r.error);
 }
 const escalation=await patientApi.from('profiles').update({role:'admin'}).eq('id',fixture.users[1].id);assert(escalation.error);
 pass('Live API denies unrelated administrator and clinician clinical access and message writes; patient role escalation blocked');
 const signedOut=await browser.newContext();const authPage=await signedOut.newPage();
 assert.equal((await authPage.request.post(base+'/api/patient-invitations/email',{data:{patientId:fixture.patientId,email:fixture.users[1].email}})).status(),401);
 const outsiderToken=(await outsider.auth.getSession()).data.session.access_token;
 assert.equal((await authPage.request.post(base+'/api/patient-invitations/email',{headers:{Authorization:'Bearer '+outsiderToken},data:{patientId:fixture.patientId,email:fixture.users[1].email}})).status(),403);
 await authPage.goto(base+'/reset-password');await authPage.getByText('The recovery session is missing, expired, or already used.',{exact:false}).waitFor();assert.equal(await authPage.getByRole('button',{name:'Update password'}).count(),0);
 await authPage.goto(base+'/auth/confirm?type=recovery&token_hash=synthetic-invalid&next=https://example.invalid');await authPage.waitForURL('**/auth/error?reason=expired_or_used');
 await signedOut.close();pass('Invite endpoint denies anonymous/unrelated callers; missing and invalid recovery links fail safely');
 const manifest=await (await patient.request.get(base+'/manifest.webmanifest')).json();assert.equal(manifest.display,'standalone');assert.equal(manifest.icons.length,3);for(const icon of manifest.icons)assert.equal((await patient.request.get(base+icon.src)).status(),200);await patient.evaluate(()=>navigator.serviceWorker.ready);pass('Install manifest, icon assets and service worker registration');
 const cached=await patient.evaluate(async()=>{const keys=await caches.keys();return (await Promise.all(keys.map(async k=>(await (await caches.open(k)).keys()).map(r=>new URL(r.url).pathname)))).flat()});assert(cached.every(p=>p==='/offline.html'||p.startsWith('/icons/')));pass('Offline cache contains only public install assets');
 await pc.setOffline(true);await patient.goto(base+'/patient/messages');await patient.getByRole('heading',{name:'Let’s reconnect.'}).waitFor();await pc.setOffline(false);pass('Offline navigation gives honest reconnect screen');
 assert.deepEqual(errors,[]);pass('No browser runtime errors in patient and clinician workflows');
 fs.writeFileSync('work/e2e-results.json',JSON.stringify({base,checks},null,2));
})().catch(async e=>{console.error(e);fs.writeFileSync('work/e2e-results.json',JSON.stringify({base,checks,failure:e.message},null,2));process.exitCode=1;}).finally(async()=>{await browser?.close()});
