import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
try {
 for(const viewport of [{width:390,height:844},{width:1280,height:900}]){
 const page=await browser.newPage({viewport});const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')writes.push(r.url());});
 await page.goto((process.env.TEST_BASE_URL||'http://localhost:3109')+'/private-pilot-preview');await page.getByRole('heading',{name:'Edit exercise — Squat'}).waitFor();
 await page.getByLabel('Repetitions value',{exact:true}).fill('10');await page.getByLabel('Clinical notes and cues').fill('Synthetic movement cues');
 await page.locator('input[type=file]').last().setInputFiles({name:'synthetic.webm',mimeType:'video/webm',buffer:Buffer.from('synthetic local preview bytes')});
 await page.getByRole('button',{name:'Synthetic preview — upload disabled'}).waitFor();assert.equal(await page.getByRole('button',{name:'Synthetic preview — upload disabled'}).isDisabled(),true);
 assert.equal(await page.getByLabel('Repetitions value',{exact:true}).inputValue(),'10');assert.equal(await page.getByLabel('Clinical notes and cues').inputValue(),'Synthetic movement cues');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
 await page.getByRole('button',{name:'Discard selected recording'}).click();await page.getByRole('button',{name:'Synthetic preview — upload disabled'}).waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:'Synthetic preview — upload disabled'}).count(),0);await page.close();
 }
 console.log('PASS: mobile/desktop Program preview, numeric edits and cues retained, local file preview/discard, no writes or overflow. Synthetic bytes do not verify codecs or camera hardware.');
} finally {await browser.close();}

