import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import Module from 'node:module';import ts from 'typescript';
const mod=new Module('lib/exercise-media.ts');mod._compile(ts.transpileModule(fs.readFileSync('lib/exercise-media.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,'lib/exercise-media.ts');
const {parseExerciseVideo:parse,validatedVideoUrl,approvedVideoFromForm,formatRepsOrTime}=mod.exports;
test('supported YouTube URL shapes resolve to one privacy-enhanced inline player',()=>{
 for(const url of ['https://www.youtube.com/watch?v=M7lc1UVf-VE&list=anything','https://youtu.be/M7lc1UVf-VE?si=tracking','https://m.youtube.com/shorts/M7lc1UVf-VE','https://www.youtube.com/embed/M7lc1UVf-VE','https://www.youtube-nocookie.com/embed/M7lc1UVf-VE']){
 const v=parse(url);assert.equal(v.provider,'youtube');assert.equal(v.url,'https://www.youtube.com/watch?v=M7lc1UVf-VE');assert.equal(v.embedUrl,'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?playsinline=1&rel=0&autoplay=0');}
});
test('Vimeo public and unlisted videos preserve only required identity',()=>{
 assert.equal(parse('https://vimeo.com/76979871').embedUrl,'https://player.vimeo.com/video/76979871?playsinline=1&autoplay=0&dnt=1');
 for(const url of ['https://vimeo.com/12345678/abc123def0','https://player.vimeo.com/video/12345678?h=abc123def0&autoplay=1'])assert.equal(parse(url).embedUrl,'https://player.vimeo.com/video/12345678?playsinline=1&autoplay=0&dnt=1&h=abc123def0');
});
test('reject executable URLs, arbitrary hosts, deceptive hosts, credentials and malformed IDs',()=>{
 for(const url of ['javascript:alert(1)','http://youtube.com/watch?v=M7lc1UVf-VE','https://youtube.com.evil.test/watch?v=M7lc1UVf-VE','https://youtube.com@evil.test/watch?v=M7lc1UVf-VE','https://user@youtube.com/watch?v=M7lc1UVf-VE','https://youtube.com:444/watch?v=M7lc1UVf-VE','https://vimeo.com/123?h=%22%3E','https://example.com/video.mp4','https://youtu.be/M7lc1UVf-VE/extra','https://youtube.com/watch?v=invalid'])assert.equal(parse(url),null,url);
 assert.equal(validatedVideoUrl(''),null);assert.throws(()=>validatedVideoUrl('javascript:alert(1)'));
});
test('clinician form requires explicit approval for video, permits intentional removal',()=>{
 const f=new FormData();f.set('video_url','https://youtu.be/M7lc1UVf-VE');assert.throws(()=>approvedVideoFromForm(f));f.set('video_approved','yes');assert.equal(approvedVideoFromForm(f),'https://www.youtube.com/watch?v=M7lc1UVf-VE');f.set('video_url','');assert.equal(approvedVideoFromForm(f),null);
});
test('time prescriptions are not mislabeled as repetitions',()=>{assert.equal(formatRepsOrTime('30 seconds'),'30 seconds');assert.equal(formatRepsOrTime('8–10'),'8–10 reps');assert.equal(formatRepsOrTime(8),'8 reps');assert.equal(formatRepsOrTime(null),'');});
