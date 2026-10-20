// Synthetic browser -> PostgREST adapter -> real PostgreSQL/RLS (PGlite). No remote data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {patientSessionFixture} from './helpers/patient-session-fixture.mjs';
const browser=await chromium.launch({channel:process.env.TEST_BROWSER_CHANNEL||undefined,headless:true});
const base=process.env.TEST_BASE_URL||'http://localhost:3109';
try{
 for(const [name,viewport] of [['mobile',{width:390,height:844}],['android',{width:412,height:915}],['desktop',{width:1280,height:900}]]){
  const {db,id}=await patientSessionFixture();
  const uid=id(2),user={id:uid,aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
  const jwt=[{alg:'HS256',typ:'JWT'},{sub:uid,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600},'synthetic'].map((v,i)=>i===2?v:Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));let loseResponse=true;
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'X-Supabase-Api-Version','X-Supabase-Api-Version':'2024-01-01'};
  const logs=async()=> (await db.query("select * from exercise_adherence_logs where activity_source in ('individual_confirmation','explicit_nonperformance')")).rows;
  await page.route('https://synthetic.example.invalid/**',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname.split('/').at(-1);let body=null,status=200;
   if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers:{...headers,'Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'}});return;}
   try{
    if(path==='token')body={access_token:jwt,refresh_token:'synthetic',expires_in:3600,token_type:'bearer',user};
    else if(path==='user')body=user;
    else if(path==='confirm_patient_exercise'){
     const p=req.postDataJSON();body=(await db.query('select confirm_patient_exercise($1,$2,$3) as id',[p.p_session,p.p_exercise,p.p_feedback])).rows[0].id;
     if(loseResponse){loseResponse=false;await route.abort('failed');return;}
    }
    else if(path==='patient_exercise_sessions'&&req.method()==='POST'){
     const p=req.postDataJSON();await db.query('insert into patient_exercise_sessions(id,patient_id,home_program_id,program_version,selection_mode,selected_ids,current_exercise_id) values($1,$2,$3,$4,$5,$6,$7)',[p.id,p.patient_id,p.home_program_id,p.program_version,p.selection_mode,p.selected_ids,p.current_exercise_id]);status=201;
    }else if(path==='patient_exercise_sessions'&&req.method()==='PATCH'){
     const p=req.postDataJSON(),sid=url.searchParams.get('id').slice(3);
     if(p.state)await db.query('update patient_exercise_sessions set state=$1 where id=$2',[p.state,sid]);
     else await db.query('update patient_exercise_sessions set current_exercise_id=$1 where id=$2',[p.current_exercise_id,sid]);
    }else if(path==='home_program_exercises')body=(await db.query('select h.*, row_to_json(e) as exercise from home_program_exercises h join exercises e on e.id=h.exercise_id order by sort_order,id')).rows;
    else if(['profiles','patients','episodes','home_programs','exercise_adherence_logs','patient_exercise_sessions'].includes(path)){
     body=(await db.query('select * from public.'+path)).rows;
     for(const [key,value] of url.searchParams){if(value.startsWith('eq.'))body=body.filter(x=>String(x[key])===value.slice(3));}
     if(path==='patient_exercise_sessions')body=body.filter(x=>!url.searchParams.has('state')||x.state===url.searchParams.get('state').slice(3));
     if(path==='exercise_adherence_logs'&&url.searchParams.has('session_id'))body=body.filter(x=>x.session_id===url.searchParams.get('session_id').slice(3));
     if(req.headers().accept?.includes('vnd.pgrst.object+json'))body=body[0]??null;
    }else body=req.headers().accept?.includes('vnd.pgrst.object+json')?null:[];
   }catch(e){status=400;body={code:e.code??'P0001',message:e.message};}
   await route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(base+'/login');await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill('SyntheticOnly!2026');await page.getByRole('button',{name:'Log in',exact:true}).click();
  await page.waitForURL('**/patient');await page.goto(base+'/patient/program');
  await page.getByRole('button',{name:'Select Section(s)',exact:true}).click();await page.getByRole('checkbox',{name:/Other/}).check();await page.getByRole('button',{name:'Start session',exact:true}).click();
  await page.getByRole('heading',{name:'Your session list'}).waitFor();assert.equal((await logs()).length,0);
  // All three fixture assignments share a name; start with the second one.
  await page.getByRole('button',{name:'Standard heel raise',exact:true}).nth(1).click();
  await page.getByText('Adjust what I did (optional)',{exact:true}).click();await page.getByLabel('Actual repetitions',{exact:true}).fill('4');
  await page.getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('alert').filter({hasText:/Failed to fetch/}).waitFor();assert.equal((await logs()).length,1,'write committed despite lost response');
  await page.getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('button',{name:'Recorded',exact:true}).waitFor();assert.equal((await logs()).length,1,'retry deduplicated');
  assert.equal((await logs())[0].actual_dose.reps.value,4);
  await page.reload();await page.getByRole('button',{name:/Resume session/}).click();await page.getByRole('heading',{name:'Your session list'}).waitFor();await page.getByRole('button',{name:'Standard heel raise · Recorded',exact:true}).waitFor();
  assert.equal((await logs()).length,1,'reload/selection never create extra activity');
  await page.getByRole('button',{name:'Standard heel raise',exact:true}).first().click();await page.getByRole('button',{name:'Next exercise',exact:true}).click();
  await page.waitForFunction(()=>document.activeElement?.classList.contains('exercise-step-heading'));
  const box=await page.locator('.exercise-step-heading').boundingBox();assert(box.y>=0&&box.y<200);
  await page.getByRole('button',{name:'Finish for now',exact:true}).click();await page.getByRole('button',{name:'Close session',exact:true}).click();await page.getByRole('button',{name:'Start session',exact:true}).waitFor();
  await page.getByRole('button',{name:'Follow Full Program',exact:true}).click();await page.getByRole('button',{name:'Start session',exact:true}).click();await page.getByRole('button',{name:'Done',exact:true}).click();await page.getByRole('button',{name:'Recorded',exact:true}).waitFor();assert.equal((await logs()).length,2,'second session can record same exercise');
  await page.getByRole('button',{name:'Next exercise',exact:true}).click();await page.getByText('Something to tell my therapist',{exact:true}).click();await page.getByRole('button',{name:'Send report: I did not do this exercise',exact:true}).click();await page.getByRole('button',{name:'Reported not performed',exact:true}).waitFor();
  const reports=await logs();assert.equal(reports.filter(l=>l.activity_source==='individual_confirmation').length,2);assert.equal(reports.filter(l=>l.activity_source==='explicit_nonperformance').length,1);
  await page.getByRole('button',{name:'Finish for now',exact:true}).click();await page.getByRole('button',{name:'Close session',exact:true}).click();
  await page.getByRole('button',{name:'Choose Individual Exercises',exact:true}).click();await page.getByRole('checkbox',{name:'Standard heel raise',exact:true}).nth(2).check();await page.getByRole('button',{name:'Start session',exact:true}).click();await page.getByRole('heading',{name:'Your session list'}).waitFor();assert.equal(await page.getByRole('button',{name:'Standard heel raise',exact:true}).count(),1);assert.equal((await logs()).length,3,'individual selection adds no confirmation');
  assert.equal(await page.getByRole('button',{name:/^Skip$|Partially completed/}).count(),0);assert(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));assert.deepEqual(errors,[]);
  fs.mkdirSync('work',{recursive:true});await page.screenshot({path:`work/patient-directed-${name}.png`,fullPage:true});console.log('PASS',name,': selection, start anywhere, lost-response retry, PostgreSQL records, reload/resume, Next focus, multiple sessions, mobile width');
  await context.close();await db.close();
 }
}finally{await browser.close();}
