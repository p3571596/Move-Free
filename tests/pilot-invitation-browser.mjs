import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
try {
 for(const viewport of [{width:390,height:844},{width:412,height:915},{width:1280,height:900}]) {
  const page=await browser.newPage({viewport});const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/auth/v1/**',route=>route.fulfill({status:400,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'X-Supabase-Api-Version','X-Supabase-Api-Version':'2024-01-01'},contentType:'application/json',body:JSON.stringify({code:'email_not_confirmed',msg:'Email not confirmed'})}));
  await page.route('**/api/patient-invitations/pilot-signup',async route=>{
   requests.push(route.request().postDataJSON());
   await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Use your existing password, or ask your clinician for a password reset link if you forgot it.'})});
  });
  await page.goto((process.env.TEST_BASE_URL||'http://localhost:3109')+'/join#token='+'a'.repeat(64)+'&mode=pilot');
  await page.getByRole('heading',{name:'Create your patient account'}).waitFor();
  assert.equal(new URL(page.url()).hash,'');
  await page.getByLabel('Patient email').fill('synthetic@example.invalid');
  await page.getByLabel('Password',{exact:true}).fill('oldPass8');
  await page.getByRole('button',{name:'Already registered? Sign in'}).click();
  await page.getByRole('status').filter({hasText:'clinician for a password reset link'}).waitFor();
  assert.equal(requests.length,1);assert.equal(requests[0].password,'oldPass8');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('button').disabled);
  assert.equal(requests.length,2,'short legacy password must reach recovery through either button');
  assert.equal(await page.getByLabel('Email verification code').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);await page.close();
 }
 for(const viewport of [{width:390,height:844},{width:412,height:915},{width:1280,height:900}]) {
  const page=await browser.newPage({viewport});let writes=0;
  await page.route('**/api/patient-invitations/password-reset',async route=>{writes++;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({updated:true})});});
  await page.goto((process.env.TEST_BASE_URL||'http://localhost:3109')+'/recover#token='+'b'.repeat(64));
  await page.getByRole('heading',{name:'Choose a new password'}).waitFor();
  await page.waitForFunction(()=>!window.location.hash);assert.equal(new URL(page.url()).hash,'');
  await page.getByLabel('Account email').fill('synthetic@example.invalid');
  await page.getByLabel('New password',{exact:true}).fill('NewSyntheticPassword!2026');
  await page.getByLabel('Confirm password').fill('DifferentPassword!2026');
  await page.getByRole('button',{name:'Update password'}).click();await page.getByRole('status').filter({hasText:'do not match'}).waitFor();assert.equal(writes,0);
  await page.getByLabel('Confirm password').fill('NewSyntheticPassword!2026');
  await page.getByRole('button',{name:'Update password'}).click();await page.getByRole('status').filter({hasText:'Password updated'}).waitFor();
  assert.equal(writes,1);assert.equal(await page.getByRole('button',{name:'Update password'}).count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.close();
 }
 console.log('PASS: iPhone-sized, Android-sized and desktop forms preserve incomplete-signup recovery through both buttons, explain password mismatch, hide email-code entry, and remove fragments without overflow. Auth/API responses mocked; hosted Auth tested separately.');
} finally {await browser.close();}
