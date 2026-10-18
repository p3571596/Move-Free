import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
try {
 for(const viewport of [{width:390,height:844},{width:412,height:915},{width:1280,height:900}]) {
  const page=await browser.newPage({viewport});const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/auth/v1/**',route=>route.fulfill({status:400,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify({code:'email_not_confirmed',msg:'Email not confirmed'})}));
  await page.route('**/api/patient-invitations/pilot-signup',async route=>{
   requests.push(route.request().postDataJSON());
   await route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Use the password from your first signup attempt, or use a different email to create a new account.'})});
  });
  await page.goto((process.env.TEST_BASE_URL||'http://localhost:3109')+'/join#token='+'a'.repeat(64)+'&mode=pilot');
  await page.getByRole('heading',{name:'Create your patient account'}).waitFor();
  assert.equal(new URL(page.url()).hash,'');
  await page.getByLabel('Patient email').fill('synthetic@example.invalid');
  await page.getByLabel('Password',{exact:true}).fill('oldPass8');
  await page.getByRole('button',{name:'Already registered? Sign in'}).click();
  await page.getByRole('status').filter({hasText:'password from your first signup attempt'}).waitFor();
  assert.equal(requests.length,1);assert.equal(requests[0].password,'oldPass8');
  await page.getByRole('button',{name:'Create patient account',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('button').disabled);
  assert.equal(requests.length,2,'short legacy password must reach recovery through either button');
  assert.equal(await page.getByLabel('Email verification code').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: iPhone-sized, Android-sized and desktop forms preserve incomplete-signup recovery through both buttons, explain password mismatch, hide email-code entry, and remove fragments without overflow. Auth/API responses mocked; hosted Auth tested separately.');
} finally {await browser.close();}
