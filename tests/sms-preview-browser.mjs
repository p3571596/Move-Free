import { chromium } from 'playwright';
import assert from 'node:assert/strict';
// Use a disposable unlinked synthetic patient and a confirmed, unlinked patient account.
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';
for (const key of ['TEST_CLINICIAN_EMAIL','TEST_CLINICIAN_PASSWORD','TEST_PATIENT_ID','TEST_PATIENT_EMAIL','TEST_PATIENT_PASSWORD']) if (!process.env[key]) throw new Error('Missing synthetic fixture setting: '+key);
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const clinician=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];clinician.on('pageerror',e=>errors.push(e.message));
 await clinician.goto(base+'/login');
 await clinician.getByLabel('Email',{exact:true}).fill(process.env.TEST_CLINICIAN_EMAIL);
 await clinician.getByLabel('Password',{exact:true}).fill(process.env.TEST_CLINICIAN_PASSWORD);
 await clinician.getByRole('button',{name:'Log in',exact:true}).click();
 await clinician.waitForURL('**/dashboard',{timeout:60000});
 await clinician.goto(base+'/patients/'+process.env.TEST_PATIENT_ID);
 await clinician.getByText('Patient actions',{exact:true}).click();
 await clinician.getByRole('button',{name:'Invite Patient',exact:true}).click();
 await clinician.getByLabel('Invitation method').selectOption('copy');
 await clinician.getByLabel('Patient email',{exact:true}).fill(process.env.TEST_PATIENT_EMAIL);
 await clinician.getByRole('button',{name:'Generate secure link',exact:true}).click();
 await clinician.getByRole('button',{name:'Copy Link',exact:true}).waitFor();
 await clinician.getByRole('button',{name:'Share Link',exact:true}).waitFor();
 await clinician.getByRole('link',{name:'Share via Text',exact:true}).waitFor();
 assert.equal(await clinician.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const input=clinician.getByLabel('Secure invitation link');await input.waitFor();const link=await input.inputValue();assert(link.includes('#token='));
 const context=await browser.newContext();const patient=await context.newPage();patient.on('pageerror',e=>errors.push(e.message));
 await patient.goto(link);await patient.getByLabel('Patient email',{exact:true}).fill(process.env.TEST_PATIENT_EMAIL);
 await patient.getByLabel('Password',{exact:true}).fill(process.env.TEST_PATIENT_PASSWORD);
 await patient.getByRole('button',{name:'Sign in and accept invitation'}).click();
 await patient.waitForURL('**/patient',{timeout:60000});
 await patient.getByText('This login is not linked to a patient record.').waitFor({state:'hidden'});
 await clinician.getByRole('button',{name:'Refresh status',exact:true}).click();
 await clinician.getByText('Patient account linked',{exact:true}).waitFor();
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: mobile clinician manual sharing controls, secure issuance API, fresh patient sign-in, verified-email claim, patient page, clinician Accepted status. No browser errors.');
} finally {await browser.close();}
