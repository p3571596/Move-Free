import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true});
const uid='96000000-0000-0000-0000-000000000001';
const pid='96000000-0000-0000-0000-000000000002';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',app_metadata:{},user_metadata:{role:'patient'},created_at:new Date().toISOString()};
const jwt=[{alg:'HS256',typ:'JWT'},{sub:uid,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600},'synthetic'].map((v,i)=>i===2?v:Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'X-Supabase-Api-Version','X-Supabase-Api-Version':'2024-01-01'};
try {
 for(const viewport of [{width:390,height:844},{width:412,height:915},{width:1280,height:900}]) {
  const context=await browser.newContext({viewport});const page=await context.newPage();let linked=false,calls=0;const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://synthetic.example.invalid/**',async route=>{
   const request=route.request(),url=new URL(request.url());let body=null,status=200;
   if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers:{...headers,'Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});return;}
   if(url.pathname.endsWith('/token'))body={access_token:jwt,refresh_token:'synthetic-refresh',expires_in:3600,token_type:'bearer',user};
   else if(url.pathname.endsWith('/user'))body=user;
   else if(url.pathname.endsWith('/profiles'))body={id:uid,role:'patient',full_name:'Synthetic'};
   else if(url.pathname.endsWith('/rpc/finish_recovered_patient_setup')){
    calls++;assert.deepEqual(request.postDataJSON(),{});
    if(calls===1){status=400;body={code:'P0001',message:'No single current recovered invitation is available'};}
    else{linked=true;body=pid;}
   } else if(url.pathname.endsWith('/patients'))body=linked?{id:pid,patient_profile_id:uid,display_name:'Synthetic Patient',clinician_id:'96000000-0000-0000-0000-000000000003'}:null;
   else body=url.searchParams.get('limit')==='1'?null:[];
   await route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto((process.env.TEST_BASE_URL||'http://localhost:3109')+'/login?password=updated');
  await page.getByLabel('Email',{exact:true}).fill(user.email);
  await page.getByLabel('Password',{exact:true}).fill('SyntheticPassword!2026');
  await page.getByRole('button',{name:'Log in',exact:true}).click();
  const finish=page.getByRole('button',{name:'Complete patient setup',exact:true});await finish.waitFor();
  assert.equal(calls,0,'setup requires explicit patient acceptance');
  await finish.click();await page.getByRole('status').filter({hasText:'Ask your clinician'}).waitFor();
  assert.equal(calls,1);assert.equal(await page.getByRole('heading',{name:'Hi, Synthetic'}).count(),0);
  await finish.click();await page.getByRole('heading',{name:'Hi, Synthetic'}).waitFor();
  assert.equal(calls,2);assert.equal(await finish.count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: lost-link setup requires patient action, explains denial, and loads the linked record on iPhone-sized, Android-sized and desktop screens. Auth/API mocked; storage authorization tested separately.');
} finally {await browser.close();}
