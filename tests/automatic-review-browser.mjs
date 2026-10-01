// Synthetic intercepted API contracts only. Database authorization is tested separately with PGlite.
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL??'http://localhost:3011';
const host=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host;
const now=new Date().toISOString();
const clinician='10000000-0000-0000-0000-000000000001', patient='20000000-0000-0000-0000-000000000001', episode='30000000-0000-0000-0000-000000000001', program='40000000-0000-0000-0000-000000000001';
const user={id:clinician,aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',app_metadata:{},user_metadata:{},created_at:now};
const tables={profiles:[{id:clinician,role:'clinician',full_name:'Synthetic clinician'}],patients:[{id:patient,clinician_id:clinician,display_name:'Synthetic automatic review'}],episodes:[{id:episode,patient_id:patient,status:'active',updated_at:now}],home_programs:[{id:program,episode_id:episode,status:'active',updated_at:now,title:'Synthetic program'}],home_program_exercises:[],goals:[{id:'goal',episode_id:episode,title:'Walk longer',baseline_value:'10',current_value:'20',target_value:'30',updated_at:now}],daily_checkins:[{id:'checkin',patient_id:patient,episode_id:episode,pain_score:4,symptom_direction:'worsening',created_at:now,patient_comment:'Synthetic feedback'}],exercise_adherence_logs:[{id:'log',patient_id:patient,home_program_id:program,completion_status:'partial',pain_during:6,performed_at:now}],clinical_engine_reviews:[],clinical_decisions:[]};
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const context=await browser.newContext({viewport:{width:390,height:844}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const saved=[];
 await page.route(`https://${host}/**`,async route=>{
  const url=new URL(route.request().url());let data=[];
  if(url.pathname.endsWith('/auth/v1/token')) data={user,access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600,token_type:'bearer'};
  else if(url.pathname.endsWith('/auth/v1/user')) data=user;
  else if(url.pathname.endsWith('/rpc/record_engine_review')) {const body=route.request().postDataJSON();saved.push(body);data=null;}
  else {const table=url.pathname.split('/').pop();data=tables[table]??[];if(url.searchParams.get('limit')==='0')data=[];if(route.request().headers().accept?.includes('vnd.pgrst.object'))data=data[0]??null;}
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(base+'/login?test=synthetic');await page.getByLabel('Email',{exact:true}).fill('synthetic@example.invalid');await page.getByLabel('Password',{exact:true}).fill('synthetic-fixture-password');await page.getByRole('button',{name:'Log in',exact:true}).click();await page.waitForURL('**/dashboard');
 for(const disposition of ['accepted','modified','rejected']) {
  // Client-side navigation retains the intercepted auth session; no live auth is bypassed or modified.
  await page.goto(base+`/patients/${patient}/decision`);
  await page.getByText('Automatically analyzed data',{exact:true}).first().click();
  await page.getByRole('heading',{name:'Automatically analyzed data',exact:true}).waitFor();
  await page.getByText('Regress or reduce load',{exact:true}).waitFor();
  assert.equal(await page.locator('#engine-exercisePain').count(),0);
  await page.getByText('Add clinical observation / inspect unavailable information',{exact:true}).click();
  assert.equal(await page.locator('#engine-newNeuro').inputValue(),'');
  await page.locator('#engine-newNeuro').selectOption('true');await page.getByText('Refer / urgent escalation',{exact:true}).waitFor();
  await page.getByLabel('Your assessment of this suggestion').selectOption(disposition);
  if(disposition==='modified')await page.getByLabel('Your modification',{exact:true}).fill('Focused reassessment first');
  if(disposition!=='accepted')await page.getByLabel('Review rationale').fill('Synthetic clinical rationale');
  await page.getByRole('button',{name:'Mark feedback reviewed',exact:true}).click();await page.getByText('Review recorded. Return to Today to see the updated inbox.').waitFor();
  assert.equal(saved.at(-1).p_disposition,disposition);assert.equal(saved.at(-1).p_source.inputProvenance.exercisePain.state,'AUTO');assert.equal(saved.at(-1).p_source.inputProvenance.newNeuro.state,'CLINICIAN-ADDED');assert.equal(saved.at(-1).p_source.inputProvenance.swelling.state,'UNKNOWN');
 }
 assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'work/automatic-review-mobile.png',fullPage:true});
 console.log('PASS synthetic browser contracts: auto recommendation, no duplicate AUTO fields, unknowns, observation recalculation, approve/modify/reject snapshots, mobile layout, no runtime errors. Live database authorization tested separately.');
} finally {await browser.close();}
