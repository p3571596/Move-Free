// Uses synthetic preview only. No authentication, PHI, or database writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.TEST_BASE_URL || 'http://localhost:3109';
const browser=await chromium.launch({channel:process.env.TEST_BROWSER_CHANNEL || undefined,headless:true});
const results=[];fs.mkdirSync('work',{recursive:true});
try {
 for(const [name,viewport] of [['mobile',{width:390,height:844}],['desktop',{width:1280,height:900}],['mobile-landscape',{width:844,height:390}]]) {
  const context=await browser.newContext({viewport,isMobile:name.startsWith('mobile'),hasTouch:name.startsWith('mobile')}),page=await context.newPage(),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST'&&/supabase|\/api\//.test(r.url()))writes.push(r.url());});
  await page.goto(base+'/workflow-preview');await page.getByRole('heading',{name:'Patient-specific prescription'}).waitFor();
  const first=page.locator('article').first();await first.getByLabel('Repetitions value',{exact:true}).fill('10');
  await first.getByRole('checkbox',{name:'Hold duration',exact:true}).check();await first.getByLabel('Hold duration value',{exact:true}).fill('5');await first.getByLabel('Hold duration unit',{exact:true}).selectOption('sec');
  assert.equal(await first.getByLabel('Distance value',{exact:true}).count(),0,'irrelevant fields not required');
  await first.getByLabel('Key clinical cues for this patient').fill('Synthetic cues: use the rail.');
  await page.getByRole('button',{name:'Save synthetic prescription',exact:true}).click();
  await page.getByText('Shared library standard: 2 sets · 8 reps · 3 sessions / week',{exact:true}).waitFor();
  await page.screenshot({path:`work/workflow-${name}-prescription.png`,fullPage:true});
  await page.getByRole('button',{name:'Patient exercise flow',exact:true}).click();await page.getByRole('button',{name:"Start today's program",exact:true}).click();
  await page.getByRole('heading',{name:'Sit to stand',exact:true}).waitFor();
  await page.getByText('2 sets · 10 reps · Hold duration: 5 sec · 3 sessions / week',{exact:true}).waitFor();await page.getByText('Synthetic cues: use the rail.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Completed',exact:true}).click();await page.getByLabel('Difficulty',{exact:true}).selectOption('too_hard');
  await page.getByLabel('What made it difficult? (optional)').selectOption('other');const explanation=page.getByLabel('Tell your therapist what made it difficult');
  await explanation.waitFor();assert(await explanation.evaluate(e=>e.required));assert(await page.getByRole('button',{name:'Next exercise',exact:true}).isDisabled());
  await explanation.fill('   ');assert(await page.getByRole('button',{name:'Next exercise',exact:true}).isDisabled());
  await explanation.fill('Synthetic: the band irritated my grip.');assert(await page.getByRole('button',{name:'Next exercise',exact:true}).isEnabled());
  await page.getByLabel('What made it difficult? (optional)').selectOption('fatigue');assert.equal(await explanation.count(),0);await page.getByLabel('What made it difficult? (optional)').selectOption('other');assert.equal(await explanation.inputValue(),'');
  await explanation.fill('Synthetic: the band irritated my grip.');
  await page.getByRole('button',{name:'Next exercise',exact:true}).scrollIntoViewIfNeeded();assert((await page.evaluate(()=>scrollY))>0);
  await page.getByRole('button',{name:'Next exercise',exact:true}).click();
  const secondHeading=page.getByRole('heading',{name:'Standing heel raise',exact:true});await secondHeading.waitFor();
  await page.waitForFunction(()=>document.activeElement?.textContent==='Standing heel raise');const rect=await secondHeading.boundingBox();assert(rect.y>=60&&rect.y<180,`new title visible below sticky appbar: ${rect.y}`);
  await page.screenshot({path:`work/workflow-${name}-next-exercise.png`});
  const video=await page.getByRole('button',{name:'Load video demonstration',exact:true}).boundingBox();assert(video.y<viewport.height,'video immediately visible');
  await page.getByRole('button',{name:'Load video demonstration',exact:true}).click();assert.equal(await page.locator('iframe').count(),1);
  await page.getByRole('button',{name:'Back',exact:true}).click();await page.waitForFunction(()=>document.activeElement?.textContent==='Sit to stand');assert.equal(await explanation.inputValue(),'Synthetic: the band irritated my grip.');
  await page.getByRole('button',{name:'Next exercise',exact:true}).click();await page.getByRole('button',{name:'Completed',exact:true}).click();await page.getByRole('button',{name:'Finish and share feedback',exact:true}).click();await page.getByRole('button',{name:'Finish today’s program',exact:true}).click();
  await page.getByText('Synthetic feedback saved in this preview only.',{exact:true}).waitFor();await page.getByRole('button',{name:'Patient Log & evidence',exact:true}).click();
  await page.getByText('Patient explanation: Synthetic: the band irritated my grip.',{exact:true}).waitFor();await page.getByText('PATIENT_REPORTED · Synthetic: the band irritated my grip. · Not inferred; clinician review required',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  await page.screenshot({path:`work/workflow-${name}.png`,fullPage:true});results.push({name,viewport,checks:['numeric applicability and units','template isolation','adaptive Other explanation','stale explanation cleared','Next/Back focus and scroll','title/video visible','feedback provenance and history','no horizontal overflow','no database writes','no runtime errors']});console.log('PASS:',name);
  await context.close();
 }
 fs.writeFileSync('work/workflow-browser-results.json',JSON.stringify(results,null,2));
}finally{await browser.close();}
