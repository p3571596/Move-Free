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
  await db.query('insert into auth.users values($1)',[id(5)]);
  await db.query('update patients set clinician_id=$1 where id=$2',[id(5),id(10)]);
  await db.query('update exercises set clinician_id=$1',[id(5)]);
  await db.query('update home_program_exercises set prescription=$1,legacy_prescription=$2',[{sets:{value:2,unit:"sets"},reps:{value:8,unit:"reps"},frequency:{value:10,unit:"sessions/week"}},{review_required:false}]);
  const uid=id(5),user={id:uid,aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
  const jwt=[{alg:'HS256',typ:'JWT'},{sub:uid,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600},'synthetic'].map((v,i)=>i===2?v:Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));let rejectSave=false, failLibrary=false;
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'X-Supabase-Api-Version','X-Supabase-Api-Version':'2024-01-01'};
  await page.route('https://synthetic.example.invalid/**',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname.split('/').at(-1);let body=null,status=200;
   if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers:{...headers,'Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'}});return;}
   try{
    if(path==='token')body={access_token:jwt,refresh_token:'synthetic',expires_in:3600,token_type:'bearer',user};
    else if(path==='user')body=user;
    else if(path==='pilot_feature_enabled')body=false;
    else if(path==='save_structured_program'){
     if(rejectSave)throw new Error('Synthetic save rejected. Your edits were retained.');
     const p=req.postDataJSON();body=(await db.query('select save_structured_program($1,$2,$3,$4) as id',[p.p_patient,p.p_program,p.p_expected,p.p_items])).rows[0].id;
    }else if(path==='save_progression_plan'){
     const p=req.postDataJSON();body=(await db.query('select save_progression_plan($1,$2,$3,$4) as id',[p.p_program,p.p_expected,p.p_plan,p.p_approve])).rows[0].id;
    }else if(path==='home_program_exercises')body=(await db.query('select h.*, row_to_json(e) as exercise from home_program_exercises h join exercises e on e.id=h.exercise_id order by sort_order,id')).rows;
    else if(['profiles','patients','episodes','home_programs','exercise_adherence_logs','patient_exercise_sessions','program_progression_revisions','exercises'].includes(path)){
     if(path==='exercises'&&failLibrary)throw new Error('Synthetic library refresh failure');
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
  await page.waitForURL('**/dashboard');await page.goto(base+'/program-builder/'+id(10));
  const builder=page.locator('.cycle-builder');
  await page.getByRole('button',{name:'Save Program',exact:true}).waitFor();
  const notes=page.getByLabel('Key clinical cues for this patient').first();
  await notes.fill('Saved clinician cues');
  assert(await builder.getByRole('button',{name:'1. Variable parameters',exact:true}).isDisabled());
  rejectSave=true;await page.getByRole('button',{name:'Save Program',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Synthetic save rejected'}).waitFor();assert.equal(await notes.inputValue(),'Saved clinician cues');
  rejectSave=false;failLibrary=true;
  await page.getByRole('button',{name:'Save Program',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Program saved. You can now build your cycle'}).waitFor();
  assert(await builder.getByRole('button',{name:'1. Variable parameters',exact:true}).isEnabled(),'successful save unlocks cycle despite stable client keys and failed library refresh');
  assert.equal((await db.query('select notes from home_program_exercises where id=$1',[id(13)])).rows[0].notes,'Saved clinician cues');
  await builder.getByRole('button',{name:'Select Common Parameters',exact:true}).first().click();
  await builder.getByRole('button',{name:'Continue',exact:true}).click();
  await builder.getByLabel('Sets value',{exact:true}).first().fill('3');
  await builder.getByRole('button',{name:'Continue',exact:true}).click();
  await builder.getByRole('button',{name:'Generate repeating schedule',exact:true}).click();
  await builder.getByRole('button',{name:'Continue',exact:true}).click();
  await builder.getByRole('button',{name:'Save cycle draft',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Draft saved. Patient prescription unchanged.'}).first().waitFor();
  assert.equal((await db.query('select progression_plan from home_programs')).rows[0].progression_plan,null);
  assert.equal((await db.query('select count(*)::int as n from program_progression_revisions where not approved')).rows[0].n,1);
  await builder.getByRole('checkbox',{name:/I reviewed all dated prescriptions/}).check();
  await builder.getByRole('button',{name:'Approve cycle',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Cycle approved:'}).first().waitFor();
  const saved=(await db.query('select progression_plan from home_programs')).rows[0].progression_plan;
  assert(saved.cycle);assert.equal(saved.templates[0].exercises[0].prescription.sets.value,3);
  assert.equal((await db.query('select recorded_by from program_progression_revisions where approved')).rows[0].recorded_by,uid);
  failLibrary=false;await page.reload();await builder.getByRole('button',{name:'2. Cycle profiles',exact:true}).click();
  assert.equal(await builder.getByLabel('Sets value',{exact:true}).first().inputValue(),'3');
  assert.deepEqual(errors,[]);fs.mkdirSync('work',{recursive:true});await page.screenshot({path:`work/program-save-cycle-${name}.png`,fullPage:true});
  console.log('PASS',name,': real base save, retained errors, optional library failure, immediate cycle unlock, missing-profile draft/approval and reload');
  await context.close();await db.close();
 }
}finally{await browser.close();}
