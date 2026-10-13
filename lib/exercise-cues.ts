// Preserve assignment-level clinical notes when an approved private video is displayed.
export function exerciseCues(notes?:string|null,videoCues?:string|null) {
 const original=notes?.trim()??'', reviewed=videoCues?.trim()??'';
 if(!original)return reviewed;
 if(!reviewed||original.includes(reviewed))return original;
 if(reviewed.includes(original))return reviewed;
 return `${original}\n${reviewed}`;
}
